"""The policy gradient's noise scale at a checkpoint (McCandlish et al., "An Empirical Model of
Large-Batch Training"):

    python -m riskgpu.selfplay.noise runs/selfplay/sw128b/snap-450.pt [--rollouts 8]

run from `src/projects/risk/gpu/`. Plays the training's league (no updates) until its games are
spread over every phase, then for each rollout takes the policy-gradient term's mean gradient over
each half of the games and over all of them. From how the squared norm shrinks with the batch,
|G_B|² = |G|² + tr(Σ)/B, it estimates the true gradient's |G|² and the per-decision noise tr(Σ),
and their ratio, the noise scale B_noise: about the number of decisions a gradient must average
before its signal matches its noise. An optimizer step on far fewer decisions than B_noise is
mostly noise. The halves are split by game, so they are independent.
"""

import argparse
import sys

import torch

from ..board import Board
from ..data import DATA
from ..options import options
from ..tables import BlitzTables
from .actions import legal_main
from .env import GD, GD_PERSONAS, GREEDY, LEARNER, SNAPSHOT, Env, EnvConfig
from .ladder import load_net
from .net import evaluate
from .obs import observe
from .ppo import advantages, rebuild


def mean_grad(net, env, targets, rows: torch.Tensor, minibatch: int) -> torch.Tensor:
    """The mean over `rows` ([n, 2] of (t, b)) of the gradient of −log π(a) × the advantage,
    the advantages normalized over the whole rollout as given."""
    buf, board = env.buf, env.board
    params = [p for p in net.parameters()]
    total = [torch.zeros_like(p) for p in params]
    for start in range(0, rows.shape[0], minibatch):
        mb = rows[start:start + minibatch]
        t, b = mb[:, 0], mb[:, 1]
        s = rebuild(buf, t, b)
        with torch.no_grad():
            o = options(s, board)
            legal = legal_main(o)
            node, slot, glob = observe(s, o, buf["placed_on"][t, b], buf["attacks"][t, b], buf["captured"][t, b], board)
        with torch.autocast("cuda", dtype=torch.bfloat16, enabled=env.cfg.bf16):
            logp, _, _, _ = evaluate(net, node, slot, glob, legal, buf["main"][t, b], buf["amount"][t, b])
        loss = -(logp.float() * targets["adv_n"][t, b]).sum()
        grads = torch.autograd.grad(loss, params, allow_unused=True)
        for acc, g in zip(total, grads):
            if g is not None:
                acc.add_(g)
    return torch.cat([g.flatten() for g in total]) / rows.shape[0]


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("checkpoint")
    p.add_argument("--rollouts", type=int, default=8)
    p.add_argument("--warmup", type=int, default=20, help="rollouts played first, so the games span every phase")
    p.add_argument("--batch", type=int, default=16384)
    p.add_argument("--horizon", type=int, default=64)
    p.add_argument("--minibatch", type=int, default=2048)
    p.add_argument("--lam", type=float, default=0.95)
    p.add_argument("--shaping", type=float, default=0.0, help="the potential-based shaping's weight, as ppo's --shaping")
    p.add_argument("--league-fixed", default="runs/selfplay/m2a/snap-50.pt,runs/selfplay/m1a/snap-75.pt,runs/selfplay/sw128b/snap-450.pt")
    p.add_argument("--self-share", type=float, default=0.15)
    p.add_argument("--snapshot-share", type=float, default=0.35)
    p.add_argument("--gd-share", type=float, default=0.35)
    args = p.parse_args(argv)

    device = "cuda"
    torch.manual_seed(1)
    board = Board.load(device)
    tables = BlitzTables.load(f"{DATA}/blitz-256", device)
    tables.scaled_oversize = True
    net = load_net(args.checkpoint, board, device)
    net.requires_grad_(True)
    gd_bots = None
    if args.gd_share > 0:
        from ..bots.gd import gd_bot_graphable
        gd_bots = [gd_bot_graphable(persona, tables) for persona in GD_PERSONAS]
    fixed = [x for x in args.league_fixed.split(",") if x]
    cfg = EnvConfig(batch=args.batch, horizon=args.horizon, gd=args.gd_share > 0, snapshots=len(fixed))
    env = Env(cfg, board, tables, net, device, seed_prefix="noise", gd_bots=gd_bots)
    for k, path in enumerate(fixed):
        env.snapshots[k] = load_net(path, board, device)
    probs = torch.zeros(SNAPSHOT + len(fixed))
    probs[LEARNER] = args.self_share
    probs[GREEDY] = max(0.0, 1.0 - args.self_share - args.snapshot_share - args.gd_share)
    probs[GD:GD + len(GD_PERSONAS)] = args.gd_share / len(GD_PERSONAS)
    probs[SNAPSHOT:] = args.snapshot_share / len(fixed)
    env.kind_probs.copy_(probs.to(device))
    env.active_snapshots = len(fixed)
    env.capture()

    def rollout() -> None:
        env.run(args.horizon)
        if int(env.cursor.max()) > env.cfg.pool // 2:
            env.refill_pool()
        env.take_stats()

    for _ in range(args.warmup):
        rollout()
    B = args.batch
    sums = {"big": 0.0, "small": 0.0, "n": 0.0}
    for r in range(args.rollouts):
        rollout()
        targets = advantages(env, env.bootstrap(), args.lam, args.shaping)
        mine = env.buf["learner"]
        adv = targets["adv"][mine]
        targets["adv_n"] = (targets["adv"] - adv.mean()) / (adv.std() + 1e-8)
        rows = mine.nonzero()
        halves = [rows[rows[:, 1] < B // 2], rows[rows[:, 1] >= B // 2]]
        g = [mean_grad(net, env, targets, h, args.minibatch) for h in halves]
        n = [h.shape[0] for h in halves]
        whole = (g[0] * n[0] + g[1] * n[1]) / sum(n)
        small = (float(g[0].square().sum()) + float(g[1].square().sum())) / 2
        big = float(whole.square().sum())
        cos = float(torch.nn.functional.cosine_similarity(g[0], g[1], dim=0))
        sums["big"] += big
        sums["small"] += small
        sums["n"] += sum(n)
        print(f"rollout {r + 1}: {sum(n)} decisions, |g_half|² {small:.3e}, |g|² {big:.3e}, cos(halves) {cos:+.3f}", flush=True)
    k = args.rollouts
    n = sums["n"] / k
    big, small = sums["big"] / k, sums["small"] / k
    # With B_small = n/2 and B_big = n: |G|² = 2|g|² − |g_half|², tr(Σ) = (|g_half|² − |g|²) × n.
    g2 = 2 * big - small
    noise = (small - big) * n
    print(f"decisions a rollout {n:.0f}; |G|² {g2:.3e}, tr(Σ) {noise:.3e}")
    print(f"B_noise {noise / g2:.0f} decisions" if g2 > 0 else "B_noise: |G|² estimate not positive, the signal is below this test's resolution")
    return 0


if __name__ == "__main__":
    sys.exit(main())

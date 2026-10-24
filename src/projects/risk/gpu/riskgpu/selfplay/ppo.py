"""PPO in a league on the GPU engine (`ideas/gpu-engine.md`, phase 3):

    python -m riskgpu.selfplay.ppo --name m1 [--resume] [--hours 48]

run from `src/projects/risk/gpu/`. Output (checkpoints, `log.jsonl`) goes to
`runs/selfplay/<name>/`, which git ignores; `--resume` continues from `latest.pt`.

Each iteration: a rollout of `horizon` steps of the whole batch (one CUDA graph replay a step),
GAE over each learner seat's own decisions (γ = 1: the score comes at the game's end), then PPO
epochs over the learner's decisions, their observations and masks rebuilt from the kept states.
The value head is a vector over slots: slot 0 learns the GAE return, the other slots their seat's
final score where the game ended inside the rollout; the auxiliary head learns each slot's board
share `aux_steps` steps on.
"""

import argparse
import json
import os
import random
import sys
import time
from dataclasses import asdict

import torch

from ..board import CARDS, MAX_SEATS, Board
from ..data import DATA
from ..options import options
from ..state import LAYOUT, State
from ..tables import BlitzTables
from .actions import legal_main
from .env import GREEDY, KEPT, LEARNER, SNAPSHOT, Env, EnvConfig
from .net import Net, evaluate
from .obs import observe, slots

RUNS = os.path.join(os.path.dirname(DATA), "runs", "selfplay")


def rebuild(buf: dict, t: torch.Tensor, b: torch.Tensor) -> State:
    n = t.shape[0]
    fields = {name: buf[name][t, b] for name in KEPT}
    fields["rng"] = torch.zeros(n, dtype=torch.int64, device=t.device)
    fields["deck"] = torch.full((n, CARDS), -1, dtype=torch.int8, device=t.device)
    return State(**{name: fields[name] for name in LAYOUT})


def by_slot(values: torch.Tensor, seat_of_slot: torch.Tensor) -> torch.Tensor:
    """`[N, 6]` by seat → by slot (0 where the slot is absent)."""
    out = values.gather(1, seat_of_slot.clamp(min=0))
    return torch.where(seat_of_slot >= 0, out, 0.0)


def advantages(env: Env, boot: torch.Tensor, lam: float) -> dict:
    buf, T, B = env.buf, env.cfg.horizon, env.cfg.batch
    rows = torch.arange(B, device=boot.device)
    next_v = boot.clone()
    next_a = torch.zeros_like(boot)
    pending = torch.zeros_like(boot)
    final = torch.zeros_like(boot)
    final_ok = torch.zeros(B, dtype=torch.bool, device=boot.device)
    adv = torch.zeros(T, B, device=boot.device)
    mc = torch.zeros(T, B, MAX_SEATS, device=boot.device)
    mc_ok = torch.zeros(T, B, dtype=torch.bool, device=boot.device)
    for t in reversed(range(T)):
        ended = buf["ended"][t]
        reward = buf["reward"][t]
        next_v = torch.where(ended[:, None], 0.0, next_v)
        next_a = torch.where(ended[:, None], 0.0, next_a)
        pending = torch.where(ended[:, None], reward, pending)
        final = torch.where(ended[:, None], reward, final)
        final_ok = final_ok | ended
        a = buf["active"][t].to(torch.int64)
        v = buf["value"][t]
        delta = pending[rows, a] + next_v[rows, a] - v
        advantage = delta + lam * next_a[rows, a]
        adv[t] = advantage
        # Only the learner's own decisions are links in a seat's chain; other rows pass through.
        mine = buf["learner"][t]
        next_v[rows, a] = torch.where(mine, v, next_v[rows, a])
        next_a[rows, a] = torch.where(mine, advantage, next_a[rows, a])
        pending[rows, a] = torch.where(mine, 0.0, pending[rows, a])
        mc[t] = final
        mc_ok[t] = final_ok
    return {"adv": adv, "ret": adv + buf["value"], "mc": mc, "mc_ok": mc_ok}


def update(net: Net, opt: torch.optim.Optimizer, env: Env, targets: dict, args) -> dict:
    buf, board, H = env.buf, env.board, env.cfg.aux_steps
    T = env.cfg.horizon
    idx = buf["learner"].nonzero()
    n = idx.shape[0]
    sums = {"pg": 0.0, "v": 0.0, "vo": 0.0, "aux": 0.0, "ent": 0.0, "kl": 0.0, "clip": 0.0}
    count = 0
    for _ in range(args.epochs):
        perm = idx[torch.randperm(n, device=idx.device)]
        for start in range(0, n, args.minibatch):
            mb = perm[start:start + args.minibatch]
            t, b = mb[:, 0], mb[:, 1]
            s = rebuild(buf, t, b)
            with torch.no_grad():
                o = options(s, board)
                legal = legal_main(o)
                node, slot, glob = observe(s, o, buf["placed_on"][t, b], buf["attacks"][t, b], buf["captured"][t, b], board)
                seat_of_slot, _ = slots(s)
                adv = targets["adv"][t, b]
                adv = (adv - adv.mean()) / (adv.std() + 1e-8)
                ret = targets["ret"][t, b]
                mc = by_slot(targets["mc"][t, b], seat_of_slot)
                mc_ok = targets["mc_ok"][t, b][:, None] & (seat_of_slot >= 0)
                mc_ok[:, 0] = False
                ahead = (t + H).clamp(max=T - 1)
                aux_ok = ((t + H) < T) & (buf["game_id"][ahead, b] == buf["game_id"][t, b])
                aux_target = by_slot(buf["share"][ahead, b], seat_of_slot)
                aux_mask = aux_ok[:, None] & (seat_of_slot >= 0)
            with torch.autocast("cuda", dtype=torch.bfloat16, enabled=env.cfg.bf16):
                logp, entropy, value, aux = evaluate(net, node, slot, glob, legal, buf["main"][t, b], buf["amount"][t, b])
            value, aux = value.float(), aux.float()
            entropy = entropy.mean()
            ratio = torch.exp(logp - buf["logp"][t, b])
            pg = -torch.minimum(ratio * adv, ratio.clamp(1 - args.clip, 1 + args.clip) * adv).mean()
            v_loss = ((value[:, 0] - ret) ** 2).mean()
            vo_loss = (((value - mc) ** 2) * mc_ok).sum() / mc_ok.sum().clamp(min=1)
            aux_loss = (((aux - aux_target) ** 2) * aux_mask).sum() / aux_mask.sum().clamp(min=1)
            loss = pg + args.vf * v_loss + args.vo * vo_loss + args.aux * aux_loss - args.ent * entropy
            opt.zero_grad(set_to_none=False)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(net.parameters(), args.grad_clip)
            opt.step()
            with torch.no_grad():
                sums["pg"] += float(pg)
                sums["v"] += float(v_loss)
                sums["vo"] += float(vo_loss)
                sums["aux"] += float(aux_loss)
                sums["ent"] += float(entropy)
                sums["kl"] += float((buf["logp"][t, b] - logp).mean())
                sums["clip"] += float(((ratio - 1).abs() > args.clip).float().mean())
            count += 1
    out = {k: v / max(count, 1) for k, v in sums.items()}
    out["samples"] = n
    return out


def summarize(stats: dict, kinds: list[str]) -> dict:
    out = {"games": stats["games"], "capped": stats["capped"] / max(stats["games"], 1), "stalled": stats["stalled"],
           "turns": stats["turns"] / max(stats["games"], 1)}
    for k, name in enumerate(kinds):
        seats = stats["seats"][k]
        if seats > 0:
            out[f"{name}_score"] = stats["score"][k] / seats
            out[f"{name}_win"] = stats["wins"][k] / max(stats["decisive_seats"][k], 1)
            out[f"{name}_seats"] = seats
    return out


class Evaluator:
    """Fixed deals played to their end, the learner (its most likely move) in one seat against
    greedy in the rest: its win rate among decisive games against par (one seat in n), its mean
    score, and the cap rate. The same seeds every time, so evaluations compare."""

    def __init__(self, board, tables, net, players: int, games: int, device: str):
        cfg = EnvConfig(batch=games, sizes=(players,), size_weights=(1.0,), cap_low=600, cap_high=600,
                        pool=8, snapshots=0, record=False, reset=False, learner_greedy=True)
        self.env = Env(cfg, board, tables, net, device, seed_prefix=f"eval{players}")
        self.players = players
        self.saved = self.env._save()
        self.env.capture()

    def run(self) -> dict:
        env = self.env
        env._restore(self.saved)
        steps = 0
        while True:
            env.run(64)
            steps += 64
            if bool(env.done.all()) or steps > 40000:
                break
        st = env.take_stats()
        decisive = st["games"] - st["capped"]
        win = st["wins"][LEARNER] / max(decisive, 1)
        return {"players": self.players, "games": st["games"], "capped": st["capped"] / max(st["games"], 1),
                "win": win, "par": 1 / self.players, "score": st["score"][LEARNER] / max(st["seats"][LEARNER], 1),
                "greedy_score": st["score"][GREEDY] / max(st["seats"][GREEDY], 1), "steps": steps,
                "unfinished": float((~env.done).sum())}


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--name", required=True)
    p.add_argument("--resume", action="store_true")
    p.add_argument("--hours", type=float, default=48.0)
    p.add_argument("--iters", type=int, default=10**9)
    p.add_argument("--batch", type=int, default=16384)
    p.add_argument("--horizon", type=int, default=64)
    p.add_argument("--sizes", default="3,4,5,6")
    p.add_argument("--size-weights", default="0.35,0.2,0.3,0.15")
    p.add_argument("--width", type=int, default=128)
    p.add_argument("--layers", type=int, default=4)
    p.add_argument("--heads", type=int, default=8)
    p.add_argument("--lr", type=float, default=3e-4)
    p.add_argument("--epochs", type=int, default=3)
    p.add_argument("--minibatch", type=int, default=8192)
    p.add_argument("--clip", type=float, default=0.2)
    p.add_argument("--lam", type=float, default=0.95)
    p.add_argument("--vf", type=float, default=0.5)
    p.add_argument("--vo", type=float, default=0.25)
    p.add_argument("--aux", type=float, default=0.25)
    p.add_argument("--ent", type=float, default=0.01)
    p.add_argument("--grad-clip", type=float, default=1.0)
    p.add_argument("--self-share", type=float, default=0.2, help="share of non-learner seats taken by the learner")
    p.add_argument("--snapshot-share", type=float, default=0.0, help="share of non-learner seats taken by past checkpoints")
    p.add_argument("--snapshot-every", type=int, default=50)
    p.add_argument("--eval-every", type=int, default=25)
    p.add_argument("--eval-games", type=int, default=2048)
    p.add_argument("--eval-players", default="3,5")
    p.add_argument("--ckpt-every", type=int, default=25)
    p.add_argument("--seed", type=int, default=1)
    args = p.parse_args(argv)

    device = "cuda"
    # Past this the allocator raises rather than letting the Windows driver spill into system
    # memory, which runs on but tens of times slower.
    torch.cuda.set_per_process_memory_fraction(0.92)
    torch.manual_seed(args.seed)
    random.seed(args.seed)
    out_dir = os.path.join(RUNS, args.name)
    os.makedirs(out_dir, exist_ok=True)
    board = Board.load(device)
    tables = BlitzTables.load(os.path.join(DATA, "blitz-256"), device)
    tables.scaled_oversize = True
    net = Net(args.width, args.layers, args.heads, edges=board.edges, adjacency=board.adjacency).to(device)
    opt = torch.optim.Adam(net.parameters(), lr=args.lr, eps=1e-5)
    iteration, steps_done, league = 0, 0, []
    latest = os.path.join(out_dir, "latest.pt")
    if args.resume and os.path.exists(latest):
        ck = torch.load(latest, map_location=device, weights_only=False)
        net.load_state_dict(ck["net"])
        opt.load_state_dict(ck["opt"])
        iteration, steps_done, league = ck["iteration"], ck["steps"], ck["league"]
        print(f"resumed {args.name} at iteration {iteration}", flush=True)
    with open(os.path.join(out_dir, "args.json"), "w") as f:
        json.dump(vars(args), f, indent=1)

    sizes = tuple(int(x) for x in args.sizes.split(","))
    weights = tuple(float(x) for x in args.size_weights.split(","))
    cfg = EnvConfig(batch=args.batch, sizes=sizes, size_weights=weights, horizon=args.horizon)
    env = Env(cfg, board, tables, net, device, seed_prefix=f"{args.name}-{iteration}")
    kinds = ["learner", "greedy"] + [f"snap{k}" for k in range(cfg.snapshots)]

    def set_league() -> None:
        probs = torch.zeros(len(kinds))
        probs[LEARNER] = args.self_share
        snaps = min(len(league), cfg.snapshots) if args.snapshot_share > 0 else 0
        snap_share = args.snapshot_share if snaps else 0.0
        probs[GREEDY] = max(0.0, 1.0 - args.self_share - snap_share)
        for k, path in enumerate(random.sample(league, snaps)):
            env.snapshots[k].load_state_dict(torch.load(path, map_location=device, weights_only=False))
            probs[SNAPSHOT + k] = snap_share / snaps
        env.kind_probs.copy_(probs.to(device))
        if snaps != env.active_snapshots:
            env.active_snapshots = snaps
            env.capture()

    set_league()
    if env.graph is None:
        env.capture()
    evaluators = [Evaluator(board, tables, net, int(n), args.eval_games, device) for n in args.eval_players.split(",")]
    log_path = os.path.join(out_dir, "log.jsonl")
    n_params = sum(x.numel() for x in net.parameters())
    started = time.time()
    print(f"{args.name}: batch {args.batch} x horizon {args.horizon}, {sum(x.numel() for x in net.parameters()):,} weights",
          flush=True)

    while iteration < args.iters and time.time() - started < args.hours * 3600:
        t0 = time.time()
        env.run(args.horizon)
        boot = env.bootstrap()
        targets = advantages(env, boot, args.lam)
        torch.cuda.synchronize()
        t1 = time.time()
        losses = update(net, opt, env, targets, args)
        t2 = time.time()
        iteration += 1
        steps_done += args.batch * args.horizon
        if int(env.cursor.max()) > env.cfg.pool // 2:
            env.refill_pool()
        record = {"iter": iteration, "steps": steps_done, "time": time.time(), "rollout_s": t1 - t0, "update_s": t2 - t1,
                  "steps_per_s": args.batch * args.horizon / (t1 - t0), "params": n_params, **summarize(env.take_stats(), kinds), **losses}
        if iteration % args.snapshot_every == 0:
            path = os.path.join(out_dir, f"snap-{iteration}.pt")
            torch.save(net.state_dict(), path)
            league.append(path)
            set_league()
        if iteration % args.eval_every == 0:
            record["eval"] = [e.run() for e in evaluators]
        if iteration % args.ckpt_every == 0:
            torch.save({"net": net.state_dict(), "opt": opt.state_dict(), "iteration": iteration, "steps": steps_done,
                        "league": league, "args": vars(args), "env": asdict(cfg)}, latest + ".tmp")
            os.replace(latest + ".tmp", latest)
        with open(log_path, "a") as f:
            f.write(json.dumps(record) + "\n")
        brief = {k: (round(v, 3) if isinstance(v, float) else v) for k, v in record.items()
                 if k in ("iter", "steps_per_s", "update_s", "learner_score", "learner_win", "greedy_score", "capped",
                          "turns", "ent", "kl", "v", "stalled", "samples")}
        print(json.dumps(brief), flush=True)
        if "eval" in record:
            print("  eval", json.dumps(record["eval"]), flush=True)
    torch.save({"net": net.state_dict(), "opt": opt.state_dict(), "iteration": iteration, "steps": steps_done,
                "league": league, "args": vars(args), "env": asdict(cfg)}, latest)
    return 0


if __name__ == "__main__":
    sys.exit(main())

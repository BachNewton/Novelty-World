"""A ladder of any checkpoints, of any sizes, seated together (the size sweep's comparison):

    python -m riskgpu.selfplay.ladder m1a-75=runs/selfplay/m1a/snap-75.pt big-50=runs/.../snap-50.pt [--games 2048]

run from `src/projects/risk/gpu/`. Each game's five seats are drawn from the checkpoints (with
repeats only while fewer than five), every seat sampling its moves as in training, and a Luce fit
over who won each decisive game gives each its win Elo, the first at 0. A checkpoint's size is read
from its weights' shapes.
"""

import argparse
import sys

import torch

from ..board import Board
from ..data import DATA
from ..tables import BlitzTables
from .env import Env, EnvConfig, LEARNER, SNAPSHOT
from .net import Net
from .ppo import luce_elo, seat_draw


def load_net(path: str, board: Board, device: str) -> Net:
    sd = torch.load(path, map_location=device, weights_only=False)
    sd = sd.get("net", sd)
    width = sd["node_in.weight"].shape[0]
    layers = len({k.split(".")[1] for k in sd if k.startswith("blocks.")})
    heads = sd["blocks.0.border"].shape[0]
    ff_mult = sd["blocks.0.ff1.weight"].shape[0] // width
    net = Net(width, layers, heads, ff_mult, edges=board.edges, adjacency=board.adjacency).to(device)
    net.load_state_dict(sd)
    net.requires_grad_(False)
    return net


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("entries", nargs="+", help="label=checkpoint")
    p.add_argument("--games", type=int, default=2048)
    p.add_argument("--players", type=int, default=5)
    p.add_argument("--pair", action="store_true",
                   help="two entries: the second alone among copies of the first (one-in) on half the deals, "
                        "the reverse (one-out) on the rest, its seat rotated; reports its win share against par")
    args = p.parse_args(argv)
    device = "cuda"
    board = Board.load(device)
    tables = BlitzTables.load(f"{DATA}/blitz-256", device)
    tables.scaled_oversize = True
    labels = [e.split("=", 1)[0] for e in args.entries]
    nets = [load_net(e.split("=", 1)[1], board, device) for e in args.entries]
    cfg = EnvConfig(batch=args.games, sizes=(args.players,), size_weights=(1.0,), cap_low=600, cap_high=600, pool=8,
                    snapshots=0, record=False, reset=False, cap_learner=0.5, cap_snapshot=0.5, cap_greedy=0.01)
    env = Env(cfg, board, tables, nets[0], device, seed_prefix="ladder")
    env.snapshots = nets[1:]
    env.active_snapshots = len(nets) - 1
    env.kind_probs = torch.zeros(SNAPSHOT + len(nets) - 1, device=device)
    env.stats = torch.zeros(8, SNAPSHOT + len(nets) - 1, dtype=torch.float64, device=device)
    kinds = torch.tensor([LEARNER] + [SNAPSHOT + k for k in range(len(nets) - 1)])
    if args.pair:
        assert len(nets) == 2, "--pair takes two entries"
        n, half = args.players, args.games // 2
        games = torch.arange(args.games)
        lone = (games % n)[:, None] == torch.arange(n)[None, :]
        pick = torch.where(games[:, None] < half, lone, ~lone).to(torch.int64)  # 1 = the second entry
        seat_kind = torch.full((args.games, 6), 1, dtype=torch.int64)
        seat_kind[:, :n] = kinds[pick]
    else:
        pick, seat_kind = seat_draw(kinds, args.games, args.players)
    env.seat_kind.copy_(seat_kind.to(device))
    env.capture()
    steps = 0
    while not bool(env.done.all()) and steps <= 40000:
        env.run(64)
        steps += 64
    winner = env.state.winner.to(torch.int64).cpu()
    if args.pair:
        n, half = args.players, args.games // 2
        decisive = winner >= 0
        won = torch.zeros(args.games, dtype=torch.bool)
        won[decisive] = pick[decisive].gather(1, winner[decisive][:, None])[:, 0] == 1
        for name, rows, par in (("one-in", slice(0, half), 1 / n), ("one-out", slice(half, None), (n - 1) / n)):
            d = int(decisive[rows].sum())
            w = int(won[rows].sum())
            share = w / max(d, 1)
            se = (share * (1 - share) / max(d, 1)) ** 0.5
            print(f"{labels[1]} {name}: wins {share:.3f} ± {1.96 * se:.3f} of {d} decisive (par {par:.3f}), "
                  f"capped {int((~decisive[rows]).sum())}")
        return 0
    elo, decisive = luce_elo(pick, winner, len(labels))
    for label, e in sorted(zip(labels, elo), key=lambda x: -x[1]):
        print(f"{label:24s} {e:+8.1f}")
    print(f"{decisive} decisive of {args.games}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

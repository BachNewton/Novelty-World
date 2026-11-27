"""A checkpoint read head to head against chosen networks, a part of the panel (`panel.py`):

    python -m riskgpu.selfplay.pairs --ckpt runs/selfplay/d4/snap-900.pt
        --anchor d4-500=runs/selfplay/d4/snap-500.pt --anchor b1-100=runs/selfplay/b1/snap-100.pt
        [--games 4096] [--modes argmax] [--mirror 1024] [--out pairs.json]

run from `src/projects/risk/gpu/`. Each reading is the panel's own pair check (`ppo.PairEval`: fixed
5-player deals, the checkpoint alone among four of the anchor on half of them and four of it against
one on the rest, the anchor's seats sampling), so a reading here is the panel's reading of the same
pair at the same number of games. For when a question needs two or three pairs of one checkpoint
and not the panel's twenty-three checks. `--mirror` adds the stall's reading on that many games.
A reading is written to `--out` as it finishes, so a stopped run keeps the ones it made.
"""

import argparse
import json
import os
import sys
import time

import torch

from ..board import Board
from ..data import DATA
from ..tables import BlitzTables
from .ladder import load_net
from .panel import MODES, reading, wilson
from .ppo import MirrorEval, PairEval


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--ckpt", required=True)
    p.add_argument("--anchor", action="append", default=[], help="label=checkpoint, once for each network read against")
    p.add_argument("--games", type=int, default=4096)
    p.add_argument("--modes", default="argmax", help="comma-separated: sample, argmax")
    p.add_argument("--mirror", type=int, default=0, help="games of the argmax mirror (0: not read)")
    p.add_argument("--out", default="")
    p.add_argument("--bf16", action=argparse.BooleanOptionalAction, default=True)
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    modes = args.modes.split(",")
    assert all(m in MODES for m in modes), f"modes are {MODES}"
    assert torch.cuda.is_available(), "no CUDA device: is the eGPU connected?"
    device = "cuda"
    torch.cuda.set_per_process_memory_fraction(0.92)
    board = Board.load(device)
    tables = BlitzTables.load(os.path.join(DATA, "blitz-256"), device)
    tables.scaled_oversize = True
    net = load_net(args.ckpt, board, device)
    out: dict = {"ckpt": args.ckpt, "games": args.games}

    def keep() -> None:
        if args.out:
            with open(args.out, "w") as f:
                f.write(json.dumps(out, indent=1) + "\n")

    half = args.games // 2
    # Every check built before any runs, as the panel builds its own: the captured steps share one
    # memory pool, and a step captured after another's graph is freed fails in the allocator.
    checks = [(mode, PairEval(board, tables, net, *spec.split("=", 1), args.games, device, greedy=mode == "argmax",
                              bf16=args.bf16))
              for mode in modes for spec in args.anchor]
    mirror_check = MirrorEval(board, tables, net, args.mirror, device, bf16=args.bf16) if args.mirror else None
    for mode, check in checks:
        started = time.time()
        pair = check.run()
        label = pair["anchor"]
        out[f"{mode} {label} one-in"] = reading(pair["one_in"], half - pair["one_in_capped"], 0.2)
        out[f"{mode} {label} one-out"] = reading(pair["one_out"], (args.games - half) - pair["one_out_capped"], 0.8)
        print(f"{mode} {label}: one-in {out[f'{mode} {label} one-in']}, one-out {out[f'{mode} {label} one-out']}, "
              f"{time.time() - started:.0f}s", flush=True)
        keep()
    if mirror_check is not None:
        mirror = mirror_check.run()
        capped = round(mirror["capped"] * mirror["games"])
        out["argmax mirror capped"] = {"share": round(mirror["capped"], 4), "interval": wilson(capped, int(mirror["games"])),
                                       "games": int(mirror["games"]), "turns": round(mirror["turns"], 1)}
        print(f"mirror: {out['argmax mirror capped']}", flush=True)
        keep()
    return 0


if __name__ == "__main__":
    sys.exit(main())

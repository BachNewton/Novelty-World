"""Plays GPU games on the batched engine and writes their game records, as `npm run
risk:gpu-fixtures` records reference games, with the same flags, so the same seeds and seating can
be played on both engines and checked against each other (`npm run risk:gpu-check`):

    python -m riskgpu.play --bots greedy,greedy,greedy --games 20 --prefix fx --turns 600 --out runs/greedy-3p.jsonl.gz

run from `src/projects/risk/gpu/`. Games `<prefix>-0` to `<prefix>-<games − 1>`, a bot label per
seat, all in one batch. Defaults: 20 games, prefix `fx`, the harness's turn cap of 600, the CPU and
the largest blitz table present.
"""

import argparse
import os
import sys
import time

import torch

from .board import Board
from .bots import GPU_BOTS
from .data import load_best
from .records import write_records
from .runner import play_games
from .tables import BlitzTables


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--bots", required=True, help="a label per seat, comma-separated")
    parser.add_argument("--games", type=int, default=20)
    parser.add_argument("--prefix", default="fx")
    parser.add_argument("--turns", type=int, default=600)
    parser.add_argument("--out", required=True)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--tables", default=None, help="a blitz table's path prefix (default: the largest present)")
    args = parser.parse_args(argv)
    bots = [label.strip() for label in args.bots.split(",") if label.strip()]
    if not 3 <= len(bots) <= 6:
        parser.error(f"Risk is for 3 to 6 players, not {len(bots)}")
    unknown = [label for label in bots if label not in GPU_BOTS]
    if unknown:
        parser.error(f"no GPU bot for {unknown}; the GPU has {sorted(GPU_BOTS)}")
    if args.device == "cpu":
        # The batch's tensors are small: a thread pool's overhead outweighs its work.
        torch.set_num_threads(1)

    started = time.perf_counter()
    tables = BlitzTables.load(args.tables, args.device) if args.tables else load_best(args.device)
    seeds = [f"{args.prefix}-{i}" for i in range(args.games)]
    results, records = play_games(seeds, [bots] * args.games, board=Board.load(args.device), tables=tables,
                                  max_turns=args.turns, device=args.device, record=True)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    write_records(args.out, records)
    moves = sum(r.decisions for r in results)
    capped = sum(r.capped for r in results)
    oversize = sum(r.oversize for r in results)
    print(f"{len(results)} games ({capped} capped, {oversize} oversize), {moves} moves -> {args.out} "
          f"in {time.perf_counter() - started:.1f}s on {args.device}, blitz table bound {tables.bound}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

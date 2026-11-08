"""The stage-0 panel (`ideas/learned-bot.md`, "Stage 0: the ruler") read on one checkpoint, without
training:

    python -m riskgpu.selfplay.panel --ckpt runs/imitate/imit-1/best.pt [--games 1024] [--out panel.json]

run from `src/projects/risk/gpu/`. At 5 players, on the trainer's fixed deals, every seat sampling
its moves as in training: the checkpoint alone among four GD Defensive (the floor), and one-in and
one-out against net-v1 sw128b-450 (the planner's class). Each reading is the checkpoint side's win
share of the decisive games against its par, with a 95% Wilson interval. `--argmax` has the
checkpoint play its most likely move instead (its opponents still sample), a diagnostic: how much of
its play's strength the sampling costs or gives.
"""

import argparse
import json
import math
import os
import sys

import torch

from ..board import Board
from ..data import DATA
from ..tables import BlitzTables
from .env import GD_PERSONAS
from .ladder import load_net
from .ppo import Evaluator, PairEval

GPU = os.path.dirname(DATA)
SW128B_450 = os.path.join(GPU, "runs", "selfplay", "sw128b", "snap-450.pt")


def wilson(wins: float, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (0.0, 1.0)
    p = wins / n
    centre = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return (round(centre - half, 4), round(centre + half, 4))


def reading(share: float, decisive: int, par: float) -> dict:
    wins = round(share * decisive)
    return {"win": round(share, 4), "par": par, "interval": wilson(wins, decisive), "decisive": decisive}


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--ckpt", required=True)
    p.add_argument("--games", type=int, default=1024)
    p.add_argument("--out", default="")
    p.add_argument("--argmax", action="store_true")
    args = p.parse_args(argv)
    assert torch.cuda.is_available(), "no CUDA device: is the eGPU connected?"
    device = "cuda"
    torch.cuda.set_per_process_memory_fraction(0.92)
    board = Board.load(device)
    tables = BlitzTables.load(os.path.join(DATA, "blitz-256"), device)
    tables.scaled_oversize = True
    net = load_net(args.ckpt, board, device)
    from ..bots.gd import gd_bot_graphable
    gd_bots = [gd_bot_graphable(persona, tables) for persona in GD_PERSONAS]

    out = {"ckpt": args.ckpt, "games": args.games, "argmax": args.argmax}
    # Both are built before either runs, as the trainer builds its checks: the captured steps share
    # one memory pool, which is released when the last graph holding it is freed.
    gd_eval = Evaluator(board, tables, net, 5, args.games, device, opponent="gd-defensive", gd_bots=gd_bots,
                        greedy=args.argmax)
    pair_eval = PairEval(board, tables, net, "sw128b-450", SW128B_450, args.games, device, greedy=args.argmax)
    gd = gd_eval.run()
    decisive = round(gd["games"] * (1 - gd["capped"]))
    out["gd-defensive one-in"] = {**reading(gd["win"], decisive, 0.2), "capped": gd["capped"],
                                  "unfinished": gd["unfinished"]}
    pair = pair_eval.run()
    half = args.games // 2
    out["sw128b-450 one-in"] = reading(pair["one_in"], half - pair["one_in_capped"], 0.2)
    out["sw128b-450 one-out"] = reading(pair["one_out"], (args.games - half) - pair["one_out_capped"], 0.8)
    text = json.dumps(out, indent=1)
    print(text)
    if args.out:
        with open(args.out, "w") as f:
            f.write(text + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())

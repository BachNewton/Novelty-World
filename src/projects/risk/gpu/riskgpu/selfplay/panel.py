"""The stage-0 panel (`ideas/learned-bot.md`, "Stage 0: the ruler"), read on a network:

    python -m riskgpu.selfplay.panel --ckpt runs/imitate/imit-1/best.pt [--games 1024] [--out panel.json]

run from `src/projects/risk/gpu/`; the PPO trainer reads the same panel on its learner every
`--eval-every` iterations with `--panel`. At 5 players, on fixed deals, the network alone among four
GD Defensive (the floor), and one-in and one-out against net-v1 sw128b-450 (the planner's class),
against imit-1 (the imitation of the target's class) and against s2-2-150 (stage 2's best, past
the target's class, learned-v1's weights), each read twice: the network sampling its
moves as net-v1 plays, and playing its most likely move. Its opponents always sample. Each reading is
the network side's win share of the decisive games against its par, with a 95% Wilson interval.
Beside them, the stall's health reading: five argmax copies of the network at one table, and the
share of those games that reach the cap.
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
from .ppo import Evaluator, MirrorEval, PairEval

GPU = os.path.dirname(DATA)
SW128B_450 = os.path.join(GPU, "runs", "selfplay", "sw128b", "snap-450.pt")
IMIT_1 = os.path.join(GPU, "runs", "imitate", "imit-1", "best.pt")
S2_2_150 = os.path.join(GPU, "runs", "selfplay", "s2-2", "snap-150.pt")
ANCHORS = (("sw128b-450", SW128B_450), ("imit-1", IMIT_1), ("s2-2-150", S2_2_150))
MODES = ("sample", "argmax")


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


class Panel:
    """Every check built at once, as the trainer builds its checks: the captured steps share one
    memory pool, which is released when the last graph holding it is freed."""

    def __init__(self, board, tables, net, games: int, device: str, gd_bots: list, bf16: bool = True):
        self.games = games
        self.checks = {}
        for mode in MODES:
            greedy = mode == "argmax"
            self.checks[mode] = (
                Evaluator(board, tables, net, 5, games, device, opponent="gd-defensive", gd_bots=gd_bots, greedy=greedy,
                          bf16=bf16),
                [PairEval(board, tables, net, label, path, games, device, greedy=greedy, bf16=bf16) for label, path in ANCHORS],
            )
        self.mirror = MirrorEval(board, tables, net, games, device, bf16=bf16)

    def run(self) -> dict:
        out = {}
        half = self.games // 2
        for mode, (gd_eval, pairs) in self.checks.items():
            gd = gd_eval.run()
            decisive = round(gd["games"] * (1 - gd["capped"]))
            out[f"{mode} gd-defensive one-in"] = {**reading(gd["win"], decisive, 0.2), "capped": gd["capped"]}
            for pair_eval in pairs:
                pair = pair_eval.run()
                label = pair["anchor"]
                out[f"{mode} {label} one-in"] = reading(pair["one_in"], half - pair["one_in_capped"], 0.2)
                out[f"{mode} {label} one-out"] = reading(pair["one_out"], (self.games - half) - pair["one_out_capped"], 0.8)
        mirror = self.mirror.run()
        capped = round(mirror["capped"] * mirror["games"])
        out["argmax mirror capped"] = {"share": round(mirror["capped"], 4), "interval": wilson(capped, int(mirror["games"])),
                                       "games": int(mirror["games"]), "turns": round(mirror["turns"], 1)}
        return out


def gd_bots_for(tables) -> list:
    from ..bots.gd import gd_bot_graphable
    return [gd_bot_graphable(persona, tables) for persona in GD_PERSONAS]


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--ckpt", required=True)
    p.add_argument("--games", type=int, default=1024)
    p.add_argument("--out", default="")
    args = p.parse_args(argv)
    assert torch.cuda.is_available(), "no CUDA device: is the eGPU connected?"
    device = "cuda"
    torch.cuda.set_per_process_memory_fraction(0.92)
    board = Board.load(device)
    tables = BlitzTables.load(os.path.join(DATA, "blitz-256"), device)
    tables.scaled_oversize = True
    net = load_net(args.ckpt, board, device)
    out = {"ckpt": args.ckpt, "games": args.games,
           **Panel(board, tables, net, args.games, device, gd_bots_for(tables)).run()}
    text = json.dumps(out, indent=1)
    print(text)
    if args.out:
        with open(args.out, "w") as f:
            f.write(text + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())

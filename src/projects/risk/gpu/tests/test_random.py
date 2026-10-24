"""The random bot is the fuzzer: every move it draws from the options must be legal, in every
phase, which `step` checks against the same options. It starts from positions of recorded
reference games just before a trade, so sets, forced trades and late-game boards are on offer."""

import os

import torch

from riskgpu.board import Board
from riskgpu.bots.random import random_bot
from riskgpu.data import FIXTURES, load_best
from riskgpu.engine import TRADE, step
from riskgpu.options import options
from riskgpu.records import read_records
from riskgpu.runner import Decision, TurnLog
from riskgpu.state import new_games


def positions_before_trades(board, tables, count: int):
    """`count` positions, each the moment before a recorded trade, spread over the fixtures."""
    picked = []
    for name in ("greedy-3p", "greedy-4p", "greedy-6p", "rule-4p"):
        for r in read_records(os.path.join(FIXTURES, f"{name}.jsonl.gz")):
            trades = [i for i, (_, kind, *_) in enumerate(r["moves"]) if kind == TRADE]
            picked += [(r, trades[0]), (r, trades[-1])] if trades else []
    picked = picked[:count]
    s = new_games([r["seed"] for r, _ in picked], [r["players"] for r, _ in picked], board, "cpu")
    stop = torch.tensor([at for _, at in picked])
    for decision in range(int(stop.max())):
        moves = torch.tensor([r["moves"][min(decision, at)][1:] for r, at in picked])
        step(s, moves, board, tables, done=decision >= stop)
    return s


def test_200_random_decisions_over_every_phase_are_legal():
    board, tables = Board.load("cpu"), load_best("cpu")
    s = positions_before_trades(board, tables, 8)
    batch = s.batch
    everyone = torch.ones(batch, dtype=torch.bool)
    kinds = set()
    for decision in range(25):
        legal = options(s, board)
        d = Decision(s, legal, board, tables, TurnLog.empty(batch, "cpu"), torch.full((batch,), decision),
                     torch.zeros(batch, 6, dtype=torch.bool), [""] * batch)
        moves = random_bot(d, everyone)
        kinds |= set(moves[:, 0].tolist())
        step(s, moves, board, tables, check=True)  # raises IllegalMove on any illegal move
    assert 25 * batch == 200
    assert kinds == set(range(8)), sorted(kinds)

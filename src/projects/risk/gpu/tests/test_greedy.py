"""GPU greedy against the reference engine's greedy: the committed fixtures replayed as one batch,
and at every decision a greedy seat made, the GPU bot asked the same position must make the
recorded move."""

import os

import pytest
import torch

from riskgpu.board import Board
from riskgpu.bots.greedy import greedy_bot
from riskgpu.data import FIXTURES, load_best
from riskgpu.engine import step
from riskgpu.options import options
from riskgpu.records import read_records
from riskgpu.runner import Decision, TurnLog
from riskgpu.state import new_games

FILES = ("greedy-3p", "greedy-4p", "greedy-6p", "gd-greedy-3p", "mixed-cap-4p", "rule-4p")


def replay_greedy(records: list[dict], board: Board, tables, graphable: bool = False) -> tuple[list[int], list[str]]:
    """Each record's greedy decisions compared, and every disagreement described."""
    batch = len(records)
    s = new_games([r["seed"] for r in records], [r["players"] for r in records], board, "cpu")
    greedy_seat = torch.tensor([[label == "greedy" for label in r["bots"]] + [False] * (6 - r["players"]) for r in records])
    log = TurnLog.empty(batch, "cpu")
    compared = [0] * batch
    disagreements: list[str] = []
    rows = torch.arange(batch)
    for decision in range(max(len(r["moves"]) for r in records)):
        live = torch.tensor([decision < len(r["moves"]) for r in records])
        recorded = torch.tensor([r["moves"][decision][1:] if decision < len(r["moves"]) else [0] * 5 for r in records])
        legal = options(s, board)
        mine = live & greedy_seat[rows, s.active.to(torch.int64)]
        ours = greedy_bot(Decision(s, legal, board, tables, log, torch.zeros(batch, dtype=torch.int64),
                                   torch.zeros(batch, 6, dtype=torch.bool), [""] * batch), mine,
                          graphable=graphable)
        for g in mine.nonzero()[:, 0].tolist():
            compared[g] += 1
            if ours[g].tolist() != recorded[g].tolist():
                r = records[g]
                disagreements.append(
                    f"{r['seed']} decision {decision} seat {int(s.active[g])} phase {int(s.phase[g])}: "
                    f"GPU {ours[g].tolist()}, recorded {recorded[g].tolist()}; "
                    f"owner {s.owner[g].tolist()} armies {s.armies[g].tolist()}"
                )
        before = s.clone()
        step(s, recorded, board, tables, done=~live, legal=legal)
        log.update(before, s, recorded, live)
    return compared, disagreements


@pytest.mark.parametrize("graphable", [False, True], ids=["eager", "graphable"])
@pytest.mark.parametrize("name", FILES)
def test_greedy_makes_every_recorded_greedy_move(name, graphable):
    records = read_records(os.path.join(FIXTURES, f"{name}.jsonl.gz"))
    compared, disagreements = replay_greedy(records, Board.load("cpu"), load_best("cpu"), graphable)
    print(f"{name}: {sum(compared)} greedy decisions compared, {len(disagreements)} disagreements")
    assert sum(compared) > 0
    assert disagreements == [], "\n".join(disagreements[:10])

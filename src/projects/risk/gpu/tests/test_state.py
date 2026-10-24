import json
import os

import torch

from riskgpu.board import DATA, Board
from riskgpu.rules import reinforcements
from riskgpu.state import State, new_games, to_engine_dict

SAMPLES = json.load(open(os.path.join(DATA, "setup-samples.json"), encoding="utf-8"))


def test_setup_matches_reference_engine():
    board = Board.load("cpu")
    games = new_games([s["seed"] for s in SAMPLES], [s["players"] for s in SAMPLES], board, "cpu")
    for i, sample in enumerate(SAMPLES):
        assert to_engine_dict(games, i, board) == sample["state"], (sample["seed"], sample["players"])


def test_empty_clone_select_assign():
    board = Board.load("cpu")
    games = new_games(["a", "b", "c"], [3, 4, 6], board, "cpu")
    copy = games.clone()
    copy.armies[0, 0] += 5
    assert int(games.armies[0, 0]) + 5 == int(copy.armies[0, 0])
    picked = games.select(torch.tensor([False, True, True]))
    assert picked.batch == 2 and picked.players.tolist() == [4, 6]
    empty = State.empty(3, "cpu")
    empty.assign(torch.tensor([True, False, True]), games)
    assert empty.players.tolist() == [3, 0, 6]
    assert empty.winner.tolist() == [-1, -1, -1]


def test_reinforcements():
    board = Board.load("cpu")
    owner = torch.zeros(2, 42, dtype=torch.int8)
    owner[1, :] = 1
    owner[1, 9:13] = 0  # seat 0 holds South America only
    got = reinforcements(owner, torch.tensor([0, 0]), board)
    assert got.dtype == torch.int32
    assert got.tolist() == [14 + 5 + 2 + 5 + 3 + 7 + 2, 3 + 2]

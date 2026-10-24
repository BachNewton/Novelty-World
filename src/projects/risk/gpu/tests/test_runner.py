"""The game runner: games played to their end with every move checked, and greedy games recorded
on the GPU identical, move for move and hash for hash, to the reference engine's recording of the
same seeds (`fixtures/gpu-greedy-3p`, made by `npm run risk:gpu-fixtures -- --bots
greedy,greedy,greedy --games 4 --prefix gpu-greedy --turns 600`)."""

import os

import pytest

from riskgpu.board import Board
from riskgpu.data import FIXTURES, load_best
from riskgpu.records import read_records, write_records
from riskgpu.runner import play_games


@pytest.fixture(scope="module")
def board():
    return Board.load("cpu")


@pytest.fixture(scope="module")
def tables():
    return load_best("cpu")


def test_random_games_finish_legal_and_well_formed(board, tables, tmp_path):
    seatings = [["random"] * n for n in (3, 4, 5, 3, 4, 5)]
    seeds = [f"runner-random-{i}" for i in range(len(seatings))]
    results, records = play_games(seeds, seatings, board=board, tables=tables, max_turns=40, device="cpu",
                                  check=True, record=True)
    for r, seating in zip(results, seatings):
        n = len(seating)
        assert len(r.places) == n and r.decisions > 0
        if r.capped:
            assert r.winner == -1 and r.turns == 40
            assert all(1 <= p <= n for p in r.places)
        else:
            assert r.places[r.winner] == 1 and sorted(r.places) == list(range(1, n + 1))
    path = os.path.join(tmp_path, "random.jsonl.gz")
    write_records(path, records)
    again = read_records(path)
    assert again == records
    for record, r in zip(again, results):
        assert len(record["moves"]) == len(record["stateHashes"]) == len(record["optionsHashes"]) == r.decisions
        assert record["result"] == {"winner": r.winner, "turns": r.turns, "capped": r.capped, "places": r.places}


def test_greedy_games_are_the_reference_engines_move_for_move(board, tables):
    expected = read_records(os.path.join(FIXTURES, "gpu-greedy-3p.jsonl.gz"))
    seeds = [f"gpu-greedy-{i}" for i in range(4)]
    assert [r["seed"] for r in expected] == seeds
    _, records = play_games(seeds, [["greedy"] * 3] * 4, board=board, tables=tables, max_turns=600, device="cpu",
                            record=True)
    for ours, theirs in zip(records, expected):
        assert ours.pop("oversize") is False
        assert ours == theirs

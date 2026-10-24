import os

import pytest

from riskgpu.data import fixture_paths, load_best
from riskgpu.lockstep import run
from riskgpu.records import read_records

FIXTURES = fixture_paths()


@pytest.fixture(scope="module")
def tables():
    return load_best("cpu")


def test_every_fixture_game_exact_at_every_decision(tables):
    games = [(path, record) for path in FIXTURES for record in read_records(path)]
    assert len(games) >= 19
    reports = run(games, "cpu", tables, invariants=True)
    failures = [(os.path.basename(r.file), r.seed, r.decision, r.mismatch) for r in reports if not r.exact]
    assert failures == []


def test_a_wrong_hash_is_caught_at_its_decision(tables):
    shortest = lambda: min((r for path in FIXTURES for r in read_records(path)), key=lambda r: len(r["moves"]))  # noqa: E731
    record, good = shortest(), shortest()
    record["stateHashes"][5] = "0" * 16
    record["optionsHashes"][9] = "0" * 16
    reports = run([("bad", record), ("good", good)], "cpu", tables)
    assert reports[0].decision == 5 and "state hash" in reports[0].mismatch
    assert reports[1].exact

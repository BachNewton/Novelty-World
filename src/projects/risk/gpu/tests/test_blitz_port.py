"""The Python port of the odds (`riskgpu/blitz_port.py`) against what the TypeScript wrote: the
blitz tables, `odds-samples.json` and the reference blitz samples, every value bit for bit."""

import json
import os
import random

import numpy as np
import pytest
import torch

from riskgpu import blitz_port
from riskgpu.board import DATA
from riskgpu.tables import BlitzTables, resolve_blitz


def load_tables(bound: int) -> BlitzTables:
    prefix = os.path.join(DATA, f"blitz-{bound}")
    if not os.path.exists(prefix + ".bin"):
        pytest.skip(f"gpu/data/blitz-{bound}.bin is absent: run `npm run risk:gpu-tables -- --bound {bound}`")
    return BlitzTables.load(prefix, "cpu")


def assert_cells_match(tables: BlitzTables, fights) -> None:
    capture = tables.capture.numpy()
    index = tables.index.numpy()
    values = tables.values.numpy()
    width = tables.bound + 1
    for a, d in fights:
        cell = blitz_port.cell(a, d)
        k = a * width + d
        at_a, at_d, likeliest_a, likeliest_d = index[k]
        assert cell.capture == capture[k], (a, d)
        assert np.array_equal(cell.values_a, values[at_a : at_a + a]), (a, d)
        assert np.array_equal(cell.values_d, values[at_d : at_d + d]), (a, d)
        assert (cell.likeliest_a, cell.likeliest_d) == (likeliest_a, likeliest_d), (a, d)


def test_every_cell_of_the_committed_table():
    tables = load_tables(32)
    assert_cells_match(tables, [(a, d) for a in range(1, 33) for d in range(1, 33)])


def test_a_sample_of_the_local_256_table():
    tables = load_tables(256)
    rng = random.Random("blitz-256-cells")
    small = [(a, d) for a in range(1, 50) for d in range(1, 50) if a + d <= 50]
    large = [(rng.randint(1, 256), rng.randint(1, 256)) for _ in range(400 - len(small))]
    assert_cells_match(tables, small + large)


@pytest.fixture(scope="module")
def odds():
    with open(os.path.join(DATA, "odds-samples.json"), encoding="utf-8") as f:
        return json.load(f)


def test_win_chance(odds):
    for a, d, p in odds["winChance"] + odds["worked"]:
        assert blitz_port.win_chance(a, d) == p, (a, d)


def test_estimated_win_chance(odds):
    for a, d, p, estimate in odds["estimated"]:
        assert blitz_port.estimated_win_chance(a, d) == estimate, (a, d)
        assert blitz_port.win_chance(a, d) == p, (a, d)


def test_balance_win_chance(odds):
    for p, balanced in odds["balanceWinChance"]:
        assert blitz_port.balance_win_chance(p) == balanced, p


def test_ideal_attack_units(odds):
    for defend, threshold, ideal in odds["idealAttackUnits"]:
        assert blitz_port.ideal_attack_units(defend, threshold) == ideal, (defend, threshold)


def resolve(tables: BlitzTables, rows):
    a = torch.tensor([r[0] for r in rows], dtype=torch.int64)
    d = torch.tensor([r[1] for r in rows], dtype=torch.int64)
    r = torch.tensor([r[2] for r in rows], dtype=torch.float64)
    attacker, defender, oversize = resolve_blitz(tables, a, d, r)
    return list(zip(attacker.tolist(), defender.tolist())), oversize.tolist()


def test_estimated_blitzes_past_the_table(odds):
    tables = load_tables(32)
    rows = odds["resolveBlitz"]
    got, oversize = resolve(tables, rows)
    assert got == [(row[3], row[4]) for row in rows]
    assert all(oversize)


def test_blitzes_past_the_table_match_the_256_samples():
    tables = load_tables(32)
    path = os.path.join(DATA, "blitz-256-samples.json")
    if not os.path.exists(path):
        pytest.skip("gpu/data/blitz-256-samples.json is absent: run `npm run risk:gpu-tables -- --bound 256`")
    with open(path, encoding="utf-8") as f:
        samples = json.load(f)[:150]
    got, oversize = resolve(tables, [(s["a"], s["d"], s["r"]) for s in samples])
    assert got == [(s["attackerLosses"], s["defenderLosses"]) for s in samples]
    assert oversize == [s["a"] > 32 or s["d"] > 32 for s in samples]


def test_a_rolled_fight_is_refused():
    tables = load_tables(32)
    with pytest.raises(NotImplementedError, match="60000 against 40001"):
        resolve(tables, [(60_000, 40_001, 0.5)])


def test_v8_maths_on_edge_arguments():
    assert blitz_port.v8_pow(0.0, 1.3) == 0.0
    assert blitz_port.v8_pow(1.0, 1.8) == 1.0
    assert blitz_port.v8_pow(5e-324, blitz_port.fround(1.8)) == 0.0
    assert blitz_port.v8_log(1.0) == 0.0
    assert blitz_port.v8_exp(0.0) == 1.0

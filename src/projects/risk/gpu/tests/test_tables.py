import json
import os

import numpy as np
import pytest
import torch

from riskgpu.board import DATA
from riskgpu.tables import BlitzTables, resolve_blitz

BOUND = 3


def write_table(prefix: str, fights: dict) -> None:
    """A table of bound 3 from {(a, d): (capture, attacker totals, defender totals, likeliestA,
    likeliestD)}; cells not given are left as zeros."""
    cells = (BOUND + 1) ** 2
    capture = np.zeros(cells, "<f8")
    index = np.zeros((cells, 4), "<i4")
    values: list[float] = []
    for (a, d), (cap, att, dfn, lik_a, lik_d) in fights.items():
        assert len(att) == a and len(dfn) == d
        cell = a * (BOUND + 1) + d
        capture[cell] = cap
        index[cell] = [len(values), len(values) + a, lik_a, lik_d]
        values += att + dfn
    sections = [("capture", capture.tobytes()), ("index", index.tobytes()), ("values", np.array(values, "<f8").tobytes())]
    meta = {"bound": BOUND, "sections": {}}
    blob = b""
    for name, data in sections:
        meta["sections"][name] = {"offset": len(blob), "bytes": len(data)}
        blob += data
    open(prefix + ".bin", "wb").write(blob)
    json.dump(meta, open(prefix + ".json", "w"))


@pytest.fixture
def tables(tmp_path):
    prefix = str(tmp_path / "blitz-3")
    write_table(prefix, {
        # capture 0.6; attacker totals 0.2, unreachable, 0.6; defender totals 0.1, 0.4 (of the 0.4 held)
        (3, 2): (0.6, [0.2, -1.0, 0.6], [0.1, 0.4], 2, 1),
        # totals that stop short of the capture chance: the likeliest index answers
        (2, 1): (0.5, [0.1, 0.45], [0.49], 1, 0),
        (1, 1): (0.3, [0.3], [0.7], 0, 0),
    })
    return BlitzTables.load(prefix, "cpu")


def run(tables, rows):
    a = torch.tensor([r[0] for r in rows], dtype=torch.int64)
    d = torch.tensor([r[1] for r in rows], dtype=torch.int64)
    r = torch.tensor([r[2] for r in rows], dtype=torch.float64)
    al, dl, over = resolve_blitz(tables, a, d, r)
    return list(zip(al.tolist(), dl.tolist(), over.tolist()))


def test_capture_branch(tables):
    got = run(tables, [(3, 2, 0.1), (3, 2, 0.2), (3, 2, 0.3), (3, 2, 0.6)])
    # 0.3 skips the unreachable index 1 (its −1 never reaches) and lands on index 2
    assert got == [(0, 2, False), (0, 2, False), (2, 2, False), (2, 2, False)]


def test_defender_branch(tables):
    got = run(tables, [(3, 2, 0.65), (3, 2, 0.75), (3, 2, 0.99)])
    assert got == [(3, 0, False), (3, 1, False), (3, 1, False)]


def test_likeliest_fallback(tables):
    # capture 0.5 >= 0.48 but the attacker totals reach only 0.45; hold side 0.995 − 0.5 > 0.49
    assert run(tables, [(2, 1, 0.48), (2, 1, 0.995)]) == [(1, 1, False), (2, 0, False)]


def test_zero_draw_is_min_value(tables):
    assert run(tables, [(1, 1, 0.0), (3, 2, 0.0)]) == [(0, 1, False), (0, 2, False)]


def test_oversize_and_invalid(tables):
    assert run(tables, [(4, 1, 0.5), (1, 4, 0.5), (1, 1, 0.5)]) == [(0, 0, True), (0, 0, True), (1, 0, False)]
    with pytest.raises(ValueError):
        run(tables, [(0, 1, 0.5)])


def test_missing_section(tmp_path):
    prefix = str(tmp_path / "bad")
    json.dump({"bound": 1, "sections": {}}, open(prefix + ".json", "w"))
    open(prefix + ".bin", "wb").write(b"")
    with pytest.raises(ValueError):
        BlitzTables.load(prefix, "cpu")


def test_golden_samples_from_typescript():
    prefix = os.path.join(DATA, "blitz-32")
    if not os.path.exists(prefix + ".bin"):
        pytest.skip("gpu/data/blitz-32.bin is absent: run `npm run risk:gpu-tables` to export it")
    tables = BlitzTables.load(prefix, "cpu")
    samples = json.load(open(os.path.join(DATA, "blitz-32-samples.json"), encoding="utf-8"))
    rows = [(s["a"], s["d"], s["r"]) for s in samples]
    got = run(tables, rows)
    expected = [(s["attackerLosses"], s["defenderLosses"], False) for s in samples]
    assert got == expected

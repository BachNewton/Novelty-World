import json
import os

import torch

from riskgpu.board import DATA
from riskgpu.rng import bot_seed, decision_seed, floor_draw, mulberry32_scalar, next_draws, xmur3

VECTORS = json.load(open(os.path.join(DATA, "rng-vectors.json"), encoding="utf-8"))


def test_string_seeds_scalar():
    for v in VECTORS["strings"]:
        state = xmur3(v["seed"])
        assert state == v["state0"], v["seed"]
        for draw, after in zip(v["draws"], v["states"], strict=True):
            got, state = mulberry32_scalar(state)
            assert (got, state) == (draw, after), v["seed"]


def test_string_seeds_tensor():
    strings = VECTORS["strings"]
    state = torch.tensor([xmur3(v["seed"]) for v in strings], dtype=torch.int64)
    for k in range(len(strings[0]["draws"])):
        draw, state = next_draws(state)
        assert draw.tolist() == [v["draws"][k] for v in strings]
        assert state.tolist() == [v["states"][k] for v in strings]


def test_numeric_states():
    numeric = VECTORS["numeric"]
    state = torch.tensor([v["state"] for v in numeric], dtype=torch.int64)
    for k in range(len(numeric[0]["draws"])):
        draw, state = next_draws(state)
        assert draw.tolist() == [v["draws"][k] for v in numeric]
    assert state.tolist() == [v["stateAfter"] for v in numeric]
    for v in numeric:
        s = v["state"]
        for draw in v["draws"]:
            got, s = mulberry32_scalar(s)
            assert got == draw
        assert s == v["stateAfter"]


def test_million_draw_checksum():
    run = VECTORS["longRun"]
    state = xmur3(run["seed"])
    acc = 0
    for _ in range(run["draws"]):
        draw, state = mulberry32_scalar(state)
        acc = (acc + int(draw * 1000003)) % 1000000007
    assert acc == run["checksum"]
    assert state == run["stateAfter"]


def test_tensor_matches_scalar():
    states = [xmur3(f"lane-{k}") for k in range(62)] + [0, 0xFFFFFFFF]
    lanes = torch.tensor(states, dtype=torch.int64)
    for _ in range(2000):
        draw, lanes = next_draws(lanes)
        expected = [mulberry32_scalar(s) for s in states]
        states = [s for _, s in expected]
        assert draw.tolist() == [d for d, _ in expected]
        assert lanes.tolist() == states


def test_floor_draw():
    draw = torch.tensor([0.0, 0.5, 0.9999999999999999], dtype=torch.float64)
    assert floor_draw(draw, 6).tolist() == [0, 3, 5]
    assert floor_draw(draw, torch.tensor([1, 2, 43])).tolist() == [0, 1, 42]


def test_bot_seed():
    v = VECTORS["botSeed"]
    assert bot_seed(v["gameSeed"]) == v["botSeed"]
    assert decision_seed(v["botSeed"], 418) == xmur3(f"{v['botSeed']}/418")

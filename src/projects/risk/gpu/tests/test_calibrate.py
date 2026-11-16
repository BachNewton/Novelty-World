"""The value head's calibration against real outcomes (`riskgpu/selfplay/calibrate.py`) and the
weight average (`riskgpu/selfplay/average.py`).

What would silently ruin a calibration reading: a decision joined to another seat's or another
game's score (the batch spans many recorded chunks, and the checkpoint's seat rotates by game),
and the bootstrap's readings built from summed per-game statistics disagreeing with the plain
formulas they stand for."""

import numpy as np
import pytest
import torch

from riskgpu.board import MAX_SEATS, Board
from riskgpu.data import load_best
from riskgpu.selfplay.average import average
from riskgpu.selfplay.calibrate import PLAYERS, collect, game_sums, mirror_env, readings
from riskgpu.selfplay.env import GREEDY, LEARNER
from riskgpu.selfplay.parity import random_net

PLACES = sorted([1.0, 0.0, -1 / 3, -2 / 3, -1.0])


def test_each_decision_is_joined_to_its_own_seats_final_score():
    board = Board.load("cpu")
    tables = load_best("cpu")
    tables.scaled_oversize = True
    games = 6
    torch.manual_seed(3)
    net = random_net(16, 1, 2, 2, board, seed=5)
    env = mirror_env(board, tables, net, games, "cpu", bf16=False, cap=100)
    # The network in a rotating seat among greedy copies, so games end (greedy wins) and each
    # game's network seat differs.
    seat_kind = torch.full((games, MAX_SEATS), GREEDY, dtype=torch.int64)
    seat_kind[torch.arange(games), torch.arange(games) % PLAYERS] = LEARNER
    env.seat_kind.copy_(seat_kind)
    env.cfg.cap_greedy = 1.0  # the mirror serves greedy one row a step; here it holds most seats
    d = collect(env)

    assert set(np.unique(d.game)) == set(range(games))
    assert (d.seat == d.game % PLAYERS).all()
    y = d.outcome()
    assert np.allclose(y, d.final[d.game, d.game % PLAYERS])
    winner = env.state.winner.to(torch.int64).numpy()
    decisive = winner >= 0
    assert decisive.any() and (~decisive).any() == d.capped.any()
    for g in np.flatnonzero(decisive):
        assert d.final[g, winner[g]] == 1.0
        assert np.allclose(sorted(d.final[g, :PLAYERS]), PLACES)
    for g in np.flatnonzero(~decisive):
        assert (d.final[g, :PLAYERS] < 1).all()
    progress = d.progress()
    assert (progress >= 0).all() and (progress < 1).all()
    # The games ran over many recorded chunks, so the join crossed chunk boundaries.
    assert (d.last_turn - d.first_turn).max() > 20


def test_readings_from_per_game_sums_match_the_plain_formulas():
    rng = np.random.default_rng(0)
    n, games = 400, 30
    game = rng.integers(0, games, n)
    land, troops = rng.random(n), rng.random(n)
    y = 0.8 * land - 0.3 * troops + rng.normal(0, 0.2, n)
    v = y + rng.normal(0.1, 0.3, n)
    mask = rng.random(n) < 0.7
    r = readings(game_sums(game, games, y, v, land, troops, mask).sum(0))
    ym, vm = y[mask], v[mask]
    assert r["n"] == mask.sum()
    assert np.isclose(r["mse"], np.mean((ym - vm) ** 2))
    assert np.isclose(r["ev"], 1 - np.var(ym - vm) / np.var(ym))
    x = np.stack([np.ones(mask.sum()), land[mask], troops[mask]], 1)
    beta = np.linalg.lstsq(x, ym, rcond=None)[0]
    assert np.isclose(r["ev_share"], 1 - np.var(ym - x @ beta) / np.var(ym))


def test_the_average_of_two_state_dicts_and_its_refusals():
    board = Board.load("cpu")
    a = random_net(16, 1, 2, 2, board, seed=1).state_dict()
    b = random_net(16, 1, 2, 2, board, seed=2).state_dict()
    mean = average([a, b])
    assert set(mean) == set(a)
    for key in a:
        assert torch.allclose(mean[key], (a[key] + b[key]) / 2)
    wider = random_net(32, 1, 2, 2, board, seed=3).state_dict()
    with pytest.raises(ValueError):
        average([a, wider])
    exact = random_net(16, 1, 2, 2, board, seed=4, actions="exact").state_dict()
    with pytest.raises(ValueError):
        average([a, exact])

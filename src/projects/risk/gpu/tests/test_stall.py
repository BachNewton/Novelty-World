"""The stall reading (`riskgpu/selfplay/stall.py`).

What would silently ruin it: a decision bucketed into the wrong standing or stage, a turn's attacks
or first decision or final score joined from another seat's or game's rows, and the probe that
reads the policy's `P(end)` writing a row's number into another row (it maps the env's served rows
back to batch rows itself)."""

import numpy as np
import torch

from riskgpu.board import Board
from riskgpu.data import load_best
from riskgpu.options import KIND_ATTACK, KIND_FORTIFY, KIND_OCCUPY, KIND_REINFORCE
from riskgpu.selfplay.actions import ATTACK, END_ATTACK, END_TURN, FORTIFY, OCCUPY
from riskgpu.selfplay.calibrate import mirror_env
from riskgpu.selfplay.parity import random_net
from riskgpu.selfplay.stall import Decisions, board_standing, collect, last_values, stage_band, standing_third, turns


def test_standing_and_stage_buckets():
    assert standing_third(np.array([0.0, 0.79, 0.8, 1.0, 1.25, 1.26, 3.0])).tolist() == [0, 0, 1, 1, 1, 2, 2]
    assert stage_band(np.array([0, 49, 50, 99, 100, 199, 200, 399, 400, 600])).tolist() == [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]
    # Three seats, seat 2 out: seat 0 holds 30 of 42 territories and 90 of 100 armies.
    owner = torch.zeros(1, 42, dtype=torch.int8)
    owner[0, 30:] = 1
    armies = torch.ones(1, 42, dtype=torch.int32)
    armies[0, 0] = 61
    armies[0, 30:32] = 0
    s = board_standing(owner, armies, torch.tensor([[False, False, True, False, False, False]]), torch.tensor([3]))
    share0 = 0.5 * 30 / 42 + 0.5 * 90 / 100
    assert np.isclose(float(s[0, 0]), 2 * share0)
    assert np.isclose(float(s[0, 1]), 2 * (0.5 * 12 / 42 + 0.5 * 10 / 100))
    assert float(s[0, 2]) == 0


def decisions(rows, final, capped):
    cols = list(zip(*rows))
    names = ("game", "step", "seat", "turn", "kind", "main", "value", "p_end", "standing")
    d = {n: np.array(c) for n, c in zip(names, cols)}
    n = len(rows)
    games = final.shape[0]
    return Decisions(**d, entropy=np.zeros(n), armies=np.zeros(n, dtype=np.int64), final=final, capped=capped,
                     length=np.zeros(games), alive_end=np.ones((games, 6), dtype=bool), standing_end=np.ones((games, 6)))


def test_a_turn_is_joined_to_its_own_first_attack_decision_and_its_seats_score():
    R, A, O, F = KIND_REINFORCE, KIND_ATTACK, KIND_OCCUPY, KIND_FORTIFY
    final = np.zeros((2, 6))
    final[0, :3] = [1.0, -1.0, 0.0]
    final[1, :3] = [-0.5, -1.0, -0.5]
    # (game, step, seat, turn, kind, main, value, p_end, standing); the games interleave by step and
    # the rows arrive out of order, as chunks of a batch do.
    rows = [
        (1, 0, 2, 0, R, 0, -0.4, 0.0, 1.0),
        (0, 0, 0, 0, R, 0, 0.1, 0.0, 1.0),
        (0, 1, 0, 0, A, ATTACK + 3, 0.2, 0.3, 1.5),  # game 0 turn 0: two attacks, a move-in between
        (0, 2, 0, 0, O, OCCUPY, 0.2, 0.0, 1.5),
        (0, 3, 0, 0, A, ATTACK + 5, 0.25, 0.4, 1.6),
        (0, 4, 0, 0, A, END_ATTACK, 0.3, 0.9, 1.7),
        (0, 5, 0, 0, F, END_TURN, 0.3, 0.0, 1.7),
        (1, 1, 2, 0, A, END_ATTACK, -0.45, 0.8, 0.5),  # game 1 turn 0: no attack
        (0, 6, 1, 1, A, END_ATTACK, -0.7, 0.6, 0.6),  # game 0 turn 1: seat 1, no attack
        (1, 2, 0, 1, F, FORTIFY + 1, -0.5, 0.0, 1.0),  # game 1 turn 1: no attack phase at all
    ][::-1]
    d = decisions(rows, final, np.array([False, True]))
    t = turns(d)
    got = sorted(zip(t.game.tolist(), t.turn.tolist(), t.seat.tolist(), t.attacks.tolist(), t.p_end.tolist(),
                     t.value.tolist(), t.final.tolist(), t.standing.tolist()))
    assert got == [(0, 0, 0, 2, 0.3, 0.2, 1.0, 1.5), (0, 1, 1, 0, 0.6, -0.7, -1.0, 0.6),
                   (1, 0, 2, 0, 0.8, -0.45, -0.5, 0.5)]
    last = last_values(d)
    assert last[0, 0] == 0.3 and last[0, 1] == -0.7 and last[1, 2] == -0.45 and last[1, 0] == -0.5
    assert np.isnan(last[1, 1])


def test_the_probe_writes_each_rows_policy_numbers_to_that_row():
    board = Board.load("cpu")
    tables = load_best("cpu")
    tables.scaled_oversize = True
    games = 3
    torch.manual_seed(3)
    net = random_net(16, 1, 2, 2, board, seed=5)
    env = mirror_env(board, tables, net, games, "cpu", bf16=False, cap=12)
    env.cfg.learner_greedy = True
    d = collect(env, net)
    assert set(np.unique(d.game)) == set(range(games)) and d.capped.all()
    attack = d.kind == KIND_ATTACK
    # END_ATTACK is legal exactly at attack decisions: a probe row landing on another row's decision
    # would put a probability where the decision had none, or none where it had one.
    assert attack.any() and (d.p_end[attack] > 0).all() and (d.p_end[~attack] == 0).all()
    assert (d.entropy >= 0).all()
    # The probe leaves the network and the env as it found them.
    assert "heads_main" not in net.__dict__
    from riskgpu.selfplay import env as env_module
    from riskgpu.selfplay.net import act
    assert env_module.act is act

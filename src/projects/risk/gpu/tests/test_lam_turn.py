"""The λ of a link that crosses a seat's turn's end (`--lam-turn`, `riskgpu/selfplay/ppo.py`).

What would silently change training: the option drifting the estimator it leaves alone (a run
without it, or with it equal to `--lam`, must reproduce to the bit), a link given the wrong λ by
reading the wrong turn, and a held decision completed across a rollout's end with the λ of a link
it isn't."""

from types import SimpleNamespace

import pytest
import torch

from riskgpu.board import MAX_SEATS, Board
from riskgpu.data import load_best
from riskgpu.selfplay.env import GREEDY, KEPT, LOG_FIELDS, Env, EnvConfig
from riskgpu.selfplay.net import Net
from riskgpu.selfplay.ppo import Carry, advantages, kept
from riskgpu.state import LAYOUT


@pytest.fixture(scope="module")
def world():
    board = Board.load("cpu")
    tables = load_best("cpu")
    tables.scaled_oversize = True
    return board, tables


def make_env(world, horizon: int) -> Env:
    board, tables = world
    torch.manual_seed(5)
    net = Net(16, 1, 2, 2, edges=board.edges, adjacency=board.adjacency)
    torch.manual_seed(11)
    # Caps of 4 to 8 player-turns: games end inside the rollout and each seat plays several turns.
    cfg = EnvConfig(batch=8, sizes=(3, 4, 5, 6), size_weights=(0.25,) * 4, cap_low=4, cap_high=8, pool=8,
                    snapshots=0, horizon=horizon, bf16=False, cap_learner=1.0, cap_greedy=1.0)
    env = Env(cfg, board, tables, net, "cpu", seed_prefix="lam-turn")
    env.kind_probs.zero_()
    env.kind_probs[GREEDY] = 1.0
    return env


def same(x: dict, y: dict) -> bool:
    return x.keys() == y.keys() and all(torch.equal(x[k], y[k]) for k in x)


def test_unset_or_equal_to_lam_is_the_plain_estimator(world):
    T = 24
    env = make_env(world, T)
    carry = Carry(env.buf, env.cfg.batch, "cpu")
    crossed = False
    for _ in range(2):
        env.run(T)
        plain = advantages(env, None, 0.95, 0.5, carry=carry)
        assert same(plain, advantages(env, None, 0.95, 0.5, carry=carry, lam_turn=0.95))
        crossed |= not torch.equal(plain["adv"], advantages(env, None, 0.95, 0.5, carry=carry, lam_turn=0.5)["adv"])
        carry.hold(env, plain)
    assert crossed, "no link crossed a turn: the test saw nothing for --lam-turn to change"
    env.run(T)
    boot = env.bootstrap()
    assert same(advantages(env, boot, 0.95), advantages(env, boot, 0.95, lam_turn=0.95))


def fake_env(active, learner, turn, value, ended_at=None, reward=1.0) -> SimpleNamespace:
    """One row, seat 0 the learner: a buffer of every field the carry keeps, the rest zero."""
    T = len(active)
    buf = {name: torch.zeros(T, 1, *LAYOUT[name][0], dtype=LAYOUT[name][1]) for name in KEPT}
    buf["placed_on"] = torch.zeros(T, 1, 42, dtype=torch.bool)
    for name in LOG_FIELDS[1:]:
        buf[name] = torch.zeros(T, 1, dtype=torch.int32)
    for name in ("main", "amount", "cap"):
        buf[name] = torch.zeros(T, 1, dtype=torch.int64)
    buf["logp"] = torch.zeros(T, 1)
    buf["active"] = torch.tensor(active, dtype=torch.int32)[:, None]
    buf["learner"] = torch.tensor(learner)[:, None]
    buf["turn"] = torch.tensor(turn, dtype=torch.int32)[:, None]
    buf["value"] = torch.tensor(value)[:, None]
    buf["ended"] = torch.zeros(T, 1, dtype=torch.bool)
    buf["reward"] = torch.zeros(T, 1, MAX_SEATS)
    if ended_at is not None:
        buf["ended"][ended_at, 0] = True
        buf["reward"][ended_at, 0, 0] = reward
    return SimpleNamespace(buf=buf, cfg=SimpleNamespace(horizon=T, batch=1))


def test_a_turns_end_decays_by_lam_turn():
    # Seat 0's turn 1 (steps 0, 1), seat 1's turn 2, seat 0's turn 3 (steps 3, 4), which wins: +1.
    env = fake_env(active=[0, 0, 1, 0, 0], learner=[True, True, False, True, True], turn=[1, 1, 2, 3, 3],
                   value=[0.25, 0.5, 0.0, 0.75, 0.125], ended_at=4)
    adv = advantages(env, torch.zeros(1, MAX_SEATS), 1.0, lam_turn=0.5)["adv"][:, 0]
    a4 = 1 - 0.125                # 0.875
    a3 = 0.125 - 0.75 + 1.0 * a4  # 0.25, inside turn 3
    a1 = 0.75 - 0.5 + 0.5 * a3    # 0.375, across turn 1's end
    a0 = 0.5 - 0.25 + 1.0 * a1    # 0.625, inside turn 1
    assert adv.tolist() == [a0, a1, 0.0, a3, a4]


@pytest.mark.parametrize("crosses", [True, False])
def test_a_held_decision_completes_with_its_links_lam(crosses):
    # Rollout 1 ends on seat 0's turn 1, its last decision held at value 0.5.
    first = fake_env(active=[0, 0], learner=[True, True], turn=[1, 1], value=[0.25, 0.5])
    carry = Carry(first.buf, 1, "cpu")
    targets = advantages(first, None, 1.0, carry=carry, lam_turn=0.5)
    assert targets["hold"][:, 0].tolist() == [False, True]
    assert targets["adv"][0, 0].item() == 0.5 - 0.25
    carry.hold(first, targets)
    if crosses:
        # The held decision was turn 1's last: seat 1 plays turn 2, seat 0 wins in turn 3.
        second = fake_env(active=[1, 0, 0], learner=[False, True, True], turn=[2, 3, 3],
                          value=[0.0, 0.75, 0.125], ended_at=2)
    else:
        # Turn 1 runs on past the cut, and seat 0 wins in it.
        second = fake_env(active=[0, 0], learner=[True, True], turn=[1, 1], value=[0.75, 0.125], ended_at=1)
    targets = advantages(second, None, 1.0, carry=carry, lam_turn=0.5)
    assert targets["complete"][0, 0]
    successor = 0.125 - 0.75 + 1.0 * (1 - 0.125)  # 0.25, the next decision's advantage, inside its turn
    expected = 0.75 - 0.5 + (0.5 if crosses else 1.0) * successor
    assert targets["adv"][-MAX_SEATS, 0].item() == expected


def test_a_resumed_run_keeps_its_lam_turn():
    assert kept("lam_turn", None, None) is None
    assert kept("lam_turn", 0.9, None) == 0.9
    assert kept("lam_turn", None, {"lr": 1e-4}) is None  # trained before the choice existed
    assert kept("lam_turn", None, {"lam_turn": 0.9}) == 0.9
    with pytest.raises(AssertionError):
        kept("lam_turn", 0.9, {"lr": 1e-4})
    with pytest.raises(AssertionError):
        kept("lam_turn", 0.8, {"lam_turn": 0.9})

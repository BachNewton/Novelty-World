"""Potential-based shaping in the self-play advantages (`riskgpu/selfplay/ppo.py`): the shaping
rewards along a seat's chain of decisions must cancel over a game, so with λ = 1 and no value
baseline a decision's advantage is the game's reward less the shaping's Φ where it stood."""

from types import SimpleNamespace

import torch

from riskgpu.board import MAX_SEATS, TERRITORIES
from riskgpu.selfplay.ppo import advantages, potential


def board(holder_share: int, armies: int) -> tuple[torch.Tensor, torch.Tensor]:
    """Seat 0 holds the first `holder_share` territories with `armies` each, seat 1 the rest with 1."""
    owner = torch.ones(1, TERRITORIES, dtype=torch.int8)
    owner[0, :holder_share] = 0
    army = torch.ones(1, TERRITORIES, dtype=torch.int32)
    army[0, :holder_share] = armies
    return owner, army


def test_shaping_cancels_over_a_game():
    # Seat 0 (the learner) decides at t = 0 and t = 2, seat 1 at t = 1; the game ends at t = 2,
    # seat 0 winning.
    T, B = 3, 1
    boards = [board(10, 3), board(20, 2), board(30, 4)]
    reward = torch.zeros(T, B, MAX_SEATS)
    reward[2, 0, :2] = torch.tensor([1.0, -1.0])
    buf = {
        "owner": torch.stack([o for o, _ in boards]),
        "armies": torch.stack([a for _, a in boards]),
        "active": torch.tensor([[0], [1], [0]], dtype=torch.int8),
        "learner": torch.tensor([[True], [False], [True]]),
        "ended": torch.tensor([[False], [False], [True]]),
        "reward": reward,
        "value": torch.zeros(T, B),
    }
    env = SimpleNamespace(buf=buf, cfg=SimpleNamespace(horizon=T, batch=B),
                          state=SimpleNamespace(owner=boards[0][0], armies=boards[0][1]))
    boot = torch.zeros(B, MAX_SEATS)

    plain = advantages(env, boot, lam=1.0)
    shaped = advantages(env, boot, lam=1.0, shaping=0.5)
    phi = [float(potential(o, a)[0, 0]) for o, a in boards]

    assert float(plain["adv"][0, 0]) == 1.0
    assert abs(float(shaped["adv"][0, 0]) - (1.0 - 0.5 * phi[0])) < 1e-6
    # The last decision earns only the move to the game's end: Φ there is 0.
    assert abs(float(shaped["adv"][2, 0]) - (1.0 - 0.5 * phi[2])) < 1e-6
    # The shaping moves credit, never the outcome's targets for the value head.
    assert torch.equal(plain["mc"], shaped["mc"])

"""The three levers on the stall b1 drew (`riskgpu/selfplay/env.py`, `ppo.py`): the cap's score, the
service of rows past a controller's capacity, and the spread of a start's deals. What would silently
spoil a run comparing them: a cap that still pays survivors more than a loss, a decisive game scored
otherwise, a row starved under the fair order, the fair order changing a step that had room for
every row, a spread that leaves the first deal standing or feeds its games into the statistics."""

import pytest
import torch

from riskgpu.board import Board
from riskgpu.data import load_best
from riskgpu.selfplay.env import GREEDY, LEARNER, Env, EnvConfig, scores
from riskgpu.selfplay.net import Net
from riskgpu.selfplay.ppo import kept


@pytest.fixture(scope="module")
def world():
    board = Board.load("cpu")
    tables = load_best("cpu")
    tables.scaled_oversize = True
    return board, tables


def make_env(world, seed: int = 3, **cfg) -> Env:
    board, tables = world
    torch.manual_seed(seed)
    net = Net(16, 1, 2, 2, edges=board.edges, adjacency=board.adjacency)
    base = dict(batch=16, sizes=(3, 4, 5, 6), size_weights=(0.25,) * 4, cap_low=4, cap_high=8, pool=8, snapshots=0,
                horizon=8, bf16=False, cap_learner=1.0, cap_greedy=1.0)
    return Env(EnvConfig(**{**base, **cfg}), board, tables, net, "cpu", seed_prefix="levers")


# Three games of five: capped with seats 0 (out 5th) and 1 (out 4th) gone and three survivors; won by
# seat 2 with 0, 1, 3, 4 out in that order; capped with two survivors.
PLAYERS = torch.tensor([5, 5, 5])
ELIMINATED = torch.tensor([[1, 1, 0, 0, 0, 0], [1, 1, 0, 1, 1, 0], [1, 1, 1, 0, 0, 0]], dtype=torch.bool)
PLACES = torch.tensor([[5, 4, 1, 1, 1, 1], [5, 4, 1, 3, 2, 1], [5, 4, 3, 1, 1, 1]])
WON = torch.tensor([False, True, False])
IN_GAME = torch.tensor([3, 1, 2])


def scored(**kw) -> torch.Tensor:
    return scores(PLAYERS, PLACES, ELIMINATED, WON, IN_GAME, **kw)


def test_a_capped_games_survivors_score_a_loss_and_the_rest_their_places():
    third = 1 / 3
    loss = scored(cap_score="loss")
    assert torch.allclose(loss[0], torch.tensor([-1, -2 * third, -1, -1, -1, 0]))
    assert torch.allclose(loss[2], torch.tensor([-1, -2 * third, -third, -1, -1, 0]))
    # The rule before the choice: k-th of n survivors less a half, so two survivors score −0.5.
    survivors = scored()
    assert torch.allclose(survivors[0], torch.tensor([-1, -2 * third, -third - 0.5, -third - 0.5, -third - 0.5, 0]))
    assert torch.allclose(survivors[2], torch.tensor([-1, -2 * third, -third, -0.5, -0.5, 0]))
    # A decisive game is the same either way.
    assert torch.equal(loss[1], survivors[1])
    assert torch.allclose(loss[1], torch.tensor([-1, -2 * third, 1, -third, 0, 0]))
    assert torch.allclose(scored(reward="place", cap_score="loss")[0], torch.tensor([-1, -0.5, -1, -1, -1, 0]))


def learner_only(env: Env) -> Env:
    env.kind_probs.zero_()
    env.kind_probs[LEARNER] = 1.0
    env._draw_seats(torch.ones(env.cfg.batch, dtype=torch.bool))
    return env


@pytest.mark.parametrize("serve", ["oldest", "lowest"])
def test_no_row_starves_when_its_controller_is_saturated(world, serve):
    # Every seat the learner, so all 16 rows are due to it every step, and it takes 4 a step.
    env = learner_only(make_env(world, cap_learner=0.25, record=False, serve=serve, cap_low=600, cap_high=600))
    steps = 24
    env.run(steps)
    stats = env.take_stats()
    assert stats["unserved"][LEARNER] == steps * (16 - 4)
    if serve == "oldest":
        # Served first come, first served: no row waits more than ⌈due / capacity⌉ − 1 steps.
        assert stats["longest_wait"] == 16 // 4 - 1
    else:
        # The old order: the rows past the first four are never served (and the test can see it).
        assert stats["longest_wait"] == steps


def test_the_fair_order_changes_nothing_while_every_due_row_fits(world):
    def rollout(serve: str) -> Env:
        env = make_env(world, serve=serve, seed=8)
        env.kind_probs.zero_()
        env.kind_probs[LEARNER] = 0.5
        env.kind_probs[GREEDY] = 0.5
        env._draw_seats(torch.ones(env.cfg.batch, dtype=torch.bool))
        # Waits the fair order would sort by, as if left from a saturated step: with room for every
        # row they must change neither the rows served nor the order the samplers draw for them in.
        env.waited.copy_(torch.randperm(env.cfg.batch))
        env.run(env.cfg.horizon)
        return env

    lowest, oldest = rollout("lowest"), rollout("oldest")
    for name, x in lowest.buf.items():
        assert torch.equal(x, oldest.buf[name]), name
    assert torch.equal(lowest.stats, oldest.stats)
    assert sum(oldest.take_stats()["unserved"]) == 0


def test_a_spread_leaves_no_game_of_the_first_deal_and_drops_its_statistics(world):
    env = make_env(world, batch=32, sizes=(4,), size_weights=(1.0,), cap_low=600, cap_high=600, horizon=24)
    learner_only(env)
    weights = {k: v.clone() for k, v in env.learner.state_dict().items()}
    rollouts = 4
    env.spread(rollouts)
    # Every first-deal game was cut at some rollout's start, so the games now began at different times.
    assert bool((env.game_id > 0).all())
    assert len(env.state.turn.unique()) >= rollouts - 1
    assert int(env.state.turn.max()) > int(env.state.turn.min())
    assert not bool(env.stats.any()) and int(env.longest_wait) == 0
    assert all(torch.equal(weights[k], v) for k, v in env.learner.state_dict().items())
    # The caps the cuts set are gone: every game now running has its own drawn cap.
    assert bool((env.cap == 600).all())


@pytest.mark.parametrize("key,old,new,other", [("cap_score", "survivors", "loss", "survivors"),
                                               ("serve", "lowest", "oldest", "lowest"),
                                               ("deal_spread", 0, 0, 20)])
def test_a_resumed_run_keeps_each_new_choice(key, old, new, other):
    assert kept(key, None, None) == new
    assert kept(key, other, None) == other
    assert kept(key, None, {"bootstrap": "carry"}) == old  # trained before the choice existed
    assert kept(key, None, {key: other}) == other
    with pytest.raises(AssertionError, match="keeps its recipe"):
        kept(key, new if other == old else old, {key: other})

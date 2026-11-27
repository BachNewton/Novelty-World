"""The levers on the stall b1 drew (`riskgpu/selfplay/env.py`, `ppo.py`): the cap's score, the
service of rows past a controller's capacity, the spread of a start's deals, the time discount on a
win, the winner-only reward and the clock among the inputs. What would silently spoil a run comparing
them: a cap that still pays survivors more than a loss, a decisive game scored otherwise, a
winner-only reward that pays a place or a cap, a row starved under the fair order, the fair order
changing a step that had room for every row, a spread that leaves the first deal standing or feeds
its games into the statistics, a discount that reaches a loss or anything but the score, a clock net
started from a checkpoint that doesn't play as the checkpoint did, a held decision trained on another
game's clock, or a panel anchor that reads the clock shown another cap than the panel's."""

import math

import pytest
import torch

from riskgpu.board import Board
from riskgpu.data import load_best
from riskgpu.selfplay.env import GREEDY, LEARNER, Env, EnvConfig, scores
from riskgpu.selfplay.net import Net, init_from, shape_of
from riskgpu.selfplay.obs import GLOBAL
from riskgpu.selfplay.ppo import Carry, advantages, kept, parser, resolve_recipe, summarize, update


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


@pytest.mark.parametrize("cap_score", ["survivors", "loss"])
def test_the_winner_reward_pays_the_win_alone_and_a_capped_game_nothing(cap_score):
    winner = scored(reward="winner", cap_score=cap_score)
    assert torch.equal(winner[1], torch.tensor([-1.0, -1, 1, -1, -1, 0]))
    # No winner, so every present seat loses: the eliminated ones and the survivors alike.
    assert torch.equal(winner[0], torch.tensor([-1.0, -1, -1, -1, -1, 0]))
    assert torch.equal(winner[2], torch.tensor([-1.0, -1, -1, -1, -1, 0]))


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
                                               ("deal_spread", 0, 0, 20),
                                               ("time_discount", 1.0, 1.0, 0.9),
                                               ("obs_turn", False, False, True)])
def test_a_resumed_run_keeps_each_new_choice(key, old, new, other):
    assert kept(key, None, None) == new
    assert kept(key, other, None) == other
    assert kept(key, None, {"bootstrap": "carry"}) == old  # trained before the choice existed
    assert kept(key, None, {key: other}) == other
    with pytest.raises(AssertionError, match="keeps its recipe"):
        kept(key, new if other == old else old, {key: other})


def test_the_trainers_flags_reach_the_recipe():
    def resolved(argv, trained):
        args = parser().parse_args(["--name", "x", *argv])
        resolve_recipe(args, trained)
        return args.time_discount, args.obs_turn

    assert resolved([], None) == (1.0, False)
    assert resolved(["--time-discount", "0.9", "--obs-turn"], None) == (0.9, True)
    assert resolved([], {"time_discount": 0.9, "obs_turn": True}) == (0.9, True)
    assert resolved([], {"bootstrap": "carry"}) == (1.0, False)
    with pytest.raises(AssertionError, match="--obs-turn"):
        resolved(["--no-obs-turn"], {"obs_turn": True})


# The games above end at turns 200, 150 (the won one) and 300.
TURNS = torch.tensor([200, 150, 300])


@pytest.mark.parametrize("kw", [{}, {"cap_score": "loss"}, {"reward": "place"}, {"reward": "winner"}])
def test_the_time_discount_lowers_the_win_alone_by_the_games_length(kw):
    plain = scored(**kw)
    assert torch.equal(scored(**kw, turn=TURNS, time_discount=1.0), plain)
    discounted = scored(**kw, turn=TURNS, time_discount=0.9)
    # The winner, seat 2 of the second game: +1 at turn 150 is worth 0.9^1.5.
    assert math.isclose(float(discounted[1, 2]), 0.9 ** 1.5, rel_tol=1e-6)
    rest = torch.ones_like(plain, dtype=torch.bool)
    rest[1, 2] = False
    # Every loss and place, and every capped game, scores as before: no seat gains by putting off its loss.
    assert torch.equal(discounted[rest], plain[rest])


def test_the_time_discount_changes_no_game_and_no_capped_score(world):
    # Every game here is capped (a win takes hundreds of steps): the discount must leave all of it alone,
    # and log the undiscounted score beside the score.
    def rollout(discount: float) -> Env:
        env = learner_only(make_env(world, seed=6, horizon=48, time_discount=discount))
        env.run(env.cfg.horizon)
        return env

    plain, discounted = rollout(1.0), rollout(0.5)
    assert bool(plain.buf["ended"].any()), "no game ended: the test saw no score"
    for name, x in plain.buf.items():
        assert torch.equal(x, discounted.buf[name]), name
    plain_stats, stats = plain.take_stats(), discounted.take_stats()
    assert "score_undiscounted" not in plain_stats
    assert stats["score_undiscounted"] == plain_stats["score"]
    assert "learner_score_undiscounted" in summarize(stats, ["learner", "greedy"])
    assert "learner_score_undiscounted" not in summarize(plain_stats, ["learner", "greedy"])


def clock_pair(world) -> tuple[Net, Net]:
    """A net without the clock and one with it started from the first, as `--init` starts it."""
    board, _ = world
    torch.manual_seed(7)
    plain = Net(16, 1, 2, 2, edges=board.edges, adjacency=board.adjacency)
    clocked = Net(16, 1, 2, 2, edges=board.edges, adjacency=board.adjacency, clock=True)
    init_from(clocked, {"net": plain.state_dict()})
    return plain, clocked


def test_a_clock_net_started_from_a_checkpoint_without_it_plays_as_the_checkpoint(world):
    plain, clocked = clock_pair(world)
    assert shape_of(clocked.state_dict()) == {**shape_of(plain.state_dict()), "clock": True}
    assert clocked.glob_in.weight.shape[1] == GLOBAL + 1 and not bool(clocked.glob_in.weight[:, GLOBAL:].any())

    def rollout(net: Net) -> Env:
        board, tables = world
        torch.manual_seed(9)
        cfg = EnvConfig(batch=16, sizes=(3, 4, 5, 6), size_weights=(0.25,) * 4, cap_low=20, cap_high=60, pool=8,
                        snapshots=0, horizon=24, bf16=False, cap_learner=1.0, cap_greedy=1.0)
        env = Env(cfg, board, tables, net, "cpu", seed_prefix="clock")
        env.kind_probs.zero_()
        env.kind_probs[LEARNER] = 0.5
        env.kind_probs[GREEDY] = 0.5
        env._draw_seats(torch.ones(cfg.batch, dtype=torch.bool))
        env.run(cfg.horizon)
        return env

    a, b = rollout(plain), rollout(clocked)
    assert int(a.buf["learner"].sum()) > 50
    for name, x in a.buf.items():
        assert torch.allclose(x.float(), b.buf[name].float(), atol=1e-6), name

    with pytest.raises(AssertionError, match="can't start from a checkpoint that reads it"):
        init_from(Net(16, 1, 2, 2, edges=world[0].edges, adjacency=world[0].adjacency), clocked.state_dict())


def test_a_clock_net_reads_its_own_games_cap_in_play_and_in_training(world):
    _, clocked = clock_pair(world)
    # The clock's weights away from zero, so a decision trained on the wrong game's cap would show.
    with torch.no_grad():
        clocked.glob_in.weight[:, GLOBAL:] = 0.5
    env = make_env(world, seed=12, cap_low=10, cap_high=40, horizon=12)
    env.learner = clocked
    env.kind_probs.zero_()
    env.kind_probs[GREEDY] = 1.0
    env._draw_seats(torch.ones(env.cfg.batch, dtype=torch.bool))
    carry = Carry(env.buf, env.cfg.batch, "cpu")
    args = type("Args", (), dict(epochs=1, minibatch=64, chunk=32, clip=0.2, vf=0.5, vo=0.25, aux=0.25, ent=0.01,
                                 grad_clip=1.0, carry_policy_age=0))
    T = env.cfg.horizon
    held_caps = None
    for _ in range(3):
        env.run(T)
        # Each decision's cap is its own game's, the one that game is cut at.
        same = env.buf["game_id"][1:] == env.buf["game_id"][:-1]
        assert torch.equal(env.buf["cap"][1:][same], env.buf["cap"][:-1][same])
        assert bool(((env.buf["cap"] >= 10) & (env.buf["cap"] <= 40)).all())
        targets = advantages(env, None, 0.95, carry=carry)
        if held_caps is not None:
            # A held decision is trained on the cap of the game it was taken in, not the row's game now.
            t, b = targets["complete"].nonzero(as_tuple=True)
            assert t.numel() > 0, "no held decision was completed: the test saw nothing carried"
            assert torch.equal(carry.at(env.buf, "cap", T + t, b), held_caps[t, b])
        losses = update(clocked, torch.optim.Adam(clocked.parameters(), lr=1e-4), env, targets, args, carry)
        assert losses["samples"] == int(targets["train"].sum())
        carry.hold(env, targets)
        held_caps = carry.fields["cap"].clone()


def test_a_panel_anchor_that_reads_the_clock_sees_the_turns_left_before_the_panels_cap(world, tmp_path, monkeypatch):
    from riskgpu.selfplay import env as env_module
    from riskgpu.selfplay.ppo import PairEval
    plain, clocked = clock_pair(world)
    anchor = str(tmp_path / "anchor.pt")
    torch.save({"net": clocked.state_dict(), "config": clocked.config()}, anchor)
    monkeypatch.setattr(Env, "capture", lambda self: None)  # CUDA graphs; the CPU steps eagerly
    seen = []
    real = env_module.observe

    def observe(*args):
        seen.append(args[-1])
        return real(*args)

    monkeypatch.setattr(env_module, "observe", observe)
    board, tables = world
    pair = PairEval(board, tables, plain, "clock", anchor, 10, "cpu", bf16=False)
    pair.env.run(24)
    caps = [cap for cap in seen if cap is not None and cap.numel()]
    assert caps, "the anchor took no decision"
    assert all(bool((cap == 600).all()) for cap in caps)
    # The learner, without the clock, is shown none.
    assert None in seen

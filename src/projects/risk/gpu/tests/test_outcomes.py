"""Slot 0 trained on real outcomes (`Outcomes`, `--outcome-share`, `riskgpu/selfplay/ppo.py`) and the
opening reading beside the learner's score (`ended_first_value`, `riskgpu/selfplay/env.py`).

What would silently corrupt the targets or the readings: the store perturbing the games or an update
that has nothing to train on, an entry resolved against another game's end or another seat's
score, an entry trained twice or never leaving, a full store failing or losing the wrong entries,
and the opening value read off the wrong seats."""

import pytest
import torch

from riskgpu.board import MAX_SEATS, Board
from riskgpu.data import load_best
from riskgpu.selfplay.env import GREEDY, LEARNER, LOG_FIELDS, Env, EnvConfig
from riskgpu.selfplay.net import Net
from riskgpu.selfplay.ppo import STORED, Carry, Outcomes, advantages, summarize, update
from riskgpu.state import LAYOUT

T = 24


@pytest.fixture(scope="module")
def world():
    board = Board.load("cpu")
    tables = load_best("cpu")
    tables.scaled_oversize = True
    return board, tables


def make_env(world) -> Env:
    board, tables = world
    torch.manual_seed(5)
    net = Net(16, 1, 2, 2, edges=board.edges, adjacency=board.adjacency)
    torch.manual_seed(11)
    # Caps of 4 to 8 player-turns: games end inside a rollout.
    cfg = EnvConfig(batch=8, sizes=(3, 4, 5, 6), size_weights=(0.25,) * 4, cap_low=4, cap_high=8, pool=8,
                    snapshots=0, horizon=T, bf16=False, cap_learner=1.0, cap_greedy=1.0)
    env = Env(cfg, board, tables, net, "cpu", seed_prefix="outcomes")
    env.kind_probs.zero_()
    env.kind_probs[GREEDY] = 1.0
    return env


def args_of(**kw):
    base = dict(epochs=2, minibatch=64, chunk=32, clip=0.2, vf=0.5, vo=0.25, aux=0.25, ent=0.01, grad_clip=1.0,
                carry_policy_age=0, vz=0.5)
    return type("Args", (), {**base, **kw})


def weights(net):
    return {k: v.clone() for k, v in net.state_dict().items()}


def play(world, rollouts: int, outcomes_share: float = 0.0):
    """A fresh env played `rollouts` rollouts, storing a share of each when given one: its buffers,
    the env and the store."""
    env = make_env(world)
    outcomes = Outcomes(env.buf, 1000, "cpu", seed=3) if outcomes_share else None
    bufs = []
    for _ in range(rollouts):
        env.run(T)
        bufs.append({k: v.clone() for k, v in env.buf.items()})
        if outcomes is not None:
            outcomes.store(env.buf, outcomes_share)
            outcomes.resolve(env.buf)
    return bufs, env, outcomes


def test_the_store_changes_no_game_and_an_empty_one_no_update(world):
    plain_bufs, plain, _ = play(world, 4)
    stored_bufs, _, outcomes = play(world, 4, 0.5)
    assert all(torch.equal(x[k], y[k]) for x, y in zip(plain_bufs, stored_bufs) for k in x)
    assert int(outcomes.ready.sum()) > 0

    trained = []
    for store in (None, Outcomes(plain.buf, 1000, "cpu", seed=3)):
        net = make_env(world).learner
        targets = advantages(plain, None, 0.95, carry=Carry(plain.buf, 8, "cpu"))
        torch.manual_seed(9)
        losses = update(net, torch.optim.Adam(net.parameters(), lr=1e-3), plain, targets, args_of(), outcomes=store)
        trained.append((weights(net), losses))
    assert all(torch.equal(trained[0][0][k], trained[1][0][k]) for k in trained[0][0])
    assert trained[0][1] == trained[1][1]


def scripted(steps: int, batch: int) -> dict:
    """A buffer of zeros, every field the store reads; the test writes who decided and what ended."""
    buf = {name: torch.zeros(steps, batch, *LAYOUT[name][0], dtype=LAYOUT[name][1]) for name in STORED
           if name in LAYOUT}
    buf["placed_on"] = torch.zeros(steps, batch, 42, dtype=torch.bool)
    for name in LOG_FIELDS[1:]:
        buf[name] = torch.zeros(steps, batch, dtype=torch.int32)
    buf["cap"] = torch.zeros(steps, batch, dtype=torch.int64)
    buf["learner"] = torch.zeros(steps, batch, dtype=torch.bool)
    buf["ended"] = torch.zeros(steps, batch, dtype=torch.bool)
    buf["reward"] = torch.zeros(steps, batch, MAX_SEATS)
    buf["game_id"] = torch.zeros(steps, batch, dtype=torch.int64)
    return buf


def decide(buf: dict, t: int, row: int, seat: int) -> None:
    buf["learner"][t, row] = True
    buf["active"][t, row] = seat


def ends(buf: dict, t: int, row: int, reward: list[float]) -> None:
    buf["ended"][t, row] = True
    buf["reward"][t, row] = torch.tensor(reward + [0.0] * (MAX_SEATS - len(reward)))
    buf["game_id"][t + 1:, row] += 1


def entries(outcomes: Outcomes) -> dict:
    """(row, game, seat) → target, of the ready entries."""
    i = outcomes.ready.nonzero()[:, 0].tolist()
    return {(int(outcomes.row[k]), int(outcomes.game[k]), int(outcomes.seat[k])): float(outcomes.target[k]) for k in i}


def test_an_entry_resolves_against_its_own_game_and_seat(world):
    outcomes = Outcomes(scripted(1, 2), 100, "cpu", seed=0)
    # Row 0 ends games 5 and 6 inside one rollout; row 1's seat 3 decides in game 0, which ends a
    # rollout later, after that seat was out (its score arrives with the game's end).
    first = scripted(6, 2)
    first["game_id"][:, 0] = 5
    decide(first, 0, 0, 1)
    decide(first, 2, 0, 2)
    ends(first, 3, 0, [0.0, 1.0, -0.5])
    decide(first, 4, 0, 0)
    decide(first, 5, 0, 2)
    ends(first, 5, 0, [-1.0, 0.0, 1.0, -0.5])
    decide(first, 1, 1, 3)
    outcomes.store(first, 1.0)
    outcomes.resolve(first)
    assert entries(outcomes) == {(0, 5, 1): 1.0, (0, 5, 2): -0.5, (0, 6, 0): -1.0, (0, 6, 2): 1.0}
    assert int((outcomes.used & ~outcomes.ready).sum()) == 1

    second = scripted(6, 2)
    second["game_id"][:, 0] = 7
    ends(second, 4, 1, [1.0, 0.0, -0.5, -1.0])
    outcomes.store(second, 1.0)
    outcomes.resolve(second)
    assert entries(outcomes)[(1, 0, 3)] == -1.0
    assert not bool((outcomes.used & ~outcomes.ready).any())


def test_an_entry_is_trained_once_and_leaves(world):
    env = make_env(world)
    net = env.learner
    carry = Carry(env.buf, 8, "cpu")
    outcomes = Outcomes(env.buf, 10_000, "cpu", seed=1)
    trained = 0
    for _ in range(6):
        env.run(T)
        targets = advantages(env, None, 0.95, carry=carry)
        outcomes.store(env.buf, 1.0)
        outcomes.resolve(env.buf)
        readings = outcomes.readings(net, env, 32)
        ready, used = readings["outcome_ready"], int(outcomes.used.sum())
        assert readings["outcome_waiting"] == used - ready
        losses = update(net, torch.optim.Adam(net.parameters(), lr=1e-3), env, targets, args_of(), carry, outcomes=outcomes)
        assert ("vz" in losses) == (ready > 0)
        assert not bool(outcomes.ready.any()) and int(outcomes.used.sum()) == used - ready
        trained += ready
        # Nothing newly ready: a second update trains no outcome.
        again = update(net, torch.optim.Adam(net.parameters(), lr=1e-3), env, targets, args_of(), carry, outcomes=outcomes)
        assert "vz" not in again
        carry.hold(env, targets)
    assert trained > 0, "no game ended: the test trained no outcome"


def test_a_full_store_overwrites_its_oldest_and_counts():
    outcomes = Outcomes(scripted(1, 1), 3, "cpu", seed=0)
    for rollout in range(2):
        buf = scripted(2, 1)
        decide(buf, 0, 0, 2 * rollout)
        decide(buf, 1, 0, 2 * rollout + 1)
        assert outcomes.store(buf, 1.0) == rollout
    assert sorted(outcomes.seat[outcomes.used].tolist()) == [1, 2, 3]


def test_the_opening_value_is_each_ended_games_learner_seat_at_its_first_decision(world):
    # A fresh env: every game that ends was dealt inside the rollouts kept, or at their first step.
    bufs, env, _ = play(world, 4)
    first: dict[tuple[int, int], float] = {}
    total, count = 0.0, 0
    for buf in bufs:
        for t in range(T):
            for b in range(8):
                key = (b, int(buf["game_id"][t, b]))
                if buf["learner"][t, b] and key not in first:
                    first[key] = float(buf["value"][t, b])
                if buf["ended"][t, b] and key in first:
                    total, count = total + first[key], count + 1
    stats = env.take_stats()
    assert count > 0 and stats["first_n"] == count
    assert stats["first_value"] == pytest.approx(total, abs=1e-5)
    # The per-size scores partition the learner's.
    assert sum(stats["size_seats"]) == stats["seats"][LEARNER]
    assert sum(stats["size_score"]) == pytest.approx(stats["score"][LEARNER])
    log = summarize(stats, ["learner", "greedy"])
    assert log["ended_first_value"] == pytest.approx(total / count, abs=1e-6)

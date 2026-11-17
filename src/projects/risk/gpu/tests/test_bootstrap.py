"""Where a learner seat's chain of decisions meets the rollout's end (`riskgpu/selfplay/ppo.py`).

What would silently ruin training: a learner decision's target built from a value the net gives
another seat's view (the defect `--bootstrap acting` keeps as the control: the other slots are
trained on the league's scores, never to agree with slot 0), a held-back decision completed with
another target than one long rollout would give it, and the control drifting from what the trainer
did before the choice existed."""

import pytest
import torch

from riskgpu.board import MAX_SEATS, Board
from riskgpu.data import load_best
from riskgpu.selfplay.env import GREEDY, Env, EnvConfig
from riskgpu.selfplay.net import Net
from riskgpu.selfplay.ppo import Carry, advantages, kept, update, value_health

# Neither is a score any table can give (`env.scores`), so a target shows which reached it.
OWN, OTHER = 0.3, -0.6
SIZES = (3, 4, 5, 6)


class TwoValues(Net):
    """A net whose value for the seat deciding (slot 0) is OWN and for every other slot OTHER."""

    def heads_main(self, x):
        logits, value, aux = super().heads_main(x)
        value = torch.full_like(value, OTHER)
        value[:, 0] = OWN
        return logits, value, aux


@pytest.fixture(scope="module")
def world():
    board = Board.load("cpu")
    tables = load_best("cpu")
    tables.scaled_oversize = True
    return board, tables


def small_net(board, cls=Net) -> Net:
    torch.manual_seed(5)
    return cls(16, 1, 2, 2, edges=board.edges, adjacency=board.adjacency)


def make_env(world, net, horizon: int, batch: int = 8, seed: int = 11) -> Env:
    board, tables = world
    torch.manual_seed(seed)
    cfg = EnvConfig(batch=batch, sizes=SIZES, size_weights=(0.25,) * 4, cap_low=4, cap_high=8, pool=8,
                    snapshots=0, horizon=horizon, bf16=False, cap_learner=1.0, cap_greedy=1.0)
    env = Env(cfg, board, tables, net, "cpu", seed_prefix="bootstrap")
    # The learner in one seat and greedy in the rest, so its seats sit beside other kinds' turns.
    env.kind_probs.zero_()
    env.kind_probs[GREEDY] = 1.0
    return env


def scores_seen(env: Env) -> torch.Tensor:
    return env.buf["reward"][env.buf["ended"]].flatten().unique()


def near(x: torch.Tensor, values: torch.Tensor) -> torch.Tensor:
    return ((x[:, None] - values[None, :]).abs() < 1e-5).any(1)


def test_no_learner_target_reads_another_seats_view(world):
    # λ = 0: each target is one link, so it is the next value or score itself.
    board, _ = world
    net = small_net(board, TwoValues)
    env = make_env(world, net, horizon=24)
    carry = Carry(env.buf, env.cfg.batch, "cpu")
    completed = 0
    for _ in range(3):
        env.run(24)
        targets = advantages(env, None, 0.0, carry=carry)
        ret = targets["ret"][targets["train"]]
        allowed = torch.cat([torch.tensor([OWN, 0.0]), scores_seen(env)])
        assert near(ret, allowed).all(), ret[~near(ret, allowed)]
        assert not near(ret, torch.tensor([OTHER])).any()
        completed += int(targets["complete"].sum())
        carry.hold(env, targets)
    assert completed > 0, "no held decision was completed: the test saw nothing carried"

    # The control reads the other slots: the test can see them when they reach a target.
    env = make_env(world, net, horizon=24)
    env.run(24)
    acting = advantages(env, env.bootstrap(), 0.0)
    assert near(acting["ret"][acting["train"]], torch.tensor([OTHER])).any()


def reference_acting(buf: dict, boot: torch.Tensor, lam: float) -> torch.Tensor:
    """GAE with the acting seat's bootstrap, one seat's chain at a time: the trainer's arithmetic
    before `--bootstrap` existed, in the same order, so it agrees to the bit."""
    T, B = buf["learner"].shape
    adv = torch.zeros(T, B)
    for b in range(B):
        for s in range(MAX_SEATS):
            next_v, next_a, pending = boot[b, s], torch.tensor(0.0), torch.tensor(0.0)
            for t in reversed(range(T)):
                if buf["ended"][t, b]:
                    next_v, next_a, pending = torch.tensor(0.0), torch.tensor(0.0), buf["reward"][t, b, s]
                if int(buf["active"][t, b]) == s and buf["learner"][t, b]:
                    advantage = (pending + next_v - buf["value"][t, b]) + lam * next_a
                    adv[t, b] = advantage
                    next_v, next_a, pending = buf["value"][t, b], advantage, torch.tensor(0.0)
    return adv


def test_the_acting_bootstrap_gives_the_old_numbers(world):
    board, _ = world
    env = make_env(world, small_net(board), horizon=32)
    env.run(32)
    boot = env.bootstrap()
    targets = advantages(env, boot, 0.95)
    mine = env.buf["learner"]
    assert torch.equal(targets["train"], mine)
    assert torch.equal(targets["adv"][mine], reference_acting(env.buf, boot, 0.95)[mine])
    assert torch.equal(targets["ret"], targets["adv"] + env.buf["value"])


@pytest.mark.parametrize("lam,shaping", [(0.0, 0.0), (0.95, 0.5)])
def test_a_chain_carried_across_the_cut_matches_one_long_rollout(world, lam, shaping):
    board, _ = world
    net = small_net(board)
    T = 20
    short = make_env(world, net, horizon=T)
    carry = Carry(short.buf, short.cfg.batch, "cpu")
    short.run(T)
    first = advantages(short, None, lam, shaping, carry=carry)
    held_at = {}  # (seat, row) -> the step it was held at in the first rollout
    for t, b in first["hold"].nonzero().tolist():
        held_at[(int(short.buf["active"][t, b]), b)] = t
    trained = {(t, b): float(first["adv"][t, b]) for t, b in first["train"].nonzero().tolist()}
    carry.hold(short, first)
    short.run(T)
    second = advantages(short, None, lam, shaping, carry=carry)
    for t, b in second["train"].nonzero().tolist():
        trained[(t + T, b) if t < T else (held_at[(t - T, b)], b)] = float(second["adv"][t, b])

    long = make_env(world, net, horizon=2 * T)
    long.run(2 * T)
    whole = advantages(long, None, lam, shaping, carry=Carry(long.buf, long.cfg.batch, "cpu"))
    assert torch.equal(long.buf["learner"][:T], first["train"][:T] | first["hold"])
    expected = {(t, b): float(whole["adv"][t, b]) for t, b in whole["train"].nonzero().tolist()}
    # The same decisions are trained, the ones still pending at the end held by both.
    assert set(trained) == set(expected)
    completed = [(t, b) for (s, b), t in held_at.items() if (t, b) in trained]
    assert completed, "no held decision was completed: the test saw nothing carried"
    # A decision whose chain runs on in the same game to a held one, m links on, stopped its
    # λ-sum there: where the long rollout trains that one, its advantage is the short one's plus
    # λ^m times the held one's. Every other decision, the held ones included, has the long
    # rollout's advantage (a held one still pending at the end stops both sums alike).
    buf = long.buf
    for (t, b), value in trained.items():
        seat = int(buf["active"][t, b])
        h = held_at.get((seat, b))
        tail = 0.0
        if t < T and (h, b) in expected and t < h and bool(buf["game_id"][t, b] == buf["game_id"][h, b]):
            steps = range(t + 1, h + 1)
            m = sum(1 for k in steps if buf["learner"][k, b] and int(buf["active"][k, b]) == seat)
            tail = lam ** m * expected[(h, b)]
        assert abs(value + tail - expected[(t, b)]) < 1e-5, ((t, b), value, tail, expected[(t, b)])


def test_a_resumed_run_keeps_its_bootstrap():
    assert kept("bootstrap", None, None) == "carry"
    assert kept("bootstrap", "acting", None) == "acting"
    assert kept("bootstrap", None, {"lr": 1e-4}) == "acting"  # trained before the choice existed
    assert kept("bootstrap", None, {"bootstrap": "carry"}) == "carry"
    assert kept("bootstrap", "acting", {}) == "acting"
    with pytest.raises(AssertionError):
        kept("bootstrap", "carry", {"lr": 1e-4})


def test_a_held_decision_is_trained_on_its_own_state(world):
    # The update reads a held decision through the carry, rows after the buffer's: it must find
    # the decision as it was taken, though the buffer has since been overwritten.
    board, _ = world
    net = small_net(board, TwoValues)
    env = make_env(world, net, horizon=24)
    carry = Carry(env.buf, env.cfg.batch, "cpu")
    env.run(24)
    targets = advantages(env, None, 0.95, carry=carry)
    t, b = targets["hold"].nonzero(as_tuple=True)
    seat = env.buf["active"][t, b].to(torch.int64)
    taken = {name: env.buf[name][t, b].clone() for name in ("owner", "armies", "main", "logp", "placed_on")}
    carry.hold(env, targets)
    env.run(24)
    targets = advantages(env, None, 0.95, carry=carry)
    T = env.cfg.horizon
    for name, then in taken.items():
        assert torch.equal(carry.at(env.buf, name, T + seat, b), then)
    steps = torch.arange(T).repeat_interleave(env.cfg.batch)
    rows = torch.arange(env.cfg.batch).repeat(T)
    assert torch.equal(carry.at(env.buf, "armies", steps, rows), env.buf["armies"][steps, rows])

    args = type("Args", (), dict(epochs=1, minibatch=64, chunk=32, clip=0.2, vf=0.5, vo=0.25, aux=0.25, ent=0.01,
                                 grad_clip=1.0, carry_policy_age=0))
    losses = update(net, torch.optim.Adam(net.parameters(), lr=1e-4), env, targets, args, carry)
    assert losses["samples"] == int(targets["train"].sum()) and int(targets["complete"].sum()) > 0


def test_the_fresh_deals_value_reads_slot_zero(world):
    board, _ = world
    env = make_env(world, small_net(board, TwoValues), horizon=48)
    env.run(48)
    health = value_health(env, advantages(env, env.bootstrap(), 0.95))
    assert abs(health["fresh_value"] - OWN) < 1e-6
    assert {k for k in health if k.startswith("fresh_value_")} <= {f"fresh_value_{n}" for n in SIZES}


def test_the_ended_games_reading_joins_each_decision_to_its_own_seats_score():
    # Two games end, each learner decision's seat scoring otherwise than the seats beside it.
    T, B = 2, 2
    final = torch.tensor([[1.0, -1.0, 0.0, 0, 0, 0], [-0.5, 0.0, -1.0, 0, 0, 0]])
    buf = {"learner": torch.tensor([[True, True], [True, True]]), "active": torch.tensor([[0, 2], [1, 0]]),
           "value": torch.tensor([[0.8, -0.6], [-0.9, -0.2]]), "game_id": torch.zeros(T, B, dtype=torch.int64)}
    targets = {"mc": final[None].expand(T, -1, -1), "mc_ok": torch.ones(T, B, dtype=torch.bool)}
    env = type("E", (), dict(buf=buf, cfg=EnvConfig(batch=B, sizes=(3,), size_weights=(1.0,), horizon=T),
                             size_index=torch.zeros(B, dtype=torch.int64), device="cpu"))
    y = torch.tensor([1.0, -1.0, -1.0, -0.5])
    v = torch.tensor([0.8, -0.6, -0.9, -0.2])
    health = value_health(env, targets)
    assert health["ended_n"] == 4
    assert abs(health["ended_explained"] - float(1 - (y - v).var() / y.var())) < 1e-6

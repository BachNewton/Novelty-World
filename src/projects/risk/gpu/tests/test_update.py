"""The PPO update's guards (`riskgpu/selfplay/ppo.py`): what turned b1's every weight into NaN at
iteration 194 (a last minibatch of one sample, whose advantage spread is undefined), the stop that
keeps a non-finite loss or gradient from reaching the weights, and the age past which a held
decision trains the value only."""

import os

import pytest
import torch

from riskgpu.board import Board
from riskgpu.data import load_best
from riskgpu.selfplay.env import GREEDY, Env, EnvConfig
from riskgpu.selfplay.net import Net
from riskgpu.selfplay.ppo import Carry, NonFinite, advantages, kept, minibatches, save_net, update

T = 24


@pytest.fixture(scope="module")
def world():
    board = Board.load("cpu")
    tables = load_best("cpu")
    tables.scaled_oversize = True
    return board, tables


def rollout(world, rollouts: int = 1):
    """A small net and env, `rollouts` rollouts in with the carry, the last one's targets not yet held."""
    board, tables = world
    torch.manual_seed(5)
    net = Net(16, 1, 2, 2, edges=board.edges, adjacency=board.adjacency)
    cfg = EnvConfig(batch=8, sizes=(3, 4, 5, 6), size_weights=(0.25,) * 4, cap_low=4, cap_high=8, pool=8,
                    snapshots=0, horizon=T, bf16=False, cap_learner=1.0, cap_greedy=1.0)
    env = Env(cfg, board, tables, net, "cpu", seed_prefix="update")
    env.kind_probs.zero_()
    env.kind_probs[GREEDY] = 1.0
    carry = Carry(env.buf, cfg.batch, "cpu")
    for k in range(rollouts):
        env.run(T)
        targets = advantages(env, None, 0.95, carry=carry)
        if k < rollouts - 1:
            carry.hold(env, targets)
    return net, env, carry, targets


def args_of(**kw):
    base = dict(epochs=2, minibatch=10**6, chunk=4096, clip=0.2, vf=0.5, vo=0.25, aux=0.25, ent=0.01, grad_clip=1.0,
                carry_policy_age=0)
    return type("Args", (), {**base, **kw})


def weights(net):
    return {k: v.clone() for k, v in net.state_dict().items()}


def test_no_minibatch_is_left_too_small_to_normalise():
    # b1's iteration 194: 524,289 samples in minibatches of 32,768 left one sample over.
    for n, size in ((16 * 32768 + 1, 32768), (32768, 32768), (5, 4), (2, 4)):
        parts = minibatches(torch.arange(n), size)
        assert torch.equal(torch.cat(parts), torch.arange(n))
        assert len(parts) == -(-n // size)
        assert min(p.shape[0] for p in parts) >= min(2, n) and max(p.shape[0] for p in parts) <= size
    with pytest.raises(AssertionError):
        minibatches(torch.arange(1), 32768)


def test_an_update_whose_samples_overrun_the_minibatch_by_one_stays_finite(world):
    net, env, carry, targets = rollout(world)
    n = int(targets["train"].sum())
    update(net, torch.optim.Adam(net.parameters(), lr=1e-4), env, targets, args_of(minibatch=n - 1), carry)
    assert all(bool(torch.isfinite(v).all()) for v in net.state_dict().values() if v.is_floating_point())


def test_a_non_finite_loss_stops_before_the_step_and_names_its_rows(world):
    net, env, carry, targets = rollout(world)
    t, b = targets["train"].nonzero()[0].tolist()
    targets["ret"][t, b] = float("nan")
    before = weights(net)
    with pytest.raises(NonFinite) as stop:
        update(net, torch.optim.Adam(net.parameters(), lr=1e-4), env, targets, args_of(), carry)
    report = stop.value.report
    assert report["term"] == ["v"] and report["epoch"] == 0 and report["minibatch"] == 0
    assert report["rows"] == [{"step": t, "row": b, "game_id": int(env.buf["game_id"][t, b]), "fails": ["ret"]}]
    assert stop.value.tensors["samples"]["armies"].shape[0] == stop.value.tensors["chunk"].shape[0]
    assert all(torch.equal(before[k], v) for k, v in net.state_dict().items())


def test_a_non_finite_gradient_stops_before_the_step(world):
    net, env, carry, targets = rollout(world)
    net.value.weight.register_hook(lambda g: g * float("nan"))
    before = weights(net)
    with pytest.raises(NonFinite) as stop:
        update(net, torch.optim.Adam(net.parameters(), lr=1e-4), env, targets, args_of(), carry)
    assert stop.value.report["term"] == ["gradient"] and "value.weight" in stop.value.report["parameters"]
    assert all(torch.equal(before[k], v) for k, v in net.state_dict().items())


def test_no_checkpoint_is_written_from_non_finite_weights(world, tmp_path):
    board, _ = world
    net = Net(16, 1, 2, 2, edges=board.edges, adjacency=board.adjacency)
    path = os.path.join(tmp_path, "latest.pt")
    save_net({"net": net.state_dict()}, net, path)
    kept = os.path.getsize(path)
    with torch.no_grad():
        net.value.weight[0, 0] = float("nan")
    with pytest.raises(RuntimeError):
        save_net({"net": net.state_dict()}, net, path)
    assert os.path.getsize(path) == kept and not os.path.exists(path + ".tmp")


def test_a_stale_held_decision_trains_the_value_only(world):
    net, env, carry, targets = rollout(world, rollouts=2)
    complete = targets["complete"]
    assert int(complete.sum()) > 0, "no held decision completed: nothing to test"
    # Only the held decisions, every one taken five updates ago, and only the policy's loss.
    targets["train"][:T] = False
    carry.age[complete] = 5
    policy_only = dict(vf=0.0, vo=0.0, aux=0.0, ent=0.0)
    before = weights(net)
    losses = update(net, torch.optim.Adam(net.parameters(), lr=1e-3), env, targets,
                    args_of(carry_policy_age=1, **policy_only), carry)
    assert losses["carried_value_only"] == int(complete.sum())
    assert all(torch.equal(before[k], v) for k, v in net.state_dict().items())
    # With no limit (the recipe before the limit existed) the same samples move the policy.
    update(net, torch.optim.Adam(net.parameters(), lr=1e-3), env, targets, args_of(carry_policy_age=0, **policy_only), carry)
    assert any(not torch.equal(before[k], v) for k, v in net.state_dict().items())


def test_a_resumed_run_keeps_its_carry_policy_age():
    assert kept("carry_policy_age", None, None) == 1
    assert kept("carry_policy_age", 3, None) == 3
    assert kept("carry_policy_age", None, {"bootstrap": "carry"}) == 0  # trained before the limit existed
    assert kept("carry_policy_age", None, {"carry_policy_age": 1}) == 1
    with pytest.raises(AssertionError):
        kept("carry_policy_age", 1, {"bootstrap": "carry"})

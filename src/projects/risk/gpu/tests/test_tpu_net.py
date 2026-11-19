"""The JAX network (`riskgpu/tpu/net.py`) is the PyTorch one: a checkpoint converted from PyTorch
gives the same outputs on the same inputs in float32, and converting back gives the same tensors, so a
TPU-trained net plays in every PyTorch tool exactly as it trained."""

import os
from types import SimpleNamespace

import numpy as np
import pytest
import torch

jax = pytest.importorskip("jax")
import jax.numpy as jnp  # noqa: E402

from riskgpu.board import Board  # noqa: E402
from riskgpu.data import DATA  # noqa: E402
from riskgpu.selfplay.actions import FEATURES, MAIN, SLOTS, amount_group, legal_amount  # noqa: E402
from riskgpu.selfplay.net import NEG, Net, masked, shape_of  # noqa: E402
from riskgpu.selfplay.obs import CLOCK, GLOBAL, NODE, SLOT  # noqa: E402
from riskgpu.selfplay.parity import random_net  # noqa: E402
from riskgpu.tpu import convert  # noqa: E402
from riskgpu.tpu.net import Forward, constants  # noqa: E402

B1 = os.path.join(os.path.dirname(DATA), "runs", "selfplay", "b1", "snap-100.pt")


def inputs(board: Board, batch: int, clock: bool, seed: int) -> dict:
    g = torch.Generator().manual_seed(seed)
    legal = torch.rand(batch, MAIN, generator=g) < 0.05
    main = torch.randint(0, MAIN, (batch,), generator=g)
    legal[torch.arange(batch), main] = True
    return {"node": torch.randn(batch, 42, NODE, generator=g), "slot": torch.randn(batch, 6, SLOT, generator=g),
            "glob": torch.randn(batch, GLOBAL + CLOCK if clock else GLOBAL, generator=g), "legal": legal, "main": main,
            "context": torch.randint(0, 49, (batch, 2), generator=g), "token": torch.randint(0, 49, (batch, SLOTS), generator=g),
            "has_token": torch.rand(batch, SLOTS, generator=g) < 0.3,
            "features": torch.randn(batch, SLOTS, FEATURES, generator=g),
            "amount_legal": torch.rand(batch, SLOTS, generator=g) < 0.5}


@torch.no_grad()
def torch_outputs(net: Net, x: dict):
    t = net.trunk(x["node"], x["slot"], x["glob"])
    logits, value, _ = net.heads_main(t)
    if net.exact:
        c = SimpleNamespace(context=x["context"], token=x["token"], has_token=x["has_token"], features=x["features"])
        za, legal = net.arg_logits(t, c), x["amount_legal"]
    else:
        za, legal = net.amount_logits(t, x["main"]), legal_amount(amount_group(x["main"]))
    return masked(logits, x["legal"]), masked(za, legal), value, legal


def jax_outputs(params: dict, board: Board, x: dict, amount_legal: torch.Tensor):
    batch = {k: jnp.asarray(v.numpy()) for k, v in x.items()}
    batch["amount_legal"] = jnp.asarray(amount_legal.numpy())
    forward = Forward(constants(board.edges.numpy(), board.adjacency.numpy()), jnp.float32)
    return [np.asarray(o) for o in jax.jit(forward)(params, batch)]


def assert_close(net: Net, board: Board, x: dict) -> dict:
    z, za, value, legal = torch_outputs(net, x)
    jz, jza, jvalue = jax_outputs(convert.from_torch(net.state_dict()), board, x, legal)
    out = {}
    for name, a, b in (("main", z, jz), ("amount", za, jza), ("value", value, jvalue)):
        a = a.numpy()
        assert np.array_equal(a == NEG, b == NEG), name  # the same choices masked
        live = a != NEG
        out[name] = float(np.abs(a[live] - b[live]).max())
        assert out[name] < 2e-4 * max(1.0, float(np.abs(a[live]).max())), (name, out[name])
    # The same most likely choice, as the bots play it.
    assert np.array_equal(z.argmax(1).numpy(), jz.argmax(1))
    return out


@pytest.mark.parametrize("actions,clock,size", [("buckets", False, (32, 2, 4)), ("exact", False, (32, 2, 4)),
                                                ("buckets", True, (64, 1, 8))])
def test_a_converted_net_gives_the_pytorch_outputs_and_converts_back_unchanged(actions, clock, size, tmp_path):
    board = Board.load("cpu")
    width, layers, heads = size
    net = random_net(width, layers, heads, 4, board, seed=5, actions=actions)
    if clock:
        net = Net(width, layers, heads, 4, edges=board.edges, adjacency=board.adjacency, actions=actions, clock=True)
    net.eval()
    assert_close(net, board, inputs(board, 64, clock, seed=1))

    params = convert.from_torch(net.state_dict())
    path = str(tmp_path / "net.pt")
    convert.save(path, params, step=3)
    back = torch.load(path, weights_only=False)
    assert back["config"] == net.config() and back["step"] == 3
    assert back["net"].keys() == net.state_dict().keys()
    for k, v in net.state_dict().items():
        assert torch.equal(back["net"][k], v), k
    assert shape_of(convert.load(path)) == net.config()


def test_in_bfloat16_the_outputs_stay_near_float32_s():
    board = Board.load("cpu")
    net = random_net(32, 2, 4, 4, board, seed=5)
    x = inputs(board, 64, False, seed=1)
    legal = legal_amount(amount_group(x["main"]))
    params = convert.from_torch(net.state_dict())
    batch = {**{k: jnp.asarray(v.numpy()) for k, v in x.items()}, "amount_legal": jnp.asarray(legal.numpy())}
    consts = constants(board.edges.numpy(), board.adjacency.numpy())
    full = jax.jit(Forward(consts, jnp.float32))(params, batch)
    half = jax.jit(Forward(consts, jnp.bfloat16))(params, batch)
    for a, b in zip(full, half):
        a, b = np.asarray(a), np.asarray(b)
        assert b.dtype == np.float32
        live = a != NEG
        assert np.abs(a[live] - b[live]).max() < 0.05 * max(1.0, np.abs(a[live]).max())


@pytest.mark.skipif(not os.path.exists(B1), reason="b1's snap-100 isn't in this checkout")
def test_the_seated_line_s_checkpoint_gives_its_outputs_in_jax():
    board = Board.load("cpu")
    from riskgpu.selfplay.ladder import load_net
    net = load_net(B1, board, "cpu")
    print(assert_close(net, board, inputs(board, 32, net.clock, seed=2)))

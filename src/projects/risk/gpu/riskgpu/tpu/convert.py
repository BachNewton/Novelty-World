"""Checkpoints between PyTorch and JAX, both ways, by name: a JAX network's parameters are the
PyTorch state dict's own tensors as float32 NumPy arrays (`net.py` in this folder), so the
conversion is lossless and a TPU-trained net is an ordinary `.pt` the PyTorch tools load (the panel,
the search, the recorder, the export to TypeScript).

A checkpoint written here is `{"net": state_dict, "config": ...}`, as `imitate.fit` writes one, with
whatever else the trainer keeps beside it (its step, its best score).
"""

import os

import numpy as np
import torch

from ..board import Board
from ..selfplay.net import Net, init_from, shape_of


def from_torch(state: dict[str, torch.Tensor]) -> dict[str, np.ndarray]:
    """A state dict (or a checkpoint holding one under `net`) as JAX parameters."""
    state = state.get("net", state)
    return {k: v.detach().cpu().to(torch.float32).numpy().copy() for k, v in state.items()}


def to_torch(params: dict) -> dict[str, torch.Tensor]:
    """JAX parameters as a state dict `Net` loads."""
    return {k: torch.from_numpy(np.asarray(v, dtype=np.float32).copy()) for k, v in params.items()}


def config_of(params: dict) -> dict:
    """The `config` a PyTorch checkpoint carries (`Net.config`), read from the parameters."""
    return shape_of(params)


def save(path: str, params: dict, **extra) -> None:
    """A PyTorch checkpoint of JAX parameters, written whole or not at all."""
    state = to_torch(params)
    # The state dict must be one `Net` of that shape loads strictly: fail here, not in a later tool.
    Net(**shape_of(state)).load_state_dict(state)
    tmp = path + ".tmp"
    torch.save({"net": state, "config": shape_of(state), **extra}, tmp)
    os.replace(tmp, path)


def load(path: str) -> dict[str, np.ndarray]:
    return from_torch(torch.load(path, map_location="cpu", weights_only=False))


def initial(shape: dict, board: Board, init: str | None, seed: int) -> dict[str, np.ndarray]:
    """A training run's first parameters, made by the PyTorch code so they are its own: a fresh
    `Net` of `shape` (PyTorch's initialisation, seeded), then `--init`'s checkpoint loaded into it by
    `init_from` (all of it from the same space, the shared heads from a bucket net into an exact one,
    the clock's weights at zero)."""
    torch.manual_seed(seed)
    net = Net(**shape, edges=board.edges, adjacency=board.adjacency)
    if init:
        init_from(net, torch.load(init, map_location="cpu", weights_only=False))
    return from_torch(net.state_dict())

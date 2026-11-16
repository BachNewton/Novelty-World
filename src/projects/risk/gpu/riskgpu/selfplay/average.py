"""The uniform average of several checkpoints' weights (stochastic weight averaging):

    python -m riskgpu.selfplay.average runs/selfplay/s2-2/snap-150.pt runs/selfplay/s2-2/snap-175.pt ...
        --out runs/selfplay/avg-s2-2-150-225.pt

run from `src/projects/risk/gpu/`. A run at a constant learning rate jitters round an optimum; the
average of nearby checkpoints of the one run sits nearer its middle, and often plays better than
each of them. The output is a plain state dict, the format of a `snap-*.pt` that `ladder.load_net`
and the panel read. The network has linear layers, layer norms and learned biases, and no
batch-norm running statistics, so averaging the weights is the whole job. The inputs must be one
shape and one action space: anything else refuses, naming the difference. Take them from one run,
close together; averaging distant or unrelated networks gives nonsense, and nothing here can tell.
"""

import argparse
import os
import sys

import torch

from .net import shape_of


def read(path: str) -> dict[str, torch.Tensor]:
    state = torch.load(path, map_location="cpu", weights_only=False)
    return state.get("net", state)


def average(states: list[dict[str, torch.Tensor]], names: list[str] | None = None) -> dict[str, torch.Tensor]:
    """The uniform average of state dicts of one shape and one action space, in float32 and cast
    back to each tensor's own dtype."""
    assert len(states) >= 2, "an average takes at least two checkpoints"
    names = names or [f"#{i}" for i in range(len(states))]
    shape = shape_of(states[0])
    for name, state in zip(names[1:], states[1:]):
        if shape_of(state) != shape:
            raise ValueError(f"{name} is {shape_of(state)}, {names[0]} is {shape}")
        if set(state) != set(states[0]):
            raise ValueError(f"{name}'s tensors differ from {names[0]}'s: {sorted(set(state) ^ set(states[0]))}")
        for key, tensor in state.items():
            if tensor.shape != states[0][key].shape or tensor.dtype != states[0][key].dtype:
                raise ValueError(f"{key}: {name} {tuple(tensor.shape)} {tensor.dtype}, "
                                 f"{names[0]} {tuple(states[0][key].shape)} {states[0][key].dtype}")
    out = {}
    for key, first in states[0].items():
        if not first.is_floating_point():
            raise ValueError(f"{key} is {first.dtype}: not a weight to average")
        total = sum(state[key].to(torch.float64) for state in states)
        out[key] = (total / len(states)).to(first.dtype)
    return out


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("ckpts", nargs="+")
    p.add_argument("--out", required=True)
    args = p.parse_args(argv)
    if os.path.exists(args.out):
        raise FileExistsError(f"{args.out} exists: remove it first")
    states = [read(path) for path in args.ckpts]
    averaged = average(states, args.ckpts)
    torch.save(averaged, args.out)
    print(f"{args.out}: the average of {len(states)} checkpoints, {shape_of(averaged)}, "
          f"{sum(t.numel() for t in averaged.values()):,} weights")
    return 0


if __name__ == "__main__":
    sys.exit(main())

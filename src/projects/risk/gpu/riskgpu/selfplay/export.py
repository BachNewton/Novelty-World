"""Exports a self-play checkpoint as a weight set of the TypeScript bot that plays its action
space: `net-v1` for the buckets, `net-v2` for the exact space (`bots/net-v1/`, `bots/net-v2/`,
`ideas/gpu-engine.md`, phase 3):

    python -m riskgpu.selfplay.export --ckpt runs/selfplay/m1a/latest.pt --name m1a-25

run from `src/projects/risk/gpu/`. Writes `bots/<bot>/weights/<name>.ts` (the net's shape and
every tensor of its state dict as little-endian float32 in base64, by its PyTorch name) and
rewrites `bots/<bot>/weights/index.ts` to list every weight set there. The checkpoint is either a
trainer's `latest.pt` (its `net`) or a bare state dict (`snap-<iter>.pt`); the shape and the action
space are read from the tensors themselves. Only fp32 weights go out: the bf16 autocast is the
trainer's, not the net's.
"""

import argparse
import base64
import os
import re
import sys

import torch

from ..board import DATA
from .net import shape_of

BOTS = os.path.join(os.path.dirname(os.path.dirname(DATA)), "bots")
BOT_OF_SPACE = {"buckets": "net-v1", "exact": "net-v2"}


def weights_dir(state: dict[str, torch.Tensor]) -> str:
    return os.path.join(BOTS, BOT_OF_SPACE[shape_of(state)["actions"]], "weights")


def load_state_dict(path: str) -> dict[str, torch.Tensor]:
    ck = torch.load(path, map_location="cpu", weights_only=False)
    state = ck["net"] if isinstance(ck, dict) and "net" in ck else ck
    return {name: t.detach().to(torch.float32).contiguous() for name, t in state.items()}


def b64(t: torch.Tensor) -> str:
    data = t.reshape(-1).numpy().astype("<f4").tobytes()
    return base64.b64encode(data).decode("ascii")


def weights_object(state: dict[str, torch.Tensor]) -> dict:
    """The weight set as the TypeScript reads it (`NetWeights` in `bots/net-v1/network.ts`)."""
    c = shape_of(state)
    return {"width": c["width"], "layers": c["layers"], "heads": c["heads"], "ff": c["ff_mult"] * c["width"],
            "tensors": {name: b64(t) for name, t in state.items()}}


def module_text(bot: str, source: str, w: dict) -> str:
    lines = [
        f"// A {bot} weight set, written by `python -m riskgpu.selfplay.export` from {source}; never edited by hand.",
        "",
        'import type { NetWeights } from "../network";',
        "",
        "export const WEIGHTS: NetWeights = {",
        f"  width: {w['width']},",
        f"  layers: {w['layers']},",
        f"  heads: {w['heads']},",
        f"  ff: {w['ff']},",
        "  tensors: {",
    ]
    lines += [f'    "{key}": "{value}",' for key, value in w["tensors"].items()]
    lines += ["  },", "};", ""]
    return "\n".join(lines)


def identifier(name: str) -> str:
    return "w" + re.sub(r"[^A-Za-z0-9]", "_", name)


def index_text(bot: str, names: list[str]) -> str:
    lines = [
        f"// Every {bot} weight set, by name: rewritten by `python -m riskgpu.selfplay.export`; never edited by hand.",
        "",
        'import type { NetWeights } from "../network";',
    ]
    lines += [f'import {{ WEIGHTS as {identifier(n)} }} from "./{n}";' for n in names]
    lines += ["", "export const WEIGHT_SETS: Readonly<Record<string, NetWeights>> = {"]
    lines += [f'  "{n}": {identifier(n)},' for n in names]
    lines += ["};", ""]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--ckpt", required=True)
    p.add_argument("--name", required=True, help="the weight set's name: letters, digits, '-' and '.'")
    args = p.parse_args(argv)
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.-]*", args.name):
        p.error(f"a weight set's name is letters, digits, '-' and '.', not {args.name!r}")
    state = load_state_dict(args.ckpt)
    w = weights_object(state)
    folder = weights_dir(state)
    bot = os.path.basename(os.path.dirname(folder))
    os.makedirs(folder, exist_ok=True)
    out = os.path.join(folder, f"{args.name}.ts")
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write(module_text(bot, os.path.basename(args.ckpt), w))
    names = sorted(f[:-3] for f in os.listdir(folder) if f.endswith(".ts") and f != "index.ts")
    with open(os.path.join(folder, "index.ts"), "w", encoding="utf-8", newline="\n") as f:
        f.write(index_text(bot, names))
    params = sum(t.numel() for t in state.values())
    print(f"{args.name}: width {w['width']}, {w['layers']} layers, {w['heads']} heads, ff {w['ff']}, "
          f"{params:,} weights -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

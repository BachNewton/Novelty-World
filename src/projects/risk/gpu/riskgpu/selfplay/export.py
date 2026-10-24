"""Exports a self-play checkpoint as a weight set of the TypeScript bot `net-v1`
(`bots/net-v1/`, `ideas/gpu-engine.md`, phase 3):

    python -m riskgpu.selfplay.export --ckpt runs/selfplay/m1a/latest.pt --name m1a-25

run from `src/projects/risk/gpu/`. Writes `bots/net-v1/weights/<name>.ts` (the net's shape and
every tensor of its state dict as little-endian float32 in base64, by its PyTorch name) and
rewrites `bots/net-v1/weights/index.ts` to list every weight set there. The checkpoint is either a
trainer's `latest.pt` (its `net`) or a bare state dict (`snap-<iter>.pt`); the shape is read from
the tensors themselves. Only fp32 weights go out: the bf16 autocast is the trainer's, not the net's.
"""

import argparse
import base64
import os
import re
import sys

import torch

from ..board import DATA

WEIGHTS_DIR = os.path.join(os.path.dirname(os.path.dirname(DATA)), "bots", "net-v1", "weights")


def load_state_dict(path: str) -> dict[str, torch.Tensor]:
    ck = torch.load(path, map_location="cpu", weights_only=False)
    state = ck["net"] if isinstance(ck, dict) and "net" in ck else ck
    return {name: t.detach().to(torch.float32).contiguous() for name, t in state.items()}


def config_of(state: dict[str, torch.Tensor]) -> dict[str, int]:
    """`Net`'s shape, read from its tensors."""
    width = state["node_in.weight"].shape[0]
    layers = len({name.split(".")[1] for name in state if name.startswith("blocks.")})
    heads = state["blocks.0.border"].shape[0]
    ff = state["blocks.0.ff1.weight"].shape[0]
    assert ff % width == 0, (ff, width)
    return {"width": width, "layers": layers, "heads": heads, "ff_mult": ff // width}


def b64(t: torch.Tensor) -> str:
    data = t.reshape(-1).numpy().astype("<f4").tobytes()
    return base64.b64encode(data).decode("ascii")


def weights_object(state: dict[str, torch.Tensor]) -> dict:
    """The weight set as the TypeScript reads it (`NetWeights` in `bots/net-v1/network.ts`)."""
    c = config_of(state)
    return {"width": c["width"], "layers": c["layers"], "heads": c["heads"], "ff": c["ff_mult"] * c["width"],
            "tensors": {name: b64(t) for name, t in state.items()}}


def module_text(name: str, source: str, w: dict) -> str:
    lines = [
        f"// A net-v1 weight set, written by `python -m riskgpu.selfplay.export` from {source}; never edited by hand.",
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


def index_text(names: list[str]) -> str:
    lines = [
        "// Every net-v1 weight set, by name: rewritten by `python -m riskgpu.selfplay.export`; never edited by hand.",
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
    os.makedirs(WEIGHTS_DIR, exist_ok=True)
    out = os.path.join(WEIGHTS_DIR, f"{args.name}.ts")
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write(module_text(args.name, os.path.basename(args.ckpt), w))
    names = sorted(f[:-3] for f in os.listdir(WEIGHTS_DIR) if f.endswith(".ts") and f != "index.ts")
    with open(os.path.join(WEIGHTS_DIR, "index.ts"), "w", encoding="utf-8", newline="\n") as f:
        f.write(index_text(names))
    params = sum(t.numel() for t in state.values())
    print(f"{args.name}: width {w['width']}, {w['layers']} layers, {w['heads']} heads, ff {w['ff']}, "
          f"{params:,} weights -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

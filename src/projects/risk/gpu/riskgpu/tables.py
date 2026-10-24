"""Balanced Blitz from exported running totals (`ideas/gpu-engine.md`, "Balanced Blitz as exported
running totals"). The GPU never computes the odds: `npm run risk:gpu-tables` writes, for every
fight (a, d) up to a bound, exactly what `blitz.ts`'s `resolveBlitz` compares, and this module
takes the first index whose total reaches the draw, as `pickOutcome`'s loop does, with no
summation of its own.

A table is `blitz-<bound>.json` (meta) beside `blitz-<bound>.bin` (little-endian sections):
- `capture: float64[(bound+1)^2]` at `a*(bound+1)+d`: `defenderLost[d]`, the capture chance;
- `index: int32[(bound+1)^2 * 4]`, per (a, d): the offset into `values` of the attacker's running
  totals (length a), of the defender's (length d), and the likeliest index of each side;
- `values: float64[...]`: the running totals, −1 where the outcome is unreachable (chance ≤ 0).

The meta holds `bound`, `endianness` and, under `sections`, each section's byte `offset` and
`bytes` (with its `count` and `dtype`, checked when present).
"""

import json
from dataclasses import dataclass

import numpy as np
import torch

MIN_VALUE = 5e-324  # JavaScript's Number.MIN_VALUE


@dataclass
class BlitzTables:
    bound: int
    capture: torch.Tensor  # [(bound+1)^2] float64
    index: torch.Tensor  # [(bound+1)^2, 4] int64
    values: torch.Tensor  # [n] float64

    @staticmethod
    def load(path_prefix: str, device: torch.device | str) -> "BlitzTables":
        """Reads `<path_prefix>.json` and `<path_prefix>.bin`, e.g. `data/blitz-32`."""
        with open(path_prefix + ".json", encoding="utf-8") as f:
            meta = json.load(f)
        if "bound" not in meta:
            raise ValueError(f"{path_prefix}.json has no 'bound': {sorted(meta)}")
        bound = int(meta["bound"])
        cells = (bound + 1) ** 2
        with open(path_prefix + ".bin", "rb") as f:
            raw = f.read()

        if meta.get("endianness", "little") != "little":
            raise ValueError(f"{path_prefix}.json is not little-endian")
        sections = meta.get("sections")
        if not isinstance(sections, dict):
            raise ValueError(f"{path_prefix}.json has no 'sections': {sorted(meta)}")

        def section(name: str, dtype: str, expected: int | None) -> np.ndarray:
            entry = sections.get(name)
            if entry is None or "offset" not in entry or "bytes" not in entry:
                raise ValueError(f"{path_prefix}.json has no '{name}' section with offset and bytes")
            offset, size = int(entry["offset"]), int(entry["bytes"])
            item = np.dtype(dtype).itemsize
            count = size // item
            if size % item or (expected is not None and count != expected):
                raise ValueError(f"section '{name}' is {size} bytes, expected {expected} of {item}")
            if entry.get("count", count) != count or entry.get("dtype", np.dtype(dtype).name) != np.dtype(dtype).name:
                raise ValueError(f"section '{name}' says {entry.get('count')} × {entry.get('dtype')}")
            if offset + size > len(raw):
                raise ValueError(f"section '{name}' runs past the end of {path_prefix}.bin")
            return np.frombuffer(raw, dtype=dtype, count=count, offset=offset)

        capture = section("capture", "<f8", cells)
        index = section("index", "<i4", cells * 4).reshape(cells, 4)
        values = section("values", "<f8", None)
        return BlitzTables(
            bound=bound,
            capture=torch.tensor(capture, dtype=torch.float64, device=device),
            index=torch.tensor(index.astype(np.int64), dtype=torch.int64, device=device),
            values=torch.tensor(values, dtype=torch.float64, device=device),
        )


def _first_reaching(
    values: torch.Tensor, offset: torch.Tensor, length: torch.Tensor, target: torch.Tensor, bound: int
) -> torch.Tensor:
    """Per row, the first i < length whose running total `values[offset + i]` is reachable and
    reaches `target`, or `bound` when none does."""
    pos = torch.arange(bound, device=values.device)[None, :]
    inside = pos < length[:, None]
    at = torch.where(inside, offset[:, None] + pos, 0)
    totals = values[at]
    hits = inside & (totals >= 0) & (totals >= target[:, None])
    return torch.where(hits, pos, bound).min(1).values


def resolve_blitz(
    tables: BlitzTables, a: torch.Tensor, d: torch.Tensor, r: torch.Tensor
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """`resolveBlitz(a, d, r)` per row: (attacker losses, defender losses, oversize). A fight past
    the table's bound is `oversize`, with zero losses, for the caller to resolve elsewhere."""
    assert a.dtype == torch.int64 and d.dtype == torch.int64, (a.dtype, d.dtype)
    assert r.dtype == torch.float64, r.dtype
    assert a.shape == d.shape == r.shape and a.dim() == 1, (a.shape, d.shape, r.shape)
    if bool(((a < 1) | (d < 1)).any()):
        raise ValueError("a blitz needs at least one army on each side")
    bound = tables.bound
    oversize = (a > bound) | (d > bound)
    a_in = torch.where(oversize, 1, a)
    d_in = torch.where(oversize, 1, d)

    cell = a_in * (bound + 1) + d_in
    capture = tables.capture[cell]
    off_a, off_d, likeliest_a, likeliest_d = tables.index[cell].unbind(1)
    draw = torch.where(r <= 0, MIN_VALUE, r)
    captures = capture >= draw

    first_a = _first_reaching(tables.values, off_a, a_in, draw, bound)
    first_d = _first_reaching(tables.values, off_d, d_in, draw - capture, bound)
    attacker_pick = torch.where(first_a < bound, first_a, likeliest_a)
    defender_pick = torch.where(first_d < bound, first_d, likeliest_d)

    attacker_losses = torch.where(captures, attacker_pick, a_in)
    defender_losses = torch.where(captures, d_in, defender_pick)
    attacker_losses = torch.where(oversize, 0, attacker_losses)
    defender_losses = torch.where(oversize, 0, defender_losses)
    return attacker_losses, defender_losses, oversize

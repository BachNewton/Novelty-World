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

A fight past the bound is resolved on the slow path: its cell is worked out on the host by the
port of the odds (`blitz_port.py`), exactly as the tables would hold it, and read the same way.
"""

import json
from dataclasses import dataclass, field

import numpy as np
import torch

from riskgpu import blitz_port

MIN_VALUE = 5e-324  # JavaScript's Number.MIN_VALUE


@dataclass
class BlitzTables:
    bound: int
    capture: torch.Tensor  # [(bound+1)^2] float64
    index: torch.Tensor  # [(bound+1)^2, 4] int64
    values: torch.Tensor  # [n] float64
    slow_cells: dict[tuple[int, int], blitz_port.Cell] = field(default_factory=dict, repr=False)
    # Training only (`selfplay/`): a fight past the bound is resolved on the device, approximately,
    # by `_resolve_scaled`, instead of exactly on the host. The host round trip is what stops a step
    # from being captured as a CUDA graph; such a game is still flagged `oversize`, and is never a
    # record anything is checked against.
    scaled_oversize: bool = False

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


SLOW_CELLS_KEPT = 4096


def _slow_cell(tables: BlitzTables, a: int, d: int) -> blitz_port.Cell:
    if a + d > blitz_port.ROLLED_ABOVE:
        raise NotImplementedError(
            f"a blitz of {a} against {d}: GD rolls a fight past {blitz_port.ROLLED_ABOVE} armies battle by battle "
            "from the game's stream (`rollFight`), which the GPU engine doesn't do yet"
        )
    known = tables.slow_cells.get((a, d))
    if known is None:
        if len(tables.slow_cells) >= SLOW_CELLS_KEPT:
            tables.slow_cells.clear()
        known = tables.slow_cells[(a, d)] = blitz_port.cell(a, d)
    return known


def _first_reaching_host(totals: np.ndarray, target: float, likeliest: int) -> int:
    hits = np.flatnonzero((totals >= 0) & (totals >= target))
    return int(hits[0]) if len(hits) else likeliest


def _resolve_slow(tables: BlitzTables, a: int, d: int, r: float) -> tuple[int, int]:
    """One fight past the bound, from its cell, as `resolve_blitz` reads a table's."""
    c = _slow_cell(tables, a, d)
    draw = MIN_VALUE if r <= 0 else r
    if c.capture >= draw:
        return _first_reaching_host(c.values_a, draw, c.likeliest_a), d
    return a, _first_reaching_host(c.values_d, draw - c.capture, c.likeliest_d)


def _resolve_scaled(
    tables: BlitzTables, a: torch.Tensor, d: torch.Tensor, draw: torch.Tensor
) -> tuple[torch.Tensor, torch.Tensor]:
    """A fight past the bound, approximately and on the device: the same draw read from the fight
    scaled down into the table (both sides by the same factor, rounded), its losses scaled back up.
    A capture still leaves the attacker an army and a failure the defender one, so the result is
    always a legal blitz. Never exact: only `scaled_oversize` reaches it."""
    bound = tables.bound
    most = torch.maximum(a, d).clamp(min=1)
    sa = ((a * bound + most // 2) // most).clamp(1, bound)
    sd = ((d * bound + most // 2) // most).clamp(1, bound)
    cell = sa * (bound + 1) + sd
    capture = tables.capture[cell]
    off_a, off_d, likeliest_a, likeliest_d = tables.index[cell].unbind(1)
    captures = capture >= draw
    first_a = _first_reaching(tables.values, off_a, sa, draw, bound)
    first_d = _first_reaching(tables.values, off_d, sd, draw - capture, bound)
    lost_a = torch.where(first_a < bound, first_a, likeliest_a)
    lost_d = torch.where(first_d < bound, first_d, likeliest_d)
    attacker = torch.where(captures, torch.minimum((lost_a * a + sa // 2) // sa, a - 1), a)
    defender = torch.where(captures, d, torch.minimum((lost_d * d + sd // 2) // sd, d - 1))
    return attacker, defender


def resolve_blitz(
    tables: BlitzTables, a: torch.Tensor, d: torch.Tensor, r: torch.Tensor
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """`resolveBlitz(a, d, r)` per row: (attacker losses, defender losses, oversize). A fight past
    the table's bound is `oversize`: it is resolved exactly on the slow path, and flagged so the
    caller knows the game left the tables."""
    assert a.dtype == torch.int64 and d.dtype == torch.int64, (a.dtype, d.dtype)
    assert r.dtype == torch.float64, r.dtype
    assert a.shape == d.shape == r.shape and a.dim() == 1, (a.shape, d.shape, r.shape)
    if not tables.scaled_oversize and bool(((a < 1) | (d < 1)).any()):
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
    if tables.scaled_oversize:
        scaled_a, scaled_d = _resolve_scaled(tables, a, d, draw)
        return (torch.where(oversize, scaled_a, attacker_losses), torch.where(oversize, scaled_d, defender_losses),
                oversize)
    if bool(oversize.any()):
        rows = torch.nonzero(oversize).flatten()
        slow = [
            _resolve_slow(tables, int(ai), int(di), float(ri))
            for ai, di, ri in zip(a[rows].tolist(), d[rows].tolist(), r[rows].tolist())
        ]
        attacker_losses = attacker_losses.clone()
        defender_losses = defender_losses.clone()
        attacker_losses[rows] = torch.tensor([s[0] for s in slow], dtype=attacker_losses.dtype, device=a.device)
        defender_losses[rows] = torch.tensor([s[1] for s in slow], dtype=defender_losses.dtype, device=a.device)
    return attacker_losses, defender_losses, oversize

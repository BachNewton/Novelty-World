"""Balanced Blitz from the exported tables (`tables.py`), compared in 32-bit integers.

The reference resolves a blitz by comparing its float64 draw r with float64 running totals: the
capture if `capture >= r`, then the attacker's first outcome whose total reaches r, or the
defender's first whose total reaches `r - capture` (rounded as float64 rounds it), with r taken as
the smallest float above 0 when it is 0. The draw is r = t / 2^32 for the stream's 32-bit t, and each
of those comparisons, as a function of t, holds for a prefix of t's values. So each becomes a
threshold on t, worked out once on the host in float64: the comparison holds exactly when
`t <= threshold`. The step then compares integers and reaches the reference's outcome to the bit.

A side's first outcome reached is found by binary search: over the running maximum of its
thresholds, from the side's first reachable outcome on, the comparison is monotone in the outcome.

A fight past the table's bound is the training engine's approximation (`tables._resolve_scaled`):
the fight scaled into the table, its losses scaled back, flagged `oversize`.
"""

import os

import jax
import jax.numpy as jnp
import numpy as np

from ..tables import MIN_VALUE, BlitzTables

TOP = 2**32 - 1
# A cell's row in `Tables.cell`: the offsets of each side's thresholds, each side's likeliest
# outcome, each side's first reachable outcome.
OFF_A, OFF_D, LIKELY_A, LIKELY_D, FIRST_A, FIRST_D = range(6)


def _draw(t: np.ndarray) -> np.ndarray:
    """The reference's draw for a 32-bit t, as `resolve_blitz` takes it (0 becomes MIN_VALUE)."""
    return np.where(t == 0, MIN_VALUE, t.astype(np.float64) / 4294967296.0)


def _largest_t(holds, size: int) -> np.ndarray:
    """Per entry, the largest t in [0, 2^32) for which `holds(t)` (monotone: true then false), or −1."""
    lo = np.full(size, -1, np.int64)  # holds at lo, or lo = −1
    hi = np.full(size, TOP + 1, np.int64)  # fails at hi, or hi = 2^32
    while bool((hi - lo > 1).any()):
        mid = (lo + hi) // 2
        ok = holds(mid)
        lo = np.where(ok, mid, lo)
        hi = np.where(ok, hi, mid)
    return lo


def thresholds(t: BlitzTables) -> dict[str, np.ndarray]:
    """The integer form of a table (module doc), as NumPy arrays."""
    bound = t.bound
    capture = t.capture.cpu().numpy()
    index = t.index.cpu().numpy()
    values = t.values.cpu().numpy()
    side = np.full(len(values), -1, np.int64)  # each value's cell's capture chance, for the defender's
    cap_of = np.full(len(values), np.nan)
    cells = np.arange((bound + 1) ** 2)
    a, d = cells // (bound + 1), cells % (bound + 1)
    real = (a > 0) & (d > 0)
    for k, length in ((0, a), (1, d)):
        starts, lens = index[real, k], length[real]
        at = np.repeat(starts - np.cumsum(np.r_[0, lens[:-1]]), lens) + np.arange(lens.sum())
        side[at] = k
        cap_of[at] = np.repeat(capture[real], lens)
    assert (side >= 0).all(), "a value no cell's side holds"

    reach = values >= 0
    # The attacker's: v >= draw. With draw = t / 2^32 that is t <= ⌊v · 2^32⌋, and t = 0 (MIN_VALUE)
    # holds whenever v >= MIN_VALUE, which the floor gives for any v above 0.
    attacker = np.where(values >= MIN_VALUE, np.minimum(np.floor(values * 4294967296.0), TOP), -1).astype(np.int64)
    # The defender's: v >= draw − capture, rounded; by search, the subtraction's rounding included.
    dv, dc = values[side == 1], cap_of[side == 1]
    defender = _largest_t(lambda tt: dv >= _draw(tt) - dc, len(dv))
    thr = np.where(side == 0, attacker, 0)
    thr[side == 1] = defender
    thr = np.where(reach, thr, -1)

    # Each side's running maximum from its start, and its first outcome that holds for some t.
    running = np.empty_like(thr)
    first = np.zeros((len(cells), 2), np.int64)
    likeliest = index[:, 2:4]
    for k, length in ((0, a), (1, d)):
        for cell in np.nonzero(real)[0]:
            s, n = index[cell, k], length[cell]
            seg = thr[s:s + n]
            run = np.maximum.accumulate(seg)
            running[s:s + n] = run
            hit = np.nonzero(run >= 0)[0]
            first[cell, k] = hit[0] if len(hit) else n
    cap_thr = np.where(capture >= MIN_VALUE, np.minimum(np.floor(capture * 4294967296.0), TOP), -1)
    cell_rows = np.stack([index[:, 0], index[:, 1], likeliest[:, 0], likeliest[:, 1], first[:, 0], first[:, 1]], 1)
    return {
        "bound": np.array(bound),
        "cell": cell_rows.astype(np.int32),
        "cap_thr": np.maximum(cap_thr, 0).astype(np.uint32),
        "cap_ok": cap_thr >= 0,
        "thr": np.maximum(running, 0).astype(np.uint32),
    }


def cached_thresholds(prefix: str, tables: BlitzTables | None = None) -> dict[str, np.ndarray]:
    """`thresholds` of `<prefix>.bin`, kept beside it as `<prefix>.thresholds.npz` (made again when
    older than the table)."""
    path = prefix + ".thresholds.npz"
    if os.path.exists(path) and os.path.getmtime(path) >= os.path.getmtime(prefix + ".bin"):
        with np.load(path) as z:
            return {k: z[k] for k in z.files}
    out = thresholds(tables if tables is not None else BlitzTables.load(prefix, "cpu"))
    tmp = path + ".tmp.npz"
    np.savez(tmp, **out)
    os.replace(tmp, path)
    return out


@jax.tree_util.register_pytree_node_class
class Tables:
    """The integer tables on the device; `bound` is static (it sets the search's length)."""

    def __init__(self, bound: int, cell, cap_thr, cap_ok, thr):
        self.bound, self.cell, self.cap_thr, self.cap_ok, self.thr = bound, cell, cap_thr, cap_ok, thr

    @staticmethod
    def of(arrays: dict[str, np.ndarray]) -> "Tables":
        return Tables(int(arrays["bound"]), *(jnp.asarray(arrays[k]) for k in ("cell", "cap_thr", "cap_ok", "thr")))

    def tree_flatten(self):
        return (self.cell, self.cap_thr, self.cap_ok, self.thr), self.bound

    @classmethod
    def tree_unflatten(cls, bound, children):
        return cls(bound, *children)


def _first(tables: Tables, off, length, first, t) -> jnp.ndarray:
    """The first outcome i < length whose comparison holds for t, or `length` when none does."""
    lo = jnp.zeros_like(length)
    hi = length
    for _ in range(tables.bound.bit_length() + 1):
        searching = lo < hi
        mid = (lo + hi) // 2
        m = tables.thr[off + jnp.clip(mid, 0, jnp.maximum(length - 1, 0))]
        holds = (mid >= first) & (t <= m)
        hi = jnp.where(searching & holds, mid, hi)
        lo = jnp.where(searching & ~holds, mid + 1, lo)
    return lo


def _read(tables: Tables, a, d, t):
    """(captures, the attacker's losses if it captures, the defender's if it doesn't) of fights
    inside the table."""
    i = a * (tables.bound + 1) + d
    cell = tables.cell[i]
    captures = tables.cap_ok[i] & (t <= tables.cap_thr[i])
    first_a = _first(tables, cell[:, OFF_A], a, cell[:, FIRST_A], t)
    first_d = _first(tables, cell[:, OFF_D], d, cell[:, FIRST_D], t)
    lost_a = jnp.where(first_a < a, first_a, cell[:, LIKELY_A])
    lost_d = jnp.where(first_d < d, first_d, cell[:, LIKELY_D])
    return captures, lost_a, lost_d


def resolve(tables: Tables, a: jnp.ndarray, d: jnp.ndarray, t: jnp.ndarray):
    """`resolveBlitz` per row from the draw's 32-bit t: (attacker losses, defender losses, oversize)."""
    bound = tables.bound
    oversize = (a > bound) | (d > bound)
    a_in = jnp.where(oversize, 1, a)
    d_in = jnp.where(oversize, 1, d)
    captures, lost_a, lost_d = _read(tables, a_in, d_in, t)
    attacker = jnp.where(captures, lost_a, a_in)
    defender = jnp.where(captures, d_in, lost_d)

    most = jnp.maximum(jnp.maximum(a, d), 1)
    sa = jnp.clip((a * bound + most // 2) // most, 1, bound)
    sd = jnp.clip((d * bound + most // 2) // most, 1, bound)
    s_captures, s_lost_a, s_lost_d = _read(tables, sa, sd, t)
    scaled_a = jnp.where(s_captures, jnp.minimum((s_lost_a * a + sa // 2) // sa, a - 1), a)
    scaled_d = jnp.where(s_captures, d, jnp.minimum((s_lost_d * d + sd // 2) // sd, d - 1))
    return jnp.where(oversize, scaled_a, attacker), jnp.where(oversize, scaled_d, defender), oversize

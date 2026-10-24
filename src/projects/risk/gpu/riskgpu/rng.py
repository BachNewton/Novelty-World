"""The reference engine's random stream (`src/shared/lib/seeded-random.ts`), bit for bit.

`createRng` is xmur3 over the seed string into a 32-bit state, then mulberry32. Every step is
32-bit integer arithmetic plus one float64 division, so it is exact in int64 tensors masked to 32
bits: states are held unsigned in [0, 2^32), and `Math.imul` is a 16-bit split product mod 2^32,
whose every intermediate stays below 2^50. On nonnegative values below 2^32, `^`, `|` and `>>`
give the same bits as JavaScript's 32-bit `^`, `|` and `>>>`, and an addition mod 2^32 the same
bits as JavaScript's addition followed by `ToInt32`.

The scalar functions are a pure-Python reference; `next_draws` is the batched stream.
"""

import torch

MASK = 0xFFFFFFFF
_GOLDEN = 0x6D2B79F5


def _imul32(a: int, b: int) -> int:
    return (a * b) & MASK


def xmur3(seed: str) -> int:
    """`createRng(seed)`'s initial state. `charCodeAt` reads UTF-16 code units, so a character
    outside the BMP counts as two, both in the length and in the hash."""
    data = seed.encode("utf-16-le")
    units = [data[k] | (data[k + 1] << 8) for k in range(0, len(data), 2)]
    h = (1779033703 ^ len(units)) & MASK
    for unit in units:
        h = _imul32(h ^ unit, 3432918353)
        h = ((h << 13) | (h >> 19)) & MASK
    h = _imul32(h ^ (h >> 16), 2246822507)
    h = _imul32(h ^ (h >> 13), 3266489909)
    return (h ^ (h >> 16)) & MASK


def mulberry32_scalar(state: int) -> tuple[float, int]:
    """One `next()`: the draw in [0, 1) and the state after it."""
    assert 0 <= state <= MASK, state
    state = (state + _GOLDEN) & MASK
    t = state
    t = _imul32(t ^ (t >> 15), t | 1)
    t ^= (t + _imul32(t ^ (t >> 7), t | 61)) & MASK
    return ((t ^ (t >> 14)) & MASK) / 4294967296.0, state


def imul(a: torch.Tensor, b: torch.Tensor | int) -> torch.Tensor:
    """`Math.imul(a, b)` mod 2^32, on int64 values in [0, 2^32)."""
    a_lo = a & 0xFFFF
    a_hi = a >> 16
    return (a_lo * b + (((a_hi * b) & 0xFFFF) << 16)) & MASK


def next_draws(state: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
    """One `next()` per lane, over any shape: (draw float64, state after int64)."""
    assert state.dtype == torch.int64, state.dtype
    state = (state + _GOLDEN) & MASK
    t = state
    t = imul(t ^ (t >> 15), t | 1)
    t = t ^ ((t + imul(t ^ (t >> 7), t | 61)) & MASK)
    draw = ((t ^ (t >> 14)) & MASK).double() / 4294967296.0
    return draw, state


def floor_draw(draw: torch.Tensor, n: torch.Tensor | int) -> torch.Tensor:
    """`Math.floor(r * n)`: the product in float64, then the floor, as int64."""
    assert draw.dtype == torch.float64, draw.dtype
    if isinstance(n, torch.Tensor):
        n = n.to(torch.float64)
    return torch.floor(draw * n).to(torch.int64)


def _base36(value: int) -> str:
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    if value == 0:
        return "0"
    out = []
    while value:
        value, rest = divmod(value, 36)
        out.append(digits[rest])
    return "".join(reversed(out))


def bot_seed(game_seed: str) -> str:
    """The runner's bot seed for a game: `createRng("bots|" + seed).getState().toString(36)`."""
    return _base36(xmur3("bots|" + game_seed))


def decision_seed(bot_seed: str, decision: int) -> int:
    """The initial state of a bot's stream for one decision: `createRng(`${botSeed}/${decision}`)`."""
    return xmur3(f"{bot_seed}/{decision}")

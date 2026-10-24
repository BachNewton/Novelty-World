"""GD's choice helpers (`bots/gd/choice.ts`), batched over the games, and the bot's own random
stream.

GD's `random()` is `createRng(seed).next()` from each decision's seed. mulberry32's state only
adds a constant each step, so the k-th draw of a stream is read directly from its seed: a
decision's draws are numbered in the order the TypeScript makes them, and each is read by its
number.
"""

import torch

from ..rng import MASK, next_draws
from .gd_odds import div, round_half_even

_GOLDEN = 0x6D2B79F5
_NONE = 1 << 30
# `GetIterativeArray` never lists more than 100 amounts.
AMOUNTS = 100


def draw(seed: torch.Tensor, k: torch.Tensor | int) -> torch.Tensor:
    """The k-th `random()` (from 0) of each stream `seed [B]`; `k` is a number, `[B]` or `[B, N]`:
    float64 of `k`'s shape after the batch."""
    k = torch.as_tensor(k, dtype=torch.int64, device=seed.device)
    lanes = seed.view(-1, *([1] * max(0, k.dim() - 1)))
    return next_draws((lanes + k * _GOLDEN) & MASK)[0]


def get_choice(scores: torch.Tensor, candidates: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
    """`getChoice` over each row's candidates `[B, N]` in column order: the first column scoring
    the row's highest score above 0, else the first scoring NaN. Returns the column (0 where none)
    and whether there is one."""
    positive = candidates & (scores > 0)
    top = torch.where(positive, scores, -torch.inf).max(-1, keepdim=True).values
    column = torch.arange(scores.shape[-1], device=scores.device)
    best = torch.where(positive & (scores == top), column, _NONE).min(-1).values
    nan = torch.where(candidates & torch.isnan(scores), column, _NONE).min(-1).values
    chosen = torch.where(best < _NONE, best, nan)
    found = chosen < _NONE
    return torch.where(found, chosen, 0), found


def iterative_array(start: torch.Tensor, end: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """`iterativeArray(start, end)` per row: the amounts `[B, 100]` int64, which of them are listed,
    and the variance `[B]`."""
    start, end = start.to(torch.int64), end.to(torch.int64)
    diff = end - start
    i = torch.arange(AMOUNTS, device=start.device)[None, :]
    every = (diff + 1 <= AMOUNTS)[:, None]
    step = div(diff, 99)
    spread = round_half_even(i * step[:, None]).to(torch.int64) + start[:, None]
    spread[:, 0] = start
    spread[:, AMOUNTS - 1] = end
    amounts = torch.where(every, start[:, None] + i, spread)
    listed = torch.where(every, i < (diff + 1)[:, None], True)
    variance = torch.where(every[:, 0], 0, torch.trunc(torch.floor(step * 0.5)).to(torch.int64))
    return amounts, listed, variance


def random_range(r: torch.Tensor, low: torch.Tensor | int, high: torch.Tensor | int) -> torch.Tensor:
    """`randomRange` from the draw `r`: `low + Math.floor(r * (high - low))`."""
    return low + torch.floor(r * (high - low)).to(torch.int64)


def apply_step_variance(
    value: torch.Tensor, low: torch.Tensor, high: torch.Tensor, variance: torch.Tensor, seed: torch.Tensor, k: torch.Tensor
) -> tuple[torch.Tensor, torch.Tensor]:
    """`applyStepVariance`, drawing the k-th `random()` where the variance is positive. Returns the
    amount and the count of draws made after it."""
    r = draw(seed, k)
    jitter = torch.where(value <= low, value + random_range(r, 0, variance),
                         torch.where(value >= high, value - random_range(r, 0, variance),
                                     value + random_range(r, -variance, variance)))
    jittered = torch.where(jitter < low, low, torch.where(jitter > high, high, jitter))
    varies = variance > 0
    plain = torch.where(value == 0, low, value)
    return torch.where(varies, jittered, plain), k + varies.to(torch.int64)

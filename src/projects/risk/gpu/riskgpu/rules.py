"""Rules shared by setup and the engine, batched."""

import torch

from .board import Board


def reinforcements(owner: torch.Tensor, seat: torch.Tensor, board: Board) -> torch.Tensor:
    """`REINF-2` and `REINF-3` for `seat[b]` in game b, from `owner [B, 42]`: max(3, ⌊owned/3⌋)
    plus the bonus of every continent the seat holds whole. int32 [B]."""
    assert owner.dim() == 2 and owner.shape[1] == board.continent_of.shape[0], owner.shape
    assert seat.shape == owner.shape[:1], (seat.shape, owner.shape)
    owned = owner.to(torch.int64) == seat.to(torch.int64)[:, None]
    territories = torch.clamp(owned.sum(1) // 3, min=3)
    held = (owned[:, None, :] | ~board.continent_members[None]).all(-1)  # [B, 6]
    continents = (held.to(torch.int64) * board.continent_bonus.to(torch.int64)).sum(1)
    return (territories + continents).to(torch.int32)

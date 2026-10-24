"""GD's choice of set (`bots/gd/cards.ts`), batched over the games: `bestCardMatch` over the hand in
its order, then `bonusTerritoryOf`. Each loop over the hand is a "first card that…" search per row;
each loop over the set's three cards runs as three masked steps.
"""

import torch

from ..board import Board
from ..engine import compact

# GD's card kinds: A infantry, B cavalry, C artillery (the board's symbols 0, 1, 2), W wild.
A, B, C, W = 0, 1, 2, 3
_NONE = 1 << 30


def kind_of(cards: torch.Tensor, board: Board) -> torch.Tensor:
    """Each card's kind, −1 for an empty hand slot (−1)."""
    symbol = board.card_symbol[cards.clamp(min=0)]
    return torch.where(cards < 0, -1, torch.where(symbol < 0, W, symbol))


def _first(found: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
    """The first true column of each row (0 where none) and whether there is one."""
    column = torch.arange(found.shape[-1], device=found.device)
    at = torch.where(found, column, _NONE).min(-1).values
    return torch.where(at < _NONE, at, 0), at < _NONE


def _pattern(x: int, y: int, z: int, like: torch.Tensor) -> torch.Tensor:
    return torch.tensor([x, y, z], dtype=torch.int64, device=like.device).expand(like.shape[0], 3)


def best_card_match(hand: torch.Tensor, owned: torch.Tensor, board: Board) -> tuple[torch.Tensor, torch.Tensor]:
    """The set GD's AI trades from `hand [B, 12]` (−1 past its end), in GD's order, as card indices
    `[B, 3]`, and whether the hand holds a set. `owned [B, 12]`: the card pictures a territory the
    trader owns."""
    kind = kind_of(hand, board)

    def count(k: int) -> torch.Tensor:
        return (kind == k).sum(1)

    a, b, c, w = count(A), count(B), count(C), count(W)
    kinds = (a > 0).to(torch.int64) + (b > 0).to(torch.int64) + (c > 0).to(torch.int64)
    col = lambda condition: condition[:, None]  # noqa: E731
    two_kinds = torch.where(col(c == 0), _pattern(A, B, W, hand), torch.where(col(b == 0), _pattern(A, W, C, hand), _pattern(W, B, C, hand)))
    one_kind = torch.where(col(a > 0), _pattern(A, W, W, hand), torch.where(col(b > 0), _pattern(W, B, W, hand), _pattern(W, W, C, hand)))
    p1, p2, p3, p4 = kinds == 3, (kinds == 2) & (w >= 1), (kinds == 1) & (w >= 2), w >= 3
    pattern = torch.where(col(p1), _pattern(A, B, C, hand), torch.where(col(p2), two_kinds, torch.where(col(p3), one_kind, _pattern(W, W, W, hand))))
    troops = torch.where(p1 | p2 | p3 | p4, 10, 0)
    for k, value in ((C, 8), (B, 6), (A, 4)):
        n = count(k)
        better = (value > troops) & ((n >= 3) | ((n == 2) & (w >= 1)) | ((n == 1) & (w >= 2)) | (w >= 3))
        mine = torch.where(col(n >= 3), _pattern(k, k, k, hand), torch.where(col(n == 2), _pattern(k, k, W, hand),
                           torch.where(col(n == 1), _pattern(k, W, W, hand), _pattern(W, W, W, hand))))
        pattern = torch.where(col(better), mine, pattern)
        troops = torch.where(better, value, troops)
    has_set = ((hand >= 0).sum(1) >= 3) & (troops > 0)
    return _cards_by_type(hand, kind, owned, pattern), has_set


def _cards_by_type(hand: torch.Tensor, kind: torch.Tensor, owned: torch.Tensor, pattern: torch.Tensor) -> torch.Tensor:
    """`GetCardsFromArrayByType`."""
    batch = hand.shape[0]
    rows = torch.arange(batch, device=hand.device)
    in_set = torch.zeros_like(owned)
    picked = []
    for p in range(3):
        at, found = _first((kind == pattern[:, p, None]) & ~in_set)
        in_set[rows, at] |= found
        picked.append(at)
    picked = torch.stack(picked, 1)  # hand positions, in the set's order
    picked_kind = kind.gather(1, picked)
    picked_owned = (picked_kind != W) & owned.gather(1, picked)
    owned_count = picked_owned.sum(1)

    removed = torch.zeros(batch, 3, dtype=torch.bool, device=hand.device)
    added = torch.zeros(batch, 3, dtype=torch.int64, device=hand.device)
    adds = torch.zeros_like(removed)

    # None owned: swap the first card that can be for an owned card of its kind.
    swapped = owned_count != 0
    for p in range(3):
        at, found = _first(~in_set & (kind == picked_kind[:, p, None]) & owned)
        ok = ~swapped & (picked_kind[:, p] != W) & found
        removed[:, p] |= ok
        added[:, p] = torch.where(ok, at, added[:, p])
        adds[:, p] |= ok
        swapped |= ok

    # Two or more owned: swap owned cards for unowned ones of their kind until one is left.
    owned_now = owned_count.clone()
    added_cards = torch.zeros_like(owned)
    for p in range(3):
        at, found = _first(~in_set & ~added_cards & (kind != W) & (kind == picked_kind[:, p, None]) & ~owned)
        ok = (owned_count >= 2) & (owned_now != 1) & picked_owned[:, p] & found
        added_cards[rows, at] |= ok
        removed[:, p] |= ok
        added[:, p] = torch.where(ok, at, added[:, p])
        adds[:, p] |= ok
        owned_now -= ok.to(torch.int64)

    order = compact(torch.cat([picked, added], 1), torch.cat([~removed, adds], 1))[:, :3]
    return hand.gather(1, order.clamp(min=0))


def bonus_territory_of(cards: torch.Tensor, seat: torch.Tensor, owner: torch.Tensor, board: Board) -> torch.Tensor:
    """The territory a set `[B, 3]` gives its +2: the first card in the set's order picturing one
    `seat` owns, or −1."""
    territory = board.card_territory[cards]
    owns = (territory >= 0) & (owner.gather(1, territory.clamp(min=0)) == seat[:, None])
    at, found = _first(owns)
    return torch.where(found, territory.gather(1, at[:, None])[:, 0], -1)

"""The active seat's legal moves, batched (`engine/options.ts` and `engine/legal.ts`).

Every kind is computed for every game and masked by its phase, so a step never branches on the
data. `options_bytes` in `canonical.py` reads only the fields of each game's own kind.
"""

from dataclasses import dataclass, fields
from itertools import combinations

import torch

from .board import CARDS, TERRITORIES, Board
from .state import HAND_MAX, State

KIND_REINFORCE, KIND_ATTACK, KIND_OCCUPY, KIND_FORTIFY = 0, 1, 2, 3

# Every triple of hand slots i < j < k, in `setsIn`'s order: i outer, then j, then k.
TRIPLES = torch.tensor(list(combinations(range(HAND_MAX), 3)), dtype=torch.int64)
assert TRIPLES.shape == (220, 3)

_ON_DEVICE: dict[tuple[str, torch.device], torch.Tensor] = {}


def on_device(name: str, value: torch.Tensor, device: torch.device) -> torch.Tensor:
    """A constant's copy on `device`, made once: a host-to-device copy inside a step would stop it
    from being captured as a CUDA graph."""
    key = (name, torch.device(device))
    if key not in _ON_DEVICE:
        _ON_DEVICE[key] = value.to(device)
    return _ON_DEVICE[key]


# `CARDS-6`: three infantry, three cavalry, three artillery; one of each.
THREE_OF = (4, 6, 8)
ONE_OF_EACH = 10


@dataclass
class Options:
    kind: torch.Tensor  # [B] int8
    # reinforce
    to_place: torch.Tensor  # [B] int32
    may_place: torch.Tensor  # [B] bool
    must_trade: torch.Tensor  # [B] bool
    may_trade: torch.Tensor  # [B] bool
    own: torch.Tensor  # [B, 42] bool
    sets: torch.Tensor  # [B, 220] bool, over TRIPLES; all false unless may_trade
    set_cards: torch.Tensor  # [B, 220, 3] int64 card indices, −1 past the hand
    bonus: torch.Tensor  # [B, 42] bool
    # attack
    attack_dice: torch.Tensor  # [B, 166] int8
    # occupy
    occ_from: torch.Tensor  # [B] int64
    occ_to: torch.Tensor  # [B] int64
    occ_min: torch.Tensor  # [B] int32
    occ_max: torch.Tensor  # [B] int32
    # fortify
    fortify_max: torch.Tensor  # [B, 42, 42] int32 by [from, to]

    def select(self, index: torch.Tensor | slice | list[int]) -> "Options":
        """The games picked by a boolean mask, indices or a slice (as `State.select`)."""
        return Options(**{f.name: getattr(self, f.name)[index] for f in fields(Options)})


def active_hand(s: State) -> tuple[torch.Tensor, torch.Tensor]:
    """The active seat's hand `[B, 12]` int64 (−1 past its length) and its length `[B]` int64."""
    rows = torch.arange(s.batch, device=s.device)
    active = s.active.to(torch.int64)
    length = s.hand_len[rows, active].to(torch.int64)
    hand = s.hand[rows, active].to(torch.int64)
    slots = torch.arange(HAND_MAX, device=s.device)[None, :]
    return torch.where(slots < length[:, None], hand, -1), length


def is_valid_set(cards: torch.Tensor, board: Board) -> torch.Tensor:
    """`isValidSet` over the last dimension (3 card indices, all ≥ 0): any wild makes a set, else
    three of a symbol or one of each."""
    symbol = board.card_symbol[cards.clamp(min=0)]
    wild = (symbol < 0).any(-1)
    a, b, c = symbol.unbind(-1)
    same = (a == b) & (b == c)
    distinct = (a != b) & (b != c) & (a != c)
    return wild | same | distinct


def set_value(cards: torch.Tensor, board: Board) -> torch.Tensor:
    """`setValue` of valid sets `[..., 3]`: one of each when the symbols and wilds cover three
    distinct symbols (a wild counting as any), else three of the first non-wild card's symbol."""
    symbol = board.card_symbol[cards]
    wilds = (symbol < 0).sum(-1)
    present = torch.stack([(symbol == k).any(-1) for k in range(3)], -1)
    distinct = present.sum(-1)
    one_of_each = (distinct + wilds == 3) & ((distinct > 1) | (wilds > 1))
    first_non_wild = torch.where(symbol >= 0, symbol, 3).min(-1).values
    # `first_non_wild` must be the first in card order, not the lowest symbol: they differ only for
    # sets that are one of each, which take the other branch.
    three_of = on_device("three_of", torch.tensor(THREE_OF + (0,), dtype=torch.int64), cards.device)[first_non_wild]
    return torch.where(one_of_each, ONE_OF_EACH, three_of)


def own_adjacency(s: State, board: Board) -> torch.Tensor:
    """`[B, 42, 42]` bool: the borders between two territories the active seat owns."""
    own = s.owner.to(torch.int64) == s.active.to(torch.int64)[:, None]
    return board.adjacency[None] & own[:, :, None] & own[:, None, :]


def fortify_reach(s: State, board: Board) -> torch.Tensor:
    """`FORT-1` (`fortifyDestinations`): `[B, 42, 42]` bool, `to` joined to `from` through the
    active seat's own territories, `to != from`. The closure doubles the path length each pass, and
    six passes cover the longest path of 41 borders. The matrix product counts paths in floats,
    which is exact for counts this small; only whether each is nonzero is kept."""
    reach = own_adjacency(s, board)
    # On CUDA in float16, on the tensor cores: the counts are at most 42, exact in either type.
    dtype = torch.float16 if reach.is_cuda else torch.float32
    for _ in range(6):
        r = reach.to(dtype)
        reach = reach | (torch.bmm(r, r) > 0)
    eye = torch.eye(TERRITORIES, dtype=torch.bool, device=s.device)
    return reach & ~eye[None]


def has_fortify_move(s: State, board: Board) -> torch.Tensor:
    """Whether `fortifyMoves` is non-empty: some own territory with 2 or more armies borders
    another own territory, since a reachable set is empty exactly when it has no own neighbour."""
    border = own_adjacency(s, board).any(-1)
    return (border & (s.armies >= 2)).any(-1)


def attack_dice(s: State, board: Board) -> torch.Tensor:
    """`COMBAT-1`, `COMBAT-2` (`attacks`): `[B, 166]` int64, the most dice on each canonical edge,
    0 where the attack isn't legal; ignores the phase and any pending move-in."""
    owner = s.owner.to(torch.int64)
    active = s.active.to(torch.int64)[:, None]
    frm, to = board.edges[:, 0], board.edges[:, 1]
    armies = s.armies.to(torch.int64)[:, frm]
    legal = (owner[:, frm] == active) & (owner[:, to] != active) & (armies >= 2)
    return torch.where(legal, (armies - 1).clamp(max=3), 0)


def has_attack(s: State, board: Board) -> torch.Tensor:
    return (attack_dice(s, board) > 0).any(-1)


def options(s: State, board: Board) -> Options:
    phase = s.phase.to(torch.int64)
    reinforce = (phase == 0) & s.reinf_present
    attack = (phase == 1) & ~s.occ_present
    occupy = (phase == 1) & s.occ_present
    fortify = phase == 2
    kind = torch.where(phase == 0, KIND_REINFORCE, torch.where(phase == 2, KIND_FORTIFY,
                       torch.where(s.occ_present, KIND_OCCUPY, KIND_ATTACK)))

    # reinforce
    hand, length = active_hand(s)
    active = s.active.to(torch.int64)
    own = s.owner.to(torch.int64) == active[:, None]
    must_trade = reinforce & (length >= 5)
    may_trade = reinforce & torch.where(s.reinf_after_elim, must_trade, ~s.reinf_placed_any)
    triples = on_device("triples", TRIPLES, s.device)
    set_cards = hand[:, triples]  # [B, 220, 3]
    in_hand = (triples[None, :, 2] < length[:, None])
    sets = may_trade[:, None] & in_hand & is_valid_set(set_cards, board)
    pictured = torch.zeros(s.batch, CARDS + 1, dtype=torch.bool, device=s.device)
    pictured.scatter_(1, torch.where(hand >= 0, hand, CARDS), True)
    bonus = reinforce[:, None] & pictured[:, :TERRITORIES] & own

    zero = torch.zeros_like(s.reinf_to_place)
    return Options(
        kind=kind.to(torch.int8),
        to_place=torch.where(reinforce, s.reinf_to_place, zero),
        may_place=reinforce & ~must_trade,
        must_trade=must_trade,
        may_trade=may_trade,
        own=reinforce[:, None] & own,
        sets=sets,
        set_cards=set_cards,
        bonus=bonus,
        attack_dice=torch.where(attack[:, None], attack_dice(s, board), 0).to(torch.int8),
        occ_from=torch.where(occupy, s.occ_from.to(torch.int64), -1),
        occ_to=torch.where(occupy, s.occ_to.to(torch.int64), -1),
        occ_min=torch.where(occupy, s.occ_min, zero),
        occ_max=torch.where(occupy, s.occ_max, zero),
        fortify_max=torch.where(
            fortify[:, None, None] & fortify_reach(s, board) & (s.armies >= 2)[:, :, None],
            (s.armies - 1)[:, :, None], 0,
        ).to(torch.int32),
    )

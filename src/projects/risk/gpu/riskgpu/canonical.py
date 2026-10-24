"""The canonical byte layout of a state and its hash (`ideas/gpu-engine.md`, "Canonical layout and
hash"), the same bytes `eval/gpu-canonical.ts` writes on the TypeScript side.

Every field is a 4-byte little-endian integer: `rng` as its unsigned 32 bits, everything else
signed. A batch's layouts are built as one `[B, N]` int32 tensor on the device and copied to the
host once.
"""

import hashlib

import numpy as np
import torch

from .board import CARDS, MAX_SEATS, TERRITORIES
from .state import HAND_MAX, State

STATE_INTS = (
    1 + 1 + MAX_SEATS + TERRITORIES + TERRITORIES  # players, rng, turnOrder, owner, armies
    + MAX_SEATS * (1 + HAND_MAX)  # handLen, hand per seat
    + 1 + CARDS + 1  # deckLen, deck, tradesCount
    + MAX_SEATS + 4  # eliminated, turn, round, active, phase
    + 4 + 6  # reinforce, occupying
    + 1 + 1  # capturedThisTurn, winner
)


def _column(t: torch.Tensor) -> torch.Tensor:
    return t.to(torch.int32).reshape(t.shape[0], -1)


def state_ints(state: State) -> torch.Tensor:
    """The canonical layout of every game, `[B, STATE_INTS] int32` on the state's device."""
    s = state
    seats = torch.arange(MAX_SEATS, device=s.device)[None, :]
    seat_exists = seats < s.players[:, None]
    slots = torch.arange(HAND_MAX, device=s.device)[None, None, :]
    hand = torch.where(slots < s.hand_len[:, :, None], s.hand.to(torch.int32), -1)
    hands = torch.cat([s.hand_len[:, :, None], hand], 2)  # [B, 6, 13]: handLen then hand
    deck = torch.where(torch.arange(CARDS, device=s.device)[None, :] < s.deck_len[:, None], s.deck.to(torch.int32), -1)
    # rng's unsigned 32 bits as the int32 with the same bits.
    rng = torch.where(s.rng >= 2**31, s.rng - 2**32, s.rng)
    reinf = s.reinf_present
    occ = s.occ_present

    def present(value: torch.Tensor, absent: int, mask: torch.Tensor) -> torch.Tensor:
        return torch.where(mask, value.to(torch.int32), absent)

    parts = [
        s.players, rng, s.turn_order, s.owner, s.armies, hands,
        s.deck_len, deck, s.trades,
        s.eliminated & seat_exists,
        s.turn, s.round, s.active, s.phase,
        reinf, present(s.reinf_to_place, 0, reinf), present(s.reinf_placed_any, 0, reinf),
        present(s.reinf_after_elim, 0, reinf),
        occ, present(s.occ_from, -1, occ), present(s.occ_to, -1, occ), present(s.occ_min, 0, occ),
        present(s.occ_max, 0, occ), present(s.occ_elim, -1, occ),
        s.captured_this_turn, s.winner,
    ]
    out = torch.cat([_column(p) for p in parts], 1)
    assert out.shape == (s.batch, STATE_INTS), out.shape
    return out


def state_bytes(state: State) -> list[bytes]:
    """One canonical byte string per game."""
    rows = state_ints(state).cpu().numpy().astype("<i4", copy=False)
    assert rows.dtype == np.dtype("<i4"), rows.dtype
    return [row.tobytes() for row in rows]


def hash_bytes(b: bytes) -> str:
    """SHA-256, the first 16 hex characters."""
    return hashlib.sha256(b).hexdigest()[:16]


def hash_states(state: State) -> list[str]:
    return [hash_bytes(b) for b in state_bytes(state)]


# The options layout (the active seat's legal moves, by kind) is canonicalised here once the
# engine computes options: `options_bytes(options) -> list[bytes]` and `hash_options`.

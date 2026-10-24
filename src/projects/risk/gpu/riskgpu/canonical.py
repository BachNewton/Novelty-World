"""The canonical byte layouts of a state and of a seat's options, and their hashes
(`ideas/gpu-engine.md`, "Canonical layout and hash"), the same bytes `eval/gpu-canonical.ts`
writes on the TypeScript side.

Every field is a 4-byte little-endian integer: `rng` as its unsigned 32 bits, everything else
signed. A batch's state layouts are built as one `[B, N]` int32 tensor on the device and copied
to the host once; options, whose length depends on their kind, are assembled on the host.
"""

import hashlib

import numpy as np
import torch

from .board import CARDS, MAX_SEATS, TERRITORIES
from .options import Options
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


def options_ints(options: Options) -> list[np.ndarray]:
    """The canonical layout of every game's options, by its kind, as int32 arrays of varying
    length: reinforce 1+1+1+1+42+1+3·sets+42, attack 1+166, occupy 1+4, fortify 1+1764."""
    o = {name: getattr(options, name).cpu().numpy() for name in (
        "kind", "to_place", "may_place", "must_trade", "own", "sets", "set_cards", "bonus",
        "attack_dice", "occ_from", "occ_to", "occ_min", "occ_max", "fortify_max",
    )}
    out = []
    for b, kind in enumerate(o["kind"].tolist()):
        if kind == 0:
            cards = o["set_cards"][b][o["sets"][b]]
            parts = [[0, o["to_place"][b], o["may_place"][b], o["must_trade"][b]], o["own"][b],
                     [len(cards)], cards.reshape(-1), o["bonus"][b]]
        elif kind == 1:
            parts = [[1], o["attack_dice"][b]]
        elif kind == 2:
            parts = [[2, o["occ_from"][b], o["occ_to"][b], o["occ_min"][b], o["occ_max"][b]]]
        elif kind == 3:
            parts = [[3], o["fortify_max"][b].reshape(-1)]
        else:
            raise ValueError(f"game {b} has options of kind {kind}")
        out.append(np.concatenate([np.asarray(p, dtype=np.int64) for p in parts]).astype("<i4"))
    return out


def options_bytes(options: Options) -> list[bytes]:
    return [row.tobytes() for row in options_ints(options)]


def hash_options(options: Options) -> list[str]:
    return [hash_bytes(b) for b in options_bytes(options)]

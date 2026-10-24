"""`RULES.md`'s invariants (INV-1 to INV-9), batched, as `engine/invariants.ts` checks them.

`check_state` holds every game's state to them; `check_step` holds one step's change, from the
two states and what the step reports, where the reference checker reads the events. Both raise
`InvariantError` naming the first game that breaks one.
"""

import torch

from .board import CARDS, MAX_SEATS
from .canonical import state_ints
from .engine import StepInfo
from .state import HAND_MAX, State


class InvariantError(Exception):
    def __init__(self, game: int, rule: str, message: str):
        super().__init__(f"game {game}: {rule}: {message}")
        self.game = game
        self.rule = rule


def _fail_where(bad: torch.Tensor, rule: str, message: str) -> None:
    if bool(bad.any()):
        raise InvariantError(int(bad.nonzero()[0, 0]), rule, message)


def check_state(s: State, mask: torch.Tensor | None = None) -> None:
    """Every game where `mask` holds (all by default)."""
    games = torch.ones(s.batch, dtype=torch.bool, device=s.device) if mask is None else mask
    rows = torch.arange(s.batch, device=s.device)
    seats = torch.arange(MAX_SEATS, device=s.device)[None, :]
    exists = seats < s.players[:, None]
    owner = s.owner.to(torch.int64)
    active = s.active.to(torch.int64)
    phase = s.phase.to(torch.int64)

    # INV-1, and every owner a seat in the game (INV-8).
    _fail_where(games & (s.armies < 1).any(1), "INV-1", "a territory holds no army")
    owner_ok = (owner >= 0) & (owner < s.players[:, None].to(torch.int64))
    owner_out = s.eliminated.gather(1, owner.clamp(0, MAX_SEATS - 1))
    _fail_where(games & (~owner_ok | owner_out).any(1), "INV-8", "a territory is held by no seat in the game")

    # INV-4: 44 cards across the deck and the hands, each once; padding −1 past every length.
    slots = torch.arange(HAND_MAX, device=s.device)[None, None, :]
    in_hand = slots < s.hand_len[:, :, None]
    hand = s.hand.to(torch.int64)
    in_deck = torch.arange(CARDS, device=s.device)[None, :] < s.deck_len[:, None]
    deck = s.deck.to(torch.int64)
    layout_ok = (
        ((hand >= 0) & (hand < CARDS) | ~in_hand).all(-1).all(-1)
        & ((hand == -1) | in_hand).all(-1).all(-1)
        & ((deck >= 0) & (deck < CARDS) | ~in_deck).all(-1)
        & ((deck == -1) | in_deck).all(-1)
        & (s.hand_len >= 0).all(-1) & (s.hand_len <= HAND_MAX).all(-1)
        & ((s.hand_len == 0) | exists).all(-1)
    )
    _fail_where(games & ~layout_ok, "INV-4", "a hand or the deck is not laid out as its length says")
    counts = torch.zeros(s.batch, CARDS + 1, dtype=torch.int64, device=s.device)
    counts.scatter_add_(1, torch.where(in_deck, deck, CARDS), torch.ones_like(deck))
    flat = torch.where(in_hand, hand, CARDS).reshape(s.batch, -1)
    counts.scatter_add_(1, flat, torch.ones_like(flat))
    _fail_where(games & (counts[:, :CARDS] != 1).any(1), "INV-4", "the 44 cards are not each held once")

    # INV-6 and ELIM-3: hand sizes by phase.
    length = s.hand_len.to(torch.int64)
    held = length[rows, active]
    off_turn = seats != active[:, None]
    _fail_where(games & (off_turn & (length > 5)).any(1), "INV-6", "more than 5 cards off turn")
    reinforce = phase == 0
    _fail_where(games & reinforce & ~s.reinf_present, "INV-3", "a reinforce phase without its state")
    _fail_where(games & reinforce & ~s.reinf_after_elim & (held > 5), "INV-6", "more than 5 cards in a turn's reinforce phase")
    _fail_where(games & reinforce & s.reinf_after_elim & (held < 2), "ELIM-3", "forced trades went below 2 cards")
    _fail_where(games & (phase == 1) & ~s.reinf_present & (held > 4), "INV-6", "more than 4 cards in the attack phase")
    _fail_where(games & (phase == 2) & (held > 4), "INV-6", "more than 4 cards in the fortify phase")

    # INV-8 and INV-9.
    owns = (owner[:, None, :] == seats[:, :, None]).any(-1)  # [B, 6]
    pending = torch.where(s.occ_present, s.occ_elim.to(torch.int64), -1)
    is_pending = seats == pending[:, None]
    _fail_where(games & (exists & is_pending & (owns | s.eliminated)).any(1), "INV-8",
                "a seat mid-elimination owns land or is out")
    _fail_where(games & (exists & ~is_pending & (owns == s.eliminated)).any(1), "INV-8",
                "a seat owns land but is out, or owns nothing but is in")
    _fail_where(games & (exists & s.eliminated & (length > 0)).any(1), "INV-8", "an eliminated seat holds cards")
    over = phase == 3
    _fail_where(games & s.eliminated[rows, active] & ~over, "INV-8", "an eliminated seat is taking a turn")
    left = exists & ~s.eliminated
    _fail_where(games & (over != (left.sum(1) == 1)), "INV-9", "the game is over exactly when one seat is left")
    last = left.to(torch.int64).argmax(1)
    _fail_where(games & over & (s.winner.to(torch.int64) != last), "INV-9", "the winner is not the last seat left")


def check_step(before: State, after: State, info: StepInfo, stepped: torch.Tensor) -> None:
    """One step: the games not `stepped` are untouched; in those stepped, the seat order holds
    (`SETUP-2`), the board's armies change only by placements, bonuses and losses (INV-2), at most
    one turn passes and the phases follow `TURN-1` (INV-3), and the deck loses at most the one
    card a turn draws or gains a trade's three (INV-4)."""
    same = (state_ints(before) == state_ints(after)).all(1)
    _fail_where(~stepped & ~same, "INV-9", "a game that was not stepped changed")
    _fail_where(stepped & (before.phase == 3), "INV-9", "a move was applied after the game ended")
    _fail_where(stepped & (before.turn_order != after.turn_order).any(1), "SETUP-2", "the seat order changed")

    change = after.armies.to(torch.int64).sum(1) - before.armies.to(torch.int64).sum(1)
    _fail_where(stepped & (change != info.placed - info.lost), "INV-2", "the board's armies changed by more than the step's placements and losses")

    turns = (after.turn - before.turn).to(torch.int64)
    b, a = before.phase.to(torch.int64), after.phase.to(torch.int64)
    forward = (a >= b) | ((b == 1) & (a == 0) & after.reinf_after_elim)
    next_turn = (a == 0) & (b >= 1) & (b <= 2)
    phase_ok = torch.where(turns == 0, forward, (turns == 1) & next_turn)
    _fail_where(stepped & ~phase_ok, "INV-3", "the phases or turns stepped out of order")
    _fail_where(stepped & (a == 3) & (b != 1), "INV-3", "the game ended outside the attack phase")

    deck = (after.deck_len - before.deck_len).to(torch.int64)
    _fail_where(stepped & ~((deck == -1) | (deck == 0) | (deck == 3)), "INV-4", "the deck changed by other than a draw or a trade")

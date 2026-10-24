"""What the network sees: the acting seat's view, as one float vector per game.

Only what that seat may see goes in (`CLAUDE.md`, "Bots are never trusted"): the board, every
seat's hand size, the acting seat's own cards, the deck's size, the turn so far's public events
(territories placed on, attacks and captures), the pending move-in and the options. Never another
hand, never the deck's order, never the random stream.

**Seats are slots, never names** (v8's rule): slot 0 is the acting seat, slot k the seat k places
after it in turn order, so a slot says where a seat sits relative to the one deciding, never who it
is. Seats that don't exist at a smaller table are absent slots; eliminated seats keep their slot,
marked out.

Three groups, one per kind of token the network reads: per territory `[B, 42, NODE]`, per slot
`[B, 6, SLOT]`, and the globals `[B, GLOBAL]`.
"""

import torch

from ..board import CARDS, MAX_SEATS, TERRITORIES, Board
from ..options import Options
from ..rules import reinforcements
from ..state import HAND_MAX, State

NODE = 13
SLOT = 7
GLOBAL = 28


def slots(s: State) -> tuple[torch.Tensor, torch.Tensor]:
    """`(seat_of_slot [B, 6], slot_of_seat [B, 7])`, int64: slot k's seat (−1 where the table has no
    slot k), and each seat's slot (6 for a seat the table doesn't have; index 6 stands for "none")."""
    players = s.players.to(torch.int64)[:, None]
    order = s.turn_order.to(torch.int64)
    active = s.active.to(torch.int64)[:, None]
    k = torch.arange(MAX_SEATS, device=s.device)[None, :]
    at = (order == active).to(torch.int64).argmax(1, keepdim=True)
    seat_of_slot = torch.where(k < players, order.gather(1, (at + k) % players), -1)
    position = torch.where(k < players, (order[:, :, None] == k[:, None, :]).to(torch.int64).argmax(1), 0)
    slot_of_seat = torch.where(k < players, (position - at) % players, MAX_SEATS)
    none = torch.full_like(slot_of_seat[:, :1], MAX_SEATS)
    return seat_of_slot, torch.cat([slot_of_seat, none], 1)


def observe(s: State, o: Options, placed_on: torch.Tensor, attacks: torch.Tensor, captured: torch.Tensor,
            board: Board) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    batch, device = s.batch, s.device
    rows = torch.arange(batch, device=device)
    f32 = torch.float32
    seat_of_slot, slot_of_seat = slots(s)
    owner = s.owner.to(torch.int64)
    armies = s.armies.to(f32)
    active = s.active.to(torch.int64)
    players = s.players.to(torch.int64)

    # per territory
    owner_slot = slot_of_seat.gather(1, owner)
    owner_onehot = torch.nn.functional.one_hot(owner_slot, MAX_SEATS + 1)[:, :, :MAX_SEATS].to(f32)
    hand = s.hand[rows, active].to(torch.int64)
    held = torch.arange(HAND_MAX, device=device)[None, :] < s.hand_len[rows, active].to(torch.int64)[:, None]
    pictured = torch.zeros(batch, CARDS + 1, dtype=f32, device=device)
    pictured.scatter_(1, torch.where(held & (hand >= 0), hand, CARDS), 1.0)
    occ_from = torch.zeros(batch, TERRITORIES + 1, dtype=f32, device=device)
    occ_from.scatter_(1, torch.where(s.occ_present, s.occ_from.to(torch.int64), TERRITORIES)[:, None], 1.0)
    occ_to = torch.zeros(batch, TERRITORIES + 1, dtype=f32, device=device)
    occ_to.scatter_(1, torch.where(s.occ_present, s.occ_to.to(torch.int64), TERRITORIES)[:, None], 1.0)
    total = armies.sum(1, keepdim=True).clamp(min=1)
    node = torch.cat([
        owner_onehot,
        (torch.log1p(armies) / 4)[:, :, None],
        (armies.clamp(max=60) / 20)[:, :, None],
        (armies / total * 10)[:, :, None],
        placed_on.to(f32)[:, :, None],
        occ_from[:, :TERRITORIES, None],
        occ_to[:, :TERRITORIES, None],
        pictured[:, :TERRITORIES, None],
    ], 2)
    assert node.shape[2] == NODE, node.shape

    # per seat, then by slot
    seats = torch.arange(MAX_SEATS, device=device)[None, :]
    present = seats < players[:, None]
    alive = present & ~s.eliminated
    mine = owner[:, None, :] == seats[:, :, None]  # [B, 6, 42]
    territories = mine.sum(-1).to(f32)
    seat_armies = (mine.to(f32) * armies[:, None, :]).sum(-1)
    income = torch.stack([reinforcements(s.owner, torch.full_like(active, k), board) for k in range(MAX_SEATS)], 1)
    income = torch.where(alive, income, 0).to(f32)
    per_seat = torch.stack([
        present.to(f32), alive.to(f32), territories / 42, seat_armies / total, s.hand_len.to(f32) / 5,
        income / 20, (seat_armies.clamp(max=300) / 100),
    ], 2)  # [B, 6, SLOT]
    per_slot = per_seat.gather(1, seat_of_slot.clamp(min=0)[:, :, None].expand(-1, -1, SLOT))
    per_slot = per_slot * (seat_of_slot >= 0).to(f32)[:, :, None]

    # globals
    kind = o.kind.to(torch.int64)
    symbol = board.card_symbol[hand.clamp(min=0)]
    counts = torch.stack([(held & (symbol == k)).sum(1) for k in range(3)] + [(held & (symbol < 0)).sum(1)], 1).to(f32)
    glob = torch.cat([
        torch.nn.functional.one_hot(kind, 4).to(f32),
        torch.stack([
            o.to_place.to(f32) / 20, o.may_place.to(f32), o.may_trade.to(f32), o.must_trade.to(f32),
            o.sets.any(-1).to(f32), s.deck_len.to(f32) / 44, s.turn.to(f32) / 300, s.round.to(f32) / 60,
            s.captured_this_turn.to(f32), attacks.to(f32) / 10, captured.to(f32) / 10,
            o.occ_min.to(f32) / 20, o.occ_max.to(f32) / 40, s.trades.to(f32) / 20,
            s.reinf_after_elim.to(f32), s.hand_len[rows, active].to(f32) / 5,
        ], 1),
        counts / 3,
        torch.nn.functional.one_hot((players - 3).clamp(0, 3), 4).to(f32),
    ], 1)
    assert glob.shape[1] == GLOBAL, glob.shape
    return node, per_slot, glob

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

**The clock** (`clock`, a network's opt-in input: the trainer's `--obs-turn`). The globals already
carry the turn so far; what a seat can't see is when its game will be cut. With `cap` given, the
globals gain `CLOCK` more: the player-turns left before the game's cap, `(cap − turn) / 100`. In
training the cap is drawn per game; at play it is the harness's fixed 600.

**The graph inputs** (`graph`, a network's opt-in input: the trainer's `--obs-graph`). What a
strong player reads off the map along its borders, given exactly, since a linear head can use only
what the trunk makes linear in a token. Each group gains its own, after its other inputs (and the
globals after the clock):
- per territory (`GRAPH_NODE`): the armies on its neighbours of other seats than its owner, summed
  and the largest stack (`log1p(x) / 4`), the share of its continent its owner lacks, and the best
  chance of an all-in blitz from it capturing a neighbour (0 with one army or no enemy neighbour);
- per slot (`GRAPH_SLOT`): the seat's share of each continent, then, on its territories that border
  the acting seat's, its armies (`log1p(x) / 4`) and their count over 42 (both 0 in slot 0);
- globals (`GRAPH_GLOBAL`): the acting seat's border exposure, the enemy armies next to each of its
  territories summed over them (`log1p(x) / 4`), and its territories with one army and an enemy
  neighbour, over 42.
A blitz's chance is the capture chance of the Balanced Blitz table (`blitz-<BLITZ_BOUND>`); a fight
past its bound reads the cell of the fight scaled into it, both sides by the same factor, as
training resolves an oversize blitz (`tables._resolve_scaled`).
"""

import os

import torch

from ..board import CARDS, DATA, MAX_SEATS, TERRITORIES, Board
from ..options import Options
from ..rules import reinforcements
from ..state import HAND_MAX, State
from ..tables import BlitzTables

NODE = 13
SLOT = 7
GLOBAL = 28
CLOCK = 1
GRAPH_NODE = 4
GRAPH_SLOT = 8
GRAPH_GLOBAL = 2
BLITZ_BOUND = 32

_capture_chances: dict[str, torch.Tensor] = {}


def clock(turn: torch.Tensor, cap: torch.Tensor) -> torch.Tensor:
    """`[B, CLOCK]`: the player-turns left before the cap, after this one (0 on the cap's own turn)."""
    return ((cap.to(torch.int64) - turn.to(torch.int64)).clamp(min=0).to(torch.float32) / 100)[:, None]


def capture_chances(device: torch.device | str) -> torch.Tensor:
    """`[BLITZ_BOUND + 1, BLITZ_BOUND + 1]` float32: the capture chance of a blitz of a armies
    against d, read once per device."""
    key = str(device)
    if key not in _capture_chances:
        tables = BlitzTables.load(os.path.join(DATA, f"blitz-{BLITZ_BOUND}"), "cpu")
        _capture_chances[key] = tables.capture.view(BLITZ_BOUND + 1, BLITZ_BOUND + 1).to(torch.float32).to(device)
    return _capture_chances[key]


def blitz_chance(a: torch.Tensor, d: torch.Tensor, chances: torch.Tensor) -> torch.Tensor:
    """The capture chance of a blitz of `a` armies (int64, at least 1) against `d`, a fight past the
    bound read scaled into it."""
    most = torch.maximum(a, d)
    inside = most <= BLITZ_BOUND
    sa = torch.where(inside, a, ((a * BLITZ_BOUND + most // 2) // most).clamp(1, BLITZ_BOUND))
    sd = torch.where(inside, d, ((d * BLITZ_BOUND + most // 2) // most).clamp(1, BLITZ_BOUND))
    return chances[sa, sd]


def graph_inputs(s: State, board: Board) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """`(per territory [B, 42, GRAPH_NODE], per seat [B, 6, GRAPH_SLOT], globals [B, GRAPH_GLOBAL])`,
    every seat's by seat id."""
    f32 = torch.float32
    owner = s.owner.to(torch.int64)
    count = s.armies.to(torch.int64)
    armies = count.to(f32)
    active = s.active.to(torch.int64)
    frm, to = board.edges[:, 0], board.edges[:, 1]
    along = frm.expand(s.batch, -1)
    enemy = owner[:, frm] != owner[:, to]  # [B, E]: the border's far side is another seat's
    zeros = torch.zeros_like(armies)
    stack = torch.where(enemy, armies[:, to], 0.0)
    enemy_sum = zeros.index_add(1, frm, stack)
    enemy_max = zeros.scatter_reduce(1, along, stack, "amax")
    has_enemy = zeros.index_add(1, frm, enemy.to(f32)) > 0
    can = enemy & (count[:, frm] > 1)
    chance = blitz_chance((count[:, frm] - 1).clamp(min=1), count[:, to], capture_chances(s.device))
    best = zeros.scatter_reduce(1, along, torch.where(can, chance, 0.0), "amax")

    seats = torch.arange(MAX_SEATS, device=s.device)
    mine = owner[:, None, :] == seats[None, :, None]  # [B, 6, 42]
    members = board.continent_members
    size = members.sum(1)  # [6]
    held = (mine[:, :, None, :] & members[None, None]).sum(-1)  # [B, seat, continent]
    continent = board.continent_of
    owner_held = held.gather(1, owner[:, :, None].expand(-1, -1, members.shape[0]))  # [B, 42, continent]
    owner_held = owner_held.gather(2, continent[None, :, None].expand(s.batch, -1, 1))[:, :, 0]
    lacks = (size[continent] - owner_held).to(f32) / size[continent].to(f32)
    node = torch.stack([torch.log1p(enemy_sum) / 4, torch.log1p(enemy_max) / 4, lacks, best], 2)

    own = owner == active[:, None]
    touches = zeros.index_add(1, to, own[:, frm].to(f32)) > 0  # [B, 42]: borders a territory of the acting seat
    near = mine & touches[:, None, :] & (seats[None, :] != active[:, None])[:, :, None]
    near_armies = torch.where(near, armies[:, None, :], 0.0).sum(-1)
    per_seat = torch.cat([held.to(f32) / size.to(f32), (torch.log1p(near_armies) / 4)[:, :, None],
                          (near.sum(-1).to(f32) / 42)[:, :, None]], 2)

    exposure = torch.where(own, enemy_sum, 0.0).sum(1)
    thin = (own & (count == 1) & has_enemy).sum(1).to(f32)
    glob = torch.stack([torch.log1p(exposure) / 4, thin / 42], 1)
    return node, per_seat, glob


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
            board: Board, cap: torch.Tensor | None = None,
            graph: bool = False) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """`(node, slot, glob)`; with `cap` (each game's turn cap), `glob` gains the clock, and with
    `graph` every group ends with the graph inputs."""
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
    if graph:
        graph_node, graph_seat, graph_glob = graph_inputs(s, board)
        node = torch.cat([node, graph_node], 2)
        per_seat = torch.cat([per_seat, graph_seat], 2)
    per_slot = per_seat.gather(1, seat_of_slot.clamp(min=0)[:, :, None].expand(-1, -1, per_seat.shape[2]))
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
    if cap is not None:
        glob = torch.cat([glob, clock(s.turn, cap)], 1)
    if graph:
        glob = torch.cat([glob, graph_glob], 1)
    return node, per_slot, glob

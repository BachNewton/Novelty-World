"""The batched game state (`ideas/gpu-engine.md`, "State: structure of arrays, batch first"), the
setup that deals it exactly as the reference engine's `newGame` does, and the bridge back to the
reference engine's `EngineState` JSON that every exactness test compares through.

Setup draws from each game's own stream in `newGame`'s order: the seat order (Fisher–Yates over
the seats), the 42 territory cards' shuffle, each starting army's pick in turn order, the 44-card
deck's shuffle. Loops whose length differs per game (the seat shuffle, the starting picks) run to
the batch's longest and mask the games already done, which draw nothing.
"""

from dataclasses import dataclass, fields

import torch

from .board import CARDS, MAX_SEATS, TERRITORIES, Board
from .rng import floor_draw, next_draws, xmur3
from .rules import reinforcements

HAND_MAX = 12
PHASES = ("reinforce", "attack", "fortify", "game-over")

# name: (shape after the batch dimension, dtype)
LAYOUT: dict[str, tuple[tuple[int, ...], torch.dtype]] = {
    "players": ((), torch.int32),
    "rng": ((), torch.int64),
    "turn_order": ((MAX_SEATS,), torch.int8),
    "owner": ((TERRITORIES,), torch.int8),
    "armies": ((TERRITORIES,), torch.int32),
    "hand": ((MAX_SEATS, HAND_MAX), torch.int8),
    "hand_len": ((MAX_SEATS,), torch.int32),
    "deck": ((CARDS,), torch.int8),
    "deck_len": ((), torch.int32),
    "trades": ((), torch.int32),
    "eliminated": ((MAX_SEATS,), torch.bool),
    "turn": ((), torch.int32),
    "round": ((), torch.int32),
    "active": ((), torch.int32),
    "phase": ((), torch.int8),
    "reinf_present": ((), torch.bool),
    "reinf_to_place": ((), torch.int32),
    "reinf_placed_any": ((), torch.bool),
    "reinf_after_elim": ((), torch.bool),
    "occ_present": ((), torch.bool),
    "occ_from": ((), torch.int8),
    "occ_to": ((), torch.int8),
    "occ_min": ((), torch.int32),
    "occ_max": ((), torch.int32),
    "occ_elim": ((), torch.int8),
    "captured_this_turn": ((), torch.bool),
    "winner": ((), torch.int8),
}

# Fields whose "absent" value is −1 rather than 0.
_MINUS_ONE = ("turn_order", "hand", "deck", "occ_from", "occ_to", "occ_elim", "winner")


@dataclass
class State:
    players: torch.Tensor
    rng: torch.Tensor
    turn_order: torch.Tensor
    owner: torch.Tensor
    armies: torch.Tensor
    hand: torch.Tensor
    hand_len: torch.Tensor
    deck: torch.Tensor
    deck_len: torch.Tensor
    trades: torch.Tensor
    eliminated: torch.Tensor
    turn: torch.Tensor
    round: torch.Tensor
    active: torch.Tensor
    phase: torch.Tensor
    reinf_present: torch.Tensor
    reinf_to_place: torch.Tensor
    reinf_placed_any: torch.Tensor
    reinf_after_elim: torch.Tensor
    occ_present: torch.Tensor
    occ_from: torch.Tensor
    occ_to: torch.Tensor
    occ_min: torch.Tensor
    occ_max: torch.Tensor
    occ_elim: torch.Tensor
    captured_this_turn: torch.Tensor
    winner: torch.Tensor

    def __post_init__(self) -> None:
        assert [f.name for f in fields(self)] == list(LAYOUT), "State and LAYOUT disagree"
        batch = self.players.shape[0]
        device = self.players.device
        for name, (shape, dtype) in LAYOUT.items():
            value = getattr(self, name)
            assert value.dtype == dtype, f"{name}: {value.dtype}, expected {dtype}"
            assert tuple(value.shape) == (batch, *shape), f"{name}: {tuple(value.shape)}, expected {(batch, *shape)}"
            assert value.device == device, f"{name} is on {value.device}, not {device}"

    @property
    def batch(self) -> int:
        return self.players.shape[0]

    @property
    def device(self) -> torch.device:
        return self.players.device

    @staticmethod
    def empty(batch: int, device: torch.device | str) -> "State":
        """B games of nothing: every field at its absent value (−1 or 0)."""
        return State(**{
            name: torch.full((batch, *shape), -1 if name in _MINUS_ONE else 0, dtype=dtype, device=device)
            for name, (shape, dtype) in LAYOUT.items()
        })

    def clone(self) -> "State":
        return State(**{name: getattr(self, name).clone() for name in LAYOUT})

    def select(self, index: torch.Tensor | slice | list[int]) -> "State":
        """The games picked by a boolean mask, indices or a slice, as a new State."""
        return State(**{name: getattr(self, name)[index] for name in LAYOUT})

    def assign(self, mask: torch.Tensor, other: "State") -> None:
        """Overwrites the games where `mask [B]` holds with the same games of `other`."""
        assert mask.dtype == torch.bool and mask.shape == (self.batch,), (mask.dtype, mask.shape)
        assert other.batch == self.batch
        for name in LAYOUT:
            mine = getattr(self, name)
            keep = mask.view(-1, *([1] * (mine.dim() - 1)))
            setattr(self, name, torch.where(keep, getattr(other, name), mine))


def _shuffle(items: torch.Tensor, rng: torch.Tensor, length: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
    """`shuffleArray` over the first `length[b]` columns of each row of `items [B, N]`, drawing
    from `rng`; columns at or past a row's length are left alone and a row draws only while
    `i < length`. Returns the shuffled items and the streams after."""
    items = items.clone()
    for i in range(items.shape[1] - 1, 0, -1):
        live = i < length
        draw, after = next_draws(rng)
        rng = torch.where(live, after, rng)
        j = floor_draw(draw, i + 1)[:, None]
        at_i = items[:, i].clone()
        at_j = items.gather(1, j)[:, 0]
        items[:, i] = torch.where(live, at_j, at_i)
        items.scatter_(1, j, torch.where(live, at_i, at_j)[:, None])
    return items, rng


def new_games(seeds: list[str], players: list[int], board: Board, device: torch.device | str) -> State:
    """`newGame({ players }, seed)` for every game of the batch, through `startTurn`."""
    assert len(seeds) == len(players) and seeds, (len(seeds), len(players))
    assert all(3 <= p <= MAX_SEATS for p in players), players
    batch = len(seeds)
    s = State.empty(batch, device)
    count = torch.tensor(players, dtype=torch.int64, device=device)
    rng = torch.tensor([xmur3(seed) for seed in seeds], dtype=torch.int64, device=device)
    rows = torch.arange(batch, device=device)

    # SETUP-3: the seat order.
    seats = torch.arange(MAX_SEATS, dtype=torch.int64, device=device).expand(batch, -1)
    turn_order, rng = _shuffle(seats, rng, count)
    turn_order = torch.where(seats < count[:, None], turn_order, -1)

    # SETUP-4: the territory cards dealt round the seat order, 1 army each.
    cards = torch.arange(TERRITORIES, dtype=torch.int64, device=device).expand(batch, -1)
    dealt, rng = _shuffle(cards, rng, torch.full_like(count, TERRITORIES))
    position = torch.arange(TERRITORIES, device=device)[None, :] % count[:, None]
    dealt_owner = turn_order.gather(1, position)  # owner of dealt[b, i]
    owner = torch.empty(batch, TERRITORIES, dtype=torch.int64, device=device)
    owner.scatter_(1, dealt, dealt_owner)
    armies = torch.ones(batch, TERRITORIES, dtype=torch.int64, device=device)

    # SETUP-5: each seat's remaining armies, in turn order, each on a random territory of its own
    # picked from its territories in dealt order.
    starting = board.starting_armies.to(torch.int64)[count]
    for k in range(MAX_SEATS):
        seat_live = k < count
        seat = turn_order[:, k]
        mine = dealt_owner == seat[:, None]
        own_len = mine.sum(1)
        # Compact each row's own territories, in dealt order, into the front of `own`.
        slot = torch.where(mine, mine.cumsum(1) - 1, TERRITORIES)
        own = torch.full((batch, TERRITORIES + 1), -1, dtype=torch.int64, device=device)
        own.scatter_(1, slot, dealt)
        left = torch.where(seat_live, starting - own_len, 0)
        for step in range(int(left.max())):
            live = step < left
            draw, after = next_draws(rng)
            rng = torch.where(live, after, rng)
            j = floor_draw(draw, own_len.clamp(min=1))
            territory = own[rows, j]
            assert bool((territory[live] >= 0).all()), "a starting army picked past a seat's territories"
            armies[rows[live], territory[live]] += 1

    # SETUP-6: all 44 cards shuffled as the deck.
    deck_cards = torch.arange(CARDS, dtype=torch.int64, device=device).expand(batch, -1)
    deck, rng = _shuffle(deck_cards, rng, torch.full_like(count, CARDS))

    s.players = count.to(torch.int32)
    s.turn_order = turn_order.to(torch.int8)
    s.owner = owner.to(torch.int8)
    s.armies = armies.to(torch.int32)
    s.hand_len = torch.zeros(batch, MAX_SEATS, dtype=torch.int32, device=device)
    s.deck = deck.to(torch.int8)
    s.deck_len = torch.full((batch,), CARDS, dtype=torch.int32, device=device)

    # SETUP-7: the first player's first turn (`startTurn`, `beginReinforce`).
    active = turn_order[:, 0]
    s.turn = torch.ones(batch, dtype=torch.int32, device=device)
    s.round = torch.zeros(batch, dtype=torch.int32, device=device)
    s.active = active.to(torch.int32)
    s.captured_this_turn = torch.zeros(batch, dtype=torch.bool, device=device)
    position_of_active = (turn_order == active[:, None]).to(torch.int64).argmax(1)
    first_turn = board.first_turn_bonus[count, position_of_active]
    first_turn = torch.where(s.round == 0, first_turn, 0)
    s.phase = torch.zeros(batch, dtype=torch.int8, device=device)
    s.reinf_present = torch.ones(batch, dtype=torch.bool, device=device)
    s.reinf_to_place = reinforcements(s.owner, active, board) + first_turn.to(torch.int32)
    s.reinf_placed_any = torch.zeros(batch, dtype=torch.bool, device=device)
    s.reinf_after_elim = torch.zeros(batch, dtype=torch.bool, device=device)
    s.rng = rng
    s.__post_init__()
    return s


def to_engine_dict(state: State, i: int, board: Board) -> dict:
    """Game i as the reference engine's `EngineState` JSON. The GPU state keeps only the number of
    trades, not the public list, so a game with trades can't be shown as one and raises."""
    g = {name: getattr(state, name)[i].cpu().tolist() for name in LAYOUT}
    players = g["players"]
    if g["trades"] != 0:
        raise ValueError(f"game {i} has {g['trades']} trades; the GPU state keeps only their count")
    territory = board.territory_ids
    card = board.card_ids
    return {
        "players": players,
        "rng": g["rng"],
        "turnOrder": g["turn_order"][:players],
        "board": {territory[t]: {"owner": g["owner"][t], "armies": g["armies"][t]} for t in range(TERRITORIES)},
        "hands": [[card[c] for c in g["hand"][seat][: g["hand_len"][seat]]] for seat in range(players)],
        "deck": [card[c] for c in g["deck"][: g["deck_len"]]],
        "trades": [],
        "eliminated": [bool(e) for e in g["eliminated"][:players]],
        "turn": g["turn"],
        "round": g["round"],
        "active": g["active"],
        "phase": PHASES[g["phase"]],
        "reinforce": {
            "armiesToPlace": g["reinf_to_place"],
            "placedAny": bool(g["reinf_placed_any"]),
            "afterElimination": bool(g["reinf_after_elim"]),
        } if g["reinf_present"] else None,
        "occupying": {
            "from": territory[g["occ_from"]],
            "to": territory[g["occ_to"]],
            "min": g["occ_min"],
            "max": g["occ_max"],
            "eliminating": None if g["occ_elim"] < 0 else g["occ_elim"],
        } if g["occ_present"] else None,
        "capturedThisTurn": bool(g["captured_this_turn"]),
        "winner": None if g["winner"] < 0 else g["winner"],
    }

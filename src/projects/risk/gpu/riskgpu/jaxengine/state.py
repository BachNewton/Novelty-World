"""The batched state in JAX, field for field the PyTorch engine's (`state.py`), in 32-bit integers
and booleans, and the setup that deals it as `newGame` does.

The stream (`rng`) is the reference's own mulberry32 state, `uint32`; every other integer is
`int32`. `to_torch` and `from_torch` move a batch between the two engines, so a JAX state has the
PyTorch state's canonical hash (`canonical.py`).

The setup draws in `newGame`'s order (`state.new_games`): the seat order, the territory cards'
shuffle, each starting army's pick in turn order, the deck's shuffle. Its loops run to their bound
for every game and are masked, so a game draws only while its own loop would.
"""

from typing import NamedTuple

import jax
import jax.numpy as jnp
import numpy as np
import torch

from ..board import CARDS, MAX_SEATS, TERRITORIES, Board
from ..rng import xmur3
from ..state import HAND_MAX, LAYOUT
from ..state import State as TorchState
from .rng import below, next_bits

I32 = jnp.int32


class State(NamedTuple):
    players: jnp.ndarray  # [B] int32
    rng: jnp.ndarray  # [B] uint32
    turn_order: jnp.ndarray  # [B, 6], −1 padded
    owner: jnp.ndarray  # [B, 42]
    armies: jnp.ndarray  # [B, 42]
    hand: jnp.ndarray  # [B, 6, HAND_MAX], −1 padded
    hand_len: jnp.ndarray  # [B, 6]
    deck: jnp.ndarray  # [B, 44], −1 padded
    deck_len: jnp.ndarray  # [B]
    trades: jnp.ndarray
    eliminated: jnp.ndarray  # [B, 6] bool
    turn: jnp.ndarray
    round: jnp.ndarray
    active: jnp.ndarray
    phase: jnp.ndarray  # 0 reinforce, 1 attack, 2 fortify, 3 game over
    reinf_present: jnp.ndarray  # bool
    reinf_to_place: jnp.ndarray
    reinf_placed_any: jnp.ndarray  # bool
    reinf_after_elim: jnp.ndarray  # bool
    occ_present: jnp.ndarray  # bool
    occ_from: jnp.ndarray
    occ_to: jnp.ndarray
    occ_min: jnp.ndarray
    occ_max: jnp.ndarray
    occ_elim: jnp.ndarray
    captured_this_turn: jnp.ndarray  # bool
    winner: jnp.ndarray

    def where(self, mask: jnp.ndarray, other: "State") -> "State":
        """`other`'s games where `mask [B]` holds, this state's elsewhere."""
        return State(*(jnp.where(mask.reshape(-1, *([1] * (a.ndim - 1))), b, a) for a, b in zip(self, other)))


assert list(State._fields) == list(LAYOUT), "the JAX State and the PyTorch LAYOUT disagree"


def _jax_dtype(name: str, torch_dtype: torch.dtype):
    if name == "rng":
        return jnp.uint32
    return jnp.bool_ if torch_dtype == torch.bool else I32


def from_torch(s: TorchState) -> State:
    return State(**{name: jnp.asarray(getattr(s, name).cpu().numpy().astype(
        np.uint32 if name == "rng" else (bool if dtype == torch.bool else np.int32)))
        for name, (_, dtype) in LAYOUT.items()})


def to_torch(s: State) -> TorchState:
    return TorchState(**{name: torch.from_numpy(np.asarray(getattr(s, name)).astype(
        np.int64 if name == "rng" else (bool if dtype == torch.bool else np.int32))).to(dtype)
        for name, (_, dtype) in LAYOUT.items()})


class Setup(NamedTuple):
    """What the setup reads of the board, as arrays."""
    continent_members: jnp.ndarray  # [6, 42] bool
    continent_bonus: jnp.ndarray  # [6] int32
    starting_armies: jnp.ndarray  # [7] int32
    first_turn_bonus: jnp.ndarray  # [7, 6] int32
    most_left: int  # the most starting armies any seat has left to place after its dealt territories


def setup_of(board: Board) -> Setup:
    starting = board.starting_armies.cpu().numpy()
    most_left = max(int(starting[p]) - TERRITORIES // p for p in range(3, MAX_SEATS + 1))
    return Setup(jnp.asarray(board.continent_members.cpu().numpy()),
                 jnp.asarray(board.continent_bonus.cpu().numpy().astype(np.int32)),
                 jnp.asarray(starting.astype(np.int32)),
                 jnp.asarray(board.first_turn_bonus.cpu().numpy().astype(np.int32)), most_left)


def reinforcements(owner: jnp.ndarray, seat: jnp.ndarray, members: jnp.ndarray, bonus: jnp.ndarray) -> jnp.ndarray:
    """`REINF-2`, `REINF-3`: max(3, ⌊owned / 3⌋) plus every whole continent's bonus, int32 [B]."""
    owned = owner == seat[:, None]
    territories = jnp.maximum(owned.sum(1) // 3, 3)
    held = (owned[:, None, :] | ~members[None]).all(-1)
    return (territories + (held * bonus[None]).sum(1)).astype(I32)


def take(x: jnp.ndarray, index: jnp.ndarray) -> jnp.ndarray:
    """`x[b, index[b]]`."""
    return jnp.take_along_axis(x, index[:, None], axis=1)[:, 0]


def _shuffle(items: jnp.ndarray, rng: jnp.ndarray, length: jnp.ndarray):
    """`shuffleArray` over each row's first `length[b]` columns (`state._shuffle`)."""
    n = items.shape[1]
    rows = jnp.arange(items.shape[0])

    def body(k, carry):
        items, rng = carry
        i = n - 1 - k
        live = i < length
        t, after = next_bits(rng)
        rng = jnp.where(live, after, rng)
        j = below(t, i + 1)
        at_i = items[:, i]
        at_j = take(items, j)
        items = items.at[:, i].set(jnp.where(live, at_j, at_i))
        items = items.at[rows, j].set(jnp.where(live, at_i, at_j))
        return items, rng

    return jax.lax.fori_loop(0, n - 1, body, (items, rng))


def new_games(setup: Setup, seeds: jnp.ndarray, players: jnp.ndarray) -> State:
    """`newGame({ players }, seed)` for every game, from each seed's initial stream state (`uint32`,
    `xmur3` of a seed string or any 32 bits), through `startTurn`."""
    batch = seeds.shape[0]
    rows = jnp.arange(batch)
    count = players.astype(I32)
    rng = seeds.astype(jnp.uint32)

    seats = jnp.broadcast_to(jnp.arange(MAX_SEATS, dtype=I32), (batch, MAX_SEATS))
    turn_order, rng = _shuffle(seats, rng, count)
    turn_order = jnp.where(seats < count[:, None], turn_order, -1)

    cards = jnp.broadcast_to(jnp.arange(TERRITORIES, dtype=I32), (batch, TERRITORIES))
    dealt, rng = _shuffle(cards, rng, jnp.full_like(count, TERRITORIES))
    position = jnp.arange(TERRITORIES, dtype=I32)[None, :] % count[:, None]
    dealt_owner = jnp.take_along_axis(turn_order, position, axis=1)
    owner = jnp.zeros((batch, TERRITORIES), I32).at[rows[:, None], dealt].set(dealt_owner)
    armies = jnp.ones((batch, TERRITORIES), I32)

    starting = setup.starting_armies[count]
    for k in range(MAX_SEATS):
        seat = turn_order[:, k]
        mine = dealt_owner == seat[:, None]
        own_len = mine.sum(1).astype(I32)
        slot = jnp.where(mine, jnp.cumsum(mine, 1) - 1, TERRITORIES)
        own = jnp.full((batch, TERRITORIES + 1), -1, I32).at[rows[:, None], slot].set(dealt)
        left = jnp.where(k < count, starting - own_len, 0)

        def place(step, carry, own=own, own_len=own_len, left=left):
            rng, armies = carry
            live = step < left
            t, after = next_bits(rng)
            rng = jnp.where(live, after, rng)
            territory = take(own, below(t, jnp.maximum(own_len, 1)))
            armies = armies.at[rows, jnp.maximum(territory, 0)].add(live.astype(I32))
            return rng, armies

        rng, armies = jax.lax.fori_loop(0, setup.most_left, place, (rng, armies))

    deck_cards = jnp.broadcast_to(jnp.arange(CARDS, dtype=I32), (batch, CARDS))
    deck, rng = _shuffle(deck_cards, rng, jnp.full_like(count, CARDS))

    active = turn_order[:, 0]
    zeros = jnp.zeros(batch, I32)
    false = jnp.zeros(batch, bool)
    first_turn = setup.first_turn_bonus[count, 0]
    return State(
        players=count, rng=rng, turn_order=turn_order, owner=owner, armies=armies,
        hand=jnp.full((batch, MAX_SEATS, HAND_MAX), -1, I32), hand_len=jnp.zeros((batch, MAX_SEATS), I32),
        deck=deck, deck_len=jnp.full(batch, CARDS, I32), trades=zeros,
        eliminated=jnp.zeros((batch, MAX_SEATS), bool), turn=jnp.ones(batch, I32), round=zeros, active=active,
        phase=zeros, reinf_present=jnp.ones(batch, bool),
        reinf_to_place=reinforcements(owner, active, setup.continent_members, setup.continent_bonus) + first_turn,
        reinf_placed_any=false, reinf_after_elim=false, occ_present=false, occ_from=jnp.full(batch, -1, I32),
        occ_to=jnp.full(batch, -1, I32), occ_min=zeros, occ_max=zeros, occ_elim=jnp.full(batch, -1, I32),
        captured_this_turn=false, winner=jnp.full(batch, -1, I32),
    )


def seed_states(seeds: list[str]) -> jnp.ndarray:
    """The initial stream states of seed strings, as `createRng` makes them."""
    return jnp.asarray(np.array([xmur3(s) for s in seeds], dtype=np.uint32))

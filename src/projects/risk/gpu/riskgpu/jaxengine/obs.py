"""What the network sees (`selfplay/obs.py`) in JAX, input for input, and the turn so far it reads
(`runner.TurnLog`'s attacks, captures and placements; GD's bookkeeping is not here)."""

from typing import NamedTuple

import jax
import jax.numpy as jnp

from ..board import CARDS, MAX_SEATS, TERRITORIES
from ..engine import ATTACK, BLITZ, PLACE
from ..selfplay.obs import GLOBAL, NODE, SLOT
from ..state import HAND_MAX
from .engine import Options, Rules
from .state import I32, State, take

F32 = jnp.float32


class TurnLog(NamedTuple):
    attacks: jnp.ndarray  # [B] battles and blitzes this turn
    captured: jnp.ndarray  # [B] territories captured this turn
    placed_on: jnp.ndarray  # [B, 42] bool

    @staticmethod
    def empty(batch: int) -> "TurnLog":
        return TurnLog(jnp.zeros(batch, I32), jnp.zeros(batch, I32), jnp.zeros((batch, TERRITORIES), bool))

    def update(self, before: State, after: State, moves, moved) -> "TurnLog":
        """`TurnLog.update`: the step from `before` to `after`, then a new turn wherever one ended."""
        kind = moves[:, 0]
        fought = moved & ((kind == ATTACK) | (kind == BLITZ))
        took = fought & (take(after.owner, jnp.where(fought, moves[:, 2], 0)) == before.active)
        placing = moved & (kind == PLACE)
        rows = jnp.arange(kind.shape[0])
        at = jnp.where(placing, moves[:, 1], 0)
        placed_on = self.placed_on.at[rows, at].set(self.placed_on[rows, at] | placing)
        ended = moved & (after.turn != before.turn)
        return TurnLog(jnp.where(ended, 0, self.attacks + fought), jnp.where(ended, 0, self.captured + took),
                       placed_on & ~ended[:, None])


def slots(s: State):
    """`(seat_of_slot [B, 6], slot_of_seat [B, 7])` (`obs.slots`)."""
    players = s.players[:, None]
    order = s.turn_order
    k = jnp.arange(MAX_SEATS)[None, :]
    at = jnp.argmax(order == s.active[:, None], 1)[:, None]
    seat_of_slot = jnp.where(k < players, jnp.take_along_axis(order, (at + k) % players, axis=1), -1)
    position = jnp.where(k < players, jnp.argmax(order[:, :, None] == k[:, None, :], 1), 0)
    slot_of_seat = jnp.where(k < players, (position - at) % players, MAX_SEATS)
    return seat_of_slot, jnp.concatenate([slot_of_seat, jnp.full_like(slot_of_seat[:, :1], MAX_SEATS)], 1)


def observe(rules: Rules, s: State, o: Options, log: TurnLog):
    """`(node, slot, glob)` without the clock (`clock` adds it for a net that reads it)."""
    batch = s.players.shape[0]
    rows = jnp.arange(batch)
    seat_of_slot, slot_of_seat = slots(s)
    armies = s.armies.astype(F32)

    owner_slot = jnp.take_along_axis(slot_of_seat, s.owner, axis=1)
    owner_onehot = jax.nn.one_hot(owner_slot, MAX_SEATS + 1, dtype=F32)[:, :, :MAX_SEATS]
    hand = s.hand[rows, s.active]
    held = jnp.arange(HAND_MAX)[None, :] < take(s.hand_len, s.active)[:, None]
    pictured = jnp.zeros((batch, CARDS + 1), F32).at[rows[:, None], jnp.where(held & (hand >= 0), hand, CARDS)].set(1.0)
    occ_from = jax.nn.one_hot(jnp.where(s.occ_present, s.occ_from, TERRITORIES), TERRITORIES + 1, dtype=F32)
    occ_to = jax.nn.one_hot(jnp.where(s.occ_present, s.occ_to, TERRITORIES), TERRITORIES + 1, dtype=F32)
    total = jnp.maximum(armies.sum(1, keepdims=True), 1)
    node = jnp.concatenate([
        owner_onehot,
        (jnp.log1p(armies) / 4)[:, :, None],
        (jnp.minimum(armies, 60) / 20)[:, :, None],
        (armies / total * 10)[:, :, None],
        log.placed_on.astype(F32)[:, :, None],
        occ_from[:, :TERRITORIES, None],
        occ_to[:, :TERRITORIES, None],
        pictured[:, :TERRITORIES, None],
    ], 2)
    assert node.shape[2] == NODE, node.shape

    seats = jnp.arange(MAX_SEATS)[None, :]
    present = seats < s.players[:, None]
    alive = present & ~s.eliminated
    mine = s.owner[:, None, :] == seats[:, :, None]
    territories = mine.sum(-1).astype(F32)
    seat_armies = (mine.astype(F32) * armies[:, None, :]).sum(-1)
    income = jnp.stack([rules.reinforcements(s.owner, jnp.full_like(s.active, k)) for k in range(MAX_SEATS)], 1)
    income = jnp.where(alive, income, 0).astype(F32)
    per_seat = jnp.stack([
        present.astype(F32), alive.astype(F32), territories / 42, seat_armies / total, s.hand_len.astype(F32) / 5,
        income / 20, jnp.minimum(seat_armies, 300) / 100,
    ], 2)
    per_slot = jnp.take_along_axis(per_seat, jnp.maximum(seat_of_slot, 0)[:, :, None], axis=1)
    per_slot = per_slot * (seat_of_slot >= 0).astype(F32)[:, :, None]

    symbol = rules.card_symbol[jnp.maximum(hand, 0)]
    counts = jnp.stack([(held & (symbol == k)).sum(1) for k in range(3)] + [(held & (symbol < 0)).sum(1)], 1).astype(F32)
    f = lambda v: v.astype(F32)  # noqa: E731
    glob = jnp.concatenate([
        jax.nn.one_hot(o.kind, 4, dtype=F32),
        jnp.stack([
            f(o.to_place) / 20, f(o.may_place), f(o.may_trade), f(o.must_trade), f(o.sets.any(-1)),
            f(s.deck_len) / 44, f(s.turn) / 300, f(s.round) / 60, f(s.captured_this_turn), f(log.attacks) / 10,
            f(log.captured) / 10, f(o.occ_min) / 20, f(o.occ_max) / 40, f(s.trades) / 20, f(s.reinf_after_elim),
            f(take(s.hand_len, s.active)) / 5,
        ], 1),
        counts / 3,
        jax.nn.one_hot(jnp.clip(s.players - 3, 0, 3), 4, dtype=F32),
    ], 1)
    assert glob.shape[1] == GLOBAL, glob.shape
    return node, per_slot, glob


def clock(turn, cap) -> jnp.ndarray:
    """`[B, 1]`: the player-turns left before the cap (`obs.clock`)."""
    return (jnp.maximum(cap - turn, 0).astype(F32) / 100)[:, None]

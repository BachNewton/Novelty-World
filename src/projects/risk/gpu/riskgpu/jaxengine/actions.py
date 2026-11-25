"""The network's bucket action space (`selfplay/actions.py`) in JAX: which main choices the options
allow, the amount buckets each has, and the engine move a choice plays. The layout of the main
choices and the buckets is `actions.py`'s own; only the bucket space is here, the space every net so
far plays (the exact space's candidates are a later step, `ideas/tpu.md`)."""

import jax.numpy as jnp

from ..board import TERRITORIES
from ..engine import ATTACK as K_ATTACK
from ..engine import BLITZ as K_BLITZ
from ..engine import END_ATTACK as K_END_ATTACK
from ..engine import END_TURN as K_END_TURN
from ..engine import FORTIFY as K_FORTIFY
from ..engine import OCCUPY as K_OCCUPY
from ..engine import PLACE as K_PLACE
from ..engine import TRADE as K_TRADE
from ..options import KIND_ATTACK, KIND_FORTIFY, KIND_OCCUPY
from ..selfplay.actions import (AMOUNTS, ATTACK, EDGES, END_ATTACK, END_TURN, FORTIFY, FORTIFY_AMOUNT, NO_AMOUNT,
                                OCCUPY, PAIRS, PLACE_AMOUNT, ATTACK_AMOUNT, TRADE)
from .engine import Options, Rules
from .state import I32, State, take


def legal_main(o: Options) -> jnp.ndarray:
    """`[B, MAIN]` bool: the main choices the options allow."""
    batch = o.kind.shape[0]
    place = o.may_place[:, None] & o.own & (o.to_place > 0)[:, None]
    trade = (o.may_trade & o.sets.any(-1))[:, None]
    attack = o.attack_dice > 0
    end_attack = (o.kind == KIND_ATTACK)[:, None]
    occupy = jnp.broadcast_to((o.kind == KIND_OCCUPY)[:, None], (batch, 3))
    fortify = (o.fortify_max > 0).reshape(batch, PAIRS)
    end_turn = (o.kind == KIND_FORTIFY)[:, None]
    return jnp.concatenate([place, trade, attack, end_attack, occupy, fortify, end_turn], 1)


def amount_group(main: jnp.ndarray) -> jnp.ndarray:
    group = jnp.full_like(main, NO_AMOUNT)
    group = jnp.where(main < TRADE, PLACE_AMOUNT, group)
    group = jnp.where((main >= ATTACK) & (main < END_ATTACK), ATTACK_AMOUNT, group)
    return jnp.where((main >= FORTIFY) & (main < END_TURN), FORTIFY_AMOUNT, group)


def legal_amount(group: jnp.ndarray) -> jnp.ndarray:
    count = jnp.where(group == NO_AMOUNT, 1, jnp.where(group == FORTIFY_AMOUNT, 2, 3))
    return jnp.arange(AMOUNTS)[None, :] < count[:, None]


def trade_rule(rules: Rules, s: State, o: Options) -> jnp.ndarray:
    """The trade the `TRADE` choice plays (`actions.trade_rule`): the most valuable set, then the
    one spending fewest wilds, then the first; its bonus territory the first qualifying card's,
    named only when more than one qualifies."""
    cards = jnp.maximum(o.set_cards, 0)
    wilds = (rules.card_symbol[cards] < 0).sum(-1)
    score = (rules.set_value(cards) * 8 - wilds).astype(jnp.float32)
    pick = jnp.argmax(jnp.where(o.sets, score, -jnp.inf), 1)
    chosen = jnp.take_along_axis(o.set_cards, pick[:, None, None], axis=1)[:, 0]
    owned = jnp.take_along_axis(s.owner, jnp.clip(chosen, 0, TERRITORIES - 1), axis=1) == s.active[:, None]
    choices = (chosen >= 0) & (chosen < TERRITORIES) & owned
    first_choice = take(chosen, jnp.argmax(choices, 1))
    bonus = jnp.where(choices.sum(-1) > 1, first_choice, -1)
    return jnp.stack([jnp.full_like(bonus, K_TRADE), chosen[:, 0], chosen[:, 1], chosen[:, 2], bonus], 1)


def decode(rules: Rules, main, amount, s: State, o: Options) -> jnp.ndarray:
    """The engine move `[B, 5]` int32 for each row's main choice and amount bucket (`actions.decode`)."""
    a, k = main.astype(I32), amount.astype(I32)
    zero = jnp.zeros_like(a)

    def move(kind, x=zero, y=zero, z=zero, w=zero):
        return jnp.stack([jnp.full_like(a, kind), x, y, z, w], 1)

    to_place = o.to_place
    place_n = jnp.maximum(jnp.where(k == 0, to_place, jnp.where(k == 1, (to_place + 1) // 2, 1)), 1)
    place = move(K_PLACE, jnp.clip(a, 0, TERRITORIES - 1), place_n)
    trade = trade_rule(rules, s, o)
    edge = jnp.clip(a - ATTACK, 0, EDGES - 1)
    frm, to = rules.edges[edge, 0], rules.edges[edge, 1]
    source = take(s.armies, frm)
    keep = jnp.where(k == 0, 1, jnp.maximum(source // 2, 1))
    dice = take(o.attack_dice, edge)
    attack = jnp.where((k == 2)[:, None], move(K_ATTACK, frm, to, dice), move(K_BLITZ, frm, to, keep))
    lo, hi = o.occ_min, o.occ_max
    m = jnp.clip(a - OCCUPY, 0, 2)
    occupy = move(K_OCCUPY, jnp.where(m == 0, lo, jnp.where(m == 1, jnp.maximum(lo, (lo + hi + 1) // 2), hi)))
    pair = jnp.clip(a - FORTIFY, 0, PAIRS - 1)
    most = take(o.fortify_max.reshape(-1, PAIRS), pair)
    fortify = move(K_FORTIFY, pair // TERRITORIES, pair % TERRITORIES,
                   jnp.maximum(jnp.where(k == 1, (most + 1) // 2, most), 1))

    out = move(K_END_TURN)
    out = jnp.where((a < END_TURN)[:, None], fortify, out)
    out = jnp.where((a < FORTIFY)[:, None], occupy, out)
    out = jnp.where((a < OCCUPY)[:, None], move(K_END_ATTACK), out)
    out = jnp.where((a < END_ATTACK)[:, None], attack, out)
    out = jnp.where((a < ATTACK)[:, None], trade, out)
    return jnp.where((a < TRADE)[:, None], place, out)

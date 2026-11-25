"""The rules in JAX: the active seat's options, the legality of a move, and the step that applies
one move per game and then the forced steps, as the PyTorch engine (`engine.py`, `options.py`) does,
function for function.

Every phase's rule runs under a mask of the games it applies to, so the step has no
data-dependent control flow and compiles once for a fixed batch. A game draws from its stream
exactly when the reference engine does: each draw advances every lane's stream and keeps it only
where the mask holds. Nothing raises: legality is a mask (`legal_move`), which the tests and a
caller's own checks read, and a move the caller vouches for is applied as given.
"""

from typing import NamedTuple

import jax.numpy as jnp
import numpy as np

from ..board import CARDS, MAX_SEATS, TERRITORIES, Board
from ..engine import ATTACK, BLITZ, END_ATTACK, END_TURN, FORTIFY, KIND_PHASE, OCCUPY, PLACE, TRADE
from ..options import KIND_ATTACK, KIND_FORTIFY, KIND_OCCUPY, KIND_REINFORCE, ONE_OF_EACH, THREE_OF, TRIPLES
from ..state import HAND_MAX
from . import blitz
from .rng import below, next_bits
from .state import I32, State, reinforcements, setup_of, take

F32 = jnp.float32


class Options(NamedTuple):
    """`options.Options`, field for field."""
    kind: jnp.ndarray  # [B]
    to_place: jnp.ndarray
    may_place: jnp.ndarray
    must_trade: jnp.ndarray
    may_trade: jnp.ndarray
    own: jnp.ndarray  # [B, 42] bool
    sets: jnp.ndarray  # [B, 220] bool
    set_cards: jnp.ndarray  # [B, 220, 3], −1 past the hand
    bonus: jnp.ndarray  # [B, 42] bool
    attack_dice: jnp.ndarray  # [B, 166]
    occ_from: jnp.ndarray
    occ_to: jnp.ndarray
    occ_min: jnp.ndarray
    occ_max: jnp.ndarray
    fortify_max: jnp.ndarray  # [B, 42, 42]


class Rules:
    """The board's constants and the rules over them. Its functions are pure, for `jax.jit`."""

    def __init__(self, board: Board):
        def arr(t, dtype=np.int32):
            return jnp.asarray(t.cpu().numpy().astype(dtype))

        self.setup = setup_of(board)
        self.adjacency = arr(board.adjacency, bool)
        self.edges = arr(board.edges)
        self.edge_id = arr(board.edge_id)
        self.card_symbol = arr(board.card_symbol)
        self.triples = jnp.asarray(TRIPLES.numpy().astype(np.int32))
        self.three_of = jnp.asarray(np.array(THREE_OF + (0,), np.int32))
        self.kind_phase = jnp.asarray(np.array(KIND_PHASE, np.int32))

    # --- reading the state ---------------------------------------------------------------------

    def reinforcements(self, owner, seat):
        return reinforcements(owner, seat, self.setup.continent_members, self.setup.continent_bonus)

    @staticmethod
    def active_hand(s: State):
        """The active seat's hand `[B, 12]` (−1 past its length) and its length `[B]`."""
        length = take(s.hand_len, s.active)
        hand = jnp.take_along_axis(s.hand, s.active[:, None, None], axis=1)[:, 0]
        return jnp.where(jnp.arange(HAND_MAX)[None, :] < length[:, None], hand, -1), length

    def is_valid_set(self, cards):
        symbol = self.card_symbol[jnp.maximum(cards, 0)]
        wild = (symbol < 0).any(-1)
        a, b, c = symbol[..., 0], symbol[..., 1], symbol[..., 2]
        return wild | ((a == b) & (b == c)) | ((a != b) & (b != c) & (a != c))

    def set_value(self, cards):
        symbol = self.card_symbol[cards]
        wilds = (symbol < 0).sum(-1)
        distinct = sum((symbol == k).any(-1).astype(I32) for k in range(3))
        one_of_each = (distinct + wilds == 3) & ((distinct > 1) | (wilds > 1))
        first_non_wild = jnp.where(symbol >= 0, symbol, 3).min(-1)
        return jnp.where(one_of_each, ONE_OF_EACH, self.three_of[first_non_wild]).astype(I32)

    def own_adjacency(self, s: State):
        own = s.owner == s.active[:, None]
        return self.adjacency[None] & own[:, :, None] & own[:, None, :]

    def fortify_reach(self, s: State):
        """`[B, 42, 42]` bool: joined through the active seat's own territories, not itself. The
        closure squares the path matrix six times; its counts (at most 42) are exact in bfloat16
        inputs with float32 sums."""
        reach = self.own_adjacency(s)
        for _ in range(6):
            r = reach.astype(jnp.bfloat16)
            reach = reach | (jnp.einsum("bij,bjk->bik", r, r, preferred_element_type=F32) > 0)
        return reach & ~jnp.eye(TERRITORIES, dtype=bool)[None]

    def has_fortify_move(self, s: State):
        return (self.own_adjacency(s).any(-1) & (s.armies >= 2)).any(-1)

    def attack_dice(self, s: State):
        frm, to = self.edges[:, 0], self.edges[:, 1]
        armies = s.armies[:, frm]
        legal = (s.owner[:, frm] == s.active[:, None]) & (s.owner[:, to] != s.active[:, None]) & (armies >= 2)
        return jnp.where(legal, jnp.minimum(armies - 1, 3), 0)

    def has_attack(self, s: State):
        return (self.attack_dice(s) > 0).any(-1)

    def options(self, s: State) -> Options:
        reinforce = (s.phase == 0) & s.reinf_present
        attack = (s.phase == 1) & ~s.occ_present
        occupy = (s.phase == 1) & s.occ_present
        fortify = s.phase == 2
        kind = jnp.where(s.phase == 0, KIND_REINFORCE, jnp.where(s.phase == 2, KIND_FORTIFY,
                         jnp.where(s.occ_present, KIND_OCCUPY, KIND_ATTACK)))
        hand, length = self.active_hand(s)
        own = s.owner == s.active[:, None]
        must_trade = reinforce & (length >= 5)
        may_trade = reinforce & jnp.where(s.reinf_after_elim, must_trade, ~s.reinf_placed_any)
        set_cards = hand[:, self.triples]
        in_hand = self.triples[None, :, 2] < length[:, None]
        sets = may_trade[:, None] & in_hand & self.is_valid_set(set_cards)
        rows = jnp.arange(s.players.shape[0])
        pictured = jnp.zeros((s.players.shape[0], CARDS + 1), bool).at[rows[:, None], jnp.where(hand >= 0, hand, CARDS)].set(True)
        zero = jnp.zeros_like(s.reinf_to_place)
        return Options(
            kind=kind.astype(I32),
            to_place=jnp.where(reinforce, s.reinf_to_place, zero),
            may_place=reinforce & ~must_trade, must_trade=must_trade, may_trade=may_trade,
            own=reinforce[:, None] & own, sets=sets, set_cards=set_cards,
            bonus=reinforce[:, None] & pictured[:, :TERRITORIES] & own,
            attack_dice=jnp.where(attack[:, None], self.attack_dice(s), 0),
            occ_from=jnp.where(occupy, s.occ_from, -1), occ_to=jnp.where(occupy, s.occ_to, -1),
            occ_min=jnp.where(occupy, s.occ_min, zero), occ_max=jnp.where(occupy, s.occ_max, zero),
            fortify_max=jnp.where(fortify[:, None, None] & self.fortify_reach(s) & (s.armies >= 2)[:, :, None],
                                  (s.armies - 1)[:, :, None], 0),
        )

    def bonus_choices(self, s: State, cards):
        """`[B, 3]` bool: which of a trade's cards picture a territory the active seat owns."""
        owner = jnp.take_along_axis(s.owner, jnp.minimum(cards, TERRITORIES - 1), axis=1)
        return (cards < TERRITORIES) & (owner == s.active[:, None])

    # --- legality ------------------------------------------------------------------------------

    def legal_move(self, s: State, o: Options, moves) -> jnp.ndarray:
        """`[B]` bool: whether `apply` accepts each game's move (`engine.validate`, rule for rule);
        a game over holds any move."""
        kind, x, y, z, w = (moves[:, k] for k in range(5))
        live = s.phase != 3
        ok = (kind >= 0) & (kind <= 7)
        ok &= s.phase == self.kind_phase[jnp.clip(kind, 0, 7)]

        def territory(v):
            return (v >= 0) & (v < TERRITORIES)

        xs, ys = jnp.clip(x, 0, TERRITORIES - 1), jnp.clip(y, 0, TERRITORIES - 1)
        placing = kind == PLACE
        ok &= ~placing | (o.may_place & territory(x) & take(o.own, xs) & (y >= 1) & (y <= o.to_place))

        trading = kind == TRADE
        cards = moves[:, 1:4]
        hand, _ = self.active_hand(s)
        distinct = (x != y) & (y != z) & (x != z)
        held = ((cards >= 0) & (cards < CARDS)).all(-1) & (cards[:, :, None] == hand[:, None, :]).any(-1).all(-1)
        clamped = jnp.clip(cards, 0, CARDS - 1)
        choices = self.bonus_choices(s, clamped)
        named = w >= 0
        trade_ok = (o.may_trade & distinct & held & self.is_valid_set(clamped) & (w >= -1)
                    & jnp.where(named, (choices & (clamped == w[:, None])).any(-1), choices.sum(-1) <= 1))
        ok &= ~trading | trade_ok

        fighting = (kind == ATTACK) | (kind == BLITZ)
        edge = self.edge_id[xs, ys]
        max_dice = jnp.where(territory(x) & territory(y) & (edge >= 0), take(o.attack_dice, jnp.maximum(edge, 0)), 0)
        ok &= ~fighting | (~s.occ_present & (max_dice > 0))
        ok &= (kind != ATTACK) | ((z >= 1) & (z <= max_dice))
        ok &= (kind != BLITZ) | ((z >= 1) & (z < take(s.armies, xs)))

        ok &= (kind != OCCUPY) | (s.occ_present & (x >= o.occ_min) & (x <= o.occ_max))
        ok &= (kind != END_ATTACK) | ~s.occ_present

        most = o.fortify_max[jnp.arange(xs.shape[0]), xs, ys]
        ok &= (kind != FORTIFY) | (territory(x) & territory(y) & (take(s.owner, xs) == s.active) & (z >= 1) & (z <= most))
        return ok | ~live

    # --- the step ------------------------------------------------------------------------------

    def step(self, tables: blitz.Tables, s: State, moves, done=None):
        """Applies `moves [B, 5]` (kind, x, y, z, w) to the games not over and not `done`, then the
        forced steps: `(state, oversize [B])`, oversize where a blitz went past the table."""
        moves = moves.astype(I32)
        live = s.phase != 3
        if done is not None:
            live = live & ~done
        kind, x, y, z, w = (moves[:, k] for k in range(5))

        def is_(k):
            return live & (kind == k)

        tx = jnp.where(is_(PLACE) | is_(ATTACK) | is_(BLITZ) | is_(FORTIFY), x, 0)
        ty = jnp.where(is_(ATTACK) | is_(BLITZ) | is_(FORTIFY), y, 0)
        s = self.place(s, is_(PLACE), tx, y)
        s = self.trade(s, is_(TRADE), jnp.where(is_(TRADE)[:, None], moves[:, 1:4], 0), w)
        s = self.attack(s, is_(ATTACK), tx, ty, z)
        s, oversize = self.blitz(tables, s, is_(BLITZ), tx, ty, z)
        s = self.fortify(s, is_(FORTIFY), tx, ty, z)
        forced = live & (s.phase == 1) & s.occ_present & (s.occ_min == s.occ_max)
        s = self.move_in(s, is_(OCCUPY) | forced, jnp.where(is_(OCCUPY), x, s.occ_min))
        forced = live & (s.phase == 1) & ~s.occ_present & ~self.has_attack(s)
        s = _set(s, is_(END_ATTACK) | forced, phase=2)
        forced = live & (s.phase == 2) & ~self.has_fortify_move(s)
        s = self.end_turn(s, is_(FORTIFY) | is_(END_TURN) | forced)
        return s, oversize

    @staticmethod
    def draw(s: State, m):
        t, after = next_bits(s.rng)
        return s._replace(rng=jnp.where(m, after, s.rng)), t

    # reinforce

    def begin_reinforce(self, s: State, m, seat, position):
        earned = self.reinforcements(s.owner, seat)
        first_turn = jnp.where(s.round == 0, self.setup.first_turn_bonus[s.players, position], 0)
        return _set(s, m, reinf_present=True, reinf_to_place=earned + first_turn, reinf_placed_any=False,
                    reinf_after_elim=False, phase=0)

    def place(self, s: State, m, territory, armies):
        armies = jnp.where(m, armies, 0)
        s = s._replace(armies=_add_at(s.armies, territory, armies))
        s = _set(s, m, reinf_to_place=s.reinf_to_place - armies, reinf_placed_any=True)
        all_placed = m & (s.reinf_to_place == 0)
        return _set(s, all_placed, reinf_present=False, reinf_to_place=0, reinf_placed_any=False,
                    reinf_after_elim=False, phase=1)

    def trade(self, s: State, m, cards, bonus):
        rows = jnp.arange(m.shape[0])
        choices = self.bonus_choices(s, cards)
        only = choices.sum(-1) == 1
        only_card = take(cards, jnp.argmax(choices, 1))
        territory = jnp.where(bonus >= 0, bonus, jnp.where(only, only_card, -1))
        gets_bonus = m & (territory >= 0)
        hand, _ = self.active_hand(s)
        keep = (hand >= 0) & ~(hand[:, :, None] == cards[:, None, :]).any(-1)
        new_hand = jnp.where(m[:, None], _compact(hand, keep), hand)
        s = s._replace(hand=s.hand.at[rows, s.active].set(new_hand),
                       hand_len=_add_at(s.hand_len, s.active, jnp.where(m, -3, 0)))
        for k in range(3):
            s = self.return_to_deck(s, m, cards[:, k])
        s = _set(s, m, trades=s.trades + 1, reinf_to_place=s.reinf_to_place + self.set_value(cards))
        return s._replace(armies=_add_at(s.armies, jnp.maximum(territory, 0), jnp.where(gets_bonus, 2, 0)))

    def return_to_deck(self, s: State, m, card):
        s, t = self.draw(s, m)
        length = s.deck_len
        lowest = jnp.where(length > 3, 3, 0)
        at = (lowest + below(t, length - lowest + 1))[:, None]
        deck = s.deck
        shifted = jnp.concatenate([jnp.full_like(deck[:, :1], -1), deck[:, :-1]], 1)
        j = jnp.arange(CARDS)[None, :]
        inserted = jnp.where(j < at, deck, jnp.where(j == at, card[:, None], shifted))
        return s._replace(deck=jnp.where(m[:, None], inserted, deck), deck_len=jnp.where(m, length + 1, length))

    # attack

    def attack(self, s: State, m, frm, to, dice):
        dice = jnp.where(m, dice, 0)
        defend = jnp.where(m, jnp.minimum(take(s.armies, to), 2), 0)
        rolls = []
        for k in range(5):
            s, t = self.draw(s, k < dice + defend)
            rolls.append(1 + below(t, 6))
        rolls = jnp.stack(rolls, 1)
        three, two = jnp.arange(3)[None, :], jnp.arange(2)[None, :]
        attacker = -jnp.sort(-jnp.where(three < dice[:, None], rolls[:, :3], 0), axis=1)
        defender = jnp.take_along_axis(rolls, jnp.minimum(dice[:, None] + two, 4), axis=1)
        defender = -jnp.sort(-jnp.where(two < defend[:, None], defender, 0), axis=1)
        paired = two < jnp.minimum(dice, defend)[:, None]
        wins = paired & (attacker[:, :2] > defender)
        defender_losses = wins.sum(1).astype(I32)
        attacker_losses = (paired & ~wins).sum(1).astype(I32)
        s = s._replace(armies=_add_at(_add_at(s.armies, frm, jnp.where(m, -attacker_losses, 0)), to,
                                      jnp.where(m, -defender_losses, 0)))
        return self.capture(s, m & (take(s.armies, to) == 0), frm, to, dice)

    def blitz(self, tables: blitz.Tables, s: State, m, frm, to, keep):
        attackers = take(s.armies, frm) - keep
        s, t = self.draw(s, m)
        a = jnp.where(m, attackers, 1)
        d = jnp.where(m, take(s.armies, to), 1)
        attacker_losses, defender_losses, oversize = blitz.resolve(tables, a, d, t)
        s = s._replace(armies=_add_at(_add_at(s.armies, frm, jnp.where(m, -attacker_losses, 0)), to,
                                      jnp.where(m, -defender_losses, 0)))
        left = take(s.armies, frm)
        minimum = jnp.minimum(jnp.minimum(3, attackers), left - 1)
        return self.capture(s, m & (take(s.armies, to) == 0), frm, to, minimum), m & oversize

    def capture(self, s: State, m, frm, to, minimum):
        previous = take(s.owner, to)
        most = take(s.armies, frm) - 1
        s = s._replace(owner=_put_at(s.owner, m, to, s.active), armies=_put_at(s.armies, m, to, minimum))
        s = s._replace(armies=_add_at(s.armies, frm, jnp.where(m, -minimum, 0)),
                       captured_this_turn=s.captured_this_turn | m)
        eliminating = m & ~(s.owner == previous[:, None]).any(1)
        in_game = ((jnp.arange(MAX_SEATS)[None, :] < s.players[:, None]) & ~s.eliminated).sum(1)
        won = eliminating & (in_game == 2)
        s = self.eliminate(s, won, previous)
        s = _set(s, won, winner=s.active, phase=3)
        occupying = m & ~won
        return _set(s, occupying, occ_present=True, occ_from=frm, occ_to=to, occ_min=minimum, occ_max=most,
                    occ_elim=jnp.where(eliminating, previous, -1))

    def move_in(self, s: State, m, armies):
        frm = jnp.where(m, s.occ_from, 0)
        to = jnp.where(m, s.occ_to, 0)
        extra = jnp.where(m, armies - s.occ_min, 0)
        s = s._replace(armies=_add_at(_add_at(s.armies, frm, -extra), to, extra))
        loser = s.occ_elim
        s = _set(s, m, occ_present=False, occ_from=-1, occ_to=-1, occ_min=0, occ_max=0, occ_elim=-1)
        eliminating = m & (loser >= 0)
        s = self.eliminate(s, eliminating, loser)
        forced_trade = eliminating & (take(s.hand_len, s.active) >= 5)
        return _set(s, forced_trade, reinf_present=True, reinf_to_place=0, reinf_placed_any=False,
                    reinf_after_elim=True, phase=0)

    @staticmethod
    def eliminate(s: State, m, loser):
        rows = jnp.arange(m.shape[0])
        loser = jnp.where(m, loser, 0)
        have = take(s.hand_len, s.active)
        taken = take(s.hand_len, loser)
        slots = jnp.arange(HAND_MAX)[None, :]
        mine = s.hand[rows, s.active]
        theirs = jnp.take_along_axis(s.hand[rows, loser], jnp.clip(slots - have[:, None], 0, HAND_MAX - 1), axis=1)
        joined = jnp.where(slots < have[:, None], mine,
                           jnp.where(slots < (have + taken)[:, None], theirs, -1))
        hand = s.hand.at[rows, s.active].set(jnp.where(m[:, None], joined, mine))
        hand = hand.at[rows, loser].set(jnp.where(m[:, None], -1, hand[rows, loser]))
        hand_len = _put_at(_add_at(s.hand_len, s.active, jnp.where(m, taken, 0)), m, loser, 0)
        return s._replace(hand=hand, hand_len=hand_len, eliminated=_put_at(s.eliminated, m, loser, True))

    # fortify and the turn's end

    @staticmethod
    def fortify(s: State, m, frm, to, armies):
        armies = jnp.where(m, armies, 0)
        return s._replace(armies=_add_at(_add_at(s.armies, frm, -armies), to, armies))

    def end_turn(self, s: State, m):
        rows = jnp.arange(m.shape[0])
        draws = m & s.captured_this_turn & (s.deck_len > 0)
        slot = jnp.minimum(take(s.hand_len, s.active), HAND_MAX - 1)
        current = s.hand[rows, s.active, slot]
        hand = s.hand.at[rows, s.active, slot].set(jnp.where(draws, s.deck[:, 0], current))
        shifted = jnp.concatenate([s.deck[:, 1:], jnp.full_like(s.deck[:, :1], -1)], 1)
        s = s._replace(hand=hand, hand_len=_add_at(s.hand_len, s.active, draws.astype(I32)),
                       deck=jnp.where(draws[:, None], shifted, s.deck), deck_len=s.deck_len - draws)

        at = jnp.argmax(s.turn_order == s.active[:, None], 1).astype(I32)
        steps = jnp.arange(1, MAX_SEATS + 1)[None, :]
        positions = (at[:, None] + steps) % s.players[:, None]
        candidates = jnp.take_along_axis(s.turn_order, positions, axis=1)
        eligible = ~jnp.take_along_axis(s.eliminated, jnp.maximum(candidates, 0), axis=1)
        first = jnp.argmax(eligible, 1)
        position = take(positions, first)
        seat = take(candidates, first)
        s = _set(s, m & (position <= at), round=s.round + 1)
        s = _set(s, m, turn=s.turn + 1, active=seat, captured_this_turn=False)
        return self.begin_reinforce(s, m, jnp.where(m, seat, s.active), position)


def _set(s: State, m, **values) -> State:
    """Each named field set to its value where `m [B]` holds."""
    out = {}
    for name, value in values.items():
        current = getattr(s, name)
        out[name] = jnp.where(m, jnp.asarray(value).astype(current.dtype), current)
    return s._replace(**out)


def _add_at(field, index, delta):
    """`field[b, index[b]] += delta[b]`."""
    return field.at[jnp.arange(field.shape[0]), index].add(delta.astype(field.dtype))


def _put_at(field, m, index, value):
    rows = jnp.arange(field.shape[0])
    return field.at[rows, index].set(jnp.where(m, jnp.asarray(value).astype(field.dtype), field[rows, index]))


def _compact(values, keep):
    """Each row's kept values moved to its front in order, −1 after them."""
    width = values.shape[1]
    rows = jnp.arange(values.shape[0])[:, None]
    slot = jnp.where(keep, jnp.cumsum(keep, 1) - 1, width)
    out = jnp.full((values.shape[0], width + 1), -1, values.dtype).at[rows, slot].set(jnp.where(keep, values, -1))
    return out[:, :width]

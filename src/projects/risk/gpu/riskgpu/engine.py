"""The rules, batched: one move per game per step, exactly as the reference engine's `apply`
(`engine/index.ts`), then its forced steps.

Every game is in its own phase, so each rule runs under a mask of the games it applies to and
leaves every other game alone; the functions follow `engine/reinforce.ts`, `combat.ts`,
`fortify.ts` and `turn.ts` one for one. A game draws from its random stream exactly when the
reference engine does: each draw is one `next_draws` over the batch, kept only where the mask
holds. `step` changes the State in place (its fields are replaced by the updated tensors).

Legality (`check=True`) is the options' masks, as `apply` checks a move against the same lists
`options` reports; an illegal move raises before any game is touched. With `check=False` the
caller vouches for every move, and nothing is synced to the host.
"""

from dataclasses import dataclass

import torch

from .board import CARDS, MAX_SEATS, TERRITORIES, Board
from .options import Options, active_hand, has_attack, has_fortify_move, is_valid_set, options, set_value
from .rng import floor_draw, next_draws
from .rules import reinforcements
from .state import HAND_MAX, State
from .tables import BlitzTables, resolve_blitz

PLACE, TRADE, ATTACK, BLITZ, OCCUPY, END_ATTACK, FORTIFY, END_TURN = range(8)
# The phase each move kind is played in.
KIND_PHASE = (0, 0, 1, 1, 1, 1, 2, 2)


class IllegalMove(Exception):
    def __init__(self, game: int, reason: str, move: list[int]):
        super().__init__(f"game {game}: {reason} (move {move})")
        self.game = game
        self.reason = reason
        self.move = move


@dataclass
class StepInfo:
    oversize: torch.Tensor  # [B] bool: a blitz went past the tables' bound
    placed: torch.Tensor  # [B] int64: armies added to the board (placements and trade bonuses)
    lost: torch.Tensor  # [B] int64: armies lost in battles and blitzes


@dataclass
class Ctx:
    """What a rule works on, as `engine/state.ts`'s `Ctx`: the state, the fixed data, what the step
    reports, and whether impossible states are checked for."""
    s: State
    board: Board
    tables: BlitzTables
    info: StepInfo
    check: bool
    rows: torch.Tensor

    def set(self, name: str, mask: torch.Tensor, value) -> None:
        current = getattr(self.s, name)
        if isinstance(value, torch.Tensor):
            value = value.to(current.dtype)
        setattr(self.s, name, torch.where(mask, value, current))

    def fail_if(self, bad: torch.Tensor, message: str) -> None:
        """A state the rules can't reach (a hand past its padding, no seat to move): a bug, raised
        in check mode."""
        if self.check and bool(bad.any()):
            game = int(bad.nonzero()[0, 0])
            raise RuntimeError(f"game {game}: {message}")

    def draw(self, mask: torch.Tensor) -> torch.Tensor:
        """One `rng.next()` for the games where `mask` holds; the others' streams don't move."""
        r, after = next_draws(self.s.rng)
        self.s.rng = torch.where(mask, after, self.s.rng)
        return r

    def at(self, field: torch.Tensor, index: torch.Tensor) -> torch.Tensor:
        """`field[b, index[b]]` as int64."""
        return field[self.rows, index].to(torch.int64)

    def add_at(self, field: torch.Tensor, mask: torch.Tensor, index: torch.Tensor, delta: torch.Tensor) -> None:
        field[self.rows, index] += torch.where(mask, delta, 0).to(field.dtype)

    def put_at(self, field: torch.Tensor, mask: torch.Tensor, index: torch.Tensor, value) -> None:
        current = field[self.rows, index]
        if isinstance(value, torch.Tensor):
            value = value.to(field.dtype)
        field[self.rows, index] = torch.where(mask, value, current)


def step(
    state: State, moves: torch.Tensor, board: Board, tables: BlitzTables, *,
    done: torch.Tensor | None = None, legal: Options | None = None, check: bool = True,
) -> StepInfo:
    """Applies `moves [B, 5]` (kind, x, y, z, w) to the games not over and not `done`, then the
    forced steps. `legal` may pass this state's options when the caller already has them."""
    s = state
    assert moves.shape == (s.batch, 5), moves.shape
    moves = moves.to(device=s.device, dtype=torch.int64)
    live = s.phase != 3
    if done is not None:
        live = live & ~done
    zeros = torch.zeros(s.batch, dtype=torch.int64, device=s.device)
    info = StepInfo(oversize=torch.zeros(s.batch, dtype=torch.bool, device=s.device), placed=zeros, lost=zeros.clone())
    ctx = Ctx(s, board, tables, info, check, torch.arange(s.batch, device=s.device))
    kind, x, y, z, w = moves.unbind(1)
    if check:
        validate(ctx, live, moves, legal if legal is not None else options(s, board))

    is_ = lambda k: live & (kind == k)  # noqa: E731
    # Fields that don't belong to a row's move kind may be anything; indices are kept in range.
    tx = torch.where(is_(PLACE) | is_(ATTACK) | is_(BLITZ) | is_(FORTIFY), x, 0)
    ty = torch.where(is_(ATTACK) | is_(BLITZ) | is_(FORTIFY), y, 0)
    place(ctx, is_(PLACE), tx, y)
    trade(ctx, is_(TRADE), torch.where(is_(TRADE)[:, None], moves[:, 1:4], 0), w)
    attack(ctx, is_(ATTACK), tx, ty, z)
    blitz(ctx, is_(BLITZ), tx, ty, z)
    fortify(ctx, is_(FORTIFY), tx, ty, z)
    # The moves that end a phase or the turn run once, each with the forced steps of its kind
    # (`takeForcedSteps`): a move-in whose minimum is its maximum, then an attack phase with no
    # attack left, then a fortify phase with no move. Each leads only to the ones after it or to a
    # decision, so one masked pass of each, in order, takes the whole chain.
    forced = live & (s.phase == 1) & s.occ_present & (s.occ_min == s.occ_max)
    move_in(ctx, is_(OCCUPY) | forced, torch.where(is_(OCCUPY), x, s.occ_min.to(torch.int64)))
    forced = live & (s.phase == 1) & ~s.occ_present & ~has_attack(s, board)
    end_attack_phase(ctx, is_(END_ATTACK) | forced)
    forced = live & (s.phase == 2) & ~has_fortify_move(s, board)
    end_turn(ctx, is_(FORTIFY) | is_(END_TURN) | forced)
    return info


def validate(ctx: Ctx, live: torch.Tensor, moves: torch.Tensor, o: Options) -> None:
    """Raises `IllegalMove` for the first game whose move `apply` would refuse."""
    s, board, rows = ctx.s, ctx.board, ctx.rows
    kind, x, y, z, w = moves.unbind(1)

    def require(applies: torch.Tensor, ok: torch.Tensor, reason: str) -> None:
        bad = live & applies & ~ok
        if bool(bad.any()):
            game = int(bad.nonzero()[0, 0])
            raise IllegalMove(game, reason, moves[game].tolist())

    def territory(v: torch.Tensor) -> torch.Tensor:
        return (v >= 0) & (v < TERRITORIES)

    everything = torch.ones_like(live)
    require(everything, (kind >= 0) & (kind <= 7), "unknown move")
    phase_of = torch.tensor(KIND_PHASE, device=s.device)[kind.clamp(0, 7)]
    require(everything, s.phase.to(torch.int64) == phase_of, "that move is not one of this phase")
    xs, ys = x.clamp(0, TERRITORIES - 1), y.clamp(0, TERRITORIES - 1)

    placing = kind == PLACE
    require(placing, o.may_place, "trade a set before placing")
    require(placing, territory(x) & o.own[rows, xs], "armies can only be placed on a territory you own")
    require(placing, (y >= 1) & (y <= o.to_place), "place between 1 and the armies to place")

    trading = kind == TRADE
    cards = moves[:, 1:4]
    hand, _ = active_hand(s)
    require(trading, o.may_trade, "no trade is allowed now")
    distinct = (x != y) & (y != z) & (x != z)
    held = ((cards >= 0) & (cards < CARDS)).all(-1) & (cards[:, :, None] == hand[:, None, :]).any(-1).all(-1)
    require(trading, distinct & held, "a trade is three different cards from your hand")
    cards = cards.clamp(0, CARDS - 1)
    require(trading, is_valid_set(cards, board), "those cards are not a set")
    choices = bonus_choices(ctx, cards)
    named = w >= 0
    require(trading, w >= -1, "no such territory")
    require(trading & named, (choices & (cards == w[:, None])).any(-1),
            "that territory cannot take the occupied-territory bonus")
    require(trading & ~named, choices.sum(-1) <= 1, "choose which territory takes the occupied-territory bonus")

    fighting = (kind == ATTACK) | (kind == BLITZ)
    edge = board.edge_id[xs, ys]
    max_dice = torch.where(territory(x) & territory(y) & (edge >= 0), o.attack_dice[rows, edge.clamp(min=0)].to(torch.int64), 0)
    require(fighting, ~s.occ_present, "move armies into the captured territory first")
    require(fighting, max_dice > 0, "that attack is not allowed")
    require(kind == ATTACK, (z >= 1) & (z <= max_dice), "roll between 1 and the most dice allowed")
    require(kind == BLITZ, (z >= 1) & (z < ctx.at(s.armies, xs)), "keep between 1 and all but one of the armies")

    require(kind == OCCUPY, s.occ_present, "there is no captured territory to move into")
    require(kind == OCCUPY, (x >= o.occ_min) & (x <= o.occ_max), "move between the minimum and the maximum")
    require(kind == END_ATTACK, ~s.occ_present, "move armies into the captured territory first")

    fortifying = kind == FORTIFY
    require(fortifying, territory(x) & territory(y), "no such territory")
    require(fortifying, ctx.at(s.owner, xs) == s.active.to(torch.int64), "fortify from a territory you own")
    most = o.fortify_max[rows, xs, ys].to(torch.int64)
    require(fortifying, (z >= 1) & (z <= most),
            "fortify to a territory joined to it through your own, leaving at least 1 behind")


def bonus_choices(ctx: Ctx, cards: torch.Tensor) -> torch.Tensor:
    """`bonusTerritories` of a trade's cards `[B, 3]`: which of them picture a territory the active
    seat owns, `[B, 3]` bool."""
    s = ctx.s
    pictured = cards < TERRITORIES
    owner = s.owner.to(torch.int64).gather(1, cards.clamp(max=TERRITORIES - 1))
    return pictured & (owner == s.active.to(torch.int64)[:, None])


def compact(values: torch.Tensor, keep: torch.Tensor) -> torch.Tensor:
    """Each row's kept values moved to its front in order, −1 after them."""
    width = values.shape[1]
    slot = torch.where(keep, keep.cumsum(1) - 1, width)
    out = torch.full((values.shape[0], width + 1), -1, dtype=values.dtype, device=values.device)
    out.scatter_(1, slot, torch.where(keep, values, -1))
    return out[:, :width]


# --- reinforce (`engine/reinforce.ts`) ---------------------------------------------------------


def clear_reinforce(ctx: Ctx, m: torch.Tensor) -> None:
    ctx.set("reinf_present", m, False)
    ctx.set("reinf_to_place", m, 0)
    ctx.set("reinf_placed_any", m, False)
    ctx.set("reinf_after_elim", m, False)


def begin_reinforce(ctx: Ctx, m: torch.Tensor, seat: torch.Tensor, position: torch.Tensor) -> None:
    """`REINF-1`: this turn's armies, with the first-turn bonus (`REINF-6`) while round is 0."""
    s = ctx.s
    earned = reinforcements(s.owner, seat, ctx.board).to(torch.int64)
    first_turn = ctx.board.first_turn_bonus[s.players.to(torch.int64), position].to(torch.int64)
    first_turn = torch.where(s.round == 0, first_turn, 0)
    ctx.set("reinf_present", m, True)
    ctx.set("reinf_to_place", m, earned + first_turn)
    ctx.set("reinf_placed_any", m, False)
    ctx.set("reinf_after_elim", m, False)
    ctx.set("phase", m, 0)


def begin_forced_trade(ctx: Ctx, m: torch.Tensor) -> None:
    """`ELIM-3`: a hand of 5 or more after taking a loser's cards trades down before the next
    battle."""
    ctx.set("reinf_present", m, True)
    ctx.set("reinf_to_place", m, 0)
    ctx.set("reinf_placed_any", m, False)
    ctx.set("reinf_after_elim", m, True)
    ctx.set("phase", m, 0)


def place(ctx: Ctx, m: torch.Tensor, territory: torch.Tensor, armies: torch.Tensor) -> None:
    """`REINF-5`; the attack phase begins once every army is placed."""
    s = ctx.s
    armies = torch.where(m, armies, 0)
    ctx.add_at(s.armies, m, territory, armies)
    ctx.info.placed += armies
    ctx.set("reinf_to_place", m, s.reinf_to_place.to(torch.int64) - armies)
    ctx.set("reinf_placed_any", m, True)
    all_placed = m & (s.reinf_to_place == 0)
    clear_reinforce(ctx, all_placed)
    ctx.set("phase", all_placed, 1)


def trade(ctx: Ctx, m: torch.Tensor, cards: torch.Tensor, bonus: torch.Tensor) -> None:
    """`CARDS-5`: the set's value (`CARDS-6`) to place, +2 on the named or only qualifying
    territory (`CARDS-7`), the cards out of the hand in its order and back into the deck
    (`CARDS-8`) in the move's order."""
    s, rows = ctx.s, ctx.rows
    active = s.active.to(torch.int64)
    choices = bonus_choices(ctx, cards)
    only = choices.sum(-1) == 1
    only_card = cards.gather(1, choices.to(torch.int64).argmax(1, keepdim=True))[:, 0]
    territory = torch.where(bonus >= 0, bonus, torch.where(only, only_card, -1))
    gets_bonus = m & (territory >= 0)

    hand, _ = active_hand(s)
    keep = (hand >= 0) & ~(hand[:, :, None] == cards[:, None, :]).any(-1)
    s.hand[rows, active] = torch.where(m[:, None], compact(hand, keep), hand).to(s.hand.dtype)
    ctx.add_at(s.hand_len, m, active, torch.full_like(active, -3))
    for k in range(3):
        return_to_deck(ctx, m, cards[:, k])

    ctx.set("trades", m, s.trades + 1)
    ctx.set("reinf_to_place", m, s.reinf_to_place.to(torch.int64) + set_value(cards, ctx.board))
    two = torch.full_like(active, 2)
    ctx.add_at(s.armies, gets_bonus, territory.clamp(min=0), two)
    ctx.info.placed += torch.where(gets_bonus, 2, 0)


def return_to_deck(ctx: Ctx, m: torch.Tensor, card: torch.Tensor) -> None:
    """`CARDS-8`: below the deck's top 3, or anywhere in a deck of 3 or fewer."""
    s = ctx.s
    r = ctx.draw(m)
    length = s.deck_len.to(torch.int64)
    lowest = torch.where(length > 3, 3, 0)
    at = (lowest + floor_draw(r, length - lowest + 1))[:, None]
    deck = s.deck.to(torch.int64)
    below = torch.cat([torch.full_like(deck[:, :1], -1), deck[:, :-1]], 1)
    j = torch.arange(CARDS, device=s.device)[None, :]
    inserted = torch.where(j < at, deck, torch.where(j == at, card[:, None], below))
    ctx.fail_if(m & (length >= CARDS), "a card returned to a full deck")
    s.deck = torch.where(m[:, None], inserted, deck).to(s.deck.dtype)
    ctx.set("deck_len", m, length + 1)


# --- attack (`engine/combat.ts`) ---------------------------------------------------------------


def attack(ctx: Ctx, m: torch.Tensor, frm: torch.Tensor, to: torch.Tensor, dice: torch.Tensor) -> None:
    """`COMBAT-3`, `COMBAT-4`: one battle, the attacker's dice drawn first, then the defender's
    (as many as it may, up to 2); highest pairs with highest, ties to the defender."""
    s = ctx.s
    dice = torch.where(m, dice, 0)
    defend = torch.where(m, ctx.at(s.armies, to).clamp(max=2), 0)
    rolls = []
    for k in range(5):
        r = ctx.draw(k < dice + defend)
        rolls.append(1 + floor_draw(r, 6))
    rolls = torch.stack(rolls, 1)  # [B, 5]: the attacker's dice, then the defender's
    three = torch.arange(3, device=s.device)[None, :]
    two = torch.arange(2, device=s.device)[None, :]
    attacker = torch.where(three < dice[:, None], rolls[:, :3], 0).sort(1, descending=True).values
    defender = rolls.gather(1, (dice[:, None] + two).clamp(max=4))
    defender = torch.where(two < defend[:, None], defender, 0).sort(1, descending=True).values
    paired = two < torch.minimum(dice, defend)[:, None]
    wins = paired & (attacker[:, :2] > defender)
    defender_losses = wins.sum(1)
    attacker_losses = (paired & ~wins).sum(1)
    ctx.add_at(s.armies, m, frm, -attacker_losses)
    ctx.add_at(s.armies, m, to, -defender_losses)
    ctx.info.lost += torch.where(m, attacker_losses + defender_losses, 0)
    capture(ctx, m & (ctx.at(s.armies, to) == 0), frm, to, dice)


def blitz(ctx: Ctx, m: torch.Tensor, frm: torch.Tensor, to: torch.Tensor, keep: torch.Tensor) -> None:
    """`COMBAT-8`: Balanced Blitz from one draw; a capture moves in at least 3, or all that can
    move (`COMBAT-6`)."""
    s = ctx.s
    attackers = ctx.at(s.armies, frm) - keep
    r = ctx.draw(m)
    a = torch.where(m, attackers, 1)
    d = torch.where(m, ctx.at(s.armies, to), 1)
    attacker_losses, defender_losses, oversize = resolve_blitz(ctx.tables, a, d, r)
    ctx.info.oversize |= m & oversize
    ctx.add_at(s.armies, m, frm, -attacker_losses)
    ctx.add_at(s.armies, m, to, -defender_losses)
    ctx.info.lost += torch.where(m, attacker_losses + defender_losses, 0)
    left = ctx.at(s.armies, frm)
    minimum = torch.minimum(torch.minimum(torch.full_like(left, 3), attackers), left - 1)
    capture(ctx, m & (ctx.at(s.armies, to) == 0), frm, to, minimum)


def capture(ctx: Ctx, m: torch.Tensor, frm: torch.Tensor, to: torch.Tensor, minimum: torch.Tensor) -> None:
    """`COMBAT-6`: the minimum moves in with the capture. Taking a seat's last territory with only
    two seats in the game ends it (`WIN-1`); otherwise the move-in is the attacker's to choose,
    with any elimination waiting for it."""
    s = ctx.s
    active = s.active.to(torch.int64)
    previous = ctx.at(s.owner, to)
    most = ctx.at(s.armies, frm) - 1
    ctx.put_at(s.owner, m, to, active)
    ctx.put_at(s.armies, m, to, minimum)
    ctx.add_at(s.armies, m, frm, -minimum)
    ctx.set("captured_this_turn", m, True)

    eliminating = m & ~(s.owner.to(torch.int64) == previous[:, None]).any(1)
    seats = torch.arange(MAX_SEATS, device=s.device)[None, :]
    in_game = ((seats < s.players[:, None]) & ~s.eliminated).sum(1)
    won = eliminating & (in_game == 2)
    eliminate(ctx, won, previous)
    ctx.set("winner", won, active)
    ctx.set("phase", won, 3)

    occupying = m & ~won
    ctx.set("occ_present", occupying, True)
    ctx.set("occ_from", occupying, frm)
    ctx.set("occ_to", occupying, to)
    ctx.set("occ_min", occupying, minimum)
    ctx.set("occ_max", occupying, most)
    ctx.set("occ_elim", occupying, torch.where(eliminating, previous, -1))


def move_in(ctx: Ctx, m: torch.Tensor, armies: torch.Tensor) -> None:
    """Completes a capture's move-in (`occupy`, or forced when its minimum is its maximum); an
    elimination follows it, and a forced trade if the hand reached 5 (`ELIM-3`)."""
    s = ctx.s
    frm = torch.where(m, s.occ_from.to(torch.int64), 0)
    to = torch.where(m, s.occ_to.to(torch.int64), 0)
    extra = torch.where(m, armies - s.occ_min.to(torch.int64), 0)
    ctx.add_at(s.armies, m, frm, -extra)
    ctx.add_at(s.armies, m, to, extra)
    loser = s.occ_elim.to(torch.int64)
    ctx.set("occ_present", m, False)
    ctx.set("occ_from", m, -1)
    ctx.set("occ_to", m, -1)
    ctx.set("occ_min", m, 0)
    ctx.set("occ_max", m, 0)
    ctx.set("occ_elim", m, -1)

    eliminating = m & (loser >= 0)
    eliminate(ctx, eliminating, loser)
    begin_forced_trade(ctx, eliminating & (ctx.at(s.hand_len, s.active.to(torch.int64)) >= 5))


def eliminate(ctx: Ctx, m: torch.Tensor, loser: torch.Tensor) -> None:
    """`ELIM-1`, `ELIM-2`: out of the game, the loser's cards appended to the active hand in
    order."""
    s, rows = ctx.s, ctx.rows
    active = s.active.to(torch.int64)
    loser = torch.where(m, loser, 0)
    have = ctx.at(s.hand_len, active)
    taken = ctx.at(s.hand_len, loser)
    ctx.fail_if(m & (have + taken > HAND_MAX), f"a hand past HAND_MAX {HAND_MAX}")
    slots = torch.arange(HAND_MAX, device=s.device)[None, :]
    mine = s.hand[rows, active].to(torch.int64)
    theirs = s.hand[rows, loser].to(torch.int64).gather(1, (slots - have[:, None]).clamp(0, HAND_MAX - 1))
    joined = torch.where(slots < have[:, None], mine, torch.where(slots < (have + taken)[:, None], theirs, -1))
    s.hand[rows, active] = torch.where(m[:, None], joined, mine).to(s.hand.dtype)
    s.hand[rows, loser] = torch.where(m[:, None], -1, s.hand[rows, loser])
    ctx.add_at(s.hand_len, m, active, taken)
    ctx.put_at(s.hand_len, m, loser, 0)
    ctx.put_at(s.eliminated, m, loser, True)


def end_attack_phase(ctx: Ctx, m: torch.Tensor) -> None:
    """On to the fortify phase (`TURN-1`)."""
    ctx.set("phase", m, 2)


# --- fortify and the turn's end (`engine/fortify.ts`, `engine/turn.ts`) -------------------------


def fortify(ctx: Ctx, m: torch.Tensor, frm: torch.Tensor, to: torch.Tensor, armies: torch.Tensor) -> None:
    """`FORT-1`; `step` then ends the turn (`FORT-3`)."""
    s = ctx.s
    armies = torch.where(m, armies, 0)
    ctx.add_at(s.armies, m, frm, -armies)
    ctx.add_at(s.armies, m, to, armies)


def end_turn(ctx: Ctx, m: torch.Tensor) -> None:
    """`CARDS-1`: the top card if the turn captured and the deck has one; `TURN-2`: the next seat
    in the game in turn order, a new round when the order wraps round."""
    s, rows = ctx.s, ctx.rows
    active = s.active.to(torch.int64)
    draws = m & s.captured_this_turn & (s.deck_len > 0)
    have = ctx.at(s.hand_len, active)
    ctx.fail_if(draws & (have >= HAND_MAX), f"a hand past HAND_MAX {HAND_MAX}")
    slot = have.clamp(max=HAND_MAX - 1)
    current = s.hand[rows, active, slot]
    s.hand[rows, active, slot] = torch.where(draws, s.deck[:, 0], current)
    ctx.add_at(s.hand_len, draws, active, torch.ones_like(active))
    deck = s.deck
    shifted = torch.cat([deck[:, 1:], torch.full_like(deck[:, :1], -1)], 1)
    s.deck = torch.where(draws[:, None], shifted, deck)
    ctx.set("deck_len", draws, s.deck_len - 1)

    order = s.turn_order.to(torch.int64)
    players = s.players.to(torch.int64)
    at = (order == active[:, None]).to(torch.int64).argmax(1)
    steps = torch.arange(1, MAX_SEATS + 1, device=s.device)[None, :]
    positions = (at[:, None] + steps) % players[:, None]
    candidates = order.gather(1, positions)
    eligible = ~s.eliminated.gather(1, candidates)
    ctx.fail_if(m & ~eligible.any(1), "no seat is left to take a turn")
    first = eligible.to(torch.int64).argmax(1)
    position = positions[rows, first]
    seat = candidates[rows, first]

    ctx.set("round", m & (position <= at), s.round + 1)
    ctx.set("turn", m, s.turn + 1)
    ctx.set("active", m, seat)
    ctx.set("captured_this_turn", m, False)
    begin_reinforce(ctx, m, torch.where(m, seat, active), position)

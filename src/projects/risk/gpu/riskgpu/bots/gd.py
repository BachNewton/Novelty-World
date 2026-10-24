"""GD-lite: GD's Expert AI (`bots/gd/bot.ts`) for one persona, batched over the games in the mask
(`ideas/gpu-engine.md`, "The bots on the GPU"). Each decision is one step of GD's phase loops: a
source, then a target, then an amount, each the persona's top score, the first on a tie in GD's
own orders, the odds from the engine's tables, the draws from the decision's own stream in the
TypeScript's order. Labelled approximate: the TypeScript's scores are matched operation for
operation, so only a choice the two would make differently in the last bit can differ.

Each phase runs on the games in it alone, as its own batch (`Turn`): the board as GD reads it, the
helper over it and the persona's scorer. `gd_bot_graphable` is the same bot with no host sync, for
a step captured as a CUDA graph: every phase runs on every game, each keeping its own.
"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING

import torch

from ..engine import BLITZ, END_ATTACK, END_TURN, FORTIFY, OCCUPY, PLACE, TRADE
from ..options import KIND_ATTACK, KIND_FORTIFY, KIND_OCCUPY, KIND_REINFORCE
from ..state import HAND_MAX
from ..tables import BlitzTables
from .gd_board import GDBoard
from .gd_cards import best_card_match, bonus_territory_of
from .gd_choice import apply_step_variance, draw, get_choice, iterative_array, random_range
from .gd_helper import Helper
from .gd_odds import FROUND_09, GraphableOdds, odds_for
from .gd_persona import BaseScorer, DeployContext, StackerScorer
from .gd_personas import PERSONAS, WEIGHTS

if TYPE_CHECKING:
    from ..runner import Bot, Decision


@dataclass
class Turn:
    board: GDBoard
    helper: Helper
    scorer: BaseScorer
    seed: torch.Tensor  # [N]: each game's stream for this decision
    hand: torch.Tensor  # [N, 12]: the seat's hand in its order, −1 past it


@dataclass
class Graphable:
    """What a graphable call reads in place of the eager one's host work: the odds kept on the
    device, and each game's stream for this decision `[B]`, supplied by the caller."""

    odds: GraphableOdds
    seed: torch.Tensor


def turn_of(d: "Decision", rows: torch.Tensor | None, persona: str, armies: torch.Tensor | None = None,
            graphable: Graphable | None = None) -> Turn:
    """`turnOf` for the games `rows` (every game where None), on the board `armies` where given
    (the move-in's)."""
    s, log = d.state, d.log
    pick = (lambda x: x) if rows is None else (lambda x: x[rows])  # noqa: E731
    active = pick(s.active).to(torch.int64)
    slots = torch.arange(HAND_MAX, device=s.device)[None, :]
    hand_len = pick(s.hand_len).to(torch.int64)
    held = pick(s.hand).gather(1, active[:, None, None].expand(-1, 1, HAND_MAX))[:, 0].to(torch.int64)
    hand = torch.where(slots < hand_len.gather(1, active[:, None]), held, -1)
    board = GDBoard(
        d.board, owner=pick(s.owner), armies=pick(s.armies) if armies is None else armies, active=active,
        to_place=pick(s.reinf_to_place), hand_len=hand_len, eliminated=pick(s.eliminated),
        turn_order=pick(s.turn_order), players=pick(s.players), first_round=pick(s.round) == 0,
        graphable=graphable is not None,
    )
    w = WEIGHTS[persona]
    helper = Helper(
        board, odds_for(d.tables) if graphable is None else graphable.odds, hand=hand, humans=pick(d.humans),
        conquered_this_turn=pick(log.captured), attacks_this_turn=pick(log.attacks),
        attack_success_threshold=w.attack_success_threshold,
    )
    seed = pick(d.seed if graphable is None else graphable.seed)
    deploy = DeployContext(to_place=board.to_place, placed_on=pick(log.placed_on), seed=seed)
    scorer = StackerScorer(w, helper, deploy) if persona == "stacker" else BaseScorer(persona, w, helper, deploy)
    return Turn(board, helper, scorer, seed, hand)


def _move(kind: int, *fields: torch.Tensor, n: int, device) -> torch.Tensor:
    move = torch.zeros(n, 5, dtype=torch.int64, device=device)
    move[:, 0] = kind
    for k, f in enumerate(fields):
        move[:, k + 1] = f
    return move


def _in_gd_order(board: GDBoard, scores: torch.Tensor, candidates: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
    """`getChoice` over territories `[N, 42]` (in map order) visited in GD's order: the territory
    chosen and whether there is one."""
    order = board.board.gd_order
    column, found = get_choice(scores[:, order], candidates[:, order])
    return order[column], found


def _own_or_first(board: GDBoard, candidates: torch.Tensor) -> torch.Tensor:
    """Every territory `[N, 42]`, with those that aren't candidates replaced by a territory the
    seat owns, so the features are only ever worked out where GD would ask for them."""
    own = board.countries(board.active)
    first = own.to(torch.int64).argmax(1, keepdim=True)
    return torch.where(candidates, board.all_territories(), first)


def trading_now(d: "Decision", rows: torch.Tensor | None = None) -> torch.Tensor:
    """Whether GD trades at this reinforcement (a trade is due, or it may and hasn't yet)."""
    o, log, s = d.options, d.log, d.state
    pick = (lambda x: x) if rows is None else (lambda x: x[rows])  # noqa: E731
    hand_len = pick(s.hand_len).gather(1, pick(s.active).to(torch.int64)[:, None])[:, 0]
    return pick(o.must_trade) | (pick(o.sets).any(-1) & (hand_len >= 3) & (pick(log.traded) == 0))


def reinforce(d: "Decision", rows: torch.Tensor, persona: str) -> torch.Tensor:
    """`ClassicAIDeploy.ExecuteAction`: a trade when one is due, otherwise one chunk of armies."""
    trading = trading_now(d, rows)
    moves = torch.zeros(len(rows), 5, dtype=torch.int64, device=rows.device)
    if bool(trading.any()):
        moves[trading] = trade(turn_of(d, rows[trading], persona))
    if bool((~trading).any()):
        moves[~trading] = place(turn_of(d, rows[~trading], persona))
    return moves


def place(turn: Turn) -> torch.Tensor:
    board, scorer, seed = turn.board, turn.scorer, turn.seed
    n = board.batch
    to_place = board.to_place
    one = torch.ones_like(to_place)
    amounts, listed, variance = iterative_array(one, to_place)
    scores, draws = scorer.deploy_units_amount(amounts, listed)
    single = (to_place == 1)[:, None] & (amounts == 1)
    scores = torch.where(single, 1.0, scores)
    draws = torch.where(to_place == 1, 0, draws)
    column, found = get_choice(scores, listed)
    chosen = torch.where(found, amounts.gather(1, column[:, None])[:, 0], 0)
    amount, draws = apply_step_variance(chosen, one, to_place, variance, seed, draws)

    countries = board.countries(board.active)
    country, found = _in_gd_order(board, scorer.deploy_country(_own_or_first(board, countries), amount), countries)
    # None scores above 0: a random one of the seat's territories, in GD's order.
    in_order = countries[:, board.board.gd_order]
    pick = random_range(draw(seed, draws), 0, in_order.sum(1))
    nth = in_order & (in_order.cumsum(1) - 1 == pick[:, None])
    fallback = board.board.gd_order[nth.to(torch.int64).argmax(1)]
    return _move(PLACE, torch.where(found, country, fallback), amount, n=n, device=seed.device)


def trade(turn: Turn, check: bool = True) -> torch.Tensor:
    board = turn.board
    b = board.board
    territory = b.card_territory[turn.hand.clamp(min=0)]
    owned = (turn.hand >= 0) & (territory >= 0) & (board.owners.gather(1, territory.clamp(min=0)) == board.active[:, None])
    cards, has_set = best_card_match(turn.hand, owned, b)
    if check and not bool(has_set.all()):
        raise RuntimeError(f"GD's AI found no set in a hand: {turn.hand[~has_set][0].tolist()}")
    bonus = bonus_territory_of(cards, board.active, board.owners, b)
    return _move(TRADE, cards[:, 0], cards[:, 1], cards[:, 2], bonus, n=board.batch, device=cards.device)


def attack(turn: Turn) -> torch.Tensor:
    """`ClassicAIAttack.ExecuteAction`: the best source, then its best target, blitzed to the end;
    the attack ends when no source, or the source's best target, scores above 0."""
    board, scorer = turn.board, turn.scorer
    sources = board.countries(board.active, 2)
    source, has_source = _in_gd_order(board, scorer.attack_source(_own_or_first(board, sources)), sources)
    source = torch.where(has_source, source, _own_or_first(board, sources)[:, 0])
    targets, enemy = board.enemies(source)
    column, has_target = get_choice(scorer.attack_target(source, targets), enemy)
    target = targets.gather(1, column[:, None])[:, 0]
    blitz = _move(BLITZ, source, target, torch.ones_like(source), n=board.batch, device=source.device)
    end = _move(END_ATTACK, n=board.batch, device=source.device)
    return torch.where((has_source & has_target)[:, None], blitz, end)


def occupy(d: "Decision", rows: torch.Tensor | None, persona: str, graphable: Graphable | None = None) -> torch.Tensor:
    """The move-in after a capture, asked on the board as GD has it: every surviving attacker
    still in the source and none yet in the captured territory."""
    pick = (lambda x: x) if rows is None else (lambda x: x[rows])  # noqa: E731
    # Every game where `rows` is None: those with no move-in pending ask about territory 0.
    frm = pick(d.options.occ_from).clamp(min=0)
    to = pick(d.options.occ_to).clamp(min=0)
    armies = pick(d.state.armies).to(torch.int64, copy=True)
    u = armies.gather(1, frm[:, None]) + armies.gather(1, to[:, None])
    # Scattered, not assigned by index: assigning a number syncs with the host.
    armies.scatter_(1, frm[:, None], u)
    armies.scatter_(1, to[:, None], 0)
    u = u[:, 0]
    turn = turn_of(d, rows, persona, armies, graphable)
    low = torch.clamp(u - 1, max=3)
    high = torch.maximum(low, u - 1)
    amounts, listed, variance = iterative_array(low, high)
    column, found = get_choice(turn.scorer.attack_move_units_amount(low, high, frm, to, amounts), listed)
    chosen = torch.where(found, amounts.gather(1, column[:, None])[:, 0], 0)
    c, _ = apply_step_variance(chosen, low, high, variance, turn.seed, torch.zeros_like(low))
    return _move(OCCUPY, torch.where((c < low) | (c > high), high, c), n=armies.shape[0], device=armies.device)


def fortify(turn: Turn) -> torch.Tensor:
    """`AIFortify.ExecuteAction`: one move, from the best source to the best territory joined to
    it, or none when neither scores above 0."""
    board, scorer, seed = turn.board, turn.scorer, turn.seed
    n = board.batch
    countries = board.countries(board.active)
    c = _own_or_first(board, countries)
    links, valid = board.links(c)
    joined = (valid & (board.owner(links) == board.active[:, None, None])).any(-1)
    scores = torch.where((board.units(c) <= 1) | ~joined, 0.0, scorer.fortify_source(c))
    source, has_source = _in_gd_order(board, scores, countries)
    source = torch.where(has_source, source, c[:, 0])
    order, _ = board.connected(source[:, None])
    order = order[:, 0]
    candidates = order >= 0
    targets = torch.where(candidates, order, source[:, None])
    column, has_target = get_choice(scorer.fortify_target(source, targets), candidates)
    target = targets.gather(1, column[:, None])[:, 0]
    most = board.units(source) - 1
    one = torch.ones_like(most)
    amounts, listed, variance = iterative_array(one, torch.clamp(most, min=1))
    column, found = get_choice(scorer.fortify_move_units_amount(source, target, amounts), listed)
    chosen = torch.where(found, amounts.gather(1, column[:, None])[:, 0], 0)
    armies, _ = apply_step_variance(chosen, one, most, variance, seed, torch.zeros_like(most))
    march = _move(FORTIFY, source, target, armies, n=n, device=seed.device)
    return torch.where((has_source & has_target)[:, None], march, _move(END_TURN, n=n, device=seed.device))


def _play(d: "Decision", mask: torch.Tensor, persona: str, moves: torch.Tensor) -> None:
    kind = d.options.kind.to(torch.int64)
    for k in (KIND_REINFORCE, KIND_ATTACK, KIND_OCCUPY, KIND_FORTIFY):
        rows = (mask & (kind == k)).nonzero()[:, 0]
        if len(rows) == 0:
            continue
        if k == KIND_REINFORCE:
            moves[rows] = reinforce(d, rows, persona)
        elif k == KIND_OCCUPY:
            moves[rows] = occupy(d, rows, persona)
        elif k == KIND_ATTACK:
            moves[rows] = attack(turn_of(d, rows, persona))
        else:
            moves[rows] = fortify(turn_of(d, rows, persona))


def gd_bot(persona: str) -> "Bot":
    """GD-lite for one persona. Stacker plays as Aggressive for good once it has ended a turn
    holding more armies than every other seat together (`log.stacker_swapped`)."""
    assert persona in PERSONAS, persona

    def bot(d: "Decision", mask: torch.Tensor) -> torch.Tensor:
        moves = torch.zeros(d.state.batch, 5, dtype=torch.int64, device=d.state.device)
        if persona == "stacker":
            rows = torch.arange(d.state.batch, device=d.state.device)
            swapped = d.log.stacker_swapped[rows, d.state.active.to(torch.int64)]
            _play(d, mask & ~swapped, "stacker", moves)
            _play(d, mask & swapped, "aggressive", moves)
        else:
            _play(d, mask, persona, moves)
        return moves.to(torch.int32)

    return bot


GD_BOTS: dict[str, "Bot"] = {f"gd-{persona}": gd_bot(persona) for persona in PERSONAS}

GraphableBot = Callable[["Decision", torch.Tensor, torch.Tensor], torch.Tensor]


def _play_graphable(d: "Decision", persona: str, graphable: Graphable) -> torch.Tensor:
    """Every kind's move for every game, each game then taking its own kind's: no game is picked
    out on the host."""
    turn = turn_of(d, None, persona, graphable=graphable)
    reinforcing = torch.where(trading_now(d)[:, None], trade(turn, check=False), place(turn))
    kind = d.options.kind.to(torch.int64)[:, None]
    return torch.where(kind == KIND_REINFORCE, reinforcing,
                       torch.where(kind == KIND_ATTACK, attack(turn),
                                   torch.where(kind == KIND_OCCUPY, occupy(d, None, persona, graphable), fortify(turn))))


def gd_bot_graphable(persona: str, tables: BlitzTables) -> GraphableBot:
    """GD-lite for one persona with no host sync and no host-to-device copy, so a call can be
    captured in a CUDA graph: `bot(d, mask, seed)`, `seed [B]` int64 each game's stream for this
    decision on the device (the caller's; `Decision.seed` gives the exact one, hashed on the host).

    It plays every decision kind for every game and keeps each game's own, walks a fixed 42 steps
    where the eager bot stops at the longest walk, and reads the odds from `GraphableOdds`. Where
    every fight it weighs fits the table and the seed is the exact one, its move is the eager
    bot's; past the table the odds are approximate. Like the eager bot it reads `d.log` (a
    subset's `TurnLog.select`) and every row's move is worked out, the mask's or not."""
    assert persona in PERSONAS, persona
    required = {min(1.0, max(0.0, float(WEIGHTS[p].attack_success_threshold))) for p in PERSONAS}
    odds = GraphableOdds(tables, (FROUND_09, *sorted(required)))

    def bot(d: "Decision", mask: torch.Tensor, seed: torch.Tensor) -> torch.Tensor:
        assert d.tables is tables, "a graphable GD bot plays on the tables it was built for"
        graphable = Graphable(odds, seed)
        if persona != "stacker":
            return _play_graphable(d, persona, graphable).to(torch.int32)
        swapped = d.log.stacker_swapped.gather(1, d.state.active.to(torch.int64)[:, None])
        moves = torch.where(swapped, _play_graphable(d, "aggressive", graphable), _play_graphable(d, "stacker", graphable))
        return moves.to(torch.int32)

    return bot

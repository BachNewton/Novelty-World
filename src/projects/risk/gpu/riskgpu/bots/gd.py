"""GD-lite: GD's Expert AI (`bots/gd/bot.ts`) for one persona, batched over the games in the mask
(`ideas/gpu-engine.md`, "The bots on the GPU"). Each decision is one step of GD's phase loops: a
source, then a target, then an amount, each the persona's top score, the first on a tie in GD's
own orders, the odds from the engine's tables, the draws from the decision's own stream in the
TypeScript's order. Labelled approximate: the TypeScript's scores are matched operation for
operation, so only a choice the two would make differently in the last bit can differ.

Each phase runs on the games in it alone, as its own batch (`Turn`): the board as GD reads it, the
helper over it and the persona's scorer.
"""

from dataclasses import dataclass
from typing import TYPE_CHECKING

import torch

from ..engine import BLITZ, END_ATTACK, END_TURN, FORTIFY, OCCUPY, PLACE, TRADE
from ..options import KIND_ATTACK, KIND_FORTIFY, KIND_OCCUPY, KIND_REINFORCE
from ..state import HAND_MAX
from .gd_board import GDBoard
from .gd_cards import best_card_match, bonus_territory_of
from .gd_choice import apply_step_variance, draw, get_choice, iterative_array, random_range
from .gd_helper import Helper
from .gd_odds import odds_for
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


def turn_of(d: "Decision", rows: torch.Tensor, persona: str, armies: torch.Tensor | None = None) -> Turn:
    """`turnOf` for the games `rows`, on the board `armies` where given (the move-in's)."""
    s, log = d.state, d.log
    active = s.active[rows].to(torch.int64)
    slots = torch.arange(HAND_MAX, device=s.device)[None, :]
    hand_len = s.hand_len[rows].to(torch.int64)
    hand = torch.where(slots < hand_len.gather(1, active[:, None]), s.hand[rows, active].to(torch.int64), -1)
    board = GDBoard(
        d.board, owner=s.owner[rows], armies=s.armies[rows] if armies is None else armies, active=active,
        to_place=s.reinf_to_place[rows], hand_len=hand_len, eliminated=s.eliminated[rows],
        turn_order=s.turn_order[rows], players=s.players[rows], first_round=s.round[rows] == 0,
    )
    w = WEIGHTS[persona]
    helper = Helper(
        board, odds_for(d.tables), hand=hand, humans=d.humans[rows], conquered_this_turn=log.captured[rows],
        attacks_this_turn=log.attacks[rows], attack_success_threshold=w.attack_success_threshold,
    )
    seed = d.seed[rows]
    deploy = DeployContext(to_place=board.to_place, placed_on=log.placed_on[rows], seed=seed)
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


def reinforce(d: "Decision", rows: torch.Tensor, persona: str) -> torch.Tensor:
    """`ClassicAIDeploy.ExecuteAction`: a trade when one is due, otherwise one chunk of armies."""
    o, log = d.options, d.log
    hand_len = (d.state.hand_len[rows].gather(1, d.state.active[rows].to(torch.int64)[:, None]))[:, 0]
    trading = o.must_trade[rows] | (o.sets[rows].any(-1) & (hand_len >= 3) & (log.traded[rows] == 0))
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


def trade(turn: Turn) -> torch.Tensor:
    board = turn.board
    b = board.board
    territory = b.card_territory[turn.hand.clamp(min=0)]
    owned = (turn.hand >= 0) & (territory >= 0) & (board.owners.gather(1, territory.clamp(min=0)) == board.active[:, None])
    cards, has_set = best_card_match(turn.hand, owned, b)
    if not bool(has_set.all()):
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


def occupy(d: "Decision", rows: torch.Tensor, persona: str) -> torch.Tensor:
    """The move-in after a capture, asked on the board as GD has it: every surviving attacker
    still in the source and none yet in the captured territory."""
    frm = d.options.occ_from[rows]
    to = d.options.occ_to[rows]
    armies = d.state.armies[rows].to(torch.int64)
    n = torch.arange(len(rows), device=rows.device)
    u = armies[n, frm] + armies[n, to]
    armies[n, frm] = u
    armies[n, to] = 0
    turn = turn_of(d, rows, persona, armies)
    low = torch.clamp(u - 1, max=3)
    high = torch.maximum(low, u - 1)
    amounts, listed, variance = iterative_array(low, high)
    column, found = get_choice(turn.scorer.attack_move_units_amount(low, high, frm, to, amounts), listed)
    chosen = torch.where(found, amounts.gather(1, column[:, None])[:, 0], 0)
    c, _ = apply_step_variance(chosen, low, high, variance, turn.seed, torch.zeros_like(low))
    return _move(OCCUPY, torch.where((c < low) | (c > high), high, c), n=len(rows), device=rows.device)


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

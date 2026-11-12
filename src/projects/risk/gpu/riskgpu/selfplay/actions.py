"""The network bot's action space (`ideas/gpu-engine.md`, phase 3): a decision is a **main** choice
(which move, where) from one flat categorical masked by the options, then, for the moves that
carry an amount, an **amount** bucket from a second categorical conditioned on the main choice.

| Main | Move | Amount buckets |
|---|---|---|
| `PLACE + t` | place on territory t | all the armies to place, half (rounded up), one |
| `TRADE` | trade a set | none: the set and its bonus territory by a fixed rule (`trade_rule`) |
| `ATTACK + e` | attack along canonical edge e | blitz keeping 1, blitz keeping half the source, one battle with the most dice |
| `END_ATTACK` | end the attack phase | none |
| `OCCUPY + a` | move in after a capture | none (the main choice is the amount: the minimum, half way, the maximum) |
| `FORTIFY + 42i + j` | fortify from i to j | all that may move, half (rounded up) |
| `END_TURN` | end the turn without fortifying | none |

Buckets instead of exact counts keep the space fixed; every bucket is legal whenever its main
choice is. A trade's set is the most valuable one, then the one spending fewest wilds, then the
first in `setsIn`'s order; its bonus territory is the first qualifying card's (the engine's own
choice when only one qualifies), as greedy names it.

**The exact space** sits beside the buckets, chosen by the network (`Net(actions="exact")`; a
checkpoint's space is read from its tensors). The main choices are the same list with the move-in
one choice (`OCCUPY` alone; `OCCUPY + 1` and `+ 2` are never legal), and the amount is an
**argument**: one of `SLOTS` candidates, each a whole move, scored by one head from the chosen
territories' tokens and the candidate's own features (`Candidates`):

| Main | Candidates |
|---|---|
| `PLACE + t` | place exactly n, 1 ≤ n ≤ the armies to place |
| `TRADE` | each legal set with each territory that may take its bonus (one entry where the engine chooses) |
| `ATTACK + e` | slot 0 one battle with the most dice; the rest a blitz keeping exactly k, 1 ≤ k ≤ source − 1 |
| `OCCUPY` | move in exactly n, the minimum to the maximum |
| `FORTIFY + 42i + j` | move exactly n, 1 to all that may move |
| the others | one, the move itself |

The slots are fixed, so a step's shapes are too. A range wider than its slots (`spread`) keeps a
quarter of them on each end, every count there, the two halves (moving half of all is a common
choice) and the rest evenly between; a trade with more choices than slots keeps the first. Either
is `overflow`, counted wherever it happens. The teacher's moves set `SLOTS` (`imitate.py measure`):
at 48, a range outgrows them on 4% of its blitzes and 6% of its fortifies, and the candidates still
express all but 0.1% of its blitzes and none fewer of the other kinds.
"""

from dataclasses import dataclass

import torch

from ..board import MAX_SEATS, TERRITORIES, Board
from ..bots.greedy import first_max, first_true
from ..engine import ATTACK as K_ATTACK
from ..engine import BLITZ as K_BLITZ
from ..engine import END_ATTACK as K_END_ATTACK
from ..engine import END_TURN as K_END_TURN
from ..engine import FORTIFY as K_FORTIFY
from ..engine import OCCUPY as K_OCCUPY
from ..engine import PLACE as K_PLACE
from ..engine import TRADE as K_TRADE
from ..options import KIND_ATTACK, KIND_FORTIFY, KIND_OCCUPY, Options, on_device, set_value
from ..state import State

EDGES = 166
PAIRS = TERRITORIES * TERRITORIES
AMOUNTS = 3

PLACE = 0
TRADE = PLACE + TERRITORIES  # 42
ATTACK = TRADE + 1  # 43
END_ATTACK = ATTACK + EDGES  # 209
OCCUPY = END_ATTACK + 1  # 210
FORTIFY = OCCUPY + 3  # 213
END_TURN = FORTIFY + PAIRS  # 1977
MAIN = END_TURN + 1  # 1978

# The exact space's move-in is one main choice: its amount is the argument.
EXACT_MAIN = torch.ones(MAIN, dtype=torch.bool)
EXACT_MAIN[OCCUPY + 1:OCCUPY + 3] = False

# What an amount means, by the main choice's group.
NO_AMOUNT, PLACE_AMOUNT, ATTACK_AMOUNT, FORTIFY_AMOUNT = 0, 1, 2, 3


def _legal_main(o: Options) -> torch.Tensor:
    batch = o.kind.shape[0]
    kind = o.kind.to(torch.int64)
    place = o.may_place[:, None] & o.own & (o.to_place > 0)[:, None]
    trade = (o.may_trade & o.sets.any(-1))[:, None]
    attack = o.attack_dice > 0
    end_attack = (kind == KIND_ATTACK)[:, None]
    occupy = (kind == KIND_OCCUPY)[:, None].expand(batch, 3)
    fortify = (o.fortify_max > 0).reshape(batch, PAIRS)
    end_turn = (kind == KIND_FORTIFY)[:, None]
    return torch.cat([place, trade, attack, end_attack, occupy, fortify, end_turn], 1)


def legal_main(o: Options, exact: bool = False) -> torch.Tensor:
    """`[B, MAIN]` bool: the main choices the options allow, in the bucket space or the exact one."""
    legal = _legal_main(o)
    if exact:
        legal = legal & on_device("exact_main", EXACT_MAIN, legal.device)
    return legal


def amount_group(main: torch.Tensor) -> torch.Tensor:
    """Each main choice's amount group (`NO_AMOUNT` … `FORTIFY_AMOUNT`)."""
    group = torch.full_like(main, NO_AMOUNT)
    group = torch.where(main < TRADE, PLACE_AMOUNT, group)
    group = torch.where((main >= ATTACK) & (main < END_ATTACK), ATTACK_AMOUNT, group)
    group = torch.where((main >= FORTIFY) & (main < END_TURN), FORTIFY_AMOUNT, group)
    return group


def legal_amount(group: torch.Tensor) -> torch.Tensor:
    """`[B, 3]` bool: the buckets a group has (bucket 0 alone stands for "no amount")."""
    k = torch.arange(AMOUNTS, device=group.device)[None, :]
    count = torch.where(group == NO_AMOUNT, 1, torch.where(group == FORTIFY_AMOUNT, 2, 3))
    return k < count[:, None]


def trade_rule(s: State, o: Options, board: Board) -> torch.Tensor:
    """The trade move `[B, 5]` the `TRADE` choice plays (meaningful only where a set exists)."""
    cards = o.set_cards.clamp(min=0)
    wilds = (board.card_symbol[cards] < 0).sum(-1)
    score = (set_value(cards, board) * 8 - wilds).to(torch.float32)
    pick, _ = first_max(score, o.sets)
    rows = torch.arange(s.batch, device=s.device)
    chosen = o.set_cards[rows, pick]  # [B, 3]
    active = s.active.to(torch.int64)
    own = s.owner.to(torch.int64) == active[:, None]
    choices = (chosen >= 0) & (chosen < TERRITORIES) & own.gather(1, chosen.clamp(0, TERRITORIES - 1))
    first_choice = chosen.gather(1, first_true(choices)[:, None])[:, 0]
    bonus = torch.where(choices.sum(-1) > 1, first_choice, -1)
    kind = torch.full_like(active, K_TRADE)
    return torch.stack([kind, chosen[:, 0], chosen[:, 1], chosen[:, 2], bonus], 1)


def decode(main: torch.Tensor, amount: torch.Tensor, s: State, o: Options, board: Board,
           trade: torch.Tensor | None = None) -> torch.Tensor:
    """The engine move `[B, 5]` int64 for each row's choice. `trade` may pass `trade_rule`'s move
    when the caller computes it only where it is needed."""
    a = main.to(torch.int64)
    k = amount.to(torch.int64)
    zero = torch.zeros_like(a)
    rows = torch.arange(a.shape[0], device=a.device)

    def move(kind, x=zero, y=zero, z=zero, w=zero) -> torch.Tensor:
        return torch.stack([torch.full_like(a, kind), x, y, z, w], 1)

    to_place = o.to_place.to(torch.int64)
    place_n = torch.where(k == 0, to_place, torch.where(k == 1, (to_place + 1) // 2, 1)).clamp(min=1)
    place = move(K_PLACE, a.clamp(0, TERRITORIES - 1), place_n)
    if trade is None:
        trade = trade_rule(s, o, board)
    edge = (a - ATTACK).clamp(0, EDGES - 1)
    frm, to = board.edges[edge, 0], board.edges[edge, 1]
    source = s.armies.to(torch.int64)[rows, frm]
    keep = torch.where(k == 0, 1, (source // 2).clamp(min=1))
    dice = o.attack_dice[rows, edge].to(torch.int64)
    attack = torch.where((k == 2)[:, None], move(K_ATTACK, frm, to, dice), move(K_BLITZ, frm, to, keep))
    lo, hi = o.occ_min.to(torch.int64), o.occ_max.to(torch.int64)
    m = (a - OCCUPY).clamp(0, 2)
    occupy = move(K_OCCUPY, torch.where(m == 0, lo, torch.where(m == 1, torch.maximum(lo, (lo + hi + 1) // 2), hi)))
    pair = (a - FORTIFY).clamp(0, PAIRS - 1)
    most = o.fortify_max.reshape(-1, PAIRS)[rows, pair].to(torch.int64)
    fortify = move(K_FORTIFY, pair // TERRITORIES, pair % TERRITORIES,
                   torch.where(k == 1, (most + 1) // 2, most).clamp(min=1))

    out = move(K_END_TURN)
    out = torch.where((a < END_TURN)[:, None], fortify, out)
    out = torch.where((a < FORTIFY)[:, None], occupy, out)
    out = torch.where((a < OCCUPY)[:, None], move(K_END_ATTACK), out)
    out = torch.where((a < END_ATTACK)[:, None], attack, out)
    out = torch.where((a < ATTACK)[:, None], trade, out)
    out = torch.where((a < TRADE)[:, None], place, out)
    return out


# --- the exact space -------------------------------------------------------------------------

SLOTS = 48
TOKEN_GLOBAL = TERRITORIES + MAX_SEATS  # the global token, the last of the network's 49
# What a candidate is (its features' one-hot, C_NONE without one): none, place, battle, blitz,
# move-in, fortify, trade.
C_NONE, C_PLACE, C_BATTLE, C_BLITZ, C_OCCUPY, C_FORTIFY, C_TRADE = range(7)
FEATURES = 6 + 9 + 7  # the kind, the count, the trade


@dataclass
class Candidates:
    """The arguments one main choice per row offers, `SLOTS` of them."""

    kind: torch.Tensor  # [B, K] int64, C_*
    number: torch.Tensor  # [B, K] int64: armies placed, dice, armies kept back, moved in or fortified
    legal: torch.Tensor  # [B, K] bool
    lo: torch.Tensor  # [B] int64: the count's legal range (a trade's: 1 to its number of choices)
    hi: torch.Tensor  # [B] int64
    overflow: torch.Tensor  # [B] bool: more legal choices than slots
    context: torch.Tensor  # [B, 2] int64: the tokens the argument is read from
    token: torch.Tensor  # [B, K] int64: a candidate's own territory token (a trade's bonus), else the global one
    has_token: torch.Tensor  # [B, K] bool
    cards: torch.Tensor  # [B, K, 3] int64: a trade's cards
    bonus: torch.Tensor  # [B, K] int64: a trade's named bonus territory, −1 where the engine chooses
    features: torch.Tensor  # [B, K, FEATURES] float32


def spread(lo: torch.Tensor, hi: torch.Tensor, slots: int) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """`(values [B, slots], legal [B, slots], overflow [B])`: every count from `lo` to `hi` while
    they fit, in order; past that, the `slots // 4` lowest and highest counts, the two counts either
    side of the middle (half of all, rounded down and up, when the range starts at 1), and the rest
    evenly between, so both ends and the halves are always there."""
    i = torch.arange(slots, device=lo.device)[None, :]
    width = (hi - lo + 1).clamp(min=0)[:, None]
    end = slots // 4
    below = (slots - 2 * end) // 2  # slots from `end` up to the lower half-count
    above = slots - 2 * end - below  # slots from the upper half-count up to the high end's
    wide = width > slots
    half = width // 2
    low_half = end + (i - end) * (half - 1 - end).clamp(min=0) // (below - 1)
    high_half = half + (i - end - below) * (width - end - 1 - half).clamp(min=0) // (above - 1)
    between = torch.where(i < end + below, low_half, high_half)
    offset = torch.where(i < end, i, torch.where(i >= slots - end, width - (slots - i), between))
    offset = torch.where(wide, offset, i)
    return lo[:, None] + offset, wide | (i < width), wide[:, 0]


def _trade_choices(s: State, o: Options):
    """Every legal set with each territory that may take its bonus (one entry where the engine
    chooses), the first `SLOTS` of them in `setsIn`'s order: `(cards [B, K, 3], bonus [B, K],
    gets [B, K] the territory the +2 goes to or −1, legal [B, K], count [B])`."""
    batch, sets = o.set_cards.shape[:2]
    device = o.set_cards.device
    cards = o.set_cards
    c = cards.clamp(min=0)
    owner = s.owner.to(torch.int64).gather(1, c.clamp(max=TERRITORIES - 1).reshape(batch, -1)).reshape(batch, sets, 3)
    qualifies = (cards >= 0) & (c < TERRITORIES) & (owner == s.active.to(torch.int64)[:, None, None])
    named = qualifies.sum(-1, keepdim=True) >= 2
    j = torch.arange(3, device=device)[None, None, :]
    ok = (o.sets[:, :, None] & torch.where(named, qualifies, j == 0)).reshape(batch, -1)
    only = c.gather(2, qualifies.to(torch.int64).argmax(2, keepdim=True))
    gets = torch.where(named, c, torch.where(qualifies.any(-1, keepdim=True), only, -1)).reshape(batch, -1)
    bonus = torch.where(named, c, -1).reshape(batch, -1)
    count = ok.sum(1)
    position = ok.cumsum(1) - 1
    slot = torch.where(ok & (position < SLOTS), position, SLOTS)
    choice = torch.zeros(batch, SLOTS + 1, dtype=torch.int64, device=device)
    choice.scatter_(1, slot, torch.arange(ok.shape[1], device=device)[None, :].expand(batch, -1))
    choice = choice[:, :SLOTS]
    legal = torch.arange(SLOTS, device=device)[None, :] < count[:, None]
    chosen = c.gather(1, (choice // 3)[:, :, None].expand(-1, -1, 3))
    return (torch.where(legal[:, :, None], chosen, 0), torch.where(legal, bonus.gather(1, choice), -1),
            torch.where(legal, gets.gather(1, choice), -1), legal, count)


def candidates(main: torch.Tensor, s: State, o: Options, board: Board) -> Candidates:
    """The arguments each row's main choice offers (`Candidates`)."""
    a = main.to(torch.int64)
    batch, device = a.shape[0], a.device
    rows = torch.arange(batch, device=device)
    i = torch.arange(SLOTS, device=device)[None, :]
    one = torch.ones_like(a)
    group = torch.where(a < TRADE, C_PLACE, torch.where(a == TRADE, C_TRADE, torch.where(a < END_ATTACK, C_BLITZ,
                        torch.where(a == END_ATTACK, C_NONE, torch.where(a < FORTIFY, C_OCCUPY,
                                    torch.where(a < END_TURN, C_FORTIFY, C_NONE))))))
    t = a.clamp(0, TERRITORIES - 1)
    edge = (a - ATTACK).clamp(0, EDGES - 1)
    frm, to = board.edges[edge, 0], board.edges[edge, 1]
    pair = (a - FORTIFY).clamp(0, PAIRS - 1)
    f_from, f_to = pair // TERRITORIES, pair % TERRITORIES
    source = s.armies.to(torch.int64)[rows, frm]
    dice = o.attack_dice[rows, edge].to(torch.int64)
    blitz = group == C_BLITZ
    trading = group == C_TRADE
    none = group == C_NONE

    lo = torch.where(group == C_OCCUPY, o.occ_min.to(torch.int64), one)
    hi = torch.where(group == C_PLACE, o.to_place.to(torch.int64),
                     torch.where(blitz, source - 1,
                                 torch.where(group == C_OCCUPY, o.occ_max.to(torch.int64),
                                             torch.where(group == C_FORTIFY,
                                                         o.fortify_max.reshape(batch, PAIRS)[rows, pair].to(torch.int64), one))))
    # A blitz's keep-backs take the slots after the battle's.
    keep, keep_legal, keep_overflow = spread(lo, hi, SLOTS - 1)
    count, count_legal, count_overflow = spread(lo, hi, SLOTS)
    number = torch.where(blitz[:, None], torch.cat([dice[:, None], keep], 1), count)
    legal = torch.where(blitz[:, None], torch.cat([dice[:, None] > 0, keep_legal], 1), count_legal)
    overflow = torch.where(blitz, keep_overflow, count_overflow)
    kind = torch.where(blitz[:, None] & (i == 0), C_BATTLE, group[:, None].expand(-1, SLOTS))

    cards, bonus, gets, trade_legal, choices = _trade_choices(s, o)
    legal = torch.where(trading[:, None], trade_legal, torch.where(none[:, None], i == 0, legal))
    number = torch.where((trading | none)[:, None], 0, number)
    lo = torch.where(trading | none, one, lo)
    hi = torch.where(trading, choices, torch.where(none, one, hi))
    overflow = torch.where(trading, choices > SLOTS, overflow & ~none)

    def context(place_side, blitz_side, occupy_side, fortify_side):
        return torch.where(group == C_PLACE, t, torch.where(blitz, blitz_side, torch.where(
            group == C_OCCUPY, occupy_side.clamp(min=0), torch.where(group == C_FORTIFY, fortify_side, TOKEN_GLOBAL))))

    has_token = trading[:, None] & (gets >= 0)
    token = torch.where(has_token, gets, TOKEN_GLOBAL)

    f32 = torch.float32
    n = number.to(f32)
    low, high = lo.to(f32)[:, None], hi.to(f32)[:, None]
    counted = ((kind == C_PLACE) | (kind == C_BLITZ) | (kind == C_OCCUPY) | (kind == C_FORTIFY)).to(f32)
    above, below = (n - low).clamp(min=0), (high - n).clamp(min=0)
    count_features = torch.stack([
        n / 20, below / 20, torch.log1p(n) / 4, torch.log1p(above) / 4, torch.log1p(below) / 4,
        above / (high - low).clamp(min=1), (number == lo[:, None]).to(f32), (number == hi[:, None]).to(f32),
        (torch.log1p(high - low + 1) / 4).expand(-1, SLOTS),
    ], 2) * counted[:, :, None]
    battle = torch.zeros_like(count_features)
    battle[..., 0] = n / 3
    count_features = torch.where((kind == C_BATTLE)[..., None], battle, count_features)
    symbol = board.card_symbol[cards]
    owner = s.owner.to(torch.int64).gather(1, cards.clamp(max=TERRITORIES - 1).reshape(batch, -1)).reshape(batch, SLOTS, 3)
    owned = (cards < TERRITORIES) & (owner == s.active.to(torch.int64)[:, None, None])
    trade_features = torch.stack([
        set_value(cards, board).to(f32) / 10, (gets >= 0).to(f32), (symbol < 0).sum(-1).to(f32) / 3,
        *[(symbol == k).sum(-1).to(f32) / 3 for k in range(3)], owned.sum(-1).to(f32) / 3,
    ], 2) * (trading[:, None] & trade_legal).to(f32)[:, :, None]
    kind_features = torch.nn.functional.one_hot(kind, 7)[:, :, 1:].to(f32)
    features = torch.cat([kind_features, count_features, trade_features], 2)
    assert features.shape[2] == FEATURES, features.shape
    return Candidates(kind=kind, number=number, legal=legal, lo=lo, hi=hi, overflow=overflow,
                      context=torch.stack([context(t, frm, o.occ_from, f_from), context(t, to, o.occ_to, f_to)], 1),
                      token=token, has_token=has_token, cards=cards, bonus=bonus, features=features)


def candidate_moves(main: torch.Tensor, c: Candidates, board: Board) -> torch.Tensor:
    """`[B, K, 5]` int64: the engine move each candidate plays."""
    a = main.to(torch.int64)[:, None].expand(-1, SLOTS)
    n = c.number
    zero = torch.zeros_like(n)

    def move(kind, x=zero, y=zero, z=zero, w=zero) -> torch.Tensor:
        return torch.stack([torch.full_like(n, kind), x, y, z, w], 2)

    edge = (a - ATTACK).clamp(0, EDGES - 1)
    frm, to = board.edges[edge, 0], board.edges[edge, 1]
    pair = (a - FORTIFY).clamp(0, PAIRS - 1)
    out = move(K_END_TURN)
    out = torch.where((a == END_ATTACK)[..., None], move(K_END_ATTACK), out)
    out = torch.where((c.kind == C_FORTIFY)[..., None], move(K_FORTIFY, pair // TERRITORIES, pair % TERRITORIES, n), out)
    out = torch.where((c.kind == C_OCCUPY)[..., None], move(K_OCCUPY, n), out)
    out = torch.where((c.kind == C_BLITZ)[..., None], move(K_BLITZ, frm, to, n), out)
    out = torch.where((c.kind == C_BATTLE)[..., None], move(K_ATTACK, frm, to, n), out)
    out = torch.where((c.kind == C_TRADE)[..., None], move(K_TRADE, c.cards[..., 0], c.cards[..., 1], c.cards[..., 2], c.bonus), out)
    out = torch.where((c.kind == C_PLACE)[..., None], move(K_PLACE, a.clamp(0, TERRITORIES - 1), n), out)
    return out


def decode_exact(main: torch.Tensor, slot: torch.Tensor, s: State, o: Options, board: Board,
                 c: Candidates | None = None) -> torch.Tensor:
    """The engine move `[B, 5]` int64 for each row's main choice and argument slot."""
    if c is None:
        c = candidates(main, s, o, board)
    moves = candidate_moves(main, c, board)
    return moves.gather(1, slot.to(torch.int64)[:, None, None].expand(-1, 1, 5))[:, 0]

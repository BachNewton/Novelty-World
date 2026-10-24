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
"""

import torch

from ..board import TERRITORIES, Board
from ..bots.greedy import first_max, first_true
from ..engine import ATTACK as K_ATTACK
from ..engine import BLITZ as K_BLITZ
from ..engine import END_ATTACK as K_END_ATTACK
from ..engine import END_TURN as K_END_TURN
from ..engine import FORTIFY as K_FORTIFY
from ..engine import OCCUPY as K_OCCUPY
from ..engine import PLACE as K_PLACE
from ..engine import TRADE as K_TRADE
from ..options import KIND_ATTACK, KIND_FORTIFY, KIND_OCCUPY, Options, set_value
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

# What an amount means, by the main choice's group.
NO_AMOUNT, PLACE_AMOUNT, ATTACK_AMOUNT, FORTIFY_AMOUNT = 0, 1, 2, 3


def legal_main(o: Options) -> torch.Tensor:
    """`[B, MAIN]` bool: the main choices the options allow."""
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

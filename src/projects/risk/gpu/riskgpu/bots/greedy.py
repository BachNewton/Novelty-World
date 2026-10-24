"""`greedy`, an exact port of `bots/greedy.ts`: the same move as the TypeScript bot in every
position (`ideas/gpu-engine.md`, "The bots on the GPU").

Exactness rests on two things. Every score is an integer plus `4 * share` in float64, summed in
the TypeScript's order. Every choice is `best`'s first maximum (a strict `>`) in the order the
TypeScript lists the candidates: territories in map order, attacks in the canonical edge order,
sets in `setsIn`'s order, a trade's bonus territory in hand order, and fortifying moves by source
in map order, then destination in `fortifyDestinations`' depth-first order. A first maximum is
taken as the lowest index among the maxima, never from `argmax`'s order.
"""

from typing import TYPE_CHECKING

import torch

from ..board import TERRITORIES, Board
from ..engine import BLITZ, END_ATTACK, END_TURN, FORTIFY, OCCUPY, PLACE, TRADE
from ..options import KIND_ATTACK, KIND_FORTIFY, KIND_OCCUPY, KIND_REINFORCE

if TYPE_CHECKING:
    from ..runner import Decision

_NONE = 1 << 30


def first_max(score: torch.Tensor, allowed: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
    """The lowest index of each row's highest `score [B, N]` among the `allowed`, and whether the
    row allows any (index 0 where none)."""
    top = torch.where(allowed, score, -torch.inf).max(-1, keepdim=True).values
    index = torch.arange(score.shape[-1], device=score.device)
    at = torch.where(allowed & (score == top), index, _NONE).min(-1).values
    found = allowed.any(-1)
    return torch.where(found, at, 0), found


def first_true(allowed: torch.Tensor) -> torch.Tensor:
    """The lowest true index of each row (0 where none)."""
    index = torch.arange(allowed.shape[-1], device=allowed.device)
    at = torch.where(allowed, index, _NONE).min(-1).values
    return torch.where(at == _NONE, 0, at)


def dfs_order(own: torch.Tensor, start: torch.Tensor, live: torch.Tensor, board: Board) -> torch.Tensor:
    """`fortifyDestinations(start)`'s order, `[B, 42]` int64: each own territory's position in the
    list (the order the walk first reaches it), `_NONE` for the rest and for `start` itself. The
    walk pops the stack's last entry and pushes each own, unreached neighbour in `ADJACENCY`
    order, as `engine/legal.ts` does; only the games in `live` walk."""
    batch = own.shape[0]
    rows = torch.arange(batch, device=own.device)
    reached = torch.zeros_like(own)
    reached[rows, start] = live
    order = torch.full((batch, TERRITORIES), _NONE, dtype=torch.int64, device=own.device)
    stack = torch.zeros(batch, TERRITORIES + 1, dtype=torch.int64, device=own.device)
    stack[:, 0] = start
    depth = live.to(torch.int64)
    count = torch.zeros(batch, dtype=torch.int64, device=own.device)
    # Each territory is pushed at most once, so at most 42 pops.
    for _ in range(TERRITORIES):
        popping = depth > 0
        if not bool(popping.any()):
            break
        depth = depth - popping.to(torch.int64)
        at = stack[rows, depth]
        for slot in range(board.adjacent.shape[1]):
            n = board.adjacent[at, slot]
            nc = n.clamp(min=0)
            push = popping & (n >= 0) & own[rows, nc] & ~reached[rows, nc]
            reached[rows, nc] |= push
            order[rows, nc] = torch.where(push, count, order[rows, nc])
            count = count + push.to(torch.int64)
            stack[rows, depth] = torch.where(push, nc, stack[rows, depth])
            depth = depth + push.to(torch.int64)
    return order


def dfs_order_graphable(own: torch.Tensor, start: torch.Tensor, live: torch.Tensor, board: Board) -> torch.Tensor:
    """`dfs_order` with no host sync, for a step captured as a CUDA graph: always 42 pops, and each
    pop pushes its neighbours at once rather than one by one. That is the same walk, because a
    territory's neighbours are distinct, so pushing one never changes whether the next is pushed;
    they land on the stack in `ADJACENCY` order, so the last is popped first, as before. Entries
    that don't push write to a spare column past the board."""
    batch = own.shape[0]
    device = own.device
    rows = torch.arange(batch, device=device)
    spare = TERRITORIES
    reached = torch.zeros(batch, TERRITORIES + 1, dtype=torch.bool, device=device)
    reached[rows, start] = live
    order = torch.full((batch, TERRITORIES + 1), _NONE, dtype=torch.int64, device=device)
    stack = torch.zeros(batch, TERRITORIES + 2, dtype=torch.int64, device=device)
    stack[:, 0] = start
    depth = live.to(torch.int64)
    count = torch.zeros(batch, dtype=torch.int64, device=device)
    for _ in range(TERRITORIES):
        popping = depth > 0
        depth = depth - popping.to(torch.int64)
        at = stack.gather(1, depth[:, None])[:, 0]
        n = board.adjacent[at]  # [B, 6]
        nc = n.clamp(min=0)
        push = popping[:, None] & (n >= 0) & own.gather(1, nc) & ~reached.gather(1, nc)
        rank = push.cumsum(1) - 1
        target = torch.where(push, nc, spare)
        reached.scatter_(1, target, push)
        order.scatter_(1, target, torch.where(push, count[:, None] + rank, _NONE))
        stack.scatter_(1, torch.where(push, depth[:, None] + rank, TERRITORIES + 1), nc)
        pushed = push.sum(1)
        count = count + pushed
        depth = depth + pushed
    return order[:, :TERRITORIES]


def greedy_bot(d: "Decision", mask: torch.Tensor, *, graphable: bool = False) -> torch.Tensor:
    """`graphable` takes no host sync (every game walks the fortify order, whether it needs it or
    not), so the bot can be captured in a CUDA graph; the moves are the same."""
    s, o, board = d.state, d.options, d.board
    batch, device = s.batch, s.device
    rows = torch.arange(batch, device=device)
    active = s.active.to(torch.int64)
    own = s.owner.to(torch.int64) == active[:, None]
    armies = s.armies.to(torch.int64)
    enemy_border = board.adjacency[None] & ~own[:, None, :]  # [B, t, n]: n borders t and isn't ours
    has_enemy = enemy_border.any(-1)  # `enemyNeighbours(t).length > 0`

    # `continentShares`: held / size, in float64.
    held = (own[:, None, :] & board.continent_members[None]).sum(-1).to(torch.float64)
    size = board.continent_members.sum(-1).to(torch.float64)
    share = (held / size[None])[:, board.continent_of]  # [B, 42], each territory's continent's share

    def move(kind, x=0, y=0, z=0, w=0) -> torch.Tensor:
        fields = [v if isinstance(v, torch.Tensor) else torch.full((batch,), v, dtype=torch.int64, device=device)
                  for v in (kind, x, y, z, w)]
        fields = [v.to(torch.int64).expand(batch) for v in fields]
        return torch.stack(fields, 1)

    # reinforce: the first set, else everything on `stackTerritory`.
    trading = o.sets.any(-1)
    cards = o.set_cards[rows, first_true(o.sets)]  # [B, 3], in hand order
    choices = (cards >= 0) & (cards < TERRITORIES) & own.gather(1, cards.clamp(0, TERRITORIES - 1))
    first_choice = cards.gather(1, first_true(choices)[:, None])[:, 0]
    bonus = torch.where(choices.sum(-1) > 1, first_choice, -1)
    trade = move(TRADE, cards[:, 0], cards[:, 1], cards[:, 2], bonus)
    weakest = torch.where(enemy_border, armies[:, None, :], _NONE).min(-1).values
    stack_score = (armies - weakest).to(torch.float64) + 4 * share
    front, any_front = first_max(stack_score, own & has_enemy)
    target = torch.where(any_front, front, first_true(own))
    place = move(PLACE, target, o.to_place)
    reinforce = torch.where(trading[:, None], trade, place)

    # attack: blitz the best edge where the attacker has 2 more armies, else end the phase.
    frm, to = board.edges[:, 0], board.edges[:, 1]
    gap = armies[:, frm] - armies[:, to]
    worth = (o.attack_dice > 0) & (gap >= 2)
    edge, found = first_max(gap.to(torch.float64) + 4 * share[:, to], worth)
    attack = torch.where(found[:, None], move(BLITZ, frm[edge], to[edge], 1), move(END_ATTACK))

    # occupy: everything, unless the territory left behind faces an enemy: then half of what can.
    lo, hi = o.occ_min.to(torch.int64), o.occ_max.to(torch.int64)
    exposed = has_enemy[rows, o.occ_from.clamp(min=0)]
    occupy = move(OCCUPY, torch.where(exposed, torch.maximum(lo, (lo + hi + 1) // 2), hi))

    # fortify: the most armies from a territory facing no enemy to one that does. The score is the
    # source's, so the first maximum is the first such source in map order, then its first such
    # destination in depth-first order.
    most = o.fortify_max.to(torch.int64)
    idle = (most > 0) & ~has_enemy[:, :, None] & has_enemy[:, None, :]
    source_ok = idle.any(-1)
    source, found = first_max((armies - 1).to(torch.float64), source_ok)
    fortify = move(END_TURN)
    walking = mask & found & (o.kind.to(torch.int64) == KIND_FORTIFY)
    if graphable or bool(walking.any()):
        order = (dfs_order_graphable if graphable else dfs_order)(own, source, walking, board)
        destination = torch.where(idle[rows, source], order, _NONE).min(-1).indices
        marched = move(FORTIFY, source, destination, most[rows, source, destination])
        fortify = torch.where(walking[:, None], marched, fortify)

    kind = o.kind.to(torch.int64)[:, None]
    return torch.where(kind == KIND_REINFORCE, reinforce, torch.where(kind == KIND_ATTACK, attack,
                       torch.where(kind == KIND_OCCUPY, occupy, fortify))).to(torch.int32)

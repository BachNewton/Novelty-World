"""`random`: a random legal move, the fuzzer for the reverse replay (`ideas/gpu-engine.md`, "The
bots on the GPU"). Not the TypeScript `random` bot: its moves depend on list orders with no rules
meaning, and an exact port would buy nothing. This one spreads its moves over every kind (a trade
when a set is offered half the time, or always when one must be made; a battle, a blitz or the
attack's end; any legal move-in; a fortify or the turn's end) and draws each from the options'
masks, so every move it makes must be legal.

Its draws come from a torch Generator seeded from the batch's position (the masked games' random
streams and decision counts), so the same seeds play the same games on the same device.
"""

from typing import TYPE_CHECKING

import torch

from ..board import TERRITORIES
from ..engine import ATTACK, BLITZ, END_ATTACK, END_TURN, FORTIFY, OCCUPY, PLACE, TRADE
from ..options import KIND_ATTACK, KIND_OCCUPY, KIND_REINFORCE

if TYPE_CHECKING:
    from ..runner import Decision


def random_bot(d: "Decision", mask: torch.Tensor) -> torch.Tensor:
    s, o, board = d.state, d.options, d.board
    batch, device = s.batch, s.device
    rows = torch.arange(batch, device=device)
    g = torch.Generator(device=device)
    g.manual_seed(int((torch.where(mask, s.rng, 0) * 7919 + torch.where(mask, d.decision, 0)).sum()))

    def uniform(*shape: int) -> torch.Tensor:
        return torch.rand(*shape, generator=g, dtype=torch.float64, device=device)

    def pick(allowed: torch.Tensor) -> torch.Tensor:
        """A uniformly random true index of each row of `allowed [B, N]` (0 where none is)."""
        return torch.where(allowed, uniform(*allowed.shape), -1.0).argmax(-1)

    def between(low: torch.Tensor, high: torch.Tensor) -> torch.Tensor:
        low, high = low.to(torch.int64), high.to(torch.int64)
        return low + torch.floor(uniform(batch) * (high - low + 1).clamp(min=1)).to(torch.int64)

    def move(kind, x=0, y=0, z=0, w=0) -> torch.Tensor:
        fields = [torch.as_tensor(v, dtype=torch.int64, device=device).expand(batch) for v in (kind, x, y, z, w)]
        return torch.stack(fields, 1)

    one = torch.ones(batch, dtype=torch.int64, device=device)

    # reinforce
    trading = o.sets.any(-1) & (o.must_trade | (uniform(batch) < 0.5))
    cards = o.set_cards[rows, pick(o.sets)]  # [B, 3]
    choices = (cards >= 0) & (cards < TERRITORIES) & o.bonus.gather(1, cards.clamp(0, TERRITORIES - 1))
    named = cards.gather(1, pick(choices)[:, None])[:, 0]
    bonus = torch.where(choices.sum(-1) > 1, named, -1)
    trade = move(TRADE, cards[:, 0], cards[:, 1], cards[:, 2], bonus)
    place = move(PLACE, pick(o.own), between(one, o.to_place))
    reinforce = torch.where(trading[:, None], trade, place)

    # attack
    edge = pick(o.attack_dice > 0)
    frm, to = board.edges[edge, 0], board.edges[edge, 1]
    dice = between(one, o.attack_dice[rows, edge])
    keep = between(one, s.armies[rows, frm] - 1)
    choice = uniform(batch) * 3
    attack = torch.where((choice < 1)[:, None], move(END_ATTACK),
                         torch.where((choice < 2)[:, None], move(ATTACK, frm, to, dice), move(BLITZ, frm, to, keep)))

    # occupy
    occupy = move(OCCUPY, between(o.occ_min, o.occ_max))

    # fortify
    most = o.fortify_max.reshape(batch, -1)
    pair = pick(most > 0)
    fortifying = (uniform(batch) < 0.5) & (most > 0).any(-1)
    marched = move(FORTIFY, pair // TERRITORIES, pair % TERRITORIES, between(one, most[rows, pair]))
    fortify = torch.where(fortifying[:, None], marched, move(END_TURN))

    kind = o.kind.to(torch.int64)[:, None]
    return torch.where(kind == KIND_REINFORCE, reinforce, torch.where(kind == KIND_ATTACK, attack,
                       torch.where(kind == KIND_OCCUPY, occupy, fortify))).to(torch.int32)


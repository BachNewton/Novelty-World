"""The policy and value network: a transformer over the board's tokens.

**Tokens.** One per territory (42), one per seat slot (6, slot 0 the seat deciding) and one global
(the phase, the options, the own hand): 49 tokens of width `width`, each embedded from its features
plus a learned identity (which territory, which slot). Attention is the map: every layer adds a
learned bias per head to the attention between two territories that share a border, so a layer
can be local (message passing along the borders) or global (a stack across the world) as it learns.
Pre-norm blocks of attention and a ReLU feed-forward, `layers` deep.

**Heads.** A place logit per territory token; an attack logit per border, the dot product of the
source's and the target's projections; a fortify logit per pair of territories, the same over every
pair; the phase's other choices (trade, end the attack, the three move-in amounts, end the turn)
from the global token. The amount of a place, attack or fortify is a second, small head read from
the chosen territories' tokens, so it is conditioned on where. The value is a vector over the slots
(each slot's expected final score, read from its slot token) and the auxiliary head each slot's
board share some steps on.

Only operations the TypeScript export (`bots/net-v1/`) can run in a fixed order: linear layers,
layer norm, softmax attention, ReLU.
"""

import math

import torch
from torch import nn
from torch.nn import functional as F

from ..board import MAX_SEATS, TERRITORIES
from .actions import (AMOUNTS, ATTACK_AMOUNT, EDGES, FORTIFY, FORTIFY_AMOUNT, MAIN, PAIRS, PLACE_AMOUNT, ATTACK,
                      amount_group, legal_amount)
from .obs import GLOBAL, NODE, SLOT

TOKENS = TERRITORIES + MAX_SEATS + 1
KEY = 64  # width of the attack and fortify projections


class Block(nn.Module):
    def __init__(self, width: int, heads: int, ff: int):
        super().__init__()
        self.heads = heads
        self.ln1 = nn.LayerNorm(width)
        self.qkv = nn.Linear(width, 3 * width)
        self.out = nn.Linear(width, width)
        self.ln2 = nn.LayerNorm(width)
        self.ff1 = nn.Linear(width, ff)
        self.ff2 = nn.Linear(ff, width)
        self.border = nn.Parameter(torch.zeros(heads))

    def forward(self, x: torch.Tensor, adjacency: torch.Tensor) -> torch.Tensor:
        b, n, w = x.shape
        q, k, v = self.qkv(self.ln1(x)).view(b, n, 3, self.heads, w // self.heads).permute(2, 0, 3, 1, 4)
        bias = (self.border[:, None, None] * adjacency[None]).to(q.dtype)[None]
        a = F.scaled_dot_product_attention(q, k, v, attn_mask=bias)
        x = x + self.out(a.transpose(1, 2).reshape(b, n, w))
        return x + self.ff2(torch.relu(self.ff1(self.ln2(x))))


class Net(nn.Module):
    def __init__(self, width: int = 128, layers: int = 4, heads: int = 8, ff_mult: int = 4,
                 edges: torch.Tensor | None = None, adjacency: torch.Tensor | None = None):
        super().__init__()
        self.width, self.layers, self.heads, self.ff_mult = width, layers, heads, ff_mult
        self.node_in = nn.Linear(NODE, width)
        self.slot_in = nn.Linear(SLOT, width)
        self.glob_in = nn.Linear(GLOBAL, width)
        self.identity = nn.Parameter(torch.randn(TOKENS, width) * 0.02)
        self.blocks = nn.ModuleList(Block(width, heads, ff_mult * width) for _ in range(layers))
        self.ln = nn.LayerNorm(width)
        self.place = nn.Linear(width, 1)
        self.glob_out = nn.Linear(width, 6)  # trade, end attack, occupy × 3, end turn
        self.attack_src = nn.Linear(width, KEY)
        self.attack_dst = nn.Linear(width, KEY)
        self.edge_bias = nn.Parameter(torch.zeros(EDGES))
        self.fortify_src = nn.Linear(width, KEY)
        self.fortify_dst = nn.Linear(width, KEY)
        self.place_amount = nn.Linear(width, AMOUNTS)
        self.attack_amount = nn.Linear(2 * width, AMOUNTS)
        self.fortify_amount = nn.Linear(2 * width, AMOUNTS)
        self.value = nn.Linear(width, 1)
        self.aux = nn.Linear(width, 1)
        if edges is None:
            edges = torch.zeros(EDGES, 2, dtype=torch.int64)
        full = torch.zeros(TOKENS, TOKENS)
        if adjacency is not None:
            full[:TERRITORIES, :TERRITORIES] = adjacency.float().cpu()
        self.register_buffer("edges", edges.clone(), persistent=False)
        self.register_buffer("adjacency", full.to(edges.device), persistent=False)

    def config(self) -> dict:
        return {"width": self.width, "layers": self.layers, "heads": self.heads, "ff_mult": self.ff_mult}

    def trunk(self, node: torch.Tensor, slot: torch.Tensor, glob: torch.Tensor) -> torch.Tensor:
        """`[B, 49, width]`: territories, then slots, then the global token, after the last norm."""
        x = torch.cat([self.node_in(node), self.slot_in(slot), self.glob_in(glob)[:, None]], 1) + self.identity
        for block in self.blocks:
            x = block(x, self.adjacency)
        return self.ln(x)

    def heads_main(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """`(main logits [B, MAIN] float32, value [B, 6], aux [B, 6])`, logits unmasked."""
        terr = x[:, :TERRITORIES]
        g = self.glob_out(x[:, -1]).float()
        place = self.place(terr)[..., 0].float()
        src, dst = self.attack_src(terr), self.attack_dst(terr)
        edge = (src[:, self.edges[:, 0]] * dst[:, self.edges[:, 1]]).sum(-1).float() / math.sqrt(KEY) + self.edge_bias
        fs, fd = self.fortify_src(terr), self.fortify_dst(terr)
        pair = torch.bmm(fs, fd.transpose(1, 2)).reshape(-1, PAIRS).float() / math.sqrt(KEY)
        logits = torch.cat([place, g[:, :1], edge, g[:, 1:2], g[:, 2:5], pair, g[:, 5:6]], 1)
        slots = x[:, TERRITORIES:TERRITORIES + MAX_SEATS]
        return logits, self.value(slots)[..., 0].float(), self.aux(slots)[..., 0].float()

    def amount_logits(self, x: torch.Tensor, main: torch.Tensor) -> torch.Tensor:
        """`[B, 3]` float32: the amount's logits for each row's main choice (zeros where it has no
        amount)."""
        rows = torch.arange(x.shape[0], device=x.device)
        terr = x[:, :TERRITORIES]
        group = amount_group(main)
        t = main.clamp(0, TERRITORIES - 1)
        edge = (main - ATTACK).clamp(0, EDGES - 1)
        pair = (main - FORTIFY).clamp(0, PAIRS - 1)
        a_src, a_dst = self.edges[edge, 0], self.edges[edge, 1]
        f_src, f_dst = pair // TERRITORIES, pair % TERRITORIES
        place = self.place_amount(terr[rows, t])
        attack = self.attack_amount(torch.cat([terr[rows, a_src], terr[rows, a_dst]], 1))
        fortify = self.fortify_amount(torch.cat([terr[rows, f_src], terr[rows, f_dst]], 1))
        out = torch.zeros_like(place)
        out = torch.where((group == PLACE_AMOUNT)[:, None], place, out)
        out = torch.where((group == ATTACK_AMOUNT)[:, None], attack, out)
        out = torch.where((group == FORTIFY_AMOUNT)[:, None], fortify, out)
        return out.float()


NEG = torch.finfo(torch.float32).min


def masked(logits: torch.Tensor, legal: torch.Tensor) -> torch.Tensor:
    return torch.where(legal, logits, NEG)


def choose(z: torch.Tensor, greedy: bool) -> torch.Tensor:
    if greedy:
        return z.argmax(1)
    # Gumbel-max through exponential races: argmax z - log E, E ~ Exp(1).
    return (z - torch.empty_like(z).exponential_().log()).argmax(1)


def act(net: Net, node, slot, glob, legal: torch.Tensor, greedy: bool = False):
    """Samples a decision: `(main, amount, logp, value [B, 6])`."""
    x = net.trunk(node, slot, glob)
    logits, value, _ = net.heads_main(x)
    z = masked(logits, legal)
    main = choose(z, greedy)
    logp = z.gather(1, main[:, None])[:, 0] - torch.logsumexp(z, 1)
    za = masked(net.amount_logits(x, main), legal_amount(amount_group(main)))
    amount = choose(za, greedy)
    logp = logp + za.gather(1, amount[:, None])[:, 0] - torch.logsumexp(za, 1)
    return main, amount, logp, value


def evaluate(net: Net, node, slot, glob, legal: torch.Tensor, main: torch.Tensor, amount: torch.Tensor):
    """For training: `(logp, entropy, value [B, 6], aux [B, 6])` of given decisions."""
    x = net.trunk(node, slot, glob)
    logits, value, aux = net.heads_main(x)
    z = masked(logits, legal)
    lp = torch.log_softmax(z, 1)
    logp = lp.gather(1, main[:, None])[:, 0]
    entropy = -torch.where(legal, lp.exp() * lp, 0.0).sum(1)
    amount_legal = legal_amount(amount_group(main))
    la = torch.log_softmax(masked(net.amount_logits(x, main), amount_legal), 1)
    logp = logp + la.gather(1, amount[:, None])[:, 0]
    entropy = entropy - torch.where(amount_legal, la.exp() * la, 0.0).sum(1)
    return logp, entropy, value, aux

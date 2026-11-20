"""The policy and value network (`selfplay/net.py`) in JAX, for training on a TPU.

**The same network, parameter for parameter.** Its parameters are a flat dict keyed by the PyTorch
state dict's names, each array in PyTorch's layout (a linear layer's weight `[out, in]`), so a
checkpoint converts both ways by name alone (`convert.py`) and nothing here decides a shape of its
own: every size (`width`, `layers`, `heads`, `ff_mult`, the action space, the clock) is read from the
parameters, as `net.shape_of` reads it. The constants (the choices' offsets, the widths of the
heads) are `net.py`'s and `actions.py`'s own.

**Its precision is autocast's.** In bf16 the linear layers and attention compute in bfloat16 from
float32 parameters, the norms in float32, the residual stream in float32 (PyTorch's sum of a bfloat16
layer and a float32 parameter), and the logits are read out in float32; in f32 every matmul runs at
the highest precision (a TPU's default float32 matmul is itself taken in bfloat16 passes).

**What it computes is what training reads**: the main choice's logits masked by the legal choices,
the value per slot, and the amount's logits for one given main choice per row: a bucket net's
amount head at that choice, or an exact net's argument head over that choice's candidates, given as
the inputs `net.amount_choice` would build them (`prepare.py` builds them on the host with the
PyTorch code). Training needs the amount only at the target's main choice, and a move can agree
with the target only where its main choice does (`prepare.py`), so that is all it is asked for.
"""

import math

import jax
import jax.numpy as jnp
import numpy as np
from jax import lax

from ..board import MAX_SEATS, TERRITORIES
from ..selfplay.actions import ATTACK, EDGES, END_ATTACK, END_TURN, FORTIFY, MAIN, PAIRS, TRADE
from ..selfplay.net import KEY, TOKENS

NEG = float(np.finfo(np.float32).min)
f32, bf16 = jnp.float32, jnp.bfloat16


def constants(edges: np.ndarray, adjacency: np.ndarray) -> dict:
    """The board as the network reads it: the canonical borders `[EDGES, 2]` and the tokens' border
    matrix `[TOKENS, TOKENS]` (the territories' block, zeros elsewhere), as `Net` registers them."""
    full = np.zeros((TOKENS, TOKENS), np.float32)
    full[:TERRITORIES, :TERRITORIES] = np.asarray(adjacency, np.float32)
    edges = np.asarray(edges, np.int32)
    assert edges.shape == (EDGES, 2), edges.shape
    return {"edges": edges, "adjacency": full}


def unpack_legal(packed: jnp.ndarray) -> jnp.ndarray:
    """`[B, MAIN]` bool from the legal choices packed eight to a byte, little-endian bit order."""
    return jnp.unpackbits(packed, axis=1, bitorder="little")[:, :MAIN].astype(bool)


class Forward:
    """`Forward(consts, dtype)(params, batch)`: the network's training readout (module doc)."""

    def __init__(self, consts: dict, dtype=bf16):
        self.edges = consts["edges"]
        self.adjacency = consts["adjacency"]
        self.dt = dtype
        # A TPU takes a float32 matmul in bfloat16 passes unless told otherwise.
        self.precision = lax.Precision.HIGHEST if dtype == f32 else None

    def lin(self, p: dict, name: str, x: jnp.ndarray) -> jnp.ndarray:
        w, b = p[f"{name}.weight"].astype(self.dt), p[f"{name}.bias"].astype(self.dt)
        return jnp.matmul(x.astype(self.dt), w.T, precision=self.precision) + b

    @staticmethod
    def norm(p: dict, name: str, x: jnp.ndarray) -> jnp.ndarray:
        x = x.astype(f32)
        mean = x.mean(-1, keepdims=True)
        var = ((x - mean) ** 2).mean(-1, keepdims=True)
        return (x - mean) * lax.rsqrt(var + 1e-5) * p[f"{name}.weight"] + p[f"{name}.bias"]

    def block(self, p: dict, i: int, heads: int, x: jnp.ndarray) -> jnp.ndarray:
        b, n, w = x.shape
        d = w // heads
        pre = f"blocks.{i}"
        qkv = self.lin(p, f"{pre}.qkv", self.norm(p, f"{pre}.ln1", x)).reshape(b, n, 3, heads, d)
        q, k, v = qkv[:, :, 0], qkv[:, :, 1], qkv[:, :, 2]
        bias = (p[f"{pre}.border"][:, None, None] * self.adjacency[None]).astype(self.dt).astype(f32)
        scores = jnp.einsum("bqhd,bkhd->bhqk", q, k, precision=self.precision,
                            preferred_element_type=f32) / math.sqrt(d) + bias[None]
        attn = jax.nn.softmax(scores, -1).astype(self.dt)
        a = jnp.einsum("bhqk,bkhd->bqhd", attn, v, precision=self.precision).reshape(b, n, w)
        x = x + self.lin(p, f"{pre}.out", a).astype(f32)
        h = jax.nn.relu(self.lin(p, f"{pre}.ff1", self.norm(p, f"{pre}.ln2", x)))
        return x + self.lin(p, f"{pre}.ff2", h).astype(f32)

    def trunk(self, p: dict, node, slot, glob) -> jnp.ndarray:
        """`[B, 49, width]` float32: territories, then slots, then the global token, after the last norm."""
        heads = p["blocks.0.border"].shape[0]
        layers = len({k.split(".")[1] for k in p if k.startswith("blocks.")})
        x = jnp.concatenate([self.lin(p, "node_in", node), self.lin(p, "slot_in", slot),
                             self.lin(p, "glob_in", glob)[:, None]], 1).astype(f32) + p["identity"]
        for i in range(layers):
            x = self.block(p, i, heads, x)
        return self.norm(p, "ln", x)

    def heads_main(self, p: dict, x: jnp.ndarray):
        """`(main logits [B, MAIN], value [B, 6])`, float32, the logits unmasked."""
        terr = x[:, :TERRITORIES]
        g = self.lin(p, "glob_out", x[:, -1]).astype(f32)
        place = self.lin(p, "place", terr)[..., 0].astype(f32)
        src, dst = self.lin(p, "attack_src", terr), self.lin(p, "attack_dst", terr)
        e = self.edges
        edge = jnp.einsum("bek,bek->be", src[:, e[:, 0]], dst[:, e[:, 1]], precision=self.precision,
                          preferred_element_type=f32) / math.sqrt(KEY) + p["edge_bias"]
        fs, fd = self.lin(p, "fortify_src", terr), self.lin(p, "fortify_dst", terr)
        pair = jnp.einsum("bik,bjk->bij", fs, fd, precision=self.precision,
                          preferred_element_type=f32).reshape(-1, PAIRS) / math.sqrt(KEY)
        logits = jnp.concatenate([place, g[:, :1], edge, g[:, 1:2], g[:, 2:5], pair, g[:, 5:6]], 1)
        slots = x[:, TERRITORIES:TERRITORIES + MAX_SEATS]
        return logits, self.lin(p, "value", slots)[..., 0].astype(f32)

    def amount_buckets(self, p: dict, x: jnp.ndarray, main: jnp.ndarray) -> jnp.ndarray:
        """`[B, 3]` float32: the bucket amount's logits at each row's main choice (`Net.amount_logits`)."""
        terr = x[:, :TERRITORIES]

        def token(i):
            return jnp.take_along_axis(terr, i[:, None, None], 1)[:, 0]
        t = jnp.clip(main, 0, TERRITORIES - 1)
        edge = jnp.clip(main - ATTACK, 0, EDGES - 1)
        pair = jnp.clip(main - FORTIFY, 0, PAIRS - 1)
        e = jnp.asarray(self.edges)
        place = self.lin(p, "place_amount", token(t))
        attack = self.lin(p, "attack_amount", jnp.concatenate([token(e[edge, 0]), token(e[edge, 1])], 1))
        fortify = self.lin(p, "fortify_amount", jnp.concatenate([token(pair // TERRITORIES), token(pair % TERRITORIES)], 1))
        out = jnp.where((main < TRADE)[:, None], place, 0)
        out = jnp.where(((main >= ATTACK) & (main < END_ATTACK))[:, None], attack, out)
        out = jnp.where(((main >= FORTIFY) & (main < END_TURN))[:, None], fortify, out)
        return out.astype(f32)

    def amount_exact(self, p: dict, x: jnp.ndarray, batch: dict) -> jnp.ndarray:
        """`[B, SLOTS]` float32: the argument head over the given candidates (`Net.arg_logits`)."""
        def tokens(i):
            return jnp.take_along_axis(x, i.astype(jnp.int32)[:, :, None], 1)
        context = tokens(batch["context"])
        ctx = self.lin(p, "arg_ctx", jnp.concatenate([context[:, 0], context[:, 1], x[:, -1]], 1))
        has = batch["has_token"][:, :, None].astype(self.dt)
        h = ctx[:, None] + self.lin(p, "arg_cand", batch["features"]) + self.lin(p, "arg_tok", tokens(batch["token"])) * has
        h = jax.nn.relu(self.lin(p, "arg_hidden", jax.nn.relu(h)))
        return self.lin(p, "arg_out", h)[..., 0].astype(f32)

    def __call__(self, p: dict, batch: dict):
        """`(main logits masked [B, MAIN], amount logits masked [B, K], value [B, 6])`, float32, the
        amount at each row's `main`."""
        x = self.trunk(p, batch["node"], batch["slot"], batch["glob"])
        logits, value = self.heads_main(p, x)
        main = batch["main"].astype(jnp.int32)
        za = self.amount_exact(p, x, batch) if "arg_out.weight" in p else self.amount_buckets(p, x, main)
        legal = batch["legal"] if batch["legal"].dtype == bool else unpack_legal(batch["legal"])
        return (jnp.where(legal, logits, NEG), jnp.where(batch["amount_legal"], za, NEG), value)

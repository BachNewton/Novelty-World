"""What an accelerator does with the learned bot's two workloads, in JAX, as one JSON document:

    python bench.py --require tpu --out bench.json [--smoke] [--sizes 128x4,256x6] [--hours 2.5]

Self-contained: JAX and NumPy only, nothing from this package or PyTorch, so it runs in Kaggle's TPU
image as shipped (`launch.py` in this folder pushes it there) and anywhere else JAX installs.

**The network** is `selfplay/net.py`'s transformer re-expressed in JAX: 49 tokens (42 territories, 6
seat slots, a global token), pre-norm blocks of 8-head attention with a learned bias per head on
the borders, a ReLU feed-forward 4 times as wide, and the same heads (a place logit per territory,
an attack logit per border, a fortify logit per pair, the global choices, the bucket amount heads,
the value and the auxiliary). Weights and inputs are random, of the real shapes: this measures
compute, not learning. Its training step is a masked cross-entropy on the main choice and the
amount, a squared error on the value and the auxiliary, and an Adam update, with float32 master
weights; inference is the forward pass and a masked argmax, as a search spends its time. Each runs
in bfloat16 (float32 weights, bfloat16 compute, the norms and logits in float32, as PyTorch's
autocast does) and in float32 at the highest matmul precision (a TPU's default float32 matmul is
itself taken in bfloat16 passes, so "float32" there means the full-precision recipe a T4 runs).

**The engine kernel** is not the engine but a faithful proxy of what one batched step does, to learn
whether integer, gather and scatter work is slow on the device: state of the real shapes (42
territories' owner and armies, 6 seats' hands of 12, a deck of 44), and per step three random draws
per game, a legality mask from the borders (an integer matmul over the 42x42 border matrix and a
gather of neighbours), a blitz read from tables the size of `blitz-256` by gather (the cell's
offsets, then up to 256 running totals compared with the draw, as `tables.py` reads them), and the
results written back by scatter and `where`: losses, a capture, a card drawn and traded, the
reinforcements from a territory count and an integer matmul over the continents, the turn passing.
Sixty-four steps run under `jit` in one `lax.scan`. Its variants price 64-bit work:
`u32` draws from mulberry32 in native unsigned 32-bit arithmetic (the reference stream's own
generator, counter plus hash) with float32 draws and tables; `i64` draws from the same generator
written as `rng.py` writes it, in int64 with a 16-bit split multiply, the rest unchanged; `i64-f64`
also keeps the draws and the tables in float64, as an exact port of the GPU engine would. The 64-bit
variants run in a process of their own with `jax_enable_x64`, so nothing of theirs leaks into the
32-bit measurements.

**Every number is a rate on a dedicated accelerator, for a ratio, never an absolute claim**: compare
it with this same script's rate on another device (a T4 under JAX-CUDA, a CPU), never with a rate
from another program. Each measurement compiles ahead of time (its compile time reported apart),
runs `WARMUP` untimed iterations and one more to size the run, then times at least `--seconds` of
steady-state iterations (at least `MIN_ITERS`), the count reported with it. Each runs on one chip
and on every chip (the batch per chip the same, so the session's rate is the per-chip rate times
the chips when it scales); the work XLA counts (`flops`) is reported where it says. A batch that
doesn't fit is reported as out of memory, and larger ones of that kind are skipped. A run that
finds no device of the kind `--require` names fails before measuring anything.
"""

import argparse
import contextlib
import json
import math
import os
import platform
import subprocess
import sys
import time

WARMUP = 2
MIN_ITERS = 3
MAX_ITERS = 2000
HEADS = 8
FF_MULT = 4
KEY = 64
TERRITORIES, SEATS, TOKENS = 42, 6, 49
NODE, SLOT, GLOBAL = 13, 7, 28
EDGES = 166
PAIRS = TERRITORIES * TERRITORIES
ATTACK, END_ATTACK, FORTIFY, END_TURN = 43, 209, 213, 1977
MAIN = 1978
AMOUNTS = 3
HAND_MAX, CARDS = 12, 44
CONTINENT_SIZES = (9, 4, 7, 6, 12, 4)
CONTINENT_BONUS = (5, 2, 5, 3, 7, 2)
MAX_NEIGHBOURS = 6
VARIANTS = ("u32", "i64", "i64-f64")
X64_VARIANTS = ("i64", "i64-f64")
PLATFORMS = {"tpu": "tpu", "gpu": "gpu", "cpu": "cpu"}
SMOKE = {"sizes": "32x2", "train_batches": "8,16", "infer_batches": "16", "engine_batches": "64,128",
         "steps": 4, "bound": 16, "seconds": 0.2}


def ints(text: str) -> list[int]:
    out = [int(x) for x in text.split(",") if x]
    assert out and all(x > 0 for x in out), f"a list of positive integers: {text!r}"
    return out


def sizes(text: str) -> list[tuple[int, int]]:
    out = []
    for word in text.split(","):
        width, _, layers = word.partition("x")
        assert width.isdigit() and layers.isdigit(), f"a size is <width>x<layers>: {word!r}"
        assert int(width) % HEADS == 0, f"{word}: the width splits over {HEADS} heads"
        out.append((int(width), int(layers)))
    return out


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--require", choices=sorted(PLATFORMS), required=True,
                   help="the device kind to measure; finding any other fails the run")
    p.add_argument("--out", required=True, help="the JSON document, rewritten after every measurement")
    p.add_argument("--smoke", action="store_true", help="tiny sizes, to check the script, not the device")
    p.add_argument("--sizes", default="128x4,256x6,384x8,512x12")
    p.add_argument("--train-batches", default="1024,4096,16384", help="per chip, smallest first")
    p.add_argument("--infer-batches", default="4096,16384,65536", help="per chip, smallest first")
    p.add_argument("--precisions", default="bf16,f32")
    p.add_argument("--engine-batches", default="16384,65536", help="games per chip")
    p.add_argument("--variants", default=",".join(VARIANTS))
    p.add_argument("--steps", type=int, default=64, help="engine steps in one scan")
    p.add_argument("--bound", type=int, default=256, help="the blitz tables' bound")
    p.add_argument("--seconds", type=float, default=3.0, help="steady-state seconds a measurement runs, at least")
    p.add_argument("--hours", type=float, default=None, help="no measurement starts after this; the rest are listed as skipped")
    p.add_argument("--phase", choices=("x32", "x64"), default=None, help=argparse.SUPPRESS)
    p.add_argument("--deadline", type=float, default=None, help=argparse.SUPPRESS)
    return p


def settings(argv: list[str]) -> argparse.Namespace:
    args = parser().parse_args(argv)
    if args.smoke:
        for k, v in SMOKE.items():
            setattr(args, k, v)
    args.size_list = sizes(args.sizes)
    args.train_list = ints(args.train_batches)
    args.infer_list = ints(args.infer_batches)
    args.engine_list = ints(args.engine_batches)
    args.precision_list = args.precisions.split(",")
    assert set(args.precision_list) <= {"bf16", "f32"}, args.precisions
    args.variant_list = args.variants.split(",")
    assert set(args.variant_list) <= set(VARIANTS), f"variants are {VARIANTS}: {args.variants}"
    assert args.steps > 0 and args.bound > 1 and args.seconds > 0
    return args


def write(path: str, doc: dict) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(doc, f, indent=1)
    os.replace(tmp, path)


# ---------------------------------------------------------------- the parent: one process per phase


def orchestrate(argv: list[str], args: argparse.Namespace) -> int:
    """Runs the 32-bit phase and, if any 64-bit variant is asked for, the 64-bit one, each in its own
    process (a TPU is held by one process at a time, so they run one after the other), and merges
    their documents."""
    start = time.time()
    deadline = start + args.hours * 3600 if args.hours else None
    phases = ["x32"] + (["x64"] if set(args.variant_list) & set(X64_VARIANTS) else [])
    base = args.out[:-5] if args.out.endswith(".json") else args.out
    docs = {}
    for phase in phases:
        out = f"{base}.{phase}.json"
        cmd = [sys.executable, os.path.abspath(__file__), *argv, "--phase", phase, "--out", out]
        if deadline:
            cmd += ["--deadline", str(deadline)]
        env = {**os.environ, "JAX_ENABLE_X64": "1" if phase == "x64" else "0"}
        print(f"phase {phase}: {' '.join(cmd[1:])}", flush=True)
        done = subprocess.run(cmd, env=env)
        if os.path.exists(out):
            with open(out) as f:
                docs[phase] = json.load(f)
        if done.returncode != 0:
            write(args.out, merged(docs, start, failed=phase))
            raise SystemExit(f"phase {phase} failed (exit {done.returncode}); what it measured is in {args.out}")
    doc = merged(docs, start)
    write(args.out, doc)
    print(json.dumps(doc, indent=1), flush=True)
    return 0


def merged(docs: dict, start: float, failed: str | None = None) -> dict:
    first = next(iter(docs.values()), {})
    for phase, d in docs.items():
        assert d["hardware"] == first["hardware"], f"phase {phase} found other hardware: {d['hardware']}"
    return {
        "what": "risk learned-bot workloads in JAX: the network's training and inference, an engine-shaped kernel",
        "read_as": "rates on a dedicated accelerator, for ratios against this same script on another device; "
                   "never absolute claims",
        "hardware": first.get("hardware"),
        "software": {p: d["software"] for p, d in docs.items()},
        "config": first.get("config"),
        "net": [r for d in docs.values() for r in d["net"]],
        "engine": [r for d in docs.values() for r in d["engine"]],
        "skipped": [r for d in docs.values() for r in d["skipped"]],
        "failed_phase": failed,
        "wall_seconds": round(time.time() - start, 1),
    }


# ---------------------------------------------------------------- a phase: the measurements


def run_phase(args: argparse.Namespace) -> int:
    import jax
    import jax.numpy as jnp
    import numpy as np
    from jax import lax
    from jax.sharding import Mesh, NamedSharding
    from jax.sharding import PartitionSpec as P

    x64 = bool(jax.config.jax_enable_x64)
    assert x64 == (args.phase == "x64"), f"phase {args.phase} runs with jax_enable_x64={x64}"
    devices = jax.devices()
    found = devices[0].platform
    if found != PLATFORMS[args.require]:
        raise SystemExit(f"--require {args.require}, but JAX found {found}: {devices}")
    f32, bf16, i32 = jnp.float32, jnp.bfloat16, jnp.int32

    doc = {"hardware": hardware(jax, devices), "software": software(jax, np, x64), "config": config(args),
           "net": [], "engine": [], "skipped": []}
    write(args.out, doc)
    chip_sets = [("one", devices[:1])] + ([("all", devices)] if len(devices) > 1 else [])

    def late() -> bool:
        return args.deadline is not None and time.time() > args.deadline

    # ------------------------------------------------------------ the board, made up but of the real shape
    graph = np.random.default_rng(0)
    adjacency = np.zeros((TERRITORIES, TERRITORIES), np.int32)
    for t in range(TERRITORIES):
        adjacency[t, (t + 1) % TERRITORIES] = adjacency[(t + 1) % TERRITORIES, t] = 1
    while adjacency.sum() < EDGES:
        a, b = graph.integers(0, TERRITORIES, 2)
        if a != b and not adjacency[a, b] and adjacency[a].sum() < MAX_NEIGHBOURS and adjacency[b].sum() < MAX_NEIGHBOURS:
            adjacency[a, b] = adjacency[b, a] = 1
    edges = np.argwhere(adjacency).astype(np.int32)
    assert edges.shape == (EDGES, 2)
    adjacent = np.full((TERRITORIES, MAX_NEIGHBOURS), -1, np.int32)
    for t in range(TERRITORIES):
        n = np.flatnonzero(adjacency[t])
        adjacent[t, :len(n)] = n
    members = np.zeros((len(CONTINENT_SIZES), TERRITORIES), np.int32)
    at = 0
    for c, size in enumerate(CONTINENT_SIZES):
        members[c, at:at + size] = 1
        at += size
    full_adjacency = np.zeros((TOKENS, TOKENS), np.float32)
    full_adjacency[:TERRITORIES, :TERRITORIES] = adjacency

    # ------------------------------------------------------------ measuring
    def is_oom(e: Exception) -> bool:
        text = str(e)
        return "RESOURCE_EXHAUSTED" in text or "out of memory" in text.lower()

    def flops(compiled) -> float | None:
        cost = compiled.cost_analysis()
        if isinstance(cost, list):
            cost = cost[0] if cost else None
        return float(cost["flops"]) if cost and "flops" in cost else None

    def steady(call) -> tuple[int, float]:
        """`call()` runs one iteration and returns what to wait on."""
        for _ in range(WARMUP):
            jax.block_until_ready(call())
        t = time.perf_counter()
        jax.block_until_ready(call())
        one = time.perf_counter() - t
        iters = max(MIN_ITERS, min(MAX_ITERS, math.ceil(args.seconds / max(one, 1e-9))))
        t = time.perf_counter()
        last = None
        for _ in range(iters):
            last = call()
        jax.block_until_ready(last)
        return iters, time.perf_counter() - t

    def record(kind: str, row: dict) -> None:
        doc[kind].append(row)
        write(args.out, doc)
        rate = row.get("per_chip_per_s")
        print(f"{kind} {json.dumps({k: v for k, v in row.items() if k != 'flops_per_iter'})}"
              + (f"  -> {rate:,.0f}/s per chip" if rate else ""), flush=True)

    # ------------------------------------------------------------ the network
    def init_net(width: int, layers: int) -> dict:
        r = np.random.default_rng(width * 100 + layers)

        def dense(i, o):
            return {"w": (r.standard_normal((i, o)) / math.sqrt(i)).astype(np.float32), "b": np.zeros(o, np.float32)}

        def norm():
            return {"g": np.ones(width, np.float32), "b": np.zeros(width, np.float32)}
        ff = FF_MULT * width
        return {
            "node_in": dense(NODE, width), "slot_in": dense(SLOT, width), "glob_in": dense(GLOBAL, width),
            "identity": (r.standard_normal((TOKENS, width)) * 0.02).astype(np.float32),
            "blocks": [{"ln1": norm(), "qkv": dense(width, 3 * width), "out": dense(width, width), "ln2": norm(),
                        "ff1": dense(width, ff), "ff2": dense(ff, width), "border": np.zeros(HEADS, np.float32)}
                       for _ in range(layers)],
            "ln": norm(), "place": dense(width, 1), "glob_out": dense(width, 6),
            "attack_src": dense(width, KEY), "attack_dst": dense(width, KEY), "edge_bias": np.zeros(EDGES, np.float32),
            "fortify_src": dense(width, KEY), "fortify_dst": dense(width, KEY),
            "place_amount": dense(width, AMOUNTS), "attack_amount": dense(2 * width, AMOUNTS),
            "fortify_amount": dense(2 * width, AMOUNTS), "value": dense(width, 1), "aux": dense(width, 1),
        }

    def lin(p, x):
        return x @ p["w"] + p["b"]

    def layer_norm(p, x):
        xf = x.astype(f32)
        mean = xf.mean(-1, keepdims=True)
        var = ((xf - mean) ** 2).mean(-1, keepdims=True)
        return ((xf - mean) * lax.rsqrt(var + 1e-5) * p["g"].astype(f32) + p["b"].astype(f32)).astype(x.dtype)

    def block(p, x, adj):
        b, n, w = x.shape
        d = w // HEADS
        qkv = lin(p["qkv"], layer_norm(p["ln1"], x)).reshape(b, n, 3, HEADS, d)
        q, k, v = qkv[:, :, 0], qkv[:, :, 1], qkv[:, :, 2]
        scores = jnp.einsum("bqhd,bkhd->bhqk", q, k).astype(f32) / math.sqrt(d) + p["border"].astype(f32)[:, None, None] * adj
        attn = jax.nn.softmax(scores, -1).astype(x.dtype)
        x = x + lin(p["out"], jnp.einsum("bhqk,bkhd->bqhd", attn, v).reshape(b, n, w))
        return x + lin(p["ff2"], jax.nn.relu(lin(p["ff1"], layer_norm(p["ln2"], x))))

    def token(terr, i):
        idx = jnp.broadcast_to(i[:, None, None], (terr.shape[0], 1, terr.shape[2]))
        return jnp.take_along_axis(terr, idx, 1)[:, 0]

    def forward(params, batch, dt):
        p = jax.tree_util.tree_map(lambda a: a.astype(dt), params)
        adj = jnp.asarray(full_adjacency)
        x = jnp.concatenate([lin(p["node_in"], batch["node"].astype(dt)), lin(p["slot_in"], batch["slot"].astype(dt)),
                             lin(p["glob_in"], batch["glob"].astype(dt))[:, None]], 1) + p["identity"]
        for blk in p["blocks"]:
            x = block(blk, x, adj)
        x = layer_norm(p["ln"], x)
        terr = x[:, :TERRITORIES]
        g = lin(p["glob_out"], x[:, -1]).astype(f32)
        place = lin(p["place"], terr)[..., 0].astype(f32)
        src, dst = lin(p["attack_src"], terr), lin(p["attack_dst"], terr)
        e = jnp.asarray(edges)
        edge = (src[:, e[:, 0]] * dst[:, e[:, 1]]).sum(-1).astype(f32) / math.sqrt(KEY) + p["edge_bias"].astype(f32)
        fs, fd = lin(p["fortify_src"], terr), lin(p["fortify_dst"], terr)
        pair = jnp.einsum("bik,bjk->bij", fs, fd).reshape(-1, PAIRS).astype(f32) / math.sqrt(KEY)
        logits = jnp.concatenate([place, g[:, :1], edge, g[:, 1:2], g[:, 2:5], pair, g[:, 5:6]], 1)
        slots = x[:, TERRITORIES:TERRITORIES + SEATS]
        value = lin(p["value"], slots)[..., 0].astype(f32)
        aux = lin(p["aux"], slots)[..., 0].astype(f32)
        return p, x, logits, value, aux

    neg = float(np.finfo(np.float32).min)

    def amount_logits(p, x, main):
        terr = x[:, :TERRITORIES]
        place_g = main < 42
        attack_g = (main >= ATTACK) & (main < END_ATTACK)
        fortify_g = (main >= FORTIFY) & (main < END_TURN)
        e = jnp.asarray(edges)
        edge = jnp.clip(main - ATTACK, 0, EDGES - 1)
        pair = jnp.clip(main - FORTIFY, 0, PAIRS - 1)
        place = lin(p["place_amount"], token(terr, jnp.clip(main, 0, TERRITORIES - 1)))
        attack = lin(p["attack_amount"], jnp.concatenate([token(terr, e[edge, 0]), token(terr, e[edge, 1])], 1))
        fortify = lin(p["fortify_amount"], jnp.concatenate([token(terr, pair // TERRITORIES), token(terr, pair % TERRITORIES)], 1))
        out = jnp.where(place_g[:, None], place, jnp.where(attack_g[:, None], attack,
                        jnp.where(fortify_g[:, None], fortify, jnp.zeros_like(place))))
        count = jnp.where(place_g | attack_g, 3, jnp.where(fortify_g, 2, 1))
        legal = jnp.arange(AMOUNTS, dtype=i32)[None] < count[:, None]
        return jnp.where(legal, out.astype(f32), neg)

    def pick(logp, i):
        return jnp.take_along_axis(logp, i[:, None], 1)[:, 0]

    def loss_fn(params, batch, dt):
        p, x, logits, value, aux = forward(params, batch, dt)
        lp = jax.nn.log_softmax(jnp.where(batch["legal"], logits, neg), 1)
        la = jax.nn.log_softmax(amount_logits(p, x, batch["main"]), 1)
        ce = -(pick(lp, batch["main"]) + pick(la, batch["amount"])).mean()
        return ce + 0.5 * (((value - batch["value"]) ** 2).mean() + ((aux - batch["aux"]) ** 2).mean())

    def train_step(params, opt, batch, dt):
        loss, grads = jax.value_and_grad(loss_fn)(params, batch, dt)
        t = opt["t"] + 1.0
        b1, b2, lr, eps = 0.9, 0.999, 1e-4, 1e-8
        m = jax.tree_util.tree_map(lambda m, g: b1 * m + (1 - b1) * g, opt["m"], grads)
        v = jax.tree_util.tree_map(lambda v, g: b2 * v + (1 - b2) * g * g, opt["v"], grads)
        params = jax.tree_util.tree_map(lambda w, m, v: w - lr * (m / (1 - b1 ** t)) / (jnp.sqrt(v / (1 - b2 ** t)) + eps),
                                        params, m, v)
        return params, {"m": m, "v": v, "t": t}, loss

    def infer(params, batch, dt):
        _, _, logits, value, _ = forward(params, batch, dt)
        return jnp.argmax(jnp.where(batch["legal"], logits, neg), 1).astype(i32), value

    def make_batch(key, b):
        k = jax.random.split(key, 8)
        main = jax.random.randint(k[4], (b,), 0, MAIN, dtype=i32)
        legal = (jax.random.uniform(k[3], (b, MAIN), f32) < 0.05) | (jnp.arange(MAIN, dtype=i32)[None] == main[:, None])
        return {"node": jax.random.normal(k[0], (b, TERRITORIES, NODE), f32),
                "slot": jax.random.normal(k[1], (b, SEATS, SLOT), f32),
                "glob": jax.random.normal(k[2], (b, GLOBAL), f32), "legal": legal, "main": main,
                "amount": jnp.zeros((b,), i32), "value": jax.random.normal(k[5], (b, SEATS), f32),
                "aux": jax.random.uniform(k[6], (b, SEATS), f32)}

    def net_measure(kind, width, layers, precision, chips, devs, per_chip):
        mesh = Mesh(np.array(devs), ("b",))
        rep, bat = NamedSharding(mesh, P()), NamedSharding(mesh, P("b"))
        dt = bf16 if precision == "bf16" else f32
        row = {"kind": kind, "size": f"{width}x{layers}", "precision": precision, "chips": chips,
               "chip_count": len(devs), "batch_per_chip": per_chip}
        host = init_net(width, layers)
        params = jax.device_put(host, rep)
        batch = jax.jit(make_batch, static_argnums=1, out_shardings=bat)(jax.random.PRNGKey(1), per_chip * len(devs))
        context = jax.default_matmul_precision("highest") if precision == "f32" else contextlib.nullcontext()
        t = time.perf_counter()
        with context:
            if kind == "train":
                zeros = jax.tree_util.tree_map(np.zeros_like, host)
                opt = jax.device_put({"m": zeros, "v": zeros, "t": np.float32(0)}, rep)
                fn = jax.jit(lambda p, o, b: train_step(p, o, b, dt), in_shardings=(rep, rep, bat),
                             out_shardings=(rep, rep, rep), donate_argnums=(0, 1))
                compiled = fn.lower(params, opt, batch).compile()
            else:
                fn = jax.jit(lambda p, b: infer(p, b, dt), in_shardings=(rep, bat), out_shardings=(bat, bat))
                compiled = fn.lower(params, batch).compile()
        row["compile_s"] = round(time.perf_counter() - t, 2)
        row["flops_per_iter"] = flops(compiled)
        if kind == "train":
            state = [params, opt]

            def call():
                state[0], state[1], loss = compiled(state[0], state[1], batch)
                return loss
        else:
            def call():
                return compiled(params, batch)
        iters, seconds = steady(call)
        rate = per_chip * len(devs) * iters / seconds
        row.update({"warmup_iters": WARMUP + 1, "iters": iters, "seconds": round(seconds, 4),
                    "samples_per_s": round(rate, 1), "per_chip_per_s": round(rate / len(devs), 1)})
        if row["flops_per_iter"]:
            row["achieved_flops_per_s_per_chip"] = row["flops_per_iter"] * iters / seconds / len(devs)
        return row

    if args.phase == "x32":
        for width, layers in args.size_list:
            for precision in args.precision_list:
                for chips, devs in chip_sets:
                    for kind, batches in (("train", args.train_list), ("infer", args.infer_list)):
                        for i, per_chip in enumerate(batches):
                            what = {"kind": kind, "size": f"{width}x{layers}", "precision": precision,
                                    "chips": chips, "batch_per_chip": per_chip}
                            if late():
                                doc["skipped"].append({**what, "why": "past the hours"})
                                continue
                            try:
                                record("net", net_measure(kind, width, layers, precision, chips, devs, per_chip))
                            except Exception as e:  # noqa: BLE001 -- only an out-of-memory is recorded; anything else re-raises
                                if not is_oom(e):
                                    raise
                                record("net", {**what, "chip_count": len(devs), "oom": True})
                                doc["skipped"] += [{**what, "batch_per_chip": b, "why": "a smaller batch ran out of memory"}
                                                   for b in batches[i + 1:]]
                                break

    # ------------------------------------------------------------ the engine kernel
    def engine_run(variant, bound, steps):
        wide = variant in X64_VARIANTS
        fdt = jnp.float64 if variant == "i64-f64" else f32
        adj = jnp.asarray(adjacency)
        nbrs = jnp.asarray(adjacent)
        cont = jnp.asarray(members)
        cont_size = cont.sum(1, dtype=i32)
        bonus = jnp.asarray(np.array(CONTINENT_BONUS, np.int32))
        iota = jnp.arange(TERRITORIES, dtype=i32)
        pos = jnp.arange(bound, dtype=i32)[None]

        def draw(rng):
            if wide:
                t, rng = mulberry_i64(rng)
                return t.astype(fdt) / 4294967296.0, rng
            t, rng = mulberry_u32(rng)
            return (t >> 8).astype(f32) * (1.0 / 16777216.0), rng

        def one(c, tables):
            values, index, capture = tables
            b = c["owner"].shape[0]
            rows = jnp.arange(b, dtype=i32)
            r1, rng = draw(c["rng"])
            r2, rng = draw(rng)
            r3, rng = draw(rng)
            owner, armies, active = c["owner"], c["armies"], c["active"]
            own = owner == active[:, None]
            enemy_nb = jnp.matmul((~own).astype(i32), adj, preferred_element_type=i32)
            can = own & (armies > 1) & (enemy_nb > 0)
            has = can.any(1)
            rot = (iota[None] + jnp.floor(r1 * TERRITORIES).astype(i32)[:, None]) % TERRITORIES
            k = jnp.argmax(jnp.take_along_axis(can, rot, 1), 1).astype(i32)
            src = jnp.take_along_axis(rot, k[:, None], 1)[:, 0]
            near = nbrs[src]
            near_enemy = (near >= 0) & (jnp.take_along_axis(owner, jnp.maximum(near, 0), 1) != active[:, None])
            dst = jnp.maximum(jnp.take_along_axis(near, jnp.argmax(near_enemy, 1).astype(i32)[:, None], 1)[:, 0], 0)
            a_src = jnp.take_along_axis(armies, src[:, None], 1)[:, 0]
            a = jnp.clip(a_src - 1, 1, bound)
            d = jnp.clip(jnp.take_along_axis(armies, dst[:, None], 1)[:, 0], 1, bound)
            cell = a * (bound + 1) + d
            offsets = index[cell]
            inside = pos < a[:, None]
            totals = values[jnp.where(inside, offsets[:, :1] + pos, 0)]
            hits = inside & (totals >= 0) & (totals >= r2[:, None].astype(fdt))
            lost = jnp.minimum(jnp.min(jnp.where(hits, pos, bound), 1), a - 1)
            captured = has & (r3.astype(fdt) < capture[cell])
            armies = armies.at[rows, src].add(jnp.where(has, -lost - captured.astype(i32), 0))
            at_dst = iota[None] == dst[:, None]
            taken = at_dst & captured[:, None]
            owner = jnp.where(taken, active[:, None], owner)
            armies = jnp.where(taken, 1, jnp.where(at_dst & (has & ~captured)[:, None], jnp.maximum(armies - 1, 1), armies))
            held = c["hand_len"][rows, active]
            deck_len = c["deck_len"]
            get = captured & (deck_len > 0) & (held < HAND_MAX)
            card = jnp.take_along_axis(c["deck"], jnp.maximum(deck_len - 1, 0)[:, None], 1)[:, 0]
            slot = jnp.minimum(held, HAND_MAX - 1)
            hand = c["hand"].at[rows, active, slot].set(jnp.where(get, card, c["hand"][rows, active, slot]))
            hand_len = c["hand_len"].at[rows, active].add(get.astype(i32))
            deck_len = deck_len - get.astype(i32)
            trade = hand_len[rows, active] >= 5
            hand_len = hand_len.at[rows, active].add(-3 * trade.astype(i32))
            deck_len = deck_len + 3 * trade.astype(i32)
            mine = (owner == active[:, None]).astype(i32)
            whole = jnp.matmul(mine, cont.T, preferred_element_type=i32) == cont_size[None]
            # Sums are given int32: under x64 an int32 sum would widen to int64.
            reinf = jnp.maximum(mine.sum(1, dtype=i32) // 3, 3) + (whole.astype(i32) * bonus[None]).sum(1, dtype=i32)
            end = r1 > 0.75
            armies = jnp.minimum(armies.at[rows, src].add(jnp.where(end & has, reinf, 0)), 5000)
            active = jnp.where(end, (active + 1) % c["players"], active)
            return {**c, "rng": rng, "owner": owner, "armies": armies, "active": active, "hand": hand,
                    "hand_len": hand_len, "deck_len": deck_len}

        def run(state, values, index, capture):
            state, _ = lax.scan(lambda c, _: (one(c, (values, index, capture)), None), state, None, length=steps)
            return state
        return run

    def engine_state(games, wide, seed):
        r = np.random.default_rng(seed)
        players = r.integers(3, 7, games).astype(np.int32)
        return {"owner": (r.integers(0, 6, (games, TERRITORIES)) % players[:, None]).astype(np.int32),
                "armies": r.integers(1, 9, (games, TERRITORIES)).astype(np.int32),
                "hand": np.full((games, SEATS, HAND_MAX), -1, np.int32),
                "hand_len": np.zeros((games, SEATS), np.int32),
                "deck": r.integers(0, CARDS, (games, CARDS)).astype(np.int32),
                "deck_len": np.full(games, CARDS, np.int32), "active": np.zeros(games, np.int32), "players": players,
                "rng": r.integers(0, 2 ** 32, games, dtype=np.uint64).astype(np.int64 if wide else np.uint32)}

    def engine_tables(variant, bound):
        r = np.random.default_rng(bound)
        fdt = np.float64 if variant == "i64-f64" else np.float32
        cells = (bound + 1) ** 2
        n = cells * bound  # every fight's running totals, as blitz-<bound>.bin holds them, to within a percent
        values = r.random(n).astype(fdt)
        values[r.random(n) < 0.05] = -1
        index = np.zeros((cells, 4), np.int32)
        index[:, 0] = r.integers(0, n - bound, cells)
        return values, index, r.random(cells).astype(fdt)

    def shard_map_of(fn, mesh, in_specs, out_specs):
        import inspect
        try:
            from jax import shard_map as sm
        except ImportError:
            from jax.experimental.shard_map import shard_map as sm
        params = inspect.signature(sm).parameters
        # The games are independent: each chip runs its own; the replication check has no rule for some
        # primitives in older releases, and nothing here crosses chips.
        off = {k: False for k in ("check_rep", "check_vma") if k in params}
        return sm(fn, mesh=mesh, in_specs=in_specs, out_specs=out_specs, **off)

    def engine_measure(variant, chips, devs, per_chip):
        mesh = Mesh(np.array(devs), ("b",))
        rep, bat = NamedSharding(mesh, P()), NamedSharding(mesh, P("b"))
        state = jax.device_put(engine_state(per_chip * len(devs), variant in X64_VARIANTS, per_chip), bat)
        values, index, capture = (jax.device_put(x, rep) for x in engine_tables(variant, args.bound))
        fn = jax.jit(shard_map_of(engine_run(variant, args.bound, args.steps), mesh, (P("b"), P(), P(), P()), P("b")),
                     donate_argnums=0)
        t = time.perf_counter()
        compiled = fn.lower(state, values, index, capture).compile()
        row = {"variant": variant, "chips": chips, "chip_count": len(devs), "games_per_chip": per_chip,
               "steps_per_call": args.steps, "table_bound": args.bound, "table_values": int(values.shape[0]),
               "compile_s": round(time.perf_counter() - t, 2), "flops_per_iter": flops(compiled)}
        holder = [state]

        def call():
            holder[0] = compiled(holder[0], values, index, capture)
            return holder[0]
        iters, seconds = steady(call)
        rate = per_chip * len(devs) * args.steps * iters / seconds
        row.update({"warmup_iters": WARMUP + 1, "iters": iters, "seconds": round(seconds, 4),
                    "game_steps_per_s": round(rate, 1), "per_chip_per_s": round(rate / len(devs), 1)})
        return row

    mine = [v for v in args.variant_list if (v in X64_VARIANTS) == x64]
    for variant in mine:
        for chips, devs in chip_sets:
            for i, per_chip in enumerate(args.engine_list):
                what = {"variant": variant, "chips": chips, "games_per_chip": per_chip}
                if late():
                    doc["skipped"].append({**what, "why": "past the hours"})
                    continue
                try:
                    record("engine", engine_measure(variant, chips, devs, per_chip))
                except Exception as e:  # noqa: BLE001 -- only an out-of-memory is recorded; anything else re-raises
                    if not is_oom(e):
                        raise
                    record("engine", {**what, "chip_count": len(devs), "oom": True})
                    doc["skipped"] += [{**what, "games_per_chip": b, "why": "a smaller batch ran out of memory"}
                                       for b in args.engine_list[i + 1:]]
                    break
    write(args.out, doc)
    return 0


def mulberry_u32(s):
    """mulberry32 on uint32 lanes, whose multiplication wraps as `Math.imul` does: `(output, state)`."""
    s = s + 0x6D2B79F5
    t = (s ^ (s >> 15)) * (s | 1)
    t = t ^ (t + (t ^ (t >> 7)) * (t | 61))
    return t ^ (t >> 14), s


MASK32 = 0xFFFFFFFF


def imul64(a, b):
    return ((a & 0xFFFF) * b + ((((a >> 16) * b) & 0xFFFF) << 16)) & MASK32


def mulberry_i64(s):
    """The same generator as `rng.py` writes it: int64 lanes in [0, 2^32), a 16-bit split multiply."""
    s = (s + 0x6D2B79F5) & MASK32
    t = imul64(s ^ (s >> 15), s | 1)
    t = t ^ ((t + imul64(t ^ (t >> 7), t | 61)) & MASK32)
    return (t ^ (t >> 14)) & MASK32, s


def hardware(jax, devices) -> dict:
    d = devices[0]
    stats = d.memory_stats()
    return {"platform": d.platform, "device_kind": d.device_kind, "device_count": len(devices),
            "local_device_count": jax.local_device_count(), "process_count": jax.process_count(),
            "memory_bytes_per_device": stats.get("bytes_limit") if stats else None,
            "host_cpus": os.cpu_count(), "host": platform.platform()}


def software(jax, np, x64: bool) -> dict:
    from importlib import metadata

    def version(name):
        try:
            return metadata.version(name)
        except metadata.PackageNotFoundError:
            return None
    return {"python": platform.python_version(), "jax": jax.__version__, "jaxlib": version("jaxlib"),
            "libtpu": version("libtpu") or version("libtpu-nightly"), "numpy": np.__version__,
            "torch_xla": version("torch_xla"), "jax_enable_x64": x64}


def config(args: argparse.Namespace) -> dict:
    return {"sizes": args.sizes, "heads": HEADS, "ff_mult": FF_MULT, "tokens": TOKENS, "main_choices": MAIN,
            "train_batches_per_chip": args.train_list, "infer_batches_per_chip": args.infer_list,
            "precisions": args.precision_list, "engine_games_per_chip": args.engine_list, "variants": args.variant_list,
            "steps_per_call": args.steps, "table_bound": args.bound, "seconds_at_least": args.seconds,
            "warmup_iters": WARMUP, "plus_sizing_iters": 1, "min_iters": MIN_ITERS, "smoke": args.smoke}


def main(argv: list[str]) -> int:
    args = settings(argv)
    if args.phase:
        return run_phase(args)
    return orchestrate(argv, args)


if __name__ == "__main__":
    # A Kaggle session runs this file with no arguments, the launcher's prepended as PUSHED_ARGV.
    sys.exit(main(sys.argv[1:] or globals().get("PUSHED_ARGV", [])))

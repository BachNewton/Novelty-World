"""The supervised trainers (`imitate.py train`, `distil.py`) in JAX, on every chip of a TPU, from a
prepared set (`prepare.py`):

    python -m riskgpu.tpu.train --data /tmp/prepared/x --dir runs/tpu/<name> [--width 256 --layers 6]
        [--init runs/...pt] [--minibatch 4096] [--max-samples ...] [--hours 8] [--require tpu]

run from `src/projects/risk/gpu/`. The task (imitation or distillation), the action space and the
clock are the prepared set's: the net reads the clock exactly when the set holds it.

**The net** is `--init`'s (a distillation's fine-tune: an init without the clock starts a net that
reads it with the clock's weights at zero, as `net.init_from` does), or a fresh one of `--width`,
`--layers` and `--heads`, from PyTorch's own initialisation (`convert.initial`): an imitation, or a
distillation of a net's own play (`selfplay/own.py`) into a copy learned from random weights, which
takes imitation's recipe in its arguments.

**The recipe is `imitate.fit`'s**, with each task's defaults: AdamW (its decay on every parameter, as
PyTorch's is given `net.parameters()`), the gradient clipped to a global norm, the rate a linear
warmup then a cosine fall to zero over `--max-samples`, a fresh order of the training samples each
pass (the last partial minibatch dropped). The losses are `imitate.losses` and `distil.losses` (the
hard target): cross-entropy over the legal main choices, over the amount where it has more than one
legal choice, and the value head's squared error on the present slots; a distillation's skipped
decisions weighted by `--skipped-weight`. Every `--read-every` steps the read (the held-out monitor
and the same on the run's own training samples, as `fit`'s `read_of`) chooses `best.pt` and never
moves the rate. A distillation's soft target is not here: it is kept for a recording with more
rollouts, and nothing trains on it yet.

**Precision and chips.** bf16 by default (`--no-bf16` for float32 at the highest matmul precision),
float32 parameters and optimiser state. The minibatch is split over the chips (`--chips`, all by
default) with the parameters replicated: one program over a mesh, XLA reducing the gradients, so it
is the same update as on one device, up to the order of a sum.

**It survives a session's end.** At every read the run's whole state (parameters, both moments, the
step, its place in the pass, the best so far) is written to `resume.npz` and `resume.json`, whole or
not at all, and a run started in a folder that holds them carries on from there, refusing if its
recipe differs. `--hours` stops the run as `fit` stops (read, saved, the log's line marked), the
schedule left over the budget. The checkpoints (`best.pt`, `last.pt`) are PyTorch's (`convert.py`).

**The read at the end** (`read.json`, and `--out`): the best checkpoint over every held-out sample,
split as the PyTorch tools split it (imitation: by the teacher's move kind and the decision's kind;
distillation: overruled, kept, skipped and by kind), with 95% intervals by bootstrap over games.
"""

import argparse
import concurrent.futures
import json
import math
import os
import sys
import time

import numpy as np

from .prepare import Prepared

# What a training step reads; the read also takes what tells a move's agreement.
STEP_FIELDS = ("node", "slot", "glob", "legal", "main", "amount", "amount_legal", "value", "value_ok")
EXACT_FIELDS = ("context", "token", "has_token", "features")
READ_FIELDS = ("ok_amount", "ok_occupy")
DEFAULTS = {"imitate": {"lr": 5e-4, "warmup": 500, "max_samples": 100_000_000},
            "distil": {"lr": 1e-4, "warmup": 200, "max_samples": 20_000_000}}
# The arguments that may differ when a run resumes: they change where and how fast, not what.
RESUMABLE = {"hours", "require", "chips", "loader_threads", "in_memory", "out", "read_chunk", "data", "dir"}
SEARCHED_GROUPS = 2  # a distillation's groups below this are searched decisions (`distil.FROM`)


def lr_at(args, step: int, total_steps: int) -> float:
    """`imitate.fit`'s schedule."""
    if step < args.warmup:
        return args.lr * (step + 1) / args.warmup
    return args.lr * 0.5 * (1 + math.cos(math.pi * (step - args.warmup) / max(1, total_steps - args.warmup)))


def adamw(params, opt, grads, lr, wd, clip, b1=0.9, b2=0.999, eps=1e-6):
    """PyTorch's AdamW step after its global-norm clip (`clip_grad_norm_`), on flat dicts."""
    import jax.numpy as jnp
    norm = jnp.sqrt(sum(jnp.sum(g.astype(jnp.float32) ** 2) for g in grads.values()))
    scale = jnp.minimum(1.0, clip / (norm + 1e-6))
    t = opt["t"] + 1
    m = {k: b1 * opt["m"][k] + (1 - b1) * grads[k] * scale for k in params}
    v = {k: b2 * opt["v"][k] + (1 - b2) * (grads[k] * scale) ** 2 for k in params}
    step = lr / (1 - b1 ** t)
    root = jnp.sqrt(1 - b2 ** t)
    params = {k: params[k] * (1 - lr * wd) - step * m[k] / (jnp.sqrt(v[k]) / root + eps) for k in params}
    return params, {"m": m, "v": v, "t": t}, norm


def losses(forward, params, batch, amount_weight: float, vf: float):
    """`(loss, parts)`: `imitate.losses`, or `distil.losses`' hard target where `weight` and
    `agree_on` say a distillation's."""
    import jax
    import jax.numpy as jnp
    z, za, value = forward(params, batch)
    main = batch["main"].astype(jnp.int32)
    amount = batch["amount"].astype(jnp.int32)
    w = batch["weight"]
    main_ce = -jnp.take_along_axis(jax.nn.log_softmax(z, 1), main[:, None], 1)[:, 0]
    amount_ce = -jnp.take_along_axis(jax.nn.log_softmax(za, 1), amount[:, None], 1)[:, 0]
    has = (batch["amount_legal"].sum(1) > 1) & (w > 0)
    main_loss = (main_ce * w).sum() / jnp.maximum(w.sum(), 1e-9)
    amount_loss = jnp.where(has, amount_ce * w, 0).sum() / jnp.maximum(jnp.where(has, w, 0).sum(), 1e-9)
    ok = batch["value_ok"]
    value_loss = jnp.where(ok, (value - batch["value"]) ** 2, 0).sum() / ok.sum()
    on = batch["agree_on"]
    agree = ((z.argmax(1) == main) & on).sum() / jnp.maximum(on.sum(), 1)
    loss = main_loss + amount_weight * amount_loss + vf * value_loss
    return loss, {"main": main_loss, "amount": amount_loss, "value": value_loss, "agree": agree}


def predict(forward, params, batch):
    """Per sample: whether the net's most likely main choice, and its whole move, are the target's
    (`imitate.agreement`'s reading: the amount at the target's main choice, the move compared through
    `prepare`'s masks), and the value's squared error summed over the present slots, with the count."""
    import jax.numpy as jnp
    from ..selfplay.actions import OCCUPY
    z, za, value = forward(params, batch)
    pm = z.argmax(1).astype(jnp.int32)
    pa = za.argmax(1).astype(jnp.int32)
    main_ok = pm == batch["main"].astype(jnp.int32)
    ok_amount = jnp.take_along_axis(batch["ok_amount"], pa[:, None], 1)[:, 0]
    occupy = (pm >= OCCUPY) & (pm < OCCUPY + 3)
    ok_occupy = jnp.take_along_axis(batch["ok_occupy"], jnp.clip(pm - OCCUPY, 0, 2)[:, None], 1)[:, 0]
    move_ok = (main_ok & ok_amount) | (occupy & ok_occupy)
    ok = batch["value_ok"]
    return main_ok, move_ok, jnp.where(ok, (value - batch["value"]) ** 2, 0).sum(1), ok.sum(1)


class Trainer:
    """The device side: the jitted step and read over a mesh of the chips."""

    def __init__(self, data: Prepared, args, devices):
        import jax
        import jax.numpy as jnp
        from jax.sharding import Mesh, NamedSharding
        from jax.sharding import PartitionSpec as P

        from .net import Forward, constants
        self.jax, self.data, self.args = jax, data, args
        self.n_dev = len(devices)
        mesh = Mesh(np.array(devices), ("b",))
        self.rep, self.bat = NamedSharding(mesh, P()), NamedSharding(mesh, P("b"))
        forward = Forward(constants(np.array(data.meta["edges"]), np.array(data.meta["adjacency"])),
                          jnp.bfloat16 if args.bf16 else jnp.float32)
        self.step_fields = STEP_FIELDS + (EXACT_FIELDS if data.exact else ())
        self.read_fields = self.step_fields + READ_FIELDS
        aw, vf, wd, clip = args.amount_weight, args.vf, args.wd, args.grad_clip

        def step(params, opt, batch, lr):
            (loss, parts), grads = jax.value_and_grad(lambda p: losses(forward, p, batch, aw, vf), has_aux=True)(params)
            params, opt, norm = adamw(params, opt, grads, lr, wd, clip)
            return params, opt, {**parts, "loss": loss, "grad_norm": norm}

        self.step = jax.jit(step, in_shardings=(self.rep, self.rep, self.bat, self.rep),
                            out_shardings=(self.rep, self.rep, self.rep), donate_argnums=(0, 1))
        self.predict = jax.jit(lambda p, b: predict(forward, p, b), in_shardings=(self.rep, self.bat),
                               out_shardings=self.bat)

    def host_batch(self, idx: np.ndarray, names) -> dict[str, np.ndarray]:
        b = self.data.batch(idx, set(names) | {"group"})
        group = b.pop("group")
        if self.data.task == "distil":
            searched = group < SEARCHED_GROUPS
            b["weight"] = np.where(searched, 1.0, self.args.skipped_weight).astype(np.float32)
            b["agree_on"] = searched
        else:
            b["weight"] = np.ones(len(idx), np.float32)
            b["agree_on"] = np.ones(len(idx), bool)
        return b

    def put(self, batch: dict):
        return self.jax.device_put(batch, self.bat)

    def read(self, params, idx: np.ndarray):
        """`(main_ok, move_ok, value mse)` over samples `idx`, in fixed-size chunks (the last padded)."""
        chunk = self.args.read_chunk
        main_ok, move_ok, verr, vcount = [], [], 0.0, 0
        for at in range(0, len(idx), chunk):
            part = idx[at:at + chunk]
            n = len(part)
            padded = np.concatenate([part, np.full(chunk - n, part[-1], part.dtype)])
            m, mv, e, c = (np.asarray(x)[:n] for x in self.predict(params, self.put(self.host_batch(padded, self.read_fields))))
            main_ok.append(m)
            move_ok.append(mv)
            verr += float(e.sum())
            vcount += int(c.sum())
        empty = np.zeros(0, bool)
        return (np.concatenate(main_ok) if main_ok else empty, np.concatenate(move_ok) if move_ok else empty,
                verr / max(vcount, 1))


# --- the run's state ----------------------------------------------------------------------------


def save_state(folder: str, params, opt, record: dict) -> None:
    """`resume.npz` (the arrays) then `resume.json` (where the run is), each by rename, the json naming
    the step the arrays hold, so a reader never pairs two different moments."""
    arrays = {f"p/{k}": np.asarray(v) for k, v in params.items()}
    arrays.update({f"m/{k}": np.asarray(v) for k, v in opt["m"].items()})
    arrays.update({f"v/{k}": np.asarray(v) for k, v in opt["v"].items()})
    arrays["t"] = np.asarray(opt["t"])
    tmp = os.path.join(folder, "resume.tmp.npz")
    np.savez(tmp, **arrays)
    os.replace(tmp, os.path.join(folder, "resume.npz"))
    with open(os.path.join(folder, "resume.json.tmp"), "w") as f:
        json.dump(record, f)
    os.replace(os.path.join(folder, "resume.json.tmp"), os.path.join(folder, "resume.json"))


def load_state(folder: str):
    with open(os.path.join(folder, "resume.json")) as f:
        record = json.load(f)
    with np.load(os.path.join(folder, "resume.npz")) as z:
        arrays = {k: z[k] for k in z.files}
    assert int(arrays["t"]) == record["step"], f"{folder}: resume.npz holds step {int(arrays['t'])}, resume.json {record['step']}"
    part = {p: {k[2:]: v for k, v in arrays.items() if k.startswith(p + "/")} for p in "pmv"}
    return part["p"], {"m": part["m"], "v": part["v"], "t": np.float32(record["step"])}, record


def recipe(args) -> dict:
    return {k: v for k, v in vars(args).items() if k not in RESUMABLE}


# --- training -----------------------------------------------------------------------------------


def devices_of(args):
    import jax
    devices = jax.devices()
    if args.require:
        assert devices[0].platform == args.require, f"--require {args.require}, but JAX found {devices[0].platform}: {devices}"
    if args.chips:
        assert args.chips <= len(devices), f"--chips {args.chips} of {len(devices)}"
        devices = devices[:args.chips]
    return devices


def shape_for(args, data: Prepared) -> dict:
    """The net's sizes: `--init`'s for a distillation that starts from one (`distil.train`), the
    arguments' otherwise; its clock the set's."""
    if data.task == "distil" and args.init:
        import torch

        from ..selfplay.net import shape_of
        state = torch.load(args.init, map_location="cpu", weights_only=False)
        shape = shape_of(state.get("net", state))
        assert shape["actions"] == data.actions, \
            f"--init is a {shape['actions']} net and the recording's candidates are {data.actions} actions"
        assert data.clock or not shape["clock"], "--init reads the clock and the set holds none: prepare it with --clock"
        return {**shape, "clock": data.clock}
    assert args.actions in (None, data.actions), f"the set is prepared for the {data.actions} space: --actions {args.actions}"
    return {"width": args.width, "layers": args.layers, "heads": args.heads, "ff_mult": 4, "actions": data.actions,
            "clock": data.clock}


def train(args) -> dict:
    import jax
    data = Prepared(args.data, load=args.in_memory)
    task = data.task
    for k, v in DEFAULTS[task].items():
        if getattr(args, k) is None:
            setattr(args, k, v)
    devices = devices_of(args)
    assert args.minibatch % len(devices) == 0, f"--minibatch {args.minibatch} doesn't split over {len(devices)} chips"
    args.read_chunk = max(len(devices), args.read_chunk // len(devices) * len(devices))
    os.makedirs(args.dir, exist_ok=True)
    name = os.path.basename(os.path.normpath(args.dir))
    resuming = os.path.exists(os.path.join(args.dir, "resume.json"))
    args_path = os.path.join(args.dir, "args.json")
    if resuming:
        with open(args_path) as f:
            theirs = json.load(f)
        assert {k: v for k, v in theirs.items() if k not in RESUMABLE} == json.loads(json.dumps(recipe(args))), \
            f"{args.dir} holds a run of another recipe: {theirs}"
    else:
        with open(args_path, "w") as f:
            json.dump(vars(args), f, indent=1)

    trainer = Trainer(data, args, devices)
    arr = data.arrays
    train_mask = np.asarray(arr["train"])
    if task == "distil" and args.skipped_weight <= 0:
        train_mask = train_mask & (np.asarray(arr["group"]) < SEARCHED_GROUPS)
    train_idx = np.flatnonzero(train_mask)
    held_idx = np.flatnonzero(np.asarray(arr["held_out"]))
    assert len(train_idx) >= args.minibatch, f"{len(train_idx)} training samples, fewer than a minibatch"
    monitor = np.sort(np.random.default_rng(7).permutation(held_idx)[:args.monitor])
    fit_monitor = np.sort(np.random.default_rng(11).permutation(train_idx)[:args.monitor])
    group = np.asarray(arr["group"])
    print(f"{name}: {task}, {data.actions} space, {len(train_idx)} training samples, {len(held_idx)} held out "
          f"(monitor {len(monitor)}); {len(devices)} x {devices[0].device_kind}, {'bf16' if args.bf16 else 'f32'}",
          flush=True)

    the_set = {k: data.meta["made_from"][k] for k in ("task", "actions", "fraction", "clock")} | {"n": data.n}
    if resuming:
        params, opt, state = load_state(args.dir)
        assert state["set"] == the_set, f"{args.dir} trained on another set: {state['set']} against {the_set}"
        print(f"{name}: resumed at step {state['step']} ({state['samples']} samples)", flush=True)
    else:
        from ..board import Board
        from . import convert
        params = convert.initial(shape_for(args, data), Board.load("cpu"), args.init, args.seed)
        opt = {"m": {k: np.zeros_like(v) for k, v in params.items()},
               "v": {k: np.zeros_like(v) for k, v in params.items()}, "t": np.float32(0)}
        state = {"step": 0, "samples": 0, "epoch": 0, "at": 0, "best": -1.0, "best_step": 0, "seconds": 0.0,
                 "set": the_set}
    params = jax.device_put(params, trainer.rep)
    opt = jax.device_put(opt, trainer.rep)

    total_steps = math.ceil(args.max_samples / args.minibatch)
    best_key = "held_main" if task == "imitate" else "held_move"

    def read_of(p) -> tuple[dict, float]:
        main_ok, move_ok, verr = trainer.read(p, monitor)
        fit_main, fit_move, _ = trainer.read(p, fit_monitor)
        if task == "imitate":
            out = {"fit_main": round(float(fit_main.mean()), 5), "fit_move": round(float(fit_move.mean()), 5),
                   "held_main": round(float(main_ok.mean()), 5), "held_move": round(float(move_ok.mean()), 5),
                   "held_value_mse": round(verr, 5)}
            return out, float(main_ok.mean())
        src = group[monitor]
        searched = src < SEARCHED_GROUPS

        def share(mask):
            return round(float(move_ok[mask].mean()), 5) if mask.any() else None
        from ..selfplay.distil import FROM
        out = {"fit_move": round(float(fit_move.mean()), 5), "held_move": share(searched),
               **{f"held_{n}": share(src == i) for i, n in enumerate(FROM)}, "held_value_mse": round(verr, 5)}
        return out, float(move_ok[searched].mean())

    from . import convert

    def host_params(p) -> dict:
        return {k: np.asarray(v) for k, v in p.items()}

    def batches(epoch: int, at: int):
        """`(epoch, at, indices)` from the run's place on, a fresh order each pass."""
        while True:
            order = train_idx[np.random.default_rng([args.seed, epoch]).permutation(len(train_idx))]
            for a in range(at, len(order) - args.minibatch + 1, args.minibatch):
                yield epoch, a + args.minibatch, np.sort(order[a:a + args.minibatch])
            epoch, at = epoch + 1, 0

    log_path = os.path.join(args.dir, "log.jsonl")
    t0 = time.time()
    samples_at_start = state["samples"]
    sums: dict[str, float] = {}
    count = 0
    stream = batches(state["epoch"], state["at"])
    pool = concurrent.futures.ThreadPoolExecutor(max(1, args.loader_threads))
    ahead = []

    def fill():
        while len(ahead) < 2 * max(1, args.loader_threads):
            epoch, at, idx = next(stream)
            ahead.append((epoch, at, pool.submit(trainer.host_batch, idx, trainer.step_fields)))

    step = state["step"]
    stopped = None
    while step < total_steps:
        fill()
        epoch, at, future = ahead.pop(0)
        lr = np.float32(lr_at(args, step, total_steps))
        params, opt, parts = trainer.step(params, opt, trainer.put(future.result()), lr)
        step += 1
        state.update({"step": step, "samples": state["samples"] + args.minibatch, "epoch": epoch, "at": at})
        for k, v in parts.items():
            sums[k] = sums.get(k, 0.0) + float(v)
        count += 1
        out_of_time = args.hours is not None and time.time() - t0 > args.hours * 3600
        if step % args.read_every == 0 or step >= total_steps or out_of_time:
            read, score = read_of(params)
            elapsed = time.time() - t0
            record = {"step": step, "samples": state["samples"], "epoch": round(state["samples"] / len(train_idx), 3),
                      "lr": lr_at(args, step, total_steps), **{f"train_{k}": round(v / count, 5) for k, v in sums.items()},
                      **read, "seconds": round(state["seconds"] + elapsed, 1),
                      "samples_per_s": round((state["samples"] - samples_at_start) / max(elapsed, 1e-9))}
            sums, count = {}, 0
            if score > state["best"]:
                state["best"], state["best_step"] = score, step
                convert.save(os.path.join(args.dir, "best.pt"), host_params(params), step=step, **{best_key: score})
            record["best"] = round(state["best"], 5)
            if out_of_time and step < total_steps:
                record["stopped"] = "hours"
            with open(log_path, "a") as f:
                f.write(json.dumps(record) + "\n")
            print(json.dumps(record), flush=True)
            save_state(args.dir, host_params(params), {"m": host_params(opt["m"]), "v": host_params(opt["v"]),
                                                       "t": np.asarray(opt["t"])},
                       {**state, "seconds": state["seconds"] + elapsed})
            if out_of_time:
                stopped = "hours"
                break
    pool.shutdown(cancel_futures=True)
    if stopped:
        print(f"{name}: stopped on the hours (--hours {args.hours}) at step {step} of {total_steps}; "
              f"run it again in {args.dir} to carry on", flush=True)
    else:
        convert.save(os.path.join(args.dir, "last.pt"), host_params(params), step=step)
    print(f"{name}: best held-out {'main' if task == 'imitate' else 'move'} agreement {state['best']:.4f} "
          f"at step {state['best_step']}", flush=True)
    best = jax.device_put(convert.load(os.path.join(args.dir, "best.pt")), trainer.rep)
    out = {"dir": args.dir, "data": data.meta["made_from"], "init": args.init, "task": task, "actions": data.actions,
           "step": step, "total_steps": total_steps, "stopped": stopped, "best_step": state["best_step"],
           "held_out": report(trainer, best, held_idx)}
    with open(os.path.join(args.dir, "read.json"), "w") as f:
        json.dump(out, f, indent=1)
    return out


def report(trainer: Trainer, params, idx: np.ndarray) -> dict:
    """The read over `idx`, split as the PyTorch tools split theirs, by bootstrap over games."""
    import torch

    from ..selfplay.imitate import DECISION_KINDS, MOVE_KINDS, share_reader
    data = trainer.data
    main_ok, move_ok, verr = trainer.read(params, idx)
    arr = {k: np.asarray(data.arrays[k][idx]) for k in ("game", "group", "decision_kind", "turn_start", "flagged")}
    read_of = share_reader(torch.from_numpy(arr["game"].astype(np.int64)))

    def r(hit, mask):
        return read_of(torch.from_numpy(hit), torch.from_numpy(mask))
    kind = arr["decision_kind"]
    out = {"samples": len(idx), "games": len(np.unique(arr["game"])), "value_mse": round(verr, 5)}
    if data.task == "distil":
        from ..selfplay.distil import FROM
        source = arr["group"]
        searched = source < SEARCHED_GROUPS
        for what, hit in (("main", main_ok), ("move", move_ok)):
            out[what] = {"searched": r(hit, searched),
                         "by_source": {n: r(hit, source == i) for i, n in enumerate(FROM)},
                         "by_kind": {n: r(hit, searched & (kind == i)) for i, n in enumerate(DECISION_KINDS)},
                         "overruled_by_kind": {n: r(hit, (source == 0) & (kind == i)) for i, n in enumerate(DECISION_KINDS)}}
        return out
    move_kind, ts = arr["group"], arr["turn_start"]
    every = np.ones(len(idx), bool)
    for what, hit in (("main", main_ok), ("move", move_ok)):
        out[what] = {"all": r(hit, every), **{n: r(hit, move_kind == k) for k, n in enumerate(MOVE_KINDS)},
                     "turn-start place": r(hit, ts), "other place": r(hit, (move_kind == 0) & ~ts)}
    out["main"]["all but turn-start"] = r(main_ok, ~ts)
    out["by_decision"] = {n: r(move_ok, kind == k) for k, n in enumerate(DECISION_KINDS)}
    out["flagged"] = {"all": r(arr["flagged"], every)}
    return out


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--data", required=True, help="a prepared set's folder (`prepare.py`)")
    p.add_argument("--dir", required=True, help="the run's folder: best.pt, last.pt, log.jsonl, resume.*, read.json")
    p.add_argument("--init", default=None, help="the checkpoint to start from (otherwise a fresh net of the sizes below)")
    p.add_argument("--width", type=int, default=128, help="a fresh net's width")
    p.add_argument("--layers", type=int, default=4, help="a fresh net's layers")
    p.add_argument("--heads", type=int, default=8, help="a fresh net's heads")
    p.add_argument("--actions", default=None, choices=["buckets", "exact"], help="the set's space, checked")
    p.add_argument("--skipped-weight", type=float, default=1.0, help="a distillation's skipped decisions (0: left out)")
    p.add_argument("--lr", type=float, default=None, help="imitation 5e-4, distillation 1e-4")
    p.add_argument("--wd", type=float, default=0.01)
    p.add_argument("--warmup", type=int, default=None, help="imitation 500, distillation 200")
    p.add_argument("--minibatch", type=int, default=4096, help="the whole minibatch, split over the chips")
    p.add_argument("--max-samples", type=int, default=None, help="the schedule's budget (imitation 100M, distillation 20M)")
    p.add_argument("--hours", type=float, default=None, help="stop once this many hours of this session's training have passed")
    p.add_argument("--amount-weight", type=float, default=0.5)
    p.add_argument("--vf", type=float, default=0.25)
    p.add_argument("--grad-clip", type=float, default=1.0)
    p.add_argument("--read-every", type=int, default=500)
    p.add_argument("--monitor", type=int, default=131072, help="held-out samples read at each checkpoint")
    p.add_argument("--seed", type=int, default=1)
    p.add_argument("--no-bf16", dest="bf16", action="store_false")
    p.add_argument("--chips", type=int, default=0, help="train on the first this many devices (0: all)")
    p.add_argument("--require", default=None, choices=["tpu", "gpu", "cpu"], help="fail unless JAX finds this platform")
    p.add_argument("--loader-threads", type=int, default=4, help="threads gathering the minibatches ahead of the step")
    p.add_argument("--read-chunk", type=int, default=16384, help="samples a read sends at once")
    p.add_argument("--in-memory", action="store_true", help="read the set into memory instead of mapping it")
    p.add_argument("--out", default="", help="write the final read as JSON here too")
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    out = train(args)
    text = json.dumps(out, indent=1)
    print(text)
    if args.out:
        with open(args.out, "w") as f:
            f.write(text + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())

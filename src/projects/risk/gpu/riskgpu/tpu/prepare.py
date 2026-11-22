"""A supervised training set made ready for the JAX trainer (`train.py`): every sample's observation,
legal choices and targets computed once, on the host's CPUs, by the PyTorch code that computes them
for the GPU trainers, and written as flat arrays the trainer streams.

    python -m riskgpu.tpu.prepare imitate --data runs/imitate/native-v2 --out /tmp/prepared/x [--actions exact]
        [--fraction 1] [--workers 0]
    python -m riskgpu.tpu.prepare distil --data runs/readings/e1/rec --out /tmp/prepared/y [--clock] [--workers 0]

run from `src/projects/risk/gpu/`.

**Why on the host, once.** The PyTorch trainers keep compact states and rebuild each minibatch's
observation on the GPU with the engine's own `options` and `observe` (`imitate.rebuild`). A TPU runs
no PyTorch, and porting the options (the rules' legality: borders, dice, fortify paths) to JAX would
be a second copy of the rules to keep equal to the first. So the rebuild runs here, once per sample,
on the session's CPUs (a TPU VM has hundreds), through exactly `Dataset.inputs` (imitation) and
`Recording.inputs` (distillation); the JAX side is the network, the loss and a loader, and the
observation stays single-sourced. A sample is used several times in a run (imitation's budget is
about six passes), so computing it once is also the cheaper side.

**What a sample holds** (`FIELDS`): the observation (`node`, `slot`, `glob`, stored in float16, which
holds more than the bfloat16 the TPU computes in), the legal main choices packed eight to a byte,
the target's main choice and amount, the amount's legal choices at that main choice, the value target
and which slots it reads, and in the exact space the target main choice's candidates as the argument
head reads them (`context`, `token`, `has_token`, `features`). The amount is needed only at the
target's main choice: training reads it there, and a predicted move can agree with the target only
where its main choice does. So the read needs two more masks, made by decoding with the PyTorch code
and comparing as `imitate.agreement` does (`normalize`): `ok_amount`, which of the target main
choice's amounts plays the target's move, and `ok_occupy`, which of the bucket space's three move-in
choices does (the only main choices that can play the same move). A net's whole-move agreement is
then exactly `imitate.agreement`'s and `distil.agreement`'s, which a test holds. Beside them: the
sample's game, whether it is held out and in the training set, its decision kind, and its group
(imitation: the teacher's move kind; distillation: where the target came from, `distil.FROM`), its
turn-start flag and whether its target is flagged, for the read's splits.

**The clock** (`--clock`, a distillation's: a recording knows its games' cap, an imitation's
extraction doesn't): the observation's globals end with the clock (`obs.py`), counted down to the
recording's cap, for a net that reads it; the set's `meta.json` says which it holds, and the trainer
makes its net read the clock exactly when the set has it.

**Sizes.** About 1.5 KB a sample in the bucket space and 3.7 KB in the exact one (the candidates'
features), against the compact state's 0.4 KB: the reason the compact set is what is uploaded and
this is made where it is trained. The set is checked against the disk's free space before anything
is written. Work is split into chunks over `--workers` processes (forked: they share the loaded set),
each writing its rows of the memory-mapped arrays; `meta.json` is written last, so a set without it
is incomplete, and a set whose `meta.json` matches the arguments is not made again.
"""

import argparse
import json
import multiprocessing
import os
import shutil
import sys
import time

import numpy as np
import torch

from ..board import MAX_SEATS, TERRITORIES, Board
from ..selfplay.actions import MAIN, OCCUPY, SLOTS, amount_group, candidate_moves, candidates, decode, legal_amount
from ..selfplay.imitate import Dataset, normalize
from ..selfplay.obs import CLOCK, GLOBAL, NODE, SLOT

TASKS = ("imitate", "distil")
LEGAL_BYTES = (MAIN + 7) // 8  # the legal main choices, eight to a byte
VERSION = 2


def fields(exact: bool, clock: bool) -> dict[str, tuple[str, tuple[int, ...]]]:
    """Each array's dtype and per-sample shape."""
    k = SLOTS if exact else 3
    out = {"node": ("float16", (TERRITORIES, NODE)), "slot": ("float16", (MAX_SEATS, SLOT)),
           "glob": ("float16", (GLOBAL + CLOCK if clock else GLOBAL,)),
           "legal": ("uint8", (LEGAL_BYTES,)), "main": ("int16", ()), "amount": ("int8", ()),
           "amount_legal": ("bool", (k,)), "ok_amount": ("bool", (k,)), "ok_occupy": ("bool", (3,)),
           "value": ("float32", (6,)), "value_ok": ("bool", (6,)),
           "game": ("int32", ()), "held_out": ("bool", ()), "train": ("bool", ()), "decision_kind": ("int8", ()),
           "group": ("int8", ()), "turn_start": ("bool", ()), "flagged": ("bool", ())}
    if exact:
        out.update({"context": ("int8", (2,)), "token": ("int8", (k,)), "has_token": ("bool", (k,)),
                    "features": ("float16", (k, 22))})
    return out


def bytes_per_sample(exact: bool, clock: bool) -> int:
    return sum(np.dtype(d).itemsize * int(np.prod(s)) for d, s in fields(exact, clock).values())


def encode(b: dict, target: torch.Tensor, exact: bool, board: Board, c=None) -> dict[str, np.ndarray]:
    """A rebuilt minibatch `b` (`imitate.rebuild`'s, with its targets `main` and `amount`) and the
    target's engine move `[N, 5]` as the arrays of `fields`, the training and read part."""
    s, o, main = b["s"], b["o"], b["main"].to(torch.int64)
    want = normalize(target.to(torch.int64), s, o)
    n = main.shape[0]
    if exact:
        if c is None:
            c = candidates(main, s, o, board)
        moves = candidate_moves(main, c, board)
        amount_legal = c.legal
        ok_amount = torch.stack([(normalize(moves[:, k], s, o) == want).all(1) for k in range(SLOTS)], 1) & c.legal
        ok_occupy = torch.zeros(n, 3, dtype=torch.bool)
    else:
        amount_legal = legal_amount(amount_group(main))
        ok_amount = torch.stack([(normalize(decode(main, torch.full_like(main, k), s, o, board), s, o) == want).all(1)
                                 for k in range(3)], 1) & amount_legal
        ok_occupy = torch.stack([(normalize(decode(torch.full_like(main, OCCUPY + a), torch.zeros_like(main), s, o, board),
                                            s, o) == want).all(1) & b["legal"][:, OCCUPY + a] for a in range(3)], 1)
    out = {"node": b["node"].numpy().astype(np.float16), "slot": b["slot"].numpy().astype(np.float16),
           "glob": b["glob"].numpy().astype(np.float16),
           "legal": np.packbits(b["legal"].numpy(), axis=1, bitorder="little"),
           "main": main.numpy().astype(np.int16), "amount": b["amount"].numpy().astype(np.int8),
           "amount_legal": amount_legal.numpy(), "ok_amount": ok_amount.numpy(), "ok_occupy": ok_occupy.numpy(),
           "value": b["value"].numpy().astype(np.float32), "value_ok": b["value_ok"].numpy()}
    if exact:
        out.update({"context": c.context.numpy().astype(np.int8), "token": c.token.numpy().astype(np.int8),
                    "has_token": c.has_token.numpy(), "features": c.features.numpy().astype(np.float16)})
    return out


class Source:
    """A compact set (an imitation's extraction or a recording) as the samples `encode` reads."""

    def __init__(self, task: str, data: str, actions: str | None, fraction: float, clock: bool):
        self.task, self.clock = task, clock
        if task == "imitate":
            assert not clock, "an imitation's extraction keeps no game's turn cap, so its set can't hold the clock"
            self.data = Dataset(data)
            self.actions = actions or "buckets"
            game = self.data.x["game"]
            self.train_games = self.data.train_games(fraction)
            self.extra = {"game": game.to(torch.int32), "held_out": self.data.held_out[game],
                          "train": self.train_games[game], "decision_kind": self.data.x["decision_kind"],
                          "group": self.data.x["move_kind"], "turn_start": self.data.x["turn_start"]}
        else:
            from ..selfplay.distil import Recording
            self.data = Recording(data)
            assert actions in (None, self.data.actions), \
                f"the recording's candidates are {self.data.actions} actions: --actions {actions} can't train on them"
            self.actions = self.data.actions
            game = self.data.sample_game()
            self.extra = {"game": game.to(torch.int32), "held_out": self.data.held_out[game],
                          "train": ~self.data.held_out[game], "decision_kind": self.data.x["decision_kind"],
                          "group": self.data.where_from(), "turn_start": torch.zeros_like(game, dtype=torch.bool)}
        self.exact = self.actions == "exact"
        self.n = self.data.n

    def chunk(self, lo: int, hi: int, board: Board) -> dict[str, np.ndarray]:
        idx = torch.arange(lo, hi)
        if self.task == "imitate":
            b = self.data.inputs(idx, board, "cpu", self.actions)
            out = encode(b, b["x"]["move"], self.exact, board, b["candidates"])
            out["flagged"] = b["flagged"].numpy()
        else:
            b = self.data.inputs(idx, board, "cpu", clock=self.clock)
            out = encode(b, b["x"]["move"], self.exact, board)
            out["flagged"] = np.zeros(hi - lo, dtype=bool)
        for k, v in self.extra.items():
            out[k] = v[lo:hi].numpy()
        return out


def path_of(out: str, name: str) -> str:
    return os.path.join(out, f"{name}.npy")


_WORK: dict = {}


def _write(span: tuple[int, int]) -> int:
    """Encodes samples `span` into the set's arrays (in a worker, from the forked parent's set)."""
    src, out, board = _WORK["source"], _WORK["out"], _WORK["board"]
    lo, hi = span
    arrays = src.chunk(lo, hi, board)
    for name, (dtype, shape) in fields(src.exact, src.clock).items():
        m = np.load(path_of(out, name), mmap_mode="r+")
        v = arrays[name]
        if v.dtype != np.dtype(dtype):
            # Only an integer narrowed (a kind, a game number): every value must survive it.
            assert v.dtype.kind in "iub" and np.array_equal(v.astype(dtype), v), (name, v.dtype, dtype)
            v = v.astype(dtype)
        assert v.shape == (hi - lo, *shape), (name, v.shape)
        m[lo:hi] = v
        m.flush()
        del m
    return hi - lo


def describe(args: argparse.Namespace) -> dict:
    """What a set is made from, which a set already made must match to be reused."""
    return {"version": VERSION, "task": args.task, "data": os.path.abspath(args.data), "actions": args.actions,
            "fraction": args.fraction, "clock": args.clock}


def prepare(args: argparse.Namespace) -> dict:
    meta_path = os.path.join(args.out, "meta.json")
    want = describe(args)
    if os.path.exists(meta_path):
        with open(meta_path) as f:
            meta = json.load(f)
        assert meta["made_from"] == want, f"{args.out} holds a set made otherwise: {meta['made_from']} against {want}"
        print(f"{args.out}: already prepared ({meta['n']} samples)", flush=True)
        return meta
    t0 = time.time()
    torch.set_num_threads(1)
    board = Board.load("cpu")
    src = Source(args.task, args.data, args.actions, args.fraction, args.clock)
    per = bytes_per_sample(src.exact, src.clock)
    os.makedirs(args.out, exist_ok=True)
    free = shutil.disk_usage(args.out).free
    need = per * src.n
    assert need < 0.95 * free, (f"the set needs {need / 1e9:.1f} GB ({src.n} samples at {per} B) and {args.out}'s "
                                f"disk has {free / 1e9:.1f} GB free")
    print(f"{args.task} set from {args.data}: {src.n} samples in the {src.actions} space, {per} B each, "
          f"{need / 1e9:.2f} GB; loaded in {time.time() - t0:.0f}s", flush=True)
    for name, (dtype, shape) in fields(src.exact, src.clock).items():
        np.lib.format.open_memmap(path_of(args.out, name), mode="w+", dtype=dtype, shape=(src.n, *shape)).flush()
    spans = [(lo, min(lo + args.chunk, src.n)) for lo in range(0, src.n, args.chunk)]
    _WORK.update({"source": src, "out": args.out, "board": board})
    done, t1 = 0, time.time()

    def progress(count: int) -> None:
        nonlocal done
        done += count
        if done == src.n or done // args.chunk % 64 == 0:
            rate = done / max(time.time() - t1, 1e-9)
            print(f"  {done}/{src.n} samples, {rate:,.0f}/s", flush=True)
    if args.workers > 1:
        # Forked, so every worker reads the parent's loaded set without a copy.
        with multiprocessing.get_context("fork").Pool(args.workers, initializer=torch.set_num_threads,
                                                      initargs=(1,)) as pool:
            for count in pool.imap_unordered(_write, spans):
                progress(count)
    else:
        for span in spans:
            progress(_write(span))
    _WORK.clear()
    meta = {"made_from": want, "task": args.task, "actions": src.actions, "clock": src.clock, "n": src.n,
            "bytes_per_sample": per, "fields": {k: [d, list(s)] for k, (d, s) in fields(src.exact, src.clock).items()},
            "edges": board.edges.tolist(), "adjacency": board.adjacency.to(torch.int8).tolist(),
            "games": int(src.extra["game"].max()) + 1 if src.n else 0,
            "recording": getattr(src.data, "configs", None), "seconds": round(time.time() - t0, 1),
            "samples_per_s": round(src.n / max(time.time() - t1, 1e-9))}
    with open(meta_path + ".tmp", "w") as f:
        json.dump(meta, f)
    os.replace(meta_path + ".tmp", meta_path)
    print(f"prepared {src.n} samples in {meta['seconds']:.0f}s ({meta['samples_per_s']:,}/s)", flush=True)
    return meta


class Prepared:
    """A prepared set, its arrays memory-mapped (`load` reads them into memory instead)."""

    def __init__(self, folder: str, load: bool = False):
        with open(os.path.join(folder, "meta.json")) as f:
            self.meta = json.load(f)
        self.task, self.actions, self.n, self.clock = self.meta["task"], self.meta["actions"], self.meta["n"], self.meta["clock"]
        self.exact = self.actions == "exact"
        self.arrays = {name: np.load(path_of(folder, name), mmap_mode=None if load else "r")
                       for name in self.meta["fields"]}

    def batch(self, idx: np.ndarray, names=None) -> dict[str, np.ndarray]:
        return {k: v[idx] for k, v in self.arrays.items() if names is None or k in names}


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("task", choices=TASKS)
    p.add_argument("--data", required=True, help="an imitation's extraction folder, or a recording's (several, comma-separated)")
    p.add_argument("--out", required=True, help="the prepared set's folder")
    p.add_argument("--actions", default=None, choices=["buckets", "exact"],
                   help="imitation: the net's action space (default buckets); distillation: the recording's, if given")
    p.add_argument("--fraction", type=float, default=1.0, help="imitation: the share of training games (`imitate --fraction`)")
    p.add_argument("--clock", action="store_true", help="distillation: the observation ends with the clock (`obs.py`)")
    p.add_argument("--workers", type=int, default=0, help="processes (0 or 1: this one)")
    p.add_argument("--chunk", type=int, default=4096, help="samples a worker encodes at once")
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    prepare(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())

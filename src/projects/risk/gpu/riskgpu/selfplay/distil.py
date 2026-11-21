"""Distilling a rollout search's recorded choices into the network (`ideas/learned-bot.md`, stage 3,
expert iteration): the policy trained to play as its own search did, the value head to the
recorded games' outcomes.

    python -m riskgpu.selfplay.distil --data runs/search-records/b1-k3r6 --init runs/selfplay/b1/snap-100.pt
        --dir runs/distil/x1 [--target hard] [--skipped-weight 1] [--max-samples 50000000] [--out distil.json]

run from `src/projects/risk/gpu/`. The recording is `record.py`'s; the machinery is `imitate.py`'s:
the observations rebuilt on the device from the kept states each minibatch (`imitate.rebuild`), the
same loop at a fixed schedule over a set budget of samples (`imitate.fit`), and a read that only
chooses the checkpoint kept. The net is `--init`'s, in its action space, which must be the
recording's (a recording keeps its candidates as that space's actions; the engine move it keeps
would let another space's targets be made from it, as `imitate.exact_targets` does, but nothing
does that yet).

**The target** (`--target`). `hard` (the default): cross-entropy to the candidate the search played,
its main choice and its amount. `soft`: the main choice's target spreads the probability the network
gave the candidates' main choices over them by a softmax of their mean scores at `--tau`, and keeps
the rest on the other legal choices in the proportions the network being trained gives them (no
gradient there), so the search reshapes only what it compared. Hard is the default because the
search played its single best candidate (past a margin), that is the move whose strength was
measured, and the raw bot plays its most likely move, which cross-entropy to the choice trains
directly; with three candidates and six rollouts each, a mean's noise (about 0.3 on a ±1 score)
dwarfs most gaps between candidates, so a soft target at a low temperature is the hard one and at a
high one is close to uniform over the three. Soft is kept for a recording with more rollouts.

**The amount.** A bucket net's candidates are its main choice by its amount bucket, so the search's
choice is a whole action of the net's space and the amount head is trained on it wherever its main
choice has more than one legal amount (both targets train it hard). What the search never chose
between it never teaches: its candidates are the network's three most likely joint actions, so an
amount outside its own top three is never a candidate, and the kinds the search doesn't search
(move-in, fortify, by default) are taught only as the network already plays them, from `--skipped`
decisions. In the exact space the amount is the argument slot, rebuilt from the state.

**The clock.** A net that reads the clock (`obs.py`) is shown it in every sample, counted from the
sample's kept turn down to its recording's cap (the search's `cap`, which every `recording.json`
holds). That is a fact of the game, not of the net that recorded it, so a recording made on a net
with or without the clock distils into either: a net without it is shown what it always is, and a
net with it the turns that were left in the game the search played. A searcher without the clock
played as if it didn't know them, so its targets carry no use of them; the distilled net learns its
use of the clock only from the net it starts from.

**Skipped decisions** (a recording made with `--skipped`): their target is the network's own first
choice, weighted by `--skipped-weight` (0 leaves them out), so the net isn't pulled off its play
where the search didn't look. The value head trains on every decision kept.

**Held out by game**: game g is held out when g % 5 == 4. The read (each `--read-every` steps, on a
fixed sample of the held-out decisions) is agreement with the search's move, the main choice alone
and the whole move, split by where the target came from: `overruled` (the search played another
move than the network's first choice: the number that matters, and 0 at the start by construction),
`kept` (searched, the first choice played: 1 at the start) and `skipped`. The checkpoint kept
maximises the move agreement over every searched decision, which can only rise by gaining overruled
decisions faster than kept ones are lost. At the end the kept checkpoint is read over every held-out
decision, by decision kind and by source, with 95% intervals by bootstrap over games (`--out`).

**Sizing a session, by counting work.** A recording's summary (`record.py --out`) counts the
searched decisions per game (S) and the search's work per searched decision (W, the trunk rows of
its rollouts and leaves, `search.Work`); the real games add about one trunk row per decision played.
A recording of N self-play games costs N × S × W trunk rows of the search, and its training set is
N × S searched samples (plus the skipped ones, with `--skipped`). In self-play every seat searches,
so S is about the table's size times a one-in recording's searched decisions per game.
"""

import argparse
import glob
import json
import os
import sys

import numpy as np
import torch
from torch.nn import functional as F

from ..board import Board
from .actions import MAIN
from .imitate import (DECISION_KINDS, HELD_OUT_EVERY, fit, forward, normalize, predict, rebuild, require_cuda,
                      share_reader)
from .net import Net, init_from, shape_of
from .record import CONFIG, SEARCHED

# Where a target came from, as the read splits it.
FROM = ("overruled", "kept", "skipped")


class Recording:
    """Every shard of one or more recordings (`folders`, comma-separated: two GPUs' recordings of
    one net, say), on the host. Games are numbered across them in order; each recording's game g is
    held out when g % 5 == 4."""

    def __init__(self, folders: str):
        parts, scores, held_out, caps, self.configs = [], [], [], [], []
        offset = 0
        for folder in [f for f in folders.split(",") if f]:
            with open(os.path.join(folder, CONFIG)) as f:
                self.configs.append(json.load(f))
            paths = sorted(glob.glob(os.path.join(folder, "shard-*.pt")))
            assert paths, f"no shards in {folder}"
            games = []
            for path in paths:
                d = torch.load(path, weights_only=False)
                games.append(d.pop("games"))
                d.pop("meta")
                d["game"] = d["game"].to(torch.int64) + offset
                parts.append(d)
                caps.append(torch.full((len(d["game"]),), self.configs[-1]["search"]["cap"], dtype=torch.int64))
            index = torch.cat([g["index"] for g in games])
            count = int(index.max()) + 1
            mine = torch.zeros(count, 6)
            mine[index] = torch.cat([g["scores"] for g in games]).float()
            scores.append(mine)
            held_out.append(torch.arange(count) % HELD_OUT_EVERY == HELD_OUT_EVERY - 1)
            offset += count
        self.x = {k: torch.cat([p[k] for p in parts]) for k in parts[0]}
        self.scores, self.held_out, self.cap = torch.cat(scores), torch.cat(held_out), torch.cat(caps)
        self.n = len(self.x["game"])
        spaces = {c["actions"] for c in self.configs}
        assert len(spaces) == 1, f"recordings in more than one action space: {spaces}"
        self.actions = spaces.pop()

    def sample_game(self) -> torch.Tensor:
        return self.x["game"].to(torch.int64)

    def where_from(self) -> torch.Tensor:
        """`[N]` int64: each sample's source as `FROM` indexes it."""
        searched = self.x["source"] == SEARCHED
        return torch.where(searched & self.x["overruled"], 0, torch.where(searched, 1, 2))

    def inputs(self, idx: torch.Tensor, board: Board, device: str, clock: bool) -> dict:
        """Samples `idx` rebuilt for a net that reads the clock (`clock`), counted down to their
        recording's cap, or for one that doesn't."""
        game_scores = self.scores[self.sample_game()[idx]].to(device)
        x = {k: v[idx].to(device, non_blocking=True) for k, v in self.x.items()}
        b = rebuild(x, game_scores, board, self.actions == "exact", self.cap[idx].to(device) if clock else None)
        rows = torch.arange(idx.shape[0], device=device)
        chosen = x["chosen"].to(torch.int64)
        b.update({"main": x["cand_main"].to(torch.int64)[rows, chosen], "amount": x["cand_amount"].to(torch.int64)[rows, chosen],
                  "x": x})
        return b


def soft_main_target(z: torch.Tensor, x: dict, tau: float) -> torch.Tensor:
    """`[N, MAIN]`: the candidates' main choices hold the probability the recording's network gave
    them, spread by a softmax of their mean scores at `tau`; the other legal choices hold the rest in
    the proportions `z` (the masked logits being trained, detached) gives them."""
    n, k = x["cand_main"].shape
    main = x["cand_main"].to(torch.int64)
    ok = x["cand_ok"]
    w = torch.softmax(torch.where(ok, x["mean"] / tau, -torch.inf), 1)
    # The probability of each distinct candidate main choice, counted once.
    seen = (main[:, :, None] == main[:, None, :]) & ok[:, None, :] & torch.ones(k, k, dtype=torch.bool,
                                                                                   device=z.device).tril(-1)
    first = ok & ~seen.any(2)
    mass = torch.where(first, x["p_main"], 0.0).sum(1).clamp(0, 1)
    on_cand = torch.zeros(n, MAIN, device=z.device).scatter_add(1, main, ok.float()) > 0
    q = torch.softmax(z.detach(), 1)
    rest = torch.where(on_cand, 0.0, q)
    rest_total = rest.sum(1, keepdim=True)
    t = torch.where(rest_total > 0, rest / rest_total.clamp(min=1e-30), 0.0) * (1 - mass)[:, None]
    t = t.scatter_add(1, main, w * mass[:, None])
    return t / t.sum(1, keepdim=True)


def losses(net: Net, b: dict, args) -> dict:
    z, za, amount_legal, value, _ = forward(net, b, args.bf16)
    x = b["x"]
    searched = x["source"] == SEARCHED
    weight = torch.where(searched, 1.0, args.skipped_weight)
    lp = torch.log_softmax(z, 1)
    if args.target == "soft":
        t = soft_main_target(z, x, args.tau)
        main_ce = torch.where(searched, -torch.where(t > 0, t * lp, 0.0).sum(1), -lp.gather(1, b["main"][:, None])[:, 0])
    else:
        main_ce = -lp.gather(1, b["main"][:, None])[:, 0]
    total = weight.sum().clamp(min=1e-9)
    has = (amount_legal.sum(1) > 1) & (weight > 0)
    amount_ce = (F.cross_entropy(za[has], b["amount"][has], reduction="none") * weight[has]).sum() / \
        weight[has].sum().clamp(min=1e-9) if bool(has.any()) else z.sum() * 0
    v = (((value - b["value"]) ** 2) * b["value_ok"]).sum() / b["value_ok"].sum()
    with torch.no_grad():
        agree = (z.argmax(1) == b["main"]).float()[searched].mean() if bool(searched.any()) else z.sum() * 0
    return {"main": (main_ce * weight).sum() / total, "amount": amount_ce, "value": v, "agree": agree}


@torch.no_grad()
def agreement(net: Net, data: Recording, idx: torch.Tensor, board: Board, device: str, bf16: bool,
              chunk: int = 8192):
    """Per sample in `idx`: whether the net's main choice and its whole move agree with the
    search's, and the value's squared error on the present slots (summed, with the count)."""
    net.eval()
    main_ok, move_ok, verr, vcount = [], [], 0.0, 0
    for at in range(0, len(idx), chunk):
        b = data.inputs(idx[at:at + chunk], board, device, net.clock)
        main, _, move, value = predict(net, b, bf16, board)
        target = b["x"]["move"].to(torch.int64)
        main_ok.append((main == b["main"]).cpu())
        move_ok.append((normalize(move, b["s"], b["o"]) == normalize(target, b["s"], b["o"])).all(1).cpu())
        verr += float((((value - b["value"]) ** 2) * b["value_ok"]).sum())
        vcount += int(b["value_ok"].sum())
    net.train()
    return torch.cat(main_ok), torch.cat(move_ok), verr / max(vcount, 1)


def report(net: Net, data: Recording, idx: torch.Tensor, board: Board, device: str, bf16: bool) -> dict:
    """The read over `idx`: main and move agreement with the search, overall (searched decisions),
    by source and by decision kind, with 95% intervals by bootstrap over games."""
    main_ok, move_ok, verr = agreement(net, data, idx, board, device, bf16)
    read_of = share_reader(data.sample_game()[idx])
    source = data.where_from()[idx]
    kind = data.x["decision_kind"][idx].to(torch.int64)
    searched = source < 2
    out = {"samples": len(idx), "games": len(np.unique(data.sample_game()[idx].numpy())), "value_mse": round(verr, 5)}
    for what, hit in (("main", main_ok), ("move", move_ok)):
        out[what] = {"searched": read_of(hit, searched),
                     "by_source": {name: read_of(hit, source == i) for i, name in enumerate(FROM)},
                     "by_kind": {name: read_of(hit, searched & (kind == i)) for i, name in enumerate(DECISION_KINDS)},
                     "overruled_by_kind": {name: read_of(hit, (source == 0) & (kind == i))
                                           for i, name in enumerate(DECISION_KINDS)}}
    return out


def train(args) -> dict:
    device = args.device
    require_cuda(device)
    torch.manual_seed(args.seed)
    args.name = os.path.basename(os.path.normpath(args.dir))
    os.makedirs(args.dir, exist_ok=True)
    with open(os.path.join(args.dir, "args.json"), "w") as f:
        json.dump(vars(args), f, indent=1)
    board = Board.load(device)
    data = Recording(args.data)
    state = torch.load(args.init, map_location=device, weights_only=False)
    shape = shape_of(state.get("net", state))
    assert shape["actions"] == data.actions, \
        f"--init is a {shape['actions']} net and the recording's candidates are {data.actions} actions"
    net = Net(**shape, edges=board.edges, adjacency=board.adjacency).to(device)
    init_from(net, state)

    game = data.sample_game()
    keep = (data.x["source"] == SEARCHED) | (args.skipped_weight > 0)
    train_idx = torch.nonzero(~data.held_out[game] & keep)[:, 0]
    held_idx = torch.nonzero(data.held_out[game])[:, 0]
    assert len(train_idx) >= args.minibatch, f"{len(train_idx)} training samples, fewer than a minibatch"
    monitor = held_idx[torch.randperm(len(held_idx), generator=torch.Generator().manual_seed(7))[: args.monitor]].sort().values
    fit_monitor = train_idx[torch.randperm(len(train_idx), generator=torch.Generator().manual_seed(11))[: args.monitor]
                            ].sort().values
    source = data.where_from()
    print(f"{args.name}: {len(train_idx)} training samples ({int((source[train_idx] == 0).sum())} overruled), "
          f"{len(held_idx)} held out (monitor {len(monitor)}), from {args.init}", flush=True)

    def loss_of(b: dict):
        parts = losses(net, b, args)
        return parts["main"] + args.amount_weight * parts["amount"] + args.vf * parts["value"], parts

    def read_of() -> dict:
        _, move_ok, verr = agreement(net, data, monitor, board, device, args.bf16)
        _, fit_move, _ = agreement(net, data, fit_monitor, board, device, args.bf16)
        src = source[monitor]
        searched = src < 2

        def share(mask: torch.Tensor) -> float | None:
            return round(float(move_ok[mask].float().mean()), 5) if bool(mask.any()) else None
        return {"fit_move": round(float(fit_move.float().mean()), 5), "held_move": share(searched),
                **{f"held_{name}": share(src == i) for i, name in enumerate(FROM)},
                "held_value_mse": round(verr, 5), "_best": float(move_ok[searched].float().mean())}

    best, best_step = fit(net, args, args.dir, train_idx, lambda idx: data.inputs(idx, board, device, net.clock), loss_of,
                          read_of, "held_move")
    print(f"{args.name}: best held-out move agreement on searched decisions {best:.4f} at step {best_step}", flush=True)
    init_from(net, torch.load(os.path.join(args.dir, "best.pt"), map_location=device, weights_only=False))
    out = {"dir": args.dir, "data": args.data, "init": args.init, "target": args.target, "best_step": best_step,
           "held_out": report(net, data, held_idx, board, device, args.bf16)}
    return out


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--data", required=True, help="a recording's folder (`record.py --dir`), or several, comma-separated")
    p.add_argument("--init", required=True, help="the checkpoint to start from, in the recording's action space")
    p.add_argument("--dir", required=True, help="the run's folder: best.pt, last.pt, log.jsonl")
    p.add_argument("--target", default="hard", choices=["hard", "soft"])
    p.add_argument("--tau", type=float, default=0.05, help="the soft target's temperature on the mean scores")
    p.add_argument("--skipped-weight", type=float, default=1.0, help="the skipped decisions' weight (0: left out)")
    p.add_argument("--device", default="cuda")
    p.add_argument("--lr", type=float, default=1e-4)
    p.add_argument("--wd", type=float, default=0.01)
    p.add_argument("--warmup", type=int, default=200)
    p.add_argument("--minibatch", type=int, default=4096)
    p.add_argument("--max-samples", type=int, default=20_000_000, help="the schedule's budget of samples")
    p.add_argument("--hours", type=float, default=None,
                   help="stop once this many hours of training have passed (the schedule stays over --max-samples)")
    p.add_argument("--amount-weight", type=float, default=0.5)
    p.add_argument("--vf", type=float, default=0.25)
    p.add_argument("--grad-clip", type=float, default=1.0)
    p.add_argument("--read-every", type=int, default=500)
    p.add_argument("--monitor", type=int, default=131072, help="held-out samples read at each checkpoint")
    p.add_argument("--seed", type=int, default=1)
    p.add_argument("--no-bf16", dest="bf16", action="store_false")
    p.add_argument("--out", default="", help="write the final held-out report as JSON here too")
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

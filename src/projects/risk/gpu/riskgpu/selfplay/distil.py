"""Distilling a rollout search's recorded choices into the network (`ideas/learned-bot.md`, stage 3,
expert iteration): the policy trained to play as its own search did, the value head to the
recorded games' outcomes.

    python -m riskgpu.selfplay.distil --data runs/search-records/b1-k3r6 --init runs/selfplay/b1/snap-100.pt
        --dir runs/distil/x1 [--target hard] [--z-min 2] [--skipped-weight 1] [--max-samples 50000000] [--out distil.json]

    python -m riskgpu.selfplay.distil --data runs/search-records/e4 --init runs/selfplay/d4/snap-500.pt
        --dir runs/distil/e4 --target completed-q [--tau-prior 0.03] [--temp 0.03]

    python -m riskgpu.selfplay.distil --data runs/own-records/d4-500 --width 256 --layers 6 --clock
        --dir runs/distil/copy-256x6 --lr 5e-4 --warmup 500 --max-samples 100000000

run from `src/projects/risk/gpu/`. The recording is `record.py`'s, or a net's own play recorded by
`own.py` in the same format; the machinery is `imitate.py`'s: the observations rebuilt on the device
from the kept states each minibatch (`imitate.rebuild`), the same loop at a fixed schedule over a set
budget of samples (`imitate.fit`), and a read that only chooses the checkpoint kept. The net is
`--init`'s, or a fresh one of `--width`, `--layers` and `--heads` (with `--clock`, reading the
clock), in the recording's action space (a recording keeps its candidates as that space's actions;
the engine move it keeps would let another space's targets be made from it, as
`imitate.exact_targets` does, but nothing does that yet). A fresh net is a copy learned from random
weights, so it takes imitation's recipe, given in its arguments (the defaults are a fine-tune's).

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

**The noise.** A candidate's gap over the first choice, read copy by copy from its paired rollouts,
has a standard error of about 0.026 at six rollouts, while the true gaps spread by about 0.03 round
0: most of a six-rollout search's overrules are noise. The gap's z (the gap over its own standard
error) tells them apart, and two targets read it from a recording's kept rollouts (`record.py`'s
`vals`; a recording without them is refused, by name). `--z-min Z` with the hard target trains an
overrule whose chosen candidate's z is under Z as the first choice. `completed-q` shrinks each
candidate's gap toward 0 by its own evidence, gap · τ² / (τ² + se²) with τ `--tau-prior` (the true
gaps' spread), a candidate that decodes to the first choice's own move holding 0, and gives each
candidate the joint probability (main choice and amount) the recording's network gave it, tilted by
exp(shrunk gap / `--temp`): its mass over the candidates stays theirs, redistributed. The main
choice is trained to that distribution's marginal, the rest kept as `soft` keeps it: a candidate
main choice's amounts outside the candidates keep the network's probability, the other legal choices
the trained net's proportions. As se grows the target returns to the network's own probabilities;
as se and the temperature fall, the candidates' mass goes to the best gap, which the hard target
(at no margin) trains alone.

**The amount.** A bucket net's candidates are its main choice by its amount bucket, so the search's
choice is a whole action of the net's space and the amount head is trained on it wherever its main
choice has more than one legal amount. Every target trains it hard: `soft` to the candidate the
search played, `completed-q` to its own most likely candidate, on that candidate's main choice
(the amount head reads the main choice it is given). What the search never chose
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

**A net's own play** (`own.py`, `source` `record.PLAYED`): every target is the recording net's most
likely move, and every decision counts as a searched one does (weight 1, in the headline read, as
`kept`: the target is the net's own first choice), so the read is the copy's agreement with the net.

**Held out by game**: game g is held out when g % 5 == 4. The read (each `--read-every` steps, on a
fixed sample of the held-out decisions) is agreement with the search's move, the main choice alone
and the whole move, split by where the target came from: `overruled` (the search played another
move than the network's first choice: the number that matters, and 0 at the start by construction),
`kept` (searched, or played, the first choice the target: 1 at the start) and `skipped`. The
headline read, `searched` in the reports, is over the decisions the recording is for: searched and
played ones. The checkpoint kept
maximises the move agreement over every searched decision, which can only rise by gaining overruled
decisions faster than kept ones are lost. At the end the kept checkpoint is read over every held-out
decision, by decision kind and by source, with 95% intervals by bootstrap over games (`--out`).
With the rollouts kept, the final read adds the overruled decisions' move agreement by the chosen
candidate's z (under 1, 1 to 2, 2 to 3, over 3), where main agreement alone flatters (an overrule
often keeps the main choice and changes the amount), and the value of the net's most likely move
among the candidates: its mean paired gap over the first choice on the recorded rollouts, 0 where
it keeps the first choice's move, beside the search's own choice's on the same decisions. Both are
in-sample to the rollouts the search chose on, which flatter the search's own choice most.

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
from .record import CONFIG, PLAYED, SEARCHED
from .search import paired_gaps, z_scores

# Where a target came from, as the read splits it.
FROM = ("overruled", "kept", "skipped")
# The read's bins of an overrule's z: under 1, 1 to 2, 2 to 3, over 3.
Z_BINS = {"under 1": (-float("inf"), 1), "1-2": (1, 2), "2-3": (2, 3), "over 3": (3, float("inf"))}
ROLLOUTS = ("vals", "same_move")


def counted(source: torch.Tensor) -> torch.Tensor:
    """Whether each sample is a decision its recording is for (searched, or a net's own play), the
    headline read's and weighted 1; the rest are a search's skipped decisions."""
    return (source == SEARCHED) | (source == PLAYED)


def cap_of(config: dict) -> int:
    """A recording's turn cap: a search's (`record.py`), or a net's own play's (`own.py`)."""
    return config["cap"] if config.get("kind") == "own" else config["search"]["cap"]


class Recording:
    """Every shard of one or more recordings (`folders`, comma-separated: two GPUs' recordings of
    one net, say), on the host. Games are numbered across them in order; each recording's game g is
    held out when g % 5 == 4."""

    def __init__(self, folders: str):
        self.folders = folders
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
                caps.append(torch.full((len(d["game"]),), cap_of(self.configs[-1]), dtype=torch.int64))
            index = torch.cat([g["index"] for g in games])
            count = int(index.max()) + 1
            mine = torch.zeros(count, 6)
            mine[index] = torch.cat([g["scores"] for g in games]).float()
            scores.append(mine)
            held_out.append(torch.arange(count) % HELD_OUT_EVERY == HELD_OUT_EVERY - 1)
            offset += count
        # Fields every shard holds; a recording made before the rollouts were kept holds no `vals`.
        keys = [k for k in parts[0] if all(k in p for p in parts)]
        if "vals" in keys:
            width = max(p["vals"].shape[2] for p in parts)
            for p in parts:
                p["vals"] = F.pad(p["vals"], (0, width - p["vals"].shape[2]))
        self.x = {k: torch.cat([p[k] for p in parts]) for k in keys}
        self.scores, self.held_out, self.cap = torch.cat(scores), torch.cat(held_out), torch.cat(caps)
        self.n = len(self.x["game"])
        spaces = {c["actions"] for c in self.configs}
        assert len(spaces) == 1, f"recordings in more than one action space: {spaces}"
        self.actions = spaces.pop()

    def require_rollouts(self, what: str) -> None:
        missing = [k for k in ROLLOUTS if k not in self.x]
        assert not missing, (f"{what} reads every rollout's value, and {self.folders} lacks {', '.join(missing)}: "
                             "a recording made before record.py kept them, or mixed with one")

    def sample_game(self) -> torch.Tensor:
        return self.x["game"].to(torch.int64)

    def where_from(self) -> torch.Tensor:
        """`[N]` int64: each sample's source as `FROM` indexes it."""
        mine = counted(self.x["source"])
        return torch.where(mine & self.x["overruled"], 0, torch.where(mine, 1, 2))

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


def rollout_gaps(x: dict) -> tuple[torch.Tensor, torch.Tensor]:
    """`(gap, se)` `[N, K]`: each candidate's paired gap over the first choice on its recorded
    rollouts, and its standard error."""
    return paired_gaps(x["vals"], x["count"][:, 0].to(torch.int64))


def chosen_z(x: dict) -> torch.Tensor:
    """`[N]`: the z of the candidate the search played (0 where it played the first choice)."""
    gap, se = rollout_gaps(x)
    return z_scores(gap, se).gather(1, x["chosen"].to(torch.int64)[:, None])[:, 0]


def completed_q_weights(x: dict, tau_prior: float, temp: float) -> torch.Tensor:
    """`[N, K]`: the candidates' share of their mass in the completed-Q target, each the recording
    network's joint probability of it tilted by exp(shrunk gap / `temp`)."""
    gap, se = rollout_gaps(x)
    shrunk = torch.where(x["same_move"], 0.0, gap * tau_prior ** 2 / (tau_prior ** 2 + se ** 2))
    prior = x["p_main"] * x["p_amount"]
    # A decision not searched keeps one candidate and no probabilities: its log 0 is held finite.
    logit = prior.clamp(min=1e-30).log() + shrunk / temp
    return torch.softmax(torch.where(x["cand_ok"], logit, -torch.inf), 1)


def completed_q_main_target(z: torch.Tensor, x: dict, w: torch.Tensor) -> torch.Tensor:
    """`[N, MAIN]`: the main-choice marginal of the completed-Q target. The candidates hold their
    joint probability under the recording's network redistributed by `w`; a candidate main choice's
    other amounts keep that network's probability, and the other legal choices the rest in the
    proportions `z` (the masked logits being trained, detached) gives them."""
    n, k = x["cand_main"].shape
    main = x["cand_main"].to(torch.int64)
    ok = x["cand_ok"]
    seen = (main[:, :, None] == main[:, None, :]) & ok[:, None, :] & torch.ones(k, k, dtype=torch.bool,
                                                                                   device=z.device).tril(-1)
    first = ok & ~seen.any(2)
    mass = torch.where(first, x["p_main"], 0.0).sum(1).clamp(0, 1)
    prior = torch.where(ok, x["p_main"] * x["p_amount"], 0.0)
    on_cand = torch.zeros(n, MAIN, device=z.device).scatter_add(1, main, ok.float()) > 0
    q = torch.softmax(z.detach(), 1)
    rest = torch.where(on_cand, 0.0, q)
    rest_total = rest.sum(1, keepdim=True)
    t = torch.where(rest_total > 0, rest / rest_total.clamp(min=1e-30), 0.0) * (1 - mass)[:, None]
    t = t.scatter_add(1, main, torch.where(first, x["p_main"], 0.0))
    t = t.scatter_add(1, main, w * prior.sum(1, keepdim=True) - prior).clamp(min=0)
    # A decision not searched may hold nothing here; it trains on its hard target, and stays finite.
    return t / t.sum(1, keepdim=True).clamp(min=1e-30)


def train_choice(x: dict, args) -> torch.Tensor:
    """`[N]`: the candidate each sample's policy is trained toward hard, where it isn't the search's
    choice: under `completed-q` its target's most likely candidate (for the amount), and under
    `--z-min` the search's choice, or the first choice where the search overruled it on a z under
    the bar."""
    if args.target == "completed-q":
        return completed_q_weights(x, args.tau_prior, args.temp).argmax(1)
    return torch.where(x["overruled"] & (chosen_z(x) < args.z_min), 0, x["chosen"].to(torch.int64))


def losses(net: Net, b: dict, args) -> dict:
    x = b["x"]
    if args.target == "completed-q" or args.z_min is not None:
        choice = train_choice(x, args)
        rows = torch.arange(choice.shape[0], device=choice.device)
        b = {**b, "main": x["cand_main"].to(torch.int64)[rows, choice],
             "amount": x["cand_amount"].to(torch.int64)[rows, choice]}
    z, za, amount_legal, value, _ = forward(net, b, args.bf16)
    searched = counted(x["source"])
    weight = torch.where(searched, 1.0, args.skipped_weight)
    lp = torch.log_softmax(z, 1)
    if args.target in ("soft", "completed-q"):
        if args.target == "soft":
            t = soft_main_target(z, x, args.tau)
        else:
            t = completed_q_main_target(z, x, completed_q_weights(x, args.tau_prior, args.temp))
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
    search's, the value's squared error on the present slots (summed, with the count), and the net's
    most likely main choice and amount."""
    net.eval()
    main_ok, move_ok, verr, vcount, mains, amounts = [], [], 0.0, 0, [], []
    for at in range(0, len(idx), chunk):
        b = data.inputs(idx[at:at + chunk], board, device, net.clock)
        main, amount, move, value = predict(net, b, bf16, board)
        mains.append(main.cpu())
        amounts.append(amount.cpu())
        target = b["x"]["move"].to(torch.int64)
        main_ok.append((main == b["main"]).cpu())
        move_ok.append((normalize(move, b["s"], b["o"]) == normalize(target, b["s"], b["o"])).all(1).cpu())
        verr += float((((value - b["value"]) ** 2) * b["value_ok"]).sum())
        vcount += int(b["value_ok"].sum())
    net.train()
    return torch.cat(main_ok), torch.cat(move_ok), verr / max(vcount, 1), torch.cat(mains), torch.cat(amounts)


def report(net: Net, data: Recording, idx: torch.Tensor, board: Board, device: str, bf16: bool) -> dict:
    """The read over `idx`: main and move agreement with the search, overall (searched decisions),
    by source and by decision kind, with 95% intervals by bootstrap over games; with the rollouts
    kept, the overruled decisions' move agreement by z and the value of the net's own move."""
    main_ok, move_ok, verr, main, amount = agreement(net, data, idx, board, device, bf16)
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
    if all(k in data.x for k in ROLLOUTS):
        x = {k: data.x[k][idx] for k in ("vals", "count", "same_move", "cand_ok", "cand_main", "cand_amount", "chosen")}
        z = chosen_z(x)
        out["move"]["overruled_by_z"] = {name: read_of(move_ok, (source == 0) & (z >= lo) & (z < hi))
                                         for name, (lo, hi) in Z_BINS.items()}
        out["value_in_sample"] = own_move_value(x, main, amount, read_of, data.x["source"][idx] == SEARCHED)
    return out


def own_move_value(x: dict, main: torch.Tensor, amount: torch.Tensor, read_of, searched: torch.Tensor) -> dict:
    """The value of the net's most likely move (`main`, `amount`) where it is one of the
    candidates, as its mean paired gap over the first choice on the recorded rollouts (0 for the
    first choice's own move), beside the search's choice's on the same decisions and on all."""
    gap, _ = rollout_gaps(x)
    gap = torch.where(x["same_move"], 0.0, gap)
    match = x["cand_ok"] & (x["cand_main"].to(torch.int64) == main[:, None]) & \
        (x["cand_amount"].to(torch.int64) == amount[:, None])
    among = match.any(1) & searched
    rows = torch.arange(len(main))
    net = gap[rows, match.to(torch.int8).argmax(1)]
    search = gap[rows, x["chosen"].to(torch.int64)]
    return {"label": "in-sample: mean paired gap over the first choice on the rollouts the search chose on",
            "net_among_candidates": read_of(among.float(), searched),
            "net": read_of(net, among), "search_same_decisions": read_of(search, among),
            "search_all": read_of(search, searched)}


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
    assert args.z_min is None or args.target == "hard", "--z-min relabels the hard target's overrules"
    if args.target == "completed-q":
        data.require_rollouts("--target completed-q")
    if args.z_min is not None:
        data.require_rollouts("--z-min")
    assert (args.init is None) != (args.width is None), "start from --init, or a fresh net of --width and --layers"
    if args.init:
        state = torch.load(args.init, map_location=device, weights_only=False)
        shape = shape_of(state.get("net", state))
    else:
        shape = {"width": args.width, "layers": args.layers, "heads": args.heads, "ff_mult": 4, "actions": data.actions,
                 "clock": args.clock}
    assert shape["actions"] == data.actions, \
        f"the net is a {shape['actions']} net and the recording's candidates are {data.actions} actions"
    net = Net(**shape, edges=board.edges, adjacency=board.adjacency).to(device)
    if args.init:
        init_from(net, state)

    game = data.sample_game()
    keep = counted(data.x["source"]) | (args.skipped_weight > 0)
    train_idx = torch.nonzero(~data.held_out[game] & keep)[:, 0]
    held_idx = torch.nonzero(data.held_out[game])[:, 0]
    assert len(train_idx) >= args.minibatch, f"{len(train_idx)} training samples, fewer than a minibatch"
    monitor = held_idx[torch.randperm(len(held_idx), generator=torch.Generator().manual_seed(7))[: args.monitor]].sort().values
    fit_monitor = train_idx[torch.randperm(len(train_idx), generator=torch.Generator().manual_seed(11))[: args.monitor]
                            ].sort().values
    source = data.where_from()
    print(f"{args.name}: {len(train_idx)} training samples ({int((source[train_idx] == 0).sum())} overruled), "
          f"{len(held_idx)} held out (monitor {len(monitor)}), from {args.init or f'random weights, {shape}'}", flush=True)

    def loss_of(b: dict):
        parts = losses(net, b, args)
        return parts["main"] + args.amount_weight * parts["amount"] + args.vf * parts["value"], parts

    def read_of() -> dict:
        _, move_ok, verr, _, _ = agreement(net, data, monitor, board, device, args.bf16)
        _, fit_move, _, _, _ = agreement(net, data, fit_monitor, board, device, args.bf16)
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
    p.add_argument("--init", default=None, help="the checkpoint to start from, in the recording's action space")
    p.add_argument("--width", type=int, default=None, help="a fresh net's width (instead of --init)")
    p.add_argument("--layers", type=int, default=4, help="a fresh net's layers")
    p.add_argument("--heads", type=int, default=8, help="a fresh net's heads")
    p.add_argument("--clock", action="store_true", help="a fresh net reads the clock (`obs.py`)")
    p.add_argument("--dir", required=True, help="the run's folder: best.pt, last.pt, log.jsonl")
    p.add_argument("--target", default="hard", choices=["hard", "soft", "completed-q"])
    p.add_argument("--tau", type=float, default=0.05, help="the soft target's temperature on the mean scores")
    p.add_argument("--tau-prior", type=float, default=0.03,
                   help="completed-q: the true gaps' spread, each gap shrunk by tau^2 / (tau^2 + se^2)")
    p.add_argument("--temp", type=float, default=0.03, help="completed-q: the temperature on the shrunk gaps")
    p.add_argument("--z-min", type=float, default=None,
                   help="hard: an overrule whose chosen candidate's z is under this is trained as the first choice")
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

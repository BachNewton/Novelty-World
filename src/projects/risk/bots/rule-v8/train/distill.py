"""The kill test for distilling rule-v7 into a cheap student (`ideas/distilled-v7.md`): a small
network scoring one of v6's candidate plans, trained to rank a search's candidates as v7's
search scored them, and measured on held-out games against v7's own choices.

The training set comes from `npm run risk:features -- --teacher`, which reads every recorded
candidate's success and failure boards through rule-v8's feature function, so nothing here
computes a feature. A candidate's input is those two boards' features, its success chance and v6's
value for it (`--features all`), or only v6's breakdown terms of each board with the two
(`--features breakdown`). `--inputs both` (the default) reads them and their difference from the
decision's mean over its candidates; `relative` only the difference; `absolute` only themselves.

The loss (`--target`) is listwise by default: the cross-entropy of the student's softmax over a
decision's candidates against the softmax of v7's mean scores at temperature `--tau` (by default
the training decisions' median spread of scores). `mse` regresses each candidate's mean score
instead, and reports how much of the scores' variance it explains between decisions and within
them (the ranking's part). Games are held out whole: a game whose index is 0 mod 5 is test, 1 mod
10 is validation (early stopping), the rest train; with `--test-data`, that recording is the
whole test set and every game of `--data` trains but the validation ones; `--train-fraction` keeps that share of the
training games (the same games for every seed, and a smaller share's games among a larger's).

The report on the test games:
  (a) how often v7 picks a candidate other than candidate 0 (v6's own choice);
  (b) top-1 agreement with v7's pick, overall and where v7 overrules v6, and how often v7's pick
      is in the student's top 2;
  (c) mean regret in v7's own scores (v7's best candidate's score less the pick's), and the share
      of v7's edge over v6 the student keeps: (regret of v6 − regret of the student) / regret of v6.
  (d) where the recording kept each reply's score, the same on two independent halves of the
      replies: v7 choosing on the first half and every pick scored on the second, so a pick is
      never scored on the noise it was chosen by, with a 95% interval from resampling test games.
      This is the number to read: (c) counts the noise v7 chose on as edge.

Each configuration is fitted with `--seeds` seeds; the report gives each seed and their mean, and
`--results` appends one JSON line per fit. Seeded; on the GPU (`--device`) a run reproduces only
up to the GPU's own arithmetic.

    python src/projects/risk/bots/rule-v8/train/distill.py
    python src/projects/risk/bots/rule-v8/train/distill.py --sweep 64,16 32 , --seeds 5 --device cuda
    python src/projects/risk/bots/rule-v8/train/distill.py --train-fraction 0.25 0.5 1 --results runs.jsonl
"""

import argparse
import json
import math
import os

import numpy as np
import torch
import torch.nn as nn

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DATA = os.path.join(HERE, "..", "..", "..", "eval", "positions", "distill-v7-features")
SEED = 7
BOOT = 1000
BREAKDOWN_TERMS = 11


def load_one(data):
    meta = json.load(open(os.path.join(data, "meta.json")))
    rows, width = meta["rows"], meta["width"]
    read = lambda name, dtype: np.fromfile(os.path.join(data, name), dtype=dtype)
    x = read("x.f32", "<f4").reshape(rows, width)
    R = meta.get("replies", 0)
    replies = read("replies.f32", "<f4").reshape(rows, R) if R > 0 else np.full((rows, 0), np.nan, np.float32)
    return x, read("score.f32", "<f4"), read("chosen.u8", np.uint8), read("decision.i32", "<i4"), read("game.i32", "<i4"), replies, meta


def load(dirs):
    """Every recording's candidates as decisions padded to the most candidates any has, and to
    the most replies any kept (a decision with fewer has none for a split-half reading)."""
    xs, scores, chosen, decisions, games, replies = [], [], [], [], [], []
    offset = 0
    parts = [load_one(d) for d in dirs]
    R = max(p[5].shape[1] for p in parts)
    for k, (x, s, c, dec, g, rep, meta) in enumerate(parts):
        replies.append(rep if rep.shape[1] == R else np.full((len(s), R), np.nan, np.float32))
        xs.append(x)
        scores.append(s)
        chosen.append(c)
        decisions.append(dec.astype(np.int64) + offset)
        games.append(g.astype(np.int64) + k * 1_000_000)
        offset += meta["decisions"]
    x, s, c, dec, g, rep = map(np.concatenate, (xs, scores, chosen, decisions, games, replies))
    starts = np.flatnonzero(np.r_[True, dec[1:] != dec[:-1]])
    counts = np.diff(np.r_[starts, len(dec)])
    D, K = len(starts), int(counts.max())
    slot = np.arange(len(dec)) - np.repeat(starts, counts)
    row = np.repeat(np.arange(D), counts)
    X = np.zeros((D, K, x.shape[1]), np.float32)
    S = np.zeros((D, K), np.float32)
    M = np.zeros((D, K), bool)
    P = np.full((D, K, R), np.nan, np.float32)
    P[row, slot] = rep
    X[row, slot] = x
    S[row, slot] = s
    M[row, slot] = True
    pick = np.zeros(D, np.int64)
    pick[row[c == 1]] = slot[c == 1]
    return X, S, M, pick, g[starts], P


def select(X, features, per_board):
    """The candidate inputs a student reads: everything, or each board's breakdown terms with the
    success chance and v6's value."""
    if features == "all":
        return X
    W = X.shape[2]
    cols = [*range(BREAKDOWN_TERMS), *range(per_board, per_board + BREAKDOWN_TERMS), W - 2, W - 1]
    return X[:, :, cols]


def inputs(X, M, mode):
    mean = (X * M[..., None]).sum(1, keepdims=True) / M.sum(1, keepdims=True)[..., None]
    rel = (X - mean) * M[..., None]
    return {"absolute": X, "relative": rel, "both": np.concatenate([X, rel], axis=2)}[mode]


def build(dim, hidden):
    layers, d = [], dim
    for h in hidden:
        layers += [nn.Linear(d, h), nn.ReLU(), nn.Dropout(0.1)]
        d = h
    return nn.Sequential(*layers, nn.Linear(d, 1))


def targets(S, M, tau):
    z = np.where(M, S / tau, -np.inf)
    z -= z.max(1, keepdims=True)
    e = np.exp(z)
    return (e / e.sum(1, keepdims=True)).astype(np.float32)


def fit(Z, S, T, M, train, val, hidden, seed, target, weight_decay, device, batch=256, epochs=300, patience=12):
    torch.manual_seed(seed)
    gen = torch.Generator().manual_seed(seed)
    flat = Z[train][M[train]]
    mu = flat.mean(0, dtype=np.float64)
    sd = flat.std(0, dtype=np.float64)
    sd[sd < 1e-6] = 1.0
    zn = torch.tensor(((Z - mu) / sd * M[..., None]).astype(np.float32), device=device)
    mt = torch.tensor(M, device=device)
    if target == "mse":
        flatS = S[train][M[train]]
        s_mu, s_sd = float(flatS.mean()), float(flatS.std()) or 1.0
        st = torch.tensor((S - s_mu) / s_sd, device=device)
    else:
        tt = torch.tensor(T, device=device)
    model = build(Z.shape[2], hidden).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=1e-3, weight_decay=weight_decay)

    def loss(idx):
        out = model(zn[idx]).squeeze(2)
        m = mt[idx]
        if target == "mse":
            return ((out - st[idx]) ** 2 * m).sum() / m.sum()
        logits = out.masked_fill(~m, -1e9)
        return -(tt[idx] * torch.log_softmax(logits, 1)).sum(1).mean()

    tr = torch.tensor(np.flatnonzero(train), device=device)
    vi = torch.tensor(np.flatnonzero(val), device=device)
    best, best_state, bad = math.inf, None, 0
    for _ in range(epochs):
        model.train()
        perm = tr[torch.randperm(len(tr), generator=gen).to(device)]
        for i in range(0, len(perm), batch):
            opt.zero_grad()
            loss(perm[i : i + batch]).backward()
            opt.step()
        model.eval()
        with torch.no_grad():
            vl = loss(vi).item()
        if vl < best - 1e-5:
            best, best_state, bad = vl, {k: t.clone() for k, t in model.state_dict().items()}, 0
        else:
            bad += 1
            if bad >= patience:
                break
    model.load_state_dict(best_state)
    model.eval()
    with torch.no_grad():
        out = model(zn).squeeze(2).cpu().numpy()
    raw = out
    if target == "mse":
        out = out * s_sd + s_mu
    return np.where(M, out, -1e9), {"model": model.cpu(), "mu": mu, "sd": sd, "raw": raw}


def export(target, fitted, args, per_board, X, M, test, cases=8):
    """The student bot's weights: the normalisation and each linear layer, with a few test
    decisions' raw candidate rows and the network's scores for them, for a parity test."""
    layers = [m for m in fitted["model"] if isinstance(m, nn.Linear)]
    golden = []
    for d in np.flatnonzero(test)[:cases]:
        k = int(M[d].sum())
        golden.append({"rows": X[d, :k].astype(float).tolist(), "scores": fitted["raw"][d, :k].astype(float).tolist()})
    weights = {
        "version": 1,
        "features": args.features,
        "inputs": args.inputs,
        "perBoard": per_board,
        "mu": fitted["mu"].tolist(),
        "sd": fitted["sd"].tolist(),
        "layers": [{"w": l.weight.detach().numpy().astype(float).tolist(), "b": l.bias.detach().numpy().astype(float).tolist()} for l in layers],
        "golden": golden,
    }
    with open(target, "w") as f:
        json.dump(weights, f)
    print(f"  wrote the first fit's weights to {target}")


def picks(scores, M):
    """Each decision's first candidate with the highest score."""
    return np.where(M, scores, -np.inf).argmax(1)


def top2(scores, M, v7):
    order = np.argsort(-np.where(M, scores, -np.inf), 1, kind="stable")
    return (order[:, :2] == v7[:, None]).any(1)


def report(name, pick, S, M, v7, test, overruled, v6_regret=None):
    best = np.where(M, S, -np.inf).max(1)
    regret = best - S[np.arange(len(S)), pick]
    agree = pick == v7
    t, o = test, test & overruled
    line = f"  {name:22s} agrees with v7 {agree[t].mean():6.1%} overall, {agree[o].mean():6.1%} where v7 overrules v6;  mean regret {regret[t].mean():.5f}"
    if v6_regret is not None and v6_regret > 0:
        line += f"  (keeps {(v6_regret - regret[t].mean()) / v6_regret:6.1%} of v7's edge)"
    print(line)
    return regret[t].mean()


class SplitHalf:
    """(d): picks scored on the second half of the replies, against v7 choosing on the first,
    on the test decisions that kept every reply, with intervals from resampling their games."""

    def __init__(self, P, M, test, game, rng):
        R = P.shape[2]
        self.kept = test & ~np.isnan(np.where(M[..., None], P, 0)).any((1, 2)) if R >= 2 else np.zeros_like(test)
        if not self.kept.any():
            return
        h = R // 2
        with np.errstate(invalid="ignore"):
            self.A = np.nanmean(np.where(M[..., None], P[:, :, :h], np.nan), 2)
            self.B = np.nanmean(np.where(M[..., None], P[:, :, h:], np.nan), 2)
        self.M, self.h, self.R = M, h, R
        ids, self.inv = np.unique(game[self.kept], return_inverse=True)
        self.counts = rng.multinomial(len(ids), np.full(len(ids), 1 / len(ids)), size=BOOT)
        self.first = picks(self.A, M)
        self.ref = self._sums(self.gain(self.first))

    def gain(self, pick):
        return (self.B[np.arange(len(self.B)), pick] - self.B[:, 0])[self.kept]

    def _sums(self, g):
        s = np.zeros(self.counts.shape[1])
        np.add.at(s, self.inv, g)
        return s

    def kept_share(self, gain):
        """The share of v7-on-the-first-half's gain over v6 kept, with its 95% interval."""
        s = self._sums(gain)
        boot = (self.counts @ s) / (self.counts @ self.ref)
        lo, hi = np.percentile(boot, [2.5, 97.5])
        return s.sum() / self.ref.sum(), lo, hi


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", nargs="+", default=[DEFAULT_DATA])
    ap.add_argument("--test-data", help="a recording to test on alone, e.g. one at more replies")
    ap.add_argument("--hidden", default="64,16")
    ap.add_argument("--sweep", nargs="*", help="hidden sizes to fit in turn, e.g. 64,16 32 , (the empty one is linear)")
    ap.add_argument("--tau", type=float, default=0.0, help="the targets' temperature in v7's score; 0 for the training decisions' median spread")
    ap.add_argument("--inputs", choices=["both", "relative", "absolute"], default="both")
    ap.add_argument("--features", choices=["all", "breakdown"], default="all")
    ap.add_argument("--target", choices=["listwise", "mse"], default="listwise")
    ap.add_argument("--weight-decay", type=float, default=1e-4)
    ap.add_argument("--batch", type=int, default=256, help="decisions a step")
    ap.add_argument("--train-fraction", type=float, nargs="+", default=[1.0])
    ap.add_argument("--seeds", type=int, default=1)
    ap.add_argument("--device", default="cpu", help="cpu, cuda, or auto")
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--results", help="append one JSON line per fit here")
    ap.add_argument("--tag", default="", help="a label written into each result line")
    ap.add_argument("--export", help="write the first fit's weights here, as the student bot reads them")
    args = ap.parse_args()
    torch.set_num_threads(args.threads)
    device = ("cuda" if torch.cuda.is_available() else "cpu") if args.device == "auto" else args.device

    X, S, M, v7, game, P = load(args.data + ([args.test_data] if args.test_data else []))
    per_board = json.load(open(os.path.join(args.data[0], "meta.json")))["features"]
    D, K, W = X.shape
    test = game // 1_000_000 == len(args.data) if args.test_data else game % 5 == 0
    val = ~test & (game % 10 == 1)
    train = ~test & ~val
    overruled = v7 != 0
    rng = np.random.default_rng(SEED)
    train_games = np.unique(game[train])
    order = rng.permutation(train_games)
    print(f"{D} decisions ({M.sum()} candidates, up to {K} a decision, {W} inputs each) from {len(set(game.tolist()))} games; train {train.sum()}, validation {val.sum()}, test {test.sum()}; on {device}")

    spread = np.where(M, S, -np.inf).max(1) - np.where(M, S, np.inf).min(1)
    tau = args.tau if args.tau > 0 else float(np.median(spread[train]))
    print(f"targets' temperature {tau:.5f} (median spread of v7's scores in a training decision; mean {spread[train].mean():.5f})")

    print(f"\n(a) v7 overrules v6's choice in {overruled[test].mean():.1%} of the test decisions ({overruled[test].sum()} of {test.sum()}); every decision {overruled.mean():.1%}")
    print("\n(b, c) baselines on the test games:")
    v6_regret = report("v6 (candidate 0)", np.zeros(D, np.int64), S, M, v7, test, overruled)
    value = X[:, :, W - 1]
    report("highest v6 value", picks(value, M), S, M, v7, test, overruled, v6_regret)
    print(f"  {'highest v6 value':22s} has v7's pick in its top 2 in {top2(value, M, v7)[test].mean():.1%} (a random two of four: 50%)")

    half = SplitHalf(P, M, test, game, rng)
    if half.kept.any():
        k, lo, hi = half.kept_share(half.gain(picks(value, M)))
        print(f"\n(d) split halves of the replies ({half.h} and {half.R - half.h}) on {half.kept.sum()} test decisions: v7 on the first half gains {half.ref.sum() / half.kept.sum():.5f} over v6 on the second")
        print(f"  {'highest v6 value':22s} keeps {k:6.1%} [{lo:6.1%}, {hi:6.1%}] of it")

    Z = inputs(select(X, args.features, per_board), M, args.inputs)
    T = targets(S, M, tau)
    sizes = args.sweep if args.sweep else [args.hidden]
    exported = False
    for fraction in args.train_fraction:
        chosen = set(order[: max(1, round(fraction * len(order)))].tolist())
        tr = train & np.isin(game, list(chosen))
        for size in sizes:
            hidden = [int(h) for h in size.split(",") if h]
            name = f"{','.join(map(str, hidden)) or 'linear'}"
            print(f"\nstudent {name}, {args.features} features, {args.inputs} inputs, {Z.shape[2]} wide, {args.target}, weight decay {args.weight_decay:g}, {fraction:.0%} of training ({tr.sum()} decisions):")
            gains, shares = [], []
            for s in range(args.seeds):
                out, fitted = fit(Z, S, T, M, tr, val, hidden, SEED + s, args.target, args.weight_decay, device, args.batch)
                if args.export and not exported:
                    export(args.export, fitted, args, per_board, X, M, test)
                    exported = True
                pick = picks(out, M)
                best = np.where(M, S, -np.inf).max(1)
                regret = (best - S[np.arange(D), pick])[test].mean()
                row = {
                    "tag": args.tag, "hidden": hidden, "features": args.features, "inputs": args.inputs, "target": args.target,
                    "weight_decay": args.weight_decay, "fraction": fraction, "train_decisions": int(tr.sum()), "seed": SEED + s,
                    "agree": float((pick == v7)[test].mean()), "agree_overruled": float((pick == v7)[test & overruled].mean()),
                    "top2": float(top2(out, M, v7)[test].mean()), "regret": float(regret),
                    "kept_c": float((v6_regret - regret) / v6_regret) if v6_regret > 0 else None,
                }
                if args.target == "mse":
                    dm = lambda a: (a * M).sum(1, keepdims=True) / M.sum(1, keepdims=True)
                    o, y = np.where(M, out, 0), np.where(M, S, 0)
                    t = test[:, None] & M
                    within = lambda a: (a - dm(a))[t]
                    between = lambda a: dm(a)[test, 0]
                    r2 = lambda p_, y_: 1 - ((y_ - p_) ** 2).sum() / ((y_ - y_.mean()) ** 2).sum()
                    row["r2_within"] = float(r2(within(o), within(y)))
                    row["r2_between"] = float(r2(between(o), between(y)))
                line = f"  seed {SEED + s}: agrees {row['agree']:6.1%} ({row['agree_overruled']:6.1%} where v7 overrules v6), top 2 {row['top2']:6.1%}, keeps (c) {row['kept_c']:6.1%}"
                if half.kept.any():
                    g = half.gain(pick)
                    gains.append(g)
                    k, lo, hi = half.kept_share(g)
                    shares.append(k)
                    row.update(kept_d=float(k), kept_d_lo=float(lo), kept_d_hi=float(hi))
                    line += f", keeps (d) {k:6.1%} [{lo:6.1%}, {hi:6.1%}]"
                if args.target == "mse":
                    line += f", R² within decisions {row['r2_within']:.3f}, between {row['r2_between']:.3f}"
                print(line)
                if args.results:
                    with open(args.results, "a") as f:
                        f.write(json.dumps(row) + "\n")
            if len(shares) > 1:
                k, lo, hi = half.kept_share(np.mean(gains, 0))
                print(f"  mean of {len(shares)} seeds: keeps (d) {k:6.1%} [{lo:6.1%}, {hi:6.1%}] (interval: test games resampled); seeds' spread +/-{np.std(shares):.1%}")


if __name__ == "__main__":
    main()

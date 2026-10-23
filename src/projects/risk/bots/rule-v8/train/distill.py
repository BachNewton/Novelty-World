"""The kill test for distilling rule-v7 into a cheap student (`ideas/distilled-v7.md`): a small
network scoring one of v6's candidate plans, trained to rank a search's candidates as v7's
search scored them, and measured on held-out games against v7's own choices.

The training set comes from `npm run risk:features -- --teacher`, which reads every recorded
candidate's success and failure boards through rule-v8's feature function, so nothing here
computes a feature. A candidate's input is those two boards' features, its success chance and v6's
value for it, and, with `--relative` (the default), the same less the decision's mean over its
candidates, since only the differences between a decision's candidates decide its ranking.

The loss is listwise: the cross-entropy of the student's softmax over a decision's candidates
against the softmax of v7's mean scores at temperature `--tau` (by default the training
decisions' median spread of scores, so a typical decision's target is neither flat nor one-hot).
Games are held out whole: a game whose index is 0 mod 5 is test, 1 mod 10 is validation (early
stopping), the rest train.

The report on the test games:
  (a) how often v7 picks a candidate other than candidate 0 (v6's own choice);
  (b) top-1 agreement with v7's pick, overall and where v7 overrules v6, for the student and the
      baselines (always v6's choice; the highest v6 value; a linear student);
  (c) mean regret in v7's own scores (v7's best candidate's score less the pick's), and the share
      of v7's edge over v6 the student keeps: (regret of v6 − regret of the student) / regret of v6.
  (d) where the recording kept each reply's score, the same on two independent halves of the
      replies: v7 choosing on the first half and every pick scored on the second, so a pick is
      never scored on the noise it was chosen by. Regret in v7's own (c) scores counts the noise
      v7 chose on as edge; (d) doesn't, and says how much of v7's choice repeats on fresh replies.

CPU only and seeded, so a run reproduces on the same machine and torch.

    python src/projects/risk/bots/rule-v8/train/distill.py
    python src/projects/risk/bots/rule-v8/train/distill.py --sweep 64,16 32 ,
    python src/projects/risk/bots/rule-v8/train/distill.py --data dir-a dir-b --threads 4
"""

import argparse
import json
import math
import os

os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")

import numpy as np  # noqa: E402
import torch  # noqa: E402
import torch.nn as nn  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DATA = os.path.join(HERE, "..", "..", "..", "eval", "positions", "distill-v7-features")
SEED = 7


def load_one(data):
    meta = json.load(open(os.path.join(data, "meta.json")))
    rows, width = meta["rows"], meta["width"]
    read = lambda name, dtype: np.fromfile(os.path.join(data, name), dtype=dtype)
    x = read("x.f32", "<f4").reshape(rows, width)
    R = meta.get("replies", 0)
    replies = read("replies.f32", "<f4").reshape(rows, R) if R > 0 else np.full((rows, 0), np.nan, np.float32)
    return x, read("score.f32", "<f4"), read("chosen.u8", np.uint8), read("decision.i32", "<i4"), read("game.i32", "<i4"), replies, meta


def load(dirs):
    """Every recording's candidates as decisions padded to the most candidates any has."""
    xs, scores, chosen, decisions, games, replies = [], [], [], [], [], []
    offset = 0
    parts = [load_one(d) for d in dirs]
    R = max(p[5].shape[1] for p in parts)
    for k, (x, s, c, dec, g, rep, meta) in enumerate(parts):
        if rep.shape[1] not in (0, R):
            raise SystemExit(f"recordings of {rep.shape[1]} and {R} replies can't be read as one set")
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


def inputs(X, M, relative):
    if not relative:
        return X
    mean = (X * M[..., None]).sum(1, keepdims=True) / M.sum(1, keepdims=True)[..., None]
    return np.concatenate([X, (X - mean) * M[..., None]], axis=2)


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


def fit(Z, T, M, train, val, hidden, epochs=300, patience=12, batch=256):
    torch.manual_seed(SEED)
    gen = torch.Generator().manual_seed(SEED)
    flat = Z[train][M[train]]
    mu = flat.mean(0, dtype=np.float64)
    sd = flat.std(0, dtype=np.float64)
    sd[sd < 1e-6] = 1.0
    zn = torch.tensor(((Z - mu) / sd * M[..., None]).astype(np.float32))
    tt = torch.tensor(T)
    mt = torch.tensor(M)
    model = build(Z.shape[2], hidden)
    opt = torch.optim.Adam(model.parameters(), lr=1e-3, weight_decay=1e-4)

    def loss(idx):
        logits = model(zn[idx]).squeeze(2).masked_fill(~mt[idx], -1e9)
        return -(tt[idx] * torch.log_softmax(logits, 1)).sum(1).mean()

    tr = torch.tensor(np.flatnonzero(train))
    vi = torch.tensor(np.flatnonzero(val))
    best, best_state, bad = math.inf, None, 0
    for _ in range(epochs):
        model.train()
        perm = tr[torch.randperm(len(tr), generator=gen)]
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
        out = model(zn).squeeze(2).masked_fill(~mt, -1e9).numpy()
    return out


def picks(scores, M):
    """Each decision's first candidate with the highest score."""
    return np.where(M, scores, -np.inf).argmax(1)


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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", nargs="+", default=[DEFAULT_DATA])
    ap.add_argument("--hidden", default="64,16")
    ap.add_argument("--sweep", nargs="*")
    ap.add_argument("--tau", type=float, default=0.0, help="the targets' temperature in v7's score; 0 for the training decisions' median spread")
    ap.add_argument("--absolute", action="store_true", help="read each candidate alone, without its difference from the decision's mean")
    ap.add_argument("--threads", type=int, default=4)
    args = ap.parse_args()
    torch.set_num_threads(args.threads)

    X, S, M, v7, game, P = load(args.data)
    D, K, W = X.shape
    test = game % 5 == 0
    val = game % 10 == 1
    train = ~test & ~val
    overruled = v7 != 0
    print(f"{D} decisions ({M.sum()} candidates, up to {K} a decision, {W} inputs each) from {len(set(game.tolist()))} games; train {train.sum()}, validation {val.sum()}, test {test.sum()}")

    spread = np.where(M, S, -np.inf).max(1) - np.where(M, S, np.inf).min(1)
    tau = args.tau if args.tau > 0 else float(np.median(spread[train]))
    print(f"targets' temperature {tau:.5f} (median spread of v7's scores in a training decision; mean {spread[train].mean():.5f})")

    print(f"\n(a) v7 overrules v6's choice in {overruled[test].mean():.1%} of the test decisions ({overruled[test].sum()} of {test.sum()}); every decision {overruled.mean():.1%}")
    random_regret = ((np.where(M, S, -np.inf).max(1, keepdims=True) - S) * M).sum(1) / M.sum(1)
    print(f"    a random candidate's mean regret {random_regret[test].mean():.5f}\n")
    print("(b, c) on the test games:")
    v6_regret = report("v6 (candidate 0)", np.zeros(D, np.int64), S, M, v7, test, overruled)
    value = X[:, :, W - 1]
    report("highest v6 value", picks(value, M), S, M, v7, test, overruled, v6_regret)

    Z = inputs(X, M, not args.absolute)
    T = targets(S, M, tau)
    sizes = args.sweep if args.sweep else [",", args.hidden]
    students = {}
    for size in sizes:
        hidden = [int(h) for h in size.split(",") if h]
        name = f"student {','.join(map(str, hidden)) or 'linear'}"
        students[name] = picks(fit(Z, T, M, train, val, hidden), M)
        report(name, students[name], S, M, v7, test, overruled, v6_regret)
    split_half(P, M, X, v7, test, students)


def split_half(P, M, X, v7, test, students):
    R = P.shape[2]
    kept = test & ~np.isnan(np.where(M[..., None], P, 0)).any((1, 2)) if R >= 2 else np.zeros_like(test)
    if not kept.any():
        print()
        print("(d) the recording kept no reply's own score, so there is no split-half reading")
        return
    h = R // 2
    A = np.nanmean(np.where(M[..., None], P[:, :, :h], np.nan), 2)
    B = np.nanmean(np.where(M[..., None], P[:, :, h:], np.nan), 2)
    W = X.shape[2]
    first = picks(A, M)
    print()
    print(f"(d) split halves of the replies ({h} and {R - h}), on the {kept.sum()} test decisions that kept them:")
    print(f"    v7 on the first half picks the second half's best in {(first == picks(B, M))[kept].mean():.1%}; v7 on all {R} agrees with its own first half in {(first == v7)[kept].mean():.1%}")
    bestB = np.where(M, B, -np.inf).max(1)
    regret = lambda pick: (bestB - B[np.arange(len(B)), pick])[kept].mean()
    r6, rA = regret(np.zeros(len(B), np.int64)), regret(first)
    edge = r6 - rA
    print(f"  {'v6 (candidate 0)':22s} regret on the second half {r6:.5f}")
    print(f"  {f'v7 on the first half':22s} regret on the second half {rA:.5f}  (v7's edge over v6 on fresh replies: {edge:.5f})")
    for name, pick in [("highest v6 value", picks(X[:, :, W - 1], M)), *students.items()]:
        r = regret(pick)
        kept_share = f"  (keeps {(r6 - r) / edge:6.1%} of it)" if edge > 0 else ""
        print(f"  {name:22s} regret on the second half {r:.5f}{kept_share}")


if __name__ == "__main__":
    main()

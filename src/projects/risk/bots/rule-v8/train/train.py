"""Trains rule-v8's evaluation (`ideas/rule-bot-v8.md`): a small network predicting whether a
seat wins from v6's breakdown and the board, read through v8's own feature function.

The features come from `npm run risk:features`, which reads the recorded positions through
`bots/rule-v8/features.ts`, so nothing here computes a feature. Games are held out whole: a
game whose index is 0 mod 5 is test, 1 mod 10 is validation (early stopping), the rest train.
The held-out log-loss is reported on the rule bots' seats, as the kill test scored it
(`ideas/bot-log.md`, "Can a learned evaluation predict the winner better than v6's?").

Seeded and single-configuration, so a run reproduces its weights on the same machine and torch.

    python src/projects/risk/bots/rule-v8/train/train.py --sweep 256,64 128,32 64,32 32,16 16,8 8 ,
    python src/projects/risk/bots/rule-v8/train/train.py --hidden 16,8 --write

(`,` in a sweep is no hidden layer: a logistic fit on the same features.)

`--write` writes the weights as a TypeScript module (`bots/rule-v8/weights.ts`) and golden values
for the forward-pass test (`bots/rule-v8/golden.ts`): held-out records whole, and the
probability this model gives each, computed in float64 from the float32 weights as written.
"""

import argparse
import base64
import json
import math
import os
import sys

import numpy as np
import torch
import torch.nn as nn

HERE = os.path.dirname(os.path.abspath(__file__))
BOT = os.path.dirname(HERE)
DEFAULT_DATA = os.path.join(BOT, "..", "..", "eval", "positions", "features")
SEED = 8


def load(data):
    meta = json.load(open(os.path.join(data, "meta.json")))
    rows, dim = meta["rows"], meta["features"]
    x = np.fromfile(os.path.join(data, "x.f32"), dtype="<f4").reshape(rows, dim)
    y = np.fromfile(os.path.join(data, "y.u8"), dtype=np.uint8).astype(np.float32)
    game = np.fromfile(os.path.join(data, "game.i32"), dtype="<i4")
    rule = np.fromfile(os.path.join(data, "rule.u8"), dtype=np.uint8).astype(bool)
    turn = np.fromfile(os.path.join(data, "turn.i32"), dtype="<i4")
    samples = [json.loads(line) for line in open(os.path.join(data, "samples.jsonl")) if line.strip()]
    return x, y, game, rule, turn, samples


def build(dim, hidden):
    layers, d = [], dim
    for h in hidden:
        layers += [nn.Linear(d, h), nn.ReLU(), nn.Dropout(0.1)]
        d = h
    return nn.Sequential(*layers, nn.Linear(d, 1))


def fit(x, y, train, val, hidden, epochs=60, patience=6):
    torch.manual_seed(SEED)
    gen = torch.Generator().manual_seed(SEED)
    mu = x[train].mean(0, dtype=np.float64)
    sd = x[train].std(0, dtype=np.float64)
    sd[sd < 1e-6] = 1.0
    xn = torch.tensor(((x - mu) / sd).astype(np.float32))
    yt = torch.tensor(y)
    model = build(x.shape[1], hidden)
    opt = torch.optim.Adam(model.parameters(), lr=1e-3, weight_decay=1e-4)
    lossf = nn.BCEWithLogitsLoss()
    tr = torch.tensor(np.where(train)[0])
    vi = torch.tensor(np.where(val)[0])
    best, best_state, bad = math.inf, None, 0
    for _ in range(epochs):
        model.train()
        perm = tr[torch.randperm(len(tr), generator=gen)]
        for i in range(0, len(perm), 1024):
            b = perm[i : i + 1024]
            opt.zero_grad()
            lossf(model(xn[b]).squeeze(1), yt[b]).backward()
            opt.step()
        model.eval()
        with torch.no_grad():
            vl = lossf(model(xn[vi]).squeeze(1), yt[vi]).item()
        if vl < best - 1e-5:
            best, best_state, bad = vl, {k: t.clone() for k, t in model.state_dict().items()}, 0
        else:
            bad += 1
            if bad >= patience:
                break
    model.load_state_dict(best_state)
    model.eval()
    return model, mu, sd


def folded(model, mu, sd):
    """The network's layers as float32 arrays, the input's normalisation folded into the first."""
    linear = [m for m in model if isinstance(m, nn.Linear)]
    out = []
    for i, m in enumerate(linear):
        w = m.weight.detach().double().numpy()
        b = m.bias.detach().double().numpy()
        if i == 0:
            w = w / sd[None, :]
            b = b - w @ mu
        out.append((w.astype(np.float32), b.astype(np.float32)))
    return out


def forward(layers, x):
    """The forward pass in float64 over the float32 weights, as the bot computes it."""
    h = x.astype(np.float64)
    for i, (w, b) in enumerate(layers):
        h = h @ w.astype(np.float64).T + b.astype(np.float64)
        if i < len(layers) - 1:
            h = np.maximum(h, 0)
    return 1 / (1 + np.exp(-h[:, 0]))


def logloss(p, y):
    p = np.clip(p, 1e-7, 1 - 1e-7)
    return float(np.mean(-(y * np.log(p) + (1 - y) * np.log(1 - p))))


def report(name, layers, x, y, test, rule, turn):
    m = test & rule
    p = forward(layers, x[m])
    phases = []
    for lo, hi in [(0, 20), (20, 40), (40, 70), (70, 120), (120, 10_000)]:
        mm = (turn[m] >= lo) & (turn[m] < hi)
        if mm.sum() >= 500:
            phases.append(f"{lo}-{hi if hi < 10_000 else ''}: {logloss(p[mm], y[m][mm]):.4f}")
    params = sum(w.size + b.size for w, b in layers)
    print(f"  {name:10s} params {params:7d}  held-out log-loss, rule seats {logloss(p, y[m]):.4f}, every seat {logloss(forward(layers, x[test]), y[test]):.4f}")
    print(f"             by turn  " + "  ".join(phases))


def ts_floats(a):
    return base64.b64encode(a.astype("<f4").tobytes()).decode("ascii")


def write(layers, dims, samples, x, args):
    lines = [
        "// rule-v8's network, written by `train/train.py` (`ideas/rule-bot-v8.md`); never edited by hand.",
        f"// Trained with: {' '.join(sys.argv[1:])}",
        "",
        "/** Each layer's width, the features first. */",
        f"export const DIMS: readonly number[] = {json.dumps(dims)};",
        "",
        "/** Each layer's weights (row by output, then input) and biases, as little-endian float32 in",
        " *  base64: the input's normalisation is folded into the first layer. */",
        "export const LAYERS: readonly { weights: string; biases: string }[] = [",
    ]
    for w, b in layers:
        lines.append(f'  {{ weights: "{ts_floats(w)}", biases: "{ts_floats(b)}" }},')
    lines.append("];")
    open(os.path.join(BOT, "weights.ts"), "w", newline="\n").write("\n".join(lines) + "\n")

    rows = np.array([s["row"] for s in samples])
    p = forward(layers, x[rows])
    golden = [{"record": s["record"], "p": float(v)} for s, v in zip(samples, p)]
    g = [
        "// Golden values for rule-v8's forward pass, written by `train/train.py`: held-out recorded",
        "// positions whole, and the probability the trained network gives each, in float64 from the",
        "// float32 weights as written. `bot.test.ts` reads them through the bot's own features and network.",
        "",
        "// Bot code imports nothing of the harness's, so the records' type is the test's to name.",
        f"export const GOLDEN = {json.dumps(golden)};",
    ]
    open(os.path.join(BOT, "golden.ts"), "w", newline="\n").write("\n".join(g) + "\n")
    print(f"wrote weights.ts ({os.path.getsize(os.path.join(BOT, 'weights.ts')) // 1024} KB) and golden.ts")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=DEFAULT_DATA)
    ap.add_argument("--hidden", default="16,8")
    ap.add_argument("--sweep", nargs="*")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--threads", type=int, default=8)
    args = ap.parse_args()
    torch.set_num_threads(args.threads)

    x, y, game, rule, turn, samples = load(args.data)
    test = game % 5 == 0
    val = game % 10 == 1
    train = ~test & ~val
    print(f"{len(y)} positions from {len(set(game.tolist()))} decisive games; train {train.sum()}, validation {val.sum()}, test {test.sum()} (rule seats {(test & rule).sum()}, won {y[test & rule].mean():.3f})")

    v6 = x[:, 9:10]
    model, mu, sd = fit(v6, y, train, val, [])
    report("v6 value", folded(model, mu, sd), v6, y, test, rule, turn)

    sizes = args.sweep if args.sweep else [args.hidden]
    for size in sizes:
        hidden = [int(h) for h in size.split(",") if h]
        model, mu, sd = fit(x, y, train, val, hidden)
        layers = folded(model, mu, sd)
        report(",".join(map(str, hidden)) or "linear", layers, x, y, test, rule, turn)
        if args.write and not args.sweep:
            write(layers, [x.shape[1], *hidden, 1], samples, x, args)


if __name__ == "__main__":
    main()

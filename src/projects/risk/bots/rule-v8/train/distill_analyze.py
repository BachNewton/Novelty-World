"""How much any student could learn from a teacher recording, before training one
(`ideas/distilled-v7.md`, experiment E0): how noisy v7's labels are, what that noise allows a
picker at each reply budget, and the simple baselines a student has to beat, all with intervals
from resampling whole test games.

Reads the same files as `distill.py` (`npm run risk:features -- --teacher`), and needs a
recording that kept each reply's score.

  Reliability. Every candidate of a decision is played in the same reply worlds, so what a reply
  says about the ranking is each candidate's score less the decision's mean in that reply (its
  contrast). Per decision, the contrasts' spread between candidates (of their means over the
  replies) holds the true spread plus noise over R; the reply-to-reply spread of the contrasts
  measures that noise. Pooled over decisions they give the reliability of an R-reply ranking at
  any R (Spearman–Brown), and a simulation of pickers at each budget against the decisions' true
  contrasts.

  Baselines, scored as `distill.py`'s (d): picks made without the second half of the replies,
  scored on it, so no pick is scored on the noise it was chosen by. The edge kept by a pick is its
  improvement over v6's choice as a share of v7's on the first half.

    python src/projects/risk/bots/rule-v8/train/distill_analyze.py
    python src/projects/risk/bots/rule-v8/train/distill_analyze.py --data dir-a dir-b
"""

import argparse
import json
import os
import warnings

import numpy as np

from distill import DEFAULT_DATA, load, picks

BOOT = 1000
SEED = 7


def contrasts(P, M):
    """Each reply's candidate scores less the decision's mean in that reply."""
    Pm = np.where(M[..., None], P, np.nan)
    return Pm - np.nanmean(Pm, 1, keepdims=True)


def variance_components(C, M):
    """Per decision: the between-candidate variance of the mean contrasts, and the noise
    variance of one reply's contrast, both unbiased."""
    K = M.sum(1)
    R = C.shape[2]
    means = np.nanmean(C, 2)
    between = np.nansum(means**2, 1) / (K - 1)
    noise = np.nansum(np.nanvar(C, 2, ddof=1), 1) / (K - 1)
    return between, noise, R


def reliability(tau2, sigma2, R):
    return R * tau2 / (R * tau2 + sigma2)


def simulate(means, noise, between, M, budgets, rng):
    """Regret against the true contrasts of pickers that see R noisy replies, with each
    decision's true contrasts its observed means shrunk by their own reliability."""
    R0 = 8
    tau2 = np.maximum(between - noise / R0, 0)
    shrink = np.where(tau2 + noise / R0 > 0, tau2 / (tau2 + noise / R0), 0)
    mu = np.where(M, means * shrink[:, None], -np.inf)
    best = mu.max(1)
    out = {"v6": float((best - mu[:, 0]).mean())}
    sd = np.sqrt(np.maximum(noise, 0))[:, None]
    for R in budgets:
        regrets = []
        for _ in range(20):
            seen = np.where(M, mu + rng.standard_normal(mu.shape) * sd / np.sqrt(R), -np.inf)
            pick = seen.argmax(1)
            regrets.append((best - mu[np.arange(len(mu)), pick]).mean())
        out[R] = float(np.mean(regrets))
    out["oracle"] = 0.0
    return out


def game_sums(values, game):
    """Per-game sums of per-decision values, columns in order."""
    ids, inv = np.unique(game, return_inverse=True)
    sums = np.zeros((len(ids), values.shape[1]))
    np.add.at(sums, inv, values)
    return sums


def boot_counts(n, rng):
    return rng.multinomial(n, np.full(n, 1 / n), size=BOOT)


def interval(samples):
    lo, hi = np.percentile(samples, [2.5, 97.5])
    return f"[{lo:6.1%}, {hi:6.1%}]"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", nargs="+", default=[DEFAULT_DATA])
    ap.add_argument("--out", help="write the numbers as JSON here too")
    args = ap.parse_args()
    warnings.simplefilter("ignore", RuntimeWarning)
    rng = np.random.default_rng(SEED)

    X, S, M, v7, game, P = load(args.data)
    D, K, W = X.shape
    FEATURES = json.load(open(os.path.join(args.data[0], "meta.json")))["features"]
    R = P.shape[2]
    kept = ~np.isnan(np.where(M[..., None], P, 0)).any((1, 2)) & (M.sum(1) >= 2)
    if R < 4 or not kept.any():
        raise SystemExit("the recording kept no per-reply scores to read")
    test = (game % 5 == 0) & kept
    result = {"decisions": int(D), "with_replies": int(kept.sum()), "test": int(test.sum()), "replies": int(R)}
    print(f"{D} decisions, {kept.sum()} with every reply's score ({R} replies), {test.sum()} of them in test games ({len(np.unique(game[test]))} games)\n")

    # Reliability, on every decision that kept its replies.
    C = contrasts(P[kept], M[kept])
    between, noise, _ = variance_components(C, M[kept])
    tau2 = max(float(between.mean() - noise.mean() / R), 0.0)
    sigma2 = float(noise.mean())
    print("Reliability of v7's ranking (pooled over decisions):")
    print(f"  true spread between candidates (variance) {tau2:.6f}; one reply's noise {sigma2:.6f}; noise / spread {sigma2 / tau2 if tau2 > 0 else float('inf'):.1f}")
    result["reliability"] = {}
    for r in (1, 4, 8, 16, 32, 64):
        rho = reliability(tau2, sigma2, r)
        result["reliability"][r] = rho
        print(f"  {r:3d} replies: reliability {rho:.2f}")
    per = np.where(between > 0, np.maximum(between - noise / R, 0) / between, 0)
    print(f"  per decision at {R} replies: median {np.median(per):.2f}, a quarter of decisions below {np.percentile(per, 25):.2f}, a quarter above {np.percentile(per, 75):.2f}")

    sim = simulate(np.nanmean(C, 2), noise, between, M[kept], (4, 8, 16, 32), rng)
    print("\nSimulated regret against the true contrasts (shrunk means; Gaussian reply noise):")
    for name, v in sim.items():
        label = f"{name}-reply picker" if isinstance(name, int) else name
        print(f"  {label:18s} {v:.5f}")
    edge = lambda k: (sim["v6"] - sim[k]) / sim["v6"] if sim["v6"] > 0 else float("nan")
    print(f"  share of the oracle's edge over v6: 4 replies {edge(4):.0%}, 8 replies {edge(8):.0%}, 16 {edge(16):.0%}, 32 {edge(32):.0%}")
    print("  so (d)'s yardstick, v7 on 4 replies, is about {:.0%} of the live 8-reply v7's true edge".format(edge(4) / edge(8) if edge(8) > 0 else float("nan")))
    result["simulated_regret"] = {str(k): v for k, v in sim.items()}

    # Elimination share.
    Pk = np.where(M[kept][..., None], P[kept], np.nan)
    ends = np.isclose(Pk, 0) | np.isclose(Pk, 1)
    standing_only = np.where(ends, np.nan, Pk)
    with np.errstate(invalid="ignore"):
        sm = np.nanmean(standing_only, 2)
    usable = ~np.isnan(np.where(M[kept], sm, 0)).any(1)
    differs = (picks(np.where(np.isnan(sm), -np.inf, sm), M[kept]) != v7[kept])[usable].mean()
    print(f"\nReply ends that are an elimination or a win (score exactly 0 or 1): {np.nanmean(np.where(M[kept][..., None], ends, np.nan)):.1%}")
    print(f"  decisions with at least one: {ends.any((1, 2)).mean():.1%}; v7's pick changes on standings alone in {differs:.1%} of the {usable.sum()} decisions where that's defined")
    result["elimination_share"] = float(np.nanmean(np.where(M[kept][..., None], ends, np.nan)))

    # Baselines, split-half, on the test games, with game-resampled intervals.
    h = R // 2
    A = np.nanmean(np.where(M[..., None], P[:, :, :h], np.nan), 2)
    B = np.nanmean(np.where(M[..., None], P[:, :, h:], np.nan), 2)
    p = X[:, :, 2 * FEATURES]
    value = X[:, :, W - 1]
    leaf = p * X[:, :, 0] + (1 - p) * X[:, :, FEATURES]
    baselines = {
        "v6 (candidate 0)": np.zeros(D, np.int64),
        "highest v6 value": picks(value, M),
        "highest success chance": picks(p, M),
        "zero-ply share leaf": picks(leaf, M),
        "v7 on the first half": picks(A, M),
    }
    idx = np.arange(D)
    t = test
    spreadA = np.where(M, A, -np.inf).max(1) - np.where(M, A, np.inf).min(1)
    wide = spreadA >= np.median(spreadA[t])
    turns = np.fromfile(os.path.join(args.data[0], "turn.i32"), "<i4") if len(args.data) == 1 else None
    gain = {name: B[idx, pick] - B[:, 0] for name, pick in baselines.items()}
    rand_gain = (np.where(M, B, 0).sum(1) / M.sum(1)) - B[:, 0]
    gain["a random candidate"] = rand_gain

    def table(mask, title):
        cols = list(gain)
        vals = np.stack([gain[c][mask] for c in cols], 1)
        sums = game_sums(vals, game[mask])
        counts = boot_counts(len(sums), rng)
        bs = counts @ sums
        ref = cols.index("v7 on the first half")
        point = sums.sum(0)
        print(f"\n{title} ({mask.sum()} decisions, {len(sums)} games): gain over v6 on the second half, and the share of v7-on-half's gain kept")
        rows = {}
        for i, c in enumerate(cols):
            share = bs[:, i] / bs[:, ref]
            rows[c] = {"gain": float(point[i] / mask.sum()), "kept": float(point[i] / point[ref]), "kept_ci": [float(x) for x in np.percentile(share, [2.5, 97.5])]}
            print(f"  {c:24s} gain {point[i] / mask.sum():+.5f}   kept {point[i] / point[ref]:7.1%} {interval(share)}")
        return rows

    result["test_all"] = table(t, "Test decisions")
    result["test_wide"] = table(t & wide, "Test decisions where the candidates differ most (first-half spread at or above the median)")
    table(t & ~wide, "Test decisions where they differ least")
    if turns is not None:
        first = np.r_[0, np.cumsum(M.sum(1))[:-1]]
        dturn = turns[first]
        lo, hi = np.percentile(dturn[t], [100 / 3, 200 / 3])
        for name, mask in ((f"turns before {lo:.0f}", dturn < lo), (f"turns {lo:.0f} to {hi:.0f}", (dturn >= lo) & (dturn < hi)), (f"turns {hi:.0f} on", dturn >= hi)):
            table(t & mask, f"Test decisions, {name}")

    if args.out:
        with open(args.out, "w") as f:
            json.dump(result, f, indent=2)


if __name__ == "__main__":
    main()

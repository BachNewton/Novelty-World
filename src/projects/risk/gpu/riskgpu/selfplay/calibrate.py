"""The value head against real outcomes: is the judge PPO trains on accurate?

    python -m riskgpu.selfplay.calibrate --ckpt runs/selfplay/s2-2/snap-150.pt [--games 256] [--device cpu]
        [--mixed runs/selfplay/sw128b/snap-450.pt] [--out calibrate.json]

run from `src/projects/risk/gpu/`. The trainer's explained variance is read against GAE returns,
which at λ = 0.95 are mostly the value head's own predictions; this reads it against how the games
really ended. Fixed 5-player deals are played to their end (no resets: each batch row is one game),
every seat sampling its moves as in training. At every decision of the checkpoint's seats it keeps
the deciding seat's value (slot 0 of the value vector), the decision's phase, its player-turn, and
the seat's board share (half its share of the territories, half its share of the armies). When the
games are over each decision is joined to its seat's final score, the trainer's own (`env.scores`:
`win` by default, capped survivors scored below the places they share).

Two tables: the **mirror** (the checkpoint in every seat) and, with `--mixed`, the checkpoint alone
among four copies of another network, its seat rotated through the five by game. For each, overall,
by thirds and fifths of the game's progress (the decision's player-turn as a share of the game's
length) and by phase, it reports the explained variance 1 − Var(y − v) / Var(y) and the MSE against
the real outcome y, each with a 95% bootstrap interval over games (a game's decisions are
correlated, so games are the unit resampled). Beside them, to read them by: the outcome's variance,
the mean prediction against the mean outcome (bias), and the explained variance of a least-squares
fit of the outcome on the seat's territory and army shares in that bucket (in-sample, so flattering
to it): the judge is worth what it adds over counting the board. Overall it also gives the
explained variance of the trivial predictor, the mean outcome of the decision's progress fifth. And
a calibration table: the prediction in ten equal bins over [−1, 1] against the mean real outcome.

`--device cpu` steps the batch eagerly (as the tests do); `cuda` captures the step as one graph, as
the trainer does.
"""

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass

import numpy as np
import torch

from ..board import MAX_SEATS, Board
from ..data import DATA
from ..state import PHASES
from ..tables import BlitzTables
from .env import GREEDY, LEARNER, SNAPSHOT, Env, EnvConfig
from .ladder import load_net

GPU = os.path.dirname(DATA)
PLAYERS = 5
CHUNK = 64
MAX_STEPS = 40000
BINS = 10


@dataclass
class Decisions:
    """One row per decision of the checkpoint's seats, and each game's end."""
    game: np.ndarray  # [N] batch row = game
    seat: np.ndarray  # [N] the deciding seat
    value: np.ndarray  # [N] its value, slot 0
    phase: np.ndarray  # [N]
    turn: np.ndarray  # [N] player-turn at the decision
    land: np.ndarray  # [N] the seat's share of the territories
    troops: np.ndarray  # [N] the seat's share of the armies
    final: np.ndarray  # [G, 6] each seat's final score
    first_turn: np.ndarray  # [G]
    last_turn: np.ndarray  # [G]
    capped: np.ndarray  # [G] the game ended at its cap

    def outcome(self) -> np.ndarray:
        """Each decision's real outcome: its own seat's final score in its own game."""
        return self.final[self.game, self.seat]

    def progress(self) -> np.ndarray:
        """Each decision's share of its game, by player-turns: 0 at the first turn, under 1 at the last."""
        span = self.last_turn - self.first_turn + 1
        return (self.turn - self.first_turn[self.game]) / span[self.game]


def mirror_env(board, tables, net, games: int, device: str, bf16: bool, cap: int) -> Env:
    cfg = EnvConfig(batch=games, sizes=(PLAYERS,), size_weights=(1.0,), cap_low=cap, cap_high=cap, pool=8, snapshots=0,
                    horizon=CHUNK, record=True, reset=False, cap_learner=1.0, cap_greedy=0.01, bf16=bf16)
    env = Env(cfg, board, tables, net, device, seed_prefix="calibrate")
    env.kind_probs.zero_()
    env.kind_probs[LEARNER] = 1.0
    seat_kind = torch.full((games, MAX_SEATS), GREEDY, dtype=torch.int64)
    seat_kind[:, :PLAYERS] = LEARNER
    env.seat_kind.copy_(seat_kind.to(device))
    return env


def mixed_env(board, tables, net, other, games: int, device: str, bf16: bool, cap: int) -> Env:
    """The checkpoint alone among copies of `other`, its seat game % 5 (as `PairEval`'s one-in)."""
    cfg = EnvConfig(batch=games, sizes=(PLAYERS,), size_weights=(1.0,), cap_low=cap, cap_high=cap, pool=8, snapshots=0,
                    horizon=CHUNK, record=True, reset=False, cap_learner=0.85, cap_snapshot=0.85, cap_greedy=0.01,
                    bf16=bf16)
    env = Env(cfg, board, tables, net, device, seed_prefix="calibrate")
    env.snapshots = [other]
    env.active_snapshots = 1
    env.kind_probs = torch.zeros(SNAPSHOT + 1, device=device)
    env.stats = torch.zeros(8, SNAPSHOT + 1, dtype=torch.float64, device=device)
    g = torch.arange(games)
    lone = (g % PLAYERS)[:, None] == torch.arange(PLAYERS)[None, :]
    seat_kind = torch.full((games, MAX_SEATS), GREEDY, dtype=torch.int64)
    seat_kind[:, :PLAYERS] = torch.where(lone, LEARNER, SNAPSHOT)
    env.seat_kind.copy_(seat_kind.to(device))
    return env


def collect(env: Env) -> Decisions:
    """Plays the batch to its end, keeping every decision of the learner's seats."""
    assert not env.cfg.reset and env.cfg.record, "one game per row, recorded"
    B = env.cfg.batch
    first_turn = env.state.turn.to(torch.int64).cpu().numpy().copy()
    final = torch.zeros(B, MAX_SEATS, dtype=torch.float32, device=env.device)
    ends = torch.zeros(B, dtype=torch.int64, device=env.device)
    parts = []
    steps = 0
    while not bool(env.done.all()):
        if steps >= MAX_STEPS:
            raise RuntimeError(f"{int((~env.done).sum())} games still running after {steps} steps")
        env.run(CHUNK)
        steps += CHUNK
        buf = env.buf
        mine = buf["learner"]
        t, b = mine.nonzero(as_tuple=True)
        seat = buf["active"][t, b].to(torch.int64)
        owner = buf["owner"][t, b].to(torch.int64)
        armies = buf["armies"][t, b].to(torch.float32)
        held = owner == seat[:, None]
        land = held.float().mean(1)
        troops = (armies * held).sum(1) / armies.sum(1).clamp(min=1)
        parts.append({"game": b, "seat": seat, "value": buf["value"][t, b], "phase": buf["phase"][t, b].to(torch.int64),
                      "turn": buf["turn"][t, b].to(torch.int64), "land": land, "troops": troops})
        ended = buf["ended"]
        ends += ended.sum(0)
        # A row ends once (no resets); its scores are the reward at that step.
        final += (buf["reward"] * ended[:, :, None]).sum(0)
    if not bool((ends == 1).all()):
        raise RuntimeError(f"games ending other than once: {ends.tolist()}")
    out = {k: torch.cat([p[k] for p in parts]).cpu().numpy() for k in parts[0]}
    return Decisions(**out, final=final.cpu().numpy(), first_turn=first_turn,
                     last_turn=env.state.turn.to(torch.int64).cpu().numpy(),
                     capped=(env.state.winner < 0).cpu().numpy())


# --- statistics ------------------------------------------------------------------------------

# Per game and bucket, the sums every reading is built from: n, Σy, Σy², Σv, Σv², Σyv, and for the
# board-share fit X'X (3×3, X = [1, land, troops]) and X'y.
SUMS = 6 + 9 + 3


def game_sums(game: np.ndarray, games: int, y: np.ndarray, v: np.ndarray, land: np.ndarray, troops: np.ndarray,
              mask: np.ndarray) -> np.ndarray:
    """`[games, SUMS]`: the sums of the decisions in `mask`, by game."""
    x = np.stack([np.ones_like(y), land, troops], 1)
    cols = [np.ones_like(y), y, y * y, v, v * v, y * v]
    cols += [x[:, i] * x[:, j] for i in range(3) for j in range(3)]
    cols += [x[:, i] * y for i in range(3)]
    terms = np.stack(cols, 1).astype(np.float64) * mask[:, None]
    out = np.zeros((games, SUMS))
    np.add.at(out, game, terms)
    return out


def readings(s: np.ndarray) -> dict[str, np.ndarray]:
    """From summed sums `[..., SUMS]`: the readings, each `[...]`."""
    n, sy, syy, sv, svv, syv = (s[..., i] for i in range(6))
    xtx = s[..., 6:15].reshape(*s.shape[:-1], 3, 3)
    xty = s[..., 15:18]
    with np.errstate(invalid="ignore", divide="ignore"):
        my, mv = sy / n, sv / n
        var_y = syy / n - my ** 2
        mse = (syy - 2 * syv + svv) / n
        var_err = mse - (my - mv) ** 2
        ev = 1 - var_err / var_y
        # Least squares on [1, land, troops]; a tiny ridge keeps a degenerate bucket solvable.
        beta = np.linalg.solve(xtx + 1e-9 * np.eye(3), xty[..., None])[..., 0]
        sse = syy - (beta * xty).sum(-1)
        ev_share = 1 - sse / n / var_y
    return {"n": n, "mean_y": my, "mean_v": mv, "var_y": var_y, "mse": mse, "ev": ev, "ev_share": ev_share}


def bootstrap_weights(games: int, resamples: int, seed: int) -> np.ndarray:
    """`[resamples, games]`: how many times each game is drawn in each resample."""
    rng = np.random.default_rng(seed)
    return rng.multinomial(games, np.full(games, 1 / games), size=resamples).astype(np.float64)


def with_interval(sums: np.ndarray, weights: np.ndarray) -> dict:
    """`sums [games, SUMS]` → each reading's point value and 95% bootstrap interval over games."""
    point = readings(sums.sum(0))
    boot = readings(weights @ sums)
    out = {"decisions": int(point["n"]), "games": int((sums[:, 0] > 0).sum())}
    for key in ("mean_v", "mean_y", "var_y", "mse", "ev", "ev_share"):
        # A resample whose outcomes in the bucket don't vary has no explained variance.
        lo, hi = np.nanpercentile(np.where(np.isfinite(boot[key]), boot[key], np.nan), [2.5, 97.5])
        out[key] = [round(float(point[key]), 4), round(float(lo), 4), round(float(hi), 4)]
    return out


def buckets(d: Decisions) -> dict[str, np.ndarray]:
    progress = d.progress()
    out = {"all": np.ones_like(progress, dtype=bool)}
    for parts, name in ((3, "third"), (5, "fifth")):
        k = np.minimum((progress * parts).astype(np.int64), parts - 1)
        for i in range(parts):
            out[f"{name} {i + 1}/{parts}"] = k == i
    for i, phase in enumerate(PHASES[:3]):
        out[f"phase {phase}"] = d.phase == i
    return out


def report(d: Decisions, resamples: int = 1000, seed: int = 7) -> dict:
    games = d.final.shape[0]
    y, v = d.outcome().astype(np.float64), d.value.astype(np.float64)
    weights = bootstrap_weights(games, resamples, seed)
    out = {"games": games, "capped": int(d.capped.sum()), "decisions": int(len(y)), "buckets": {}}
    for name, mask in buckets(d).items():
        out["buckets"][name] = with_interval(game_sums(d.game, games, y, v, d.land, d.troops, mask), weights)
    # The trivial predictor: the mean outcome of the decision's progress fifth.
    fifth = np.minimum((d.progress() * 5).astype(np.int64), 4)
    means = np.array([y[fifth == i].mean() if (fifth == i).any() else 0.0 for i in range(5)])
    out["ev_progress_mean"] = round(float(1 - np.var(y - means[fifth]) / np.var(y)), 4)
    # Calibration: the prediction in ten equal bins over [-1, 1].
    edges = np.linspace(-1, 1, BINS + 1)
    k = np.clip(np.digitize(v, edges) - 1, 0, BINS - 1)
    rows = []
    for i in range(BINS):
        m = k == i
        per_game_n = np.bincount(d.game[m], minlength=games).astype(np.float64)
        per_game_y = np.bincount(d.game[m], weights=y[m], minlength=games)
        per_game_v = np.bincount(d.game[m], weights=v[m], minlength=games)
        n = per_game_n.sum()
        row = {"bin": [round(float(edges[i]), 1), round(float(edges[i + 1]), 1)], "decisions": int(n)}
        if n:
            with np.errstate(invalid="ignore", divide="ignore"):
                boot = (weights @ per_game_y) / (weights @ per_game_n)
            lo, hi = np.nanpercentile(boot, [2.5, 97.5])
            row["mean_v"] = round(float(per_game_v.sum() / n), 4)
            row["mean_y"] = [round(float(per_game_y.sum() / n), 4), round(float(lo), 4), round(float(hi), 4)]
        rows.append(row)
    out["calibration"] = rows
    return out


def interval(x: list[float]) -> str:
    return f"{x[0]:+.3f} [{x[1]:+.3f}, {x[2]:+.3f}]"


def table(name: str, r: dict) -> str:
    lines = [f"== {name}: {r['games']} games ({r['capped']} capped), {r['decisions']} decisions",
             f"{'bucket':18s} {'dec':>7s} {'EV vs outcome':>25s} {'MSE':>25s} {'Var(y)':>7s} {'mean v':>7s} "
             f"{'mean y':>7s} {'EV share-fit':>13s}"]
    for bucket, b in r["buckets"].items():
        lines.append(f"{bucket:18s} {b['decisions']:7d} {interval(b['ev']):>25s} {interval(b['mse']):>25s} "
                     f"{b['var_y'][0]:7.3f} {b['mean_v'][0]:+7.3f} {b['mean_y'][0]:+7.3f} {b['ev_share'][0]:+13.3f}")
    lines.append(f"EV of the trivial predictor (mean outcome by progress fifth), overall: {r['ev_progress_mean']:+.3f}")
    lines.append(f"{'calibration bin':18s} {'dec':>7s} {'mean v':>7s} {'mean y [95%]':>25s}")
    for row in r["calibration"]:
        label = f"[{row['bin'][0]:+.1f}, {row['bin'][1]:+.1f})"
        if row["decisions"]:
            lines.append(f"{label:18s} {row['decisions']:7d} {row['mean_v']:+7.3f} {interval(row['mean_y']):>25s}")
        else:
            lines.append(f"{label:18s} {0:7d}")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--ckpt", required=True)
    p.add_argument("--games", type=int, default=256)
    p.add_argument("--device", default="cuda", choices=["cuda", "cpu"])
    p.add_argument("--threads", type=int, default=4, help="CPU threads (`--device cpu`)")
    p.add_argument("--mixed", default="", help="also the checkpoint alone among four copies of this one")
    p.add_argument("--cap", type=int, default=600, help="the games' turn cap, in player-turns")
    p.add_argument("--seed", type=int, default=1, help="the move sampling's seed (the deals are fixed)")
    p.add_argument("--resamples", type=int, default=1000)
    p.add_argument("--out", default="")
    p.add_argument("--bf16", action=argparse.BooleanOptionalAction, default=True,
                   help="on CUDA, the networks in bfloat16 autocast as in training; ignored on the CPU")
    args = p.parse_args(argv)
    device = args.device
    if device == "cuda":
        assert torch.cuda.is_available(), "no CUDA device: is the eGPU connected? (--device cpu runs on the CPU)"
    else:
        torch.set_num_threads(args.threads)
    bf16 = args.bf16 and device == "cuda"
    torch.manual_seed(args.seed)
    board = Board.load(device)
    tables = BlitzTables.load(os.path.join(DATA, "blitz-256"), device)
    tables.scaled_oversize = True
    net = load_net(args.ckpt, board, device)
    out = {"ckpt": args.ckpt, "games": args.games, "device": device, "bf16": bf16, "seed": args.seed}
    tables_to_run = [("mirror", lambda: mirror_env(board, tables, net, args.games, device, bf16, args.cap))]
    if args.mixed:
        other = load_net(args.mixed, board, device)
        out["mixed_with"] = args.mixed
        tables_to_run.append(("mixed", lambda: mixed_env(board, tables, net, other, args.games, device, bf16, args.cap)))
    for name, build in tables_to_run:
        started = time.time()
        env = build()
        if device == "cuda":
            env.capture()
        decisions = collect(env)
        r = report(decisions, args.resamples)
        r["wall_s"] = round(time.time() - started, 1)
        out[name] = r
        print(table(name, r), flush=True)
        print(f"({r['wall_s']} s wall on {device}, context only)", flush=True)
        del env
    if args.out:
        with open(args.out, "w") as f:
            f.write(json.dumps(out, indent=1) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())

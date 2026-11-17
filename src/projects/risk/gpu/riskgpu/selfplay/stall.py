"""What kind of stall a checkpoint plays: turtling when behind, passivity everywhere, or argmax alone.

    python -m riskgpu.selfplay.stall b1-100=runs/selfplay/b1/snap-100.pt b1-125=runs/selfplay/b1/snap-125.pt#32
        [--games 64] [--modes sample,argmax] [--device cpu] [--threads 8] [--out runs/readings/stall/x.json]

run from `src/projects/risk/gpu/`. Each entry is `label=checkpoint`, with `#games` to play fewer (or
more) games for that one. Fixed 5-player deals (the same deals for every checkpoint: `calibrate`'s
mirror table), the checkpoint in every seat, played once with every seat **sampling** its moves and
once with every seat playing its **argmax**, to the end or the 600 player-turn cap, on the CPU as
`calibrate` does. At every decision it keeps, beside what `calibrate` keeps, the policy's own
probability on "end the attack" and the entropy of the main choice (both read from the sampled
policy's distribution, in either mode's games), the main choice actually played, and the board.

The three kinds it tells apart, and the numbers that separate them:

- **Turtling when behind** (a seat expecting to lose stops attacking, since a capped game's survivors
  can score above the bottom places, `env.scores`): the no-attack rate and `P(end)` of seats
  **behind** rising, across checkpoints, while seats **ahead** keep attacking; read as the
  behind − ahead difference of the no-attack rate, with its interval. Its value signature: behind
  seats' values near the cap's score rather than near elimination's.
- **General passivity** (an entropy bonus flattening late choices, or a standoff of equals): the
  no-attack rate and `P(end)` rising in **every** standing, ahead included, and in the early stage
  (turns under 100, which every game has, so the comparison is not about which games run long);
  attacks per turn falling everywhere; the board's armies at fixed turn marks climbing (hoarding).
- **An argmax artefact** (the most likely move is passive where the sampled policy still attacks):
  the argmax games capping while the sampled games of the same checkpoint finish, and in the argmax
  games the no-attack rate far above the mean `P(end)` at the same decisions (the policy itself
  would still attack often).

The numbers, per checkpoint and mode:

- games, the capped share (95% bootstrap interval over games), mean player-turns of decisive games,
  and the mean armies on the board at turns 50, 100, 200 and 400 among the games still running
  (the hoarding signature).
- By **standing** and by **stage**, over the turns that had an attack phase: the share of such turns
  whose attack phase ended without one attack (`no-atk`), the attacks made per such turn (`atk/t`),
  of them the single battles (`1bt/t`, the rest blitzes) and the territories captured (`cap/t`): many
  attacks that capture little is a war of attrition that doesn't close, rather than passivity;
  `P(end)` at the turn's first attack decision (`P(end)`: the sampled policy's probability on ending
  the attack phase there, in either mode's games), the entropy in nats of the main choice there
  (`H`), the net's value for the seat there (slot 0, `v`) and the seat's real final score (`y`,
  `env.scores` with the trainer's `win` reward, capped survivors at their survivors' place less 0.5).
  Each with its 95% bootstrap interval over games where it carries a conclusion. **Standing** is the
  deciding seat's board share (half its share of the territories, half its share of the armies, as
  `calibrate` and the auxiliary target count it) times the number of live seats, so 1 is an even
  share whatever the table's size: behind under 0.8, ahead over 1.25, the middle between (cut points
  fixed, so a bucket means the same at every checkpoint and stage). **Stage** is the decision's
  player-turn counted from the game's first, in bands 0-49, 50-99, 100-199, 200-399, 400+.
- **Capped games**: who is alive at the cap, by standing at the end, with each survivor's last value
  beside its real score: does the net expect the cap's score (survivors score −0.5 at two left, −1
  at four or five)?

Intervals are 95% bootstrap over games (a game's turns are correlated). The deals are fixed and the
move sampling seeded, so a rerun with the same arguments is the same reading.
"""

import argparse
import contextlib
import json
import os
import sys
import time
from dataclasses import dataclass

import numpy as np
import torch

from ..board import MAX_SEATS, Board
from ..data import DATA
from ..options import KIND_ATTACK, KIND_FORTIFY, KIND_OCCUPY, KIND_REINFORCE
from ..tables import BlitzTables
from . import env as env_module
from .actions import ATTACK, END_ATTACK
from .calibrate import CHUNK, PLAYERS, bootstrap_weights, mirror_env
from .ladder import load_net
from .net import Net, masked

MAX_STEPS = 200000
MARKS = (50, 100, 200, 400)
STAGES = ((0, 50), (50, 100), (100, 200), (200, 400), (400, 10 ** 9))
STANDINGS = ("behind", "middle", "ahead")
BEHIND, AHEAD = 0.8, 1.25
EARLY = 100  # the early stage every game reaches


@dataclass
class Decisions:
    """One row per decision (every seat is the checkpoint), and each game's end."""
    game: np.ndarray  # [N]
    step: np.ndarray  # [N] the batch step, so a game's decisions sort in order
    seat: np.ndarray  # [N]
    turn: np.ndarray  # [N] player-turns since the game's first
    kind: np.ndarray  # [N] the options' kind (KIND_*)
    main: np.ndarray  # [N] the main choice played
    amount: np.ndarray  # [N] its amount bucket (an attack's: 0 blitz keeping 1, 1 blitz keeping half, 2 one battle)
    captured: np.ndarray  # [N] territories the seat had captured this turn before the decision
    value: np.ndarray  # [N] the seat's value, slot 0
    p_end: np.ndarray  # [N] the sampled policy's probability on END_ATTACK (0 where it isn't legal)
    entropy: np.ndarray  # [N] the main choice's entropy, nats
    standing: np.ndarray  # [N] the seat's board share times the live seats (1 = an even share)
    armies: np.ndarray  # [N] the armies on the board
    final: np.ndarray  # [G, 6] each seat's final score
    capped: np.ndarray  # [G]
    length: np.ndarray  # [G] player-turns played
    alive_end: np.ndarray  # [G, 6] alive at the game's end
    standing_end: np.ndarray  # [G, 6] standing at the end (live seats)


def standing_third(standing: np.ndarray) -> np.ndarray:
    """0 behind, 1 middle, 2 ahead."""
    return np.where(standing < BEHIND, 0, np.where(standing > AHEAD, 2, 1))


def stage_band(turn: np.ndarray) -> np.ndarray:
    out = np.zeros(turn.shape, dtype=np.int64)
    for i, (lo, _) in enumerate(STAGES):
        out = np.where(turn >= lo, i, out)
    return out


def board_standing(owner: torch.Tensor, armies: torch.Tensor, eliminated: torch.Tensor,
                   players: torch.Tensor) -> torch.Tensor:
    """`[B, 6]`: each seat's board share (half territories, half armies) times the live seats."""
    seats = torch.arange(MAX_SEATS, device=owner.device)
    mine = (owner.to(torch.int64)[:, None, :] == seats[None, :, None]).to(torch.float32)
    a = armies.to(torch.float32)
    share = 0.5 * mine.mean(-1) + 0.5 * (mine * a[:, None, :]).sum(-1) / a.sum(1, keepdim=True).clamp(min=1)
    present = seats[None, :] < players.to(torch.int64)[:, None]
    live = (present & ~eliminated).sum(1, keepdim=True).to(torch.float32)
    return share * live


@contextlib.contextmanager
def probed(env, net: Net, p_end: torch.Tensor, entropy: torch.Tensor):
    """While inside, every learner decision's sampled-policy `P(END_ATTACK)` and main-choice entropy
    are written to `[CHUNK, B]` buffers at the env's step, by batch row. The env's own `act` runs
    unchanged; the probe reads the logits it computed (no second forward pass)."""
    original_act = env_module.act
    seen = {}

    def heads(x):
        out = type(net).heads_main(net, x)
        seen["logits"] = out[0]
        return out

    def act(n, node, slot, glob, legal, greedy=False, s=None, o=None, board=None):
        assert n is net, "the mirror runs one network"
        out = original_act(n, node, slot, glob, legal, greedy, s, o, board)
        # The rows the env served, in its order: `pick` with every live row needing the learner.
        idx = torch.argsort(env.done.to(torch.int8), stable=True)
        assert idx.shape[0] == legal.shape[0], "the mirror serves every row each step (cap_learner 1)"
        assert torch.equal(s.turn, env.state.turn[idx]) and torch.equal(s.active, env.state.active[idx])
        z = masked(seen.pop("logits"), legal)
        lp = torch.log_softmax(z, 1)
        p = lp.exp()
        t = int(env.t)
        p_end[t].index_copy_(0, idx, torch.where(legal[:, END_ATTACK], p[:, END_ATTACK], 0.0))
        entropy[t].index_copy_(0, idx, -torch.where(legal, p * lp, 0.0).sum(1))
        return out

    env_module.act = act
    net.heads_main = heads
    try:
        yield
    finally:
        env_module.act = original_act
        del net.heads_main


def collect(env, net: Net) -> Decisions:
    """Plays the mirror batch to its end, keeping every decision."""
    assert not env.cfg.reset and env.cfg.record
    B = env.cfg.batch
    first_turn = env.state.turn.to(torch.int64).clone()
    final = torch.zeros(B, MAX_SEATS, dtype=torch.float32)
    ends = torch.zeros(B, dtype=torch.int64)
    p_end = torch.zeros(CHUNK, B)
    entropy = torch.zeros(CHUNK, B)
    parts = []
    steps = 0
    with probed(env, net, p_end, entropy):
        while not bool(env.done.all()):
            if steps >= MAX_STEPS:
                raise RuntimeError(f"{int((~env.done).sum())} games still running after {steps} steps")
            p_end.zero_()
            entropy.zero_()
            env.run(CHUNK)
            buf = env.buf
            t, b = buf["learner"].nonzero(as_tuple=True)
            seat = buf["active"][t, b].to(torch.int64)
            standing = board_standing(buf["owner"][t, b], buf["armies"][t, b], buf["eliminated"][t, b],
                                      buf["players"][t, b])
            phase = buf["phase"][t, b].to(torch.int64)
            kind = torch.where(phase == 0, KIND_REINFORCE, torch.where(phase == 2, KIND_FORTIFY,
                               torch.where(buf["occ_present"][t, b], KIND_OCCUPY, KIND_ATTACK)))
            parts.append({"game": b, "step": t + steps, "seat": seat,
                          "turn": buf["turn"][t, b].to(torch.int64) - first_turn[b], "kind": kind,
                          "main": buf["main"][t, b], "amount": buf["amount"][t, b],
                          "captured": buf["captured"][t, b].to(torch.int64), "value": buf["value"][t, b], "p_end": p_end[t, b],
                          "entropy": entropy[t, b], "standing": standing.gather(1, seat[:, None])[:, 0],
                          "armies": buf["armies"][t, b].to(torch.int64).sum(1)})
            ended = buf["ended"]
            ends += ended.sum(0).cpu()
            final += (buf["reward"] * ended[:, :, None]).sum(0).cpu()
            steps += CHUNK
    if not bool((ends == 1).all()):
        raise RuntimeError(f"games ending other than once: {ends.tolist()}")
    out = {k: torch.cat([p[k] for p in parts]).cpu().numpy() for k in parts[0]}
    s = env.state
    present = torch.arange(MAX_SEATS)[None, :] < s.players.to(torch.int64)[:, None]
    return Decisions(**out, final=final.numpy(), capped=(s.winner < 0).cpu().numpy(),
                     length=(s.turn.to(torch.int64) - first_turn).cpu().numpy(),
                     alive_end=(present & ~s.eliminated).cpu().numpy(),
                     standing_end=board_standing(s.owner, s.armies, s.eliminated, s.players).cpu().numpy())


# --- per turn ----------------------------------------------------------------------------------

@dataclass
class Turns:
    """One row per (game, turn) that had an attack decision, read at its first."""
    game: np.ndarray
    seat: np.ndarray
    turn: np.ndarray
    standing: np.ndarray  # at the first attack decision
    attacks: np.ndarray  # attack moves (a battle or a blitz) made in the turn
    battles: np.ndarray  # of them, single battles (the rest blitzes)
    captures: np.ndarray  # territories captured in the turn
    p_end: np.ndarray  # at the first attack decision
    entropy: np.ndarray
    value: np.ndarray
    final: np.ndarray  # the seat's final score


def turns(d: Decisions) -> Turns:
    order = np.lexsort((d.step, d.game))
    attack = d.kind[order] == KIND_ATTACK
    o = order[attack]
    game, turn = d.game[o], d.turn[o]
    key = game * 100000 + turn
    starts = np.flatnonzero(np.r_[True, key[1:] != key[:-1]])
    attacked = (d.main[o] >= ATTACK) & (d.main[o] < END_ATTACK)
    count = np.add.reduceat(attacked.astype(np.int64), starts) if len(o) else np.zeros(0, dtype=np.int64)
    battles = np.add.reduceat((attacked & (d.amount[o] == 2)).astype(np.int64), starts) if len(o) else count
    first = o[starts]
    # Captures: the most the turn's log shows at any of its decisions (a capture shows from the next).
    all_key = d.game[order] * 100000 + d.turn[order]
    runs = np.flatnonzero(np.r_[True, all_key[1:] != all_key[:-1]])
    most = np.maximum.reduceat(d.captured[order], runs)
    captures = most[np.searchsorted(all_key[runs], key[starts])]
    # One turn is one seat's: a key never repeats once its run ends.
    assert len(np.unique(key[starts])) == len(starts), "a turn's attack decisions are not contiguous"
    return Turns(game=d.game[first], seat=d.seat[first], turn=d.turn[first], standing=d.standing[first],
                 attacks=count, battles=battles, captures=captures, p_end=d.p_end[first], entropy=d.entropy[first], value=d.value[first],
                 final=d.final[d.game[first], d.seat[first]])


# --- statistics --------------------------------------------------------------------------------

def means(game: np.ndarray, games: int, columns: list[np.ndarray], mask: np.ndarray, weights: np.ndarray):
    """Each column's mean over the rows in `mask`, `[point, lo, hi]` by bootstrap over games."""
    count = np.bincount(game[mask], minlength=games).astype(np.float64)
    out = []
    for c in columns:
        total = np.bincount(game[mask], weights=c[mask].astype(np.float64), minlength=games)
        with np.errstate(invalid="ignore", divide="ignore"):
            point = total.sum() / count.sum() if count.sum() else np.nan
            boot = (weights @ total) / (weights @ count)
        lo, hi = np.nanpercentile(boot, [2.5, 97.5]) if np.isfinite(boot).any() else (np.nan, np.nan)
        out.append([round(float(point), 4), round(float(lo), 4), round(float(hi), 4)])
    return int(count.sum()), out


FIELDS = ("no_attack", "attacks", "battles", "captures", "p_end", "entropy", "value", "final")


def bucket_table(t: Turns, games: int, weights: np.ndarray) -> dict:
    cols = [(t.attacks == 0).astype(np.float64), t.attacks, t.battles, t.captures, t.p_end, t.entropy, t.value, t.final]
    third, stage = standing_third(t.standing), stage_band(t.turn)
    masks = {"all": np.ones_like(third, dtype=bool)}
    for i, name in enumerate(STANDINGS):
        masks[name] = third == i
    for i, (lo, hi) in enumerate(STAGES):
        masks[f"turn {lo}-{hi - 1}" if hi < 10 ** 9 else f"turn {lo}+"] = stage == i
    early = t.turn < EARLY
    for i, name in enumerate(STANDINGS):
        masks[f"{name}, turn <{EARLY}"] = early & (third == i)
    out = {}
    for name, m in masks.items():
        n, vals = means(t.game, games, cols, m, weights)
        out[name] = {"turns": n, **dict(zip(FIELDS, vals))}
    return out


def gap(t: Turns, games: int, weights: np.ndarray, mask: np.ndarray) -> list[float]:
    """The no-attack rate of behind seats less that of ahead seats, in `mask`, with its interval."""
    third = standing_third(t.standing)
    no = (t.attacks == 0).astype(np.float64)

    def rate(m):
        n = np.bincount(t.game[m], minlength=games).astype(np.float64)
        k = np.bincount(t.game[m], weights=no[m], minlength=games)
        with np.errstate(invalid="ignore", divide="ignore"):
            return k.sum() / n.sum(), (weights @ k) / (weights @ n)

    pb, bb = rate(mask & (third == 0))
    pa, ba = rate(mask & (third == 2))
    lo, hi = np.nanpercentile(bb - ba, [2.5, 97.5])
    return [round(float(pb - pa), 4), round(float(lo), 4), round(float(hi), 4)]


def last_values(d: Decisions) -> np.ndarray:
    """`[G, 6]`: each seat's value at its last decision (NaN for a seat that never decided)."""
    out = np.full(d.final.shape, np.nan)
    key = d.game * MAX_SEATS + d.seat
    latest = np.lexsort((-d.step, key))  # by seat of game, latest first
    first = np.flatnonzero(np.r_[True, key[latest][1:] != key[latest][:-1]])
    rows = latest[first]
    out[d.game[rows], d.seat[rows]] = d.value[rows]
    return out


def report(d: Decisions, resamples: int = 1000, seed: int = 7) -> dict:
    games = d.final.shape[0]
    w = bootstrap_weights(games, resamples, seed)
    t = turns(d)
    capped = d.capped.astype(np.float64)
    boot = w @ capped / games
    decisive = ~d.capped
    out = {"games": games, "capped": int(d.capped.sum()),
           "capped_share": [round(float(capped.mean()), 4), *[round(float(x), 4) for x in np.percentile(boot, [2.5, 97.5])]],
           "decisive_turns": round(float(d.length[decisive].mean()), 1) if decisive.any() else None,
           "decisions": int(len(d.game)), "attack_turns": int(len(t.game)),
           "entropy_all": round(float(d.entropy.mean()), 4)}
    marks = {}
    for mark in MARKS:
        at = d.turn >= mark
        order = np.lexsort((d.step[at], d.game[at]))
        g = d.game[at][order]
        firsts = np.flatnonzero(np.r_[True, g[1:] != g[:-1]]) if len(g) else np.zeros(0, dtype=np.int64)
        armies = d.armies[at][order][firsts]
        marks[str(mark)] = {"games": int(len(firsts)), "armies": round(float(armies.mean()), 1) if len(firsts) else None}
    out["armies_at"] = marks
    out["buckets"] = bucket_table(t, games, w)
    every = np.ones(len(t.game), dtype=bool)
    out["behind_minus_ahead_no_attack"] = {"all": gap(t, games, w, every), f"turn <{EARLY}": gap(t, games, w, t.turn < EARLY)}
    # Capped games: the survivors, by standing at the end, their last value beside their real score.
    last_value = last_values(d)
    surv = d.capped[:, None] & d.alive_end
    g_idx, s_idx = np.nonzero(surv)
    third = standing_third(d.standing_end[g_idx, s_idx])
    rows = {}
    for i, name in enumerate(["all", *STANDINGS]):
        m = np.ones_like(third, dtype=bool) if name == "all" else third == i - 1
        if m.any():
            rows[name] = {"survivors": int(m.sum()), "last_value": round(float(last_value[g_idx[m], s_idx[m]].mean()), 4),
                          "final": round(float(d.final[g_idx[m], s_idx[m]].mean()), 4),
                          "standing": round(float(d.standing_end[g_idx[m], s_idx[m]].mean()), 3)}
    counts = surv.sum(1)[d.capped]
    out["capped_games"] = {"survivors_per_game": {str(k): int((counts == k).sum()) for k in range(1, PLAYERS + 1)},
                           "by_standing": rows}
    return out


# --- printing ----------------------------------------------------------------------------------

def iv(x: list[float], fmt: str = "{:.3f}") -> str:
    if x[0] != x[0]:
        return "-"
    return f"{fmt.format(x[0])} [{fmt.format(x[1])},{fmt.format(x[2])}]"


def table(label: str, mode: str, r: dict) -> str:
    c = r["capped_share"]
    lines = [f"== {label} {mode}: {r['games']} games, capped {iv(c, '{:.0%}')}, decisive games' turns "
             f"{r['decisive_turns']}, {r['attack_turns']} attack turns, mean main entropy {r['entropy_all']:.3f}",
             "armies on the board at turn " + ", ".join(f"{k}: {v['armies']} ({v['games']} g)" for k, v in r["armies_at"].items()),
             f"{'bucket':22s} {'turns':>6s} {'no-atk':>20s} {'atk/t':>20s} {'1bt/t':>6s} {'cap/t':>20s} {'P(end)':>20s} {'H':>6s} {'v':>7s} {'y':>7s}"]
    for name, b in r["buckets"].items():
        if not b["turns"]:
            continue
        lines.append(f"{name:22s} {b['turns']:6d} {iv(b['no_attack']):>20s} {iv(b['attacks'], '{:.2f}'):>20s} {b['battles'][0]:6.2f} {iv(b['captures'], '{:.2f}'):>20s} "
                     f"{iv(b['p_end']):>20s} {b['entropy'][0]:6.3f} {b['value'][0]:+7.3f} {b['final'][0]:+7.3f}")
    g = r["behind_minus_ahead_no_attack"]
    lines.append("no-attack rate, behind less ahead: " + ", ".join(f"{k} {iv(v, '{:+.3f}')}" for k, v in g.items()))
    cg = r["capped_games"]
    if r["capped"]:
        lines.append("capped games' survivors per game: " + ", ".join(f"{k}: {v}" for k, v in cg["survivors_per_game"].items() if v))
        for name, row in cg["by_standing"].items():
            lines.append(f"  survivors {name:7s} n={row['survivors']:4d} standing {row['standing']:.2f} "
                         f"last value {row['last_value']:+.3f} real score {row['final']:+.3f}")
    return "\n".join(lines)


def comparison(results: dict) -> str:
    """The few numbers that separate the three kinds, one row per checkpoint and mode."""
    head = (f"{'checkpoint':10s} {'mode':6s} {'capped':>16s} {'no-atk behind<100':>20s} {'no-atk ahead<100':>20s} "
            f"{'gap<100':>22s} {'no-atk all':>20s} {'P(end) all':>20s} {'arm@100':>7s} {'surv v/y':>13s}")
    lines = [head]
    for label, modes in results.items():
        for mode, r in modes.items():
            b = r["buckets"]
            cg = r["capped_games"]["by_standing"].get("all")
            sv = f"{cg['last_value']:+.2f}/{cg['final']:+.2f}" if cg else "-"
            lines.append(f"{label:10s} {mode:6s} {iv(r['capped_share'], '{:.0%}'):>16s} "
                         f"{iv(b[f'behind, turn <{EARLY}']['no_attack']):>20s} {iv(b[f'ahead, turn <{EARLY}']['no_attack']):>20s} "
                         f"{iv(r['behind_minus_ahead_no_attack'][f'turn <{EARLY}'], '{:+.3f}'):>22s} "
                         f"{iv(b['all']['no_attack']):>20s} {iv(b['all']['p_end']):>20s} "
                         f"{str(r['armies_at']['100']['armies']):>7s} {sv:>13s}")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("entries", nargs="+", help="label=checkpoint[#games]")
    p.add_argument("--games", type=int, default=64)
    p.add_argument("--modes", default="sample,argmax")
    p.add_argument("--device", default="cpu", choices=["cuda", "cpu"])
    p.add_argument("--threads", type=int, default=8, help="CPU threads (`--device cpu`)")
    p.add_argument("--cap", type=int, default=600)
    p.add_argument("--seed", type=int, default=1, help="the move sampling's seed (the deals are fixed)")
    p.add_argument("--resamples", type=int, default=1000)
    p.add_argument("--out", default="")
    args = p.parse_args(argv)
    device = args.device
    if device == "cuda":
        assert torch.cuda.is_available(), "no CUDA device (--device cpu runs on the CPU)"
    else:
        torch.set_num_threads(args.threads)
    board = Board.load(device)
    tables = BlitzTables.load(os.path.join(DATA, "blitz-256"), device)
    tables.scaled_oversize = True
    modes = args.modes.split(",")
    assert set(modes) <= {"sample", "argmax"}, modes
    out = {"args": vars(args), "standing_cuts": [BEHIND, AHEAD], "stages": STAGES, "results": {}}
    for entry in args.entries:
        label, rest = entry.split("=", 1)
        path, _, n = rest.partition("#")
        games = int(n) if n else args.games
        net = load_net(path, board, device)
        out["results"][label] = {}
        for mode in modes:
            started = time.time()
            torch.manual_seed(args.seed)
            env = mirror_env(board, tables, net, games, device, False, args.cap)
            env.cfg.learner_greedy = mode == "argmax"
            # The rule these checkpoints trained on (`env.scores`), whatever the env's default.
            env.cfg.cap_score = "survivors"
            r = report(collect(env, net), args.resamples)
            r["ckpt"], r["wall_s"] = path, round(time.time() - started, 1)
            out["results"][label][mode] = r
            print(table(label, mode, r), flush=True)
            print(f"({r['wall_s']} s wall on {device}, context only)\n", flush=True)
            del env
            if args.out:
                os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
                with open(args.out, "w") as f:
                    f.write(json.dumps(out, indent=1) + "\n")
    print(comparison(out["results"]), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())

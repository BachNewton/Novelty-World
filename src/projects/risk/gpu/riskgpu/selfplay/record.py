"""Recording a rollout search's choices as training targets (`ideas/learned-bot.md`, stage 3: expert
iteration, the search's choices distilled back into the policy by `distil.py`):

    python -m riskgpu.selfplay.record --ckpt runs/selfplay/b1/snap-100.pt --dir runs/search-records/b1-k3r6
        [--games 4096] [--shard-games 1024] [--mixture self] [--players 5] [--k 3] [--r 6]
        [--r-max 24 --z-stop 2] [--skipped] [--device cuda] [--out record.json]

run from `src/projects/risk/gpu/`. The search is `search.py`'s, with its options and defaults; only
its seating differs. `self` (the default and the main mode): the searcher's net in every seat, every
seat searching. `one-in`: one seat searches (game i's seat i mod the table's size) among the raw
net (`--raw`), as `search.py` reads it. Deals are the recording's own (`record-<seed>-<game>`), never
the panel's or a reading's.

**What a sample is.** One per searched decision of a searching seat: the state before the move as
`imitate.py` keeps it (every field the options and the observation read, and the turn so far), so
the observation, the legal choices and the decision's kind are rebuilt from it exactly as the search
saw them (a net's clock from the kept turn and the search's `cap`, which `recording.json` holds),
and nothing derived from them is stored; the candidates, each as the network's own action
(`cand_main`, `cand_amount`: the main choice and the amount bucket, or in the exact space the
argument slot) with its mean rollout score (`mean`), its number of rollouts (`count`), every
rollout's value (`vals`, float16, `[K, W]` with W the most rollouts a candidate may get: R, or the
adaptive budget's `--r-max`; the first `count` are played, the rest 0), whether it decodes to the
first choice's own move (`same_move`, the first choice itself among them) and the raw policy's
probabilities of it (`p_main`, and `p_amount` given its main choice); the candidate played
(`chosen`: 0, the network's first choice, unless the search overruled it; a candidate that decodes to
the first choice's own move counts as the first choice) and the engine move it is (`move`); whether
the search overruled (`overruled`). Each game keeps every seat's final score (`env.scores`, the win
reward's), the value head's target.

The rollouts are kept whole because one rollout's value is noisy next to the gaps between
candidates: a gap's standard error, its z, a shrunk gap, any statistic the distiller (`distil.py`)
needs, is computed from them. At K 3 they cost 6W + 3 bytes a sample, skipped ones included (39 at
R 6, 147 at an `--r-max` of 24), next to about 400 for the rest. A recording made before they were kept lacks
`vals` and `same_move`, and reads as before wherever they aren't asked for.

**Decisions the search skipped**, with `--skipped`: a searching seat's decision that has more than
one legal move and wasn't searched, because its first choice holds `--skip-mass` or more of the
probability (`source` 1) or its kind isn't searched (`source` 2). Its target is the network's own
first choice (one candidate, no rollouts), so the distilled net is held to its play there. Decisions
with one legal move are never kept: there is nothing to learn from them.

**Shards.** Game g is in shard g // `--shard-games`; each shard is played as one batch of games,
from its own seeds (the search's generators seeded from `--seed` and the shard), so a shard is the
same whichever shards ran before it, and on one device the same bytes every time. A shard is written
whole (`shard-<n>.pt`, by rename) once its games end, and a run that finds it already there skips it:
a recording stopped anywhere resumes by running the same command again. `recording.json` holds what
the shards were made with (the checkpoint's hash among it); a run whose arguments differ refuses.
`--hours` starts no new shard once that many hours have passed.

**Work.** Each shard keeps the search's work counters (`search.Work`: the network's trunk rows for the
real games, the rollouts and the leaves), its counts of decisions searched, overruled and skipped,
and the rollouts its searched decisions' candidates were given; the summary (`--out`) totals them,
with the work and the rollouts per searched decision and the searched decisions per game, the numbers a session is sized from (`distil.py`'s docstring has the formula).
"""

import argparse
import hashlib
import json
import os
import sys
import time
from dataclasses import asdict, replace

import torch

from ..board import MAX_SEATS, Board
from ..data import DATA
from ..options import Options
from ..runner import TurnLog
from ..state import State
from ..tables import BlitzTables
from .imitate import decision_kind, kept_fields
from .search import KINDS, SearchConfig, Searcher

# Where a sample's target came from. `PLAYED` is `own.py`'s: the net's own most likely move at a
# decision of its sampled play, with no search, which a recording of a net's own play holds alone.
SEARCHED, CONFIDENT, UNSEARCHED_KIND, PLAYED = 0, 1, 2, 3
SOURCES = ("searched", "confident", "unsearched-kind", "played")
MIXTURES = ("self", "one-in")
CONFIG = "recording.json"


def shard_path(folder: str, shard: int) -> str:
    return os.path.join(folder, f"shard-{shard:05d}.pt")


def shard_seed(seed: int, shard: int) -> int:
    """The search's seed for a shard: its generators depend on the shard alone, never on the shards
    played before it."""
    return seed * 1_000_003 + shard


def game_seed(seed: int, game: int) -> str:
    return f"record-{seed}-{game}"


def table_sizes(players: list[int], games: range) -> list[int]:
    return [players[g % len(players)] for g in games]


def searching_seats(mixture: str, sizes: list[int], games: range) -> torch.Tensor:
    """`[G, 6]` bool: the seats that search, every present seat under `self`, game g's seat
    g mod its size under `one-in`."""
    present = torch.arange(MAX_SEATS)[None, :] < torch.tensor(sizes)[:, None]
    if mixture == "self":
        return present
    lone = torch.tensor([g % n for g, n in zip(games, sizes)])
    return torch.arange(MAX_SEATS)[None, :] == lone[:, None]


class Recorder:
    """Collects the samples of one shard, on the host, as `Searcher.play` shows it each step's
    decisions of searching seats."""

    def __init__(self, k: int, width: int, skipped: bool, searchable: torch.Tensor, first_game: int):
        # `width`: the most rollouts a candidate may get, the width of every sample's `vals`.
        self.k, self.width, self.skipped, self.searchable, self.first_game = k, width, skipped, searchable, first_game
        self.parts: list[dict[str, torch.Tensor]] = []

    def _keep(self, s: State, o: Options, log: TurnLog, rows: torch.Tensor, games: torch.Tensor,
              decision: torch.Tensor, fields: dict[str, torch.Tensor]) -> None:
        sample = kept_fields(s.select(rows), log.select(rows))
        sample.update({"decision_kind": decision_kind(o.select(rows)).to(torch.int8),
                       "game": (games[rows] + self.first_game).to(torch.int32),
                       "decision": decision[rows].to(torch.int32), **fields})
        self.parts.append({name: v.cpu() for name, v in sample.items()})

    def decisions(self, s: State, o: Options, log: TurnLog, games: torch.Tensor, decision: torch.Tensor,
                  first: torch.Tensor, played: torch.Tensor, detail: dict) -> None:
        """`s`, `o`, `log`: the decisions' states before their moves; `games`: their games' rows in
        the shard; `first`, `played`: the network's first choices and the moves played, `[D, 5]`;
        `detail`: what `Searcher.choose` saw."""
        k = self.k
        for rows, means, pick, overruled, grid, vals, count, same in zip(
                detail["rows"], detail["means"], detail["chosen"], detail["overruled"], detail["grid"], detail["vals"],
                detail["count"], detail["same"]):
            ok = torch.isfinite(means)
            assert vals.shape[2] == self.width, (vals.shape, self.width)
            self._keep(s, o, log, rows, games, decision, {
                "cand_main": grid["main"].to(torch.int16), "cand_amount": grid["amount"].to(torch.int8),
                "cand_ok": ok, "mean": torch.where(ok, means, 0.0).float(),
                "count": torch.where(ok, count[:, None], 0).to(torch.int16),
                "vals": torch.where(ok[:, :, None], vals, 0.0).to(torch.float16), "same_move": same,
                "p_main": grid["p_main"].float(), "p_amount": grid["p_amount"].float(),
                "chosen": torch.where(overruled, pick, 0).to(torch.int8), "overruled": overruled,
                "move": played[rows].to(torch.int16),
                "source": torch.full_like(rows, SEARCHED, dtype=torch.int8)})
        if not self.skipped:
            return
        rows = (~detail["go"] & ~detail["forced"]).nonzero()[:, 0]
        if not rows.numel():
            return
        n, device = rows.shape[0], rows.device
        assert bool((played[rows] == first[rows]).all()), "a decision not searched played other than its first choice"
        searchable = self.searchable.to(device)[o.kind[rows].to(torch.int64)]
        one = torch.zeros(n, k, dtype=torch.bool, device=device)
        one[:, 0] = True

        def first_only(v: torch.Tensor, dtype) -> torch.Tensor:
            return torch.where(one, v[rows][:, None], 0).to(dtype)

        self._keep(s, o, log, rows, games, decision, {
            "cand_main": first_only(detail["main0"], torch.int16), "cand_amount": first_only(detail["a0"], torch.int8),
            "cand_ok": one, "mean": torch.zeros(n, k), "count": torch.zeros(n, k, dtype=torch.int16),
            "vals": torch.zeros(n, k, self.width, dtype=torch.float16), "same_move": one,
            "p_main": torch.zeros(n, k), "p_amount": torch.zeros(n, k),
            "chosen": torch.zeros(n, dtype=torch.int8), "overruled": torch.zeros(n, dtype=torch.bool),
            "move": played[rows].to(torch.int16),
            "source": torch.where(searchable, CONFIDENT, UNSEARCHED_KIND).to(torch.int8)})

    def samples(self) -> dict[str, torch.Tensor]:
        assert self.parts, "a shard with no decision kept"
        return {name: torch.cat([p[name] for p in self.parts]) for name in self.parts[0]}


def record_shard(net, board: Board, tables: BlitzTables, cfg: SearchConfig, device: str, shard: int,
                 shard_games: int, games: int, seed: int, mixture: str, players: list[int], raw: str,
                 skipped: bool, progress: bool = False) -> dict:
    """Plays shard `shard`'s games and returns what its file holds."""
    span = range(shard * shard_games, min(games, (shard + 1) * shard_games))
    sizes = table_sizes(players, span)
    searcher = Searcher(net, board, tables, replace(cfg, seed=shard_seed(seed, shard)), device)
    recorder = Recorder(cfg.k, cfg.r_max or cfg.r, skipped, searcher.searchable.cpu(), span.start)
    started = time.time()
    result = searcher.play([game_seed(seed, g) for g in span], sizes, searching_seats(mixture, sizes, span),
                           raw == "argmax", progress, recorder)
    data = recorder.samples()
    work = asdict(searcher.work)
    data["games"] = {"seed": [game_seed(seed, g) for g in span], "index": torch.tensor(list(span)),
                     "players": torch.tensor(sizes, dtype=torch.int8), "scores": result["scores"],
                     "winner": result["winner"], "turns": result["turns"].to(torch.int32)}
    data["meta"] = {"shard": shard, "games": len(span), "searched": dict(searcher.searched),
                    "overruled": dict(searcher.overruled), "skipped": dict(searcher.skipped), "work": work,
                    "rollouts": searcher.rollouts,
                    "samples": int(len(data["game"])), "wall_s": round(time.time() - started, 1)}
    return data


def file_hash(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def recording_config(args: argparse.Namespace, cfg: SearchConfig, net) -> dict:
    """What every shard of a recording was made with; `bf16`, `chunk`, `max_copies` and `check` are
    left out: they change how the work is batched or checked, not what is played (up to bfloat16's
    rounding, which a recording's own config doesn't hide: it is kept beside it)."""
    search = {k: v for k, v in asdict(cfg).items() if k not in ("seed", "chunk", "max_copies", "check", "bf16")}
    return {"ckpt": args.ckpt, "ckpt_sha256": file_hash(args.ckpt), "net": net.config(), "actions": net.actions,
            "search": search, "seed": args.seed, "games": args.games, "shard_games": args.shard_games,
            "mixture": args.mixture, "players": args.players, "raw": args.raw, "skipped": args.skipped}


def summary(folder: str) -> dict:
    """Every shard's counts and work, totalled."""
    with open(os.path.join(folder, CONFIG)) as f:
        config = json.load(f)
    shards = sorted(p for p in os.listdir(folder) if p.startswith("shard-") and p.endswith(".pt"))
    total = {"shards": len(shards), "games": 0, "capped": 0, "turns": 0, "samples": 0, "searched": 0, "overruled": 0,
             "skipped": 0, "rollouts": 0, "work": {"game": 0, "rollout": 0, "leaf": 0}, "by_kind": {}, "bytes": 0}
    for name in shards:
        path = os.path.join(folder, name)
        shard = torch.load(path, weights_only=False)
        meta, games = shard["meta"], shard["games"]
        total["capped"] += int((games["winner"] < 0).sum())
        total["turns"] += int(games["turns"].sum())
        total["bytes"] += os.path.getsize(path)
        total["games"] += meta["games"]
        total["samples"] += meta["samples"]
        total["rollouts"] += meta["rollouts"]
        for key in ("searched", "overruled", "skipped"):
            total[key] += sum(meta[key].values())
            for kind, v in meta[key].items():
                total["by_kind"].setdefault(kind, {"searched": 0, "overruled": 0, "skipped": 0})[key] += v
        for key, v in meta["work"].items():
            total["work"][key] += v
    searched = max(total["searched"], 1)
    total["mean_turns"] = round(total.pop("turns") / max(total["games"], 1), 1)
    total["overruled_share"] = round(total["overruled"] / searched, 4)
    total["work_per_search"] = round((total["work"]["rollout"] + total["work"]["leaf"]) / searched, 1)
    total["rollouts_per_search"] = round(total["rollouts"] / searched, 2)
    total["searched_per_game"] = round(total["searched"] / max(total["games"], 1), 1)
    total["bytes_per_sample"] = round(total["bytes"] / max(total["samples"], 1), 1)
    return {"config": config, **total}


def record(args: argparse.Namespace, net, board: Board, tables: BlitzTables, cfg: SearchConfig, device: str) -> dict:
    os.makedirs(args.dir, exist_ok=True)
    config = json.loads(json.dumps(recording_config(args, cfg, net)))  # as a reload reads it: lists, not tuples
    path = os.path.join(args.dir, CONFIG)
    if os.path.exists(path):
        with open(path) as f:
            theirs = json.load(f)
        assert theirs == config, f"{args.dir} holds a recording made otherwise: {theirs} against {config}"
    else:
        with open(path, "w") as f:
            json.dump(config, f, indent=1)
    started = time.time()
    shards = -(-args.games // args.shard_games)
    for shard in range(shards):
        target = shard_path(args.dir, shard)
        if os.path.exists(target):
            continue
        if args.hours is not None and time.time() - started > args.hours * 3600:
            print(f"stopped on the hours (--hours {args.hours}) before shard {shard} of {shards}", flush=True)
            break
        with torch.inference_mode():
            data = record_shard(net, board, tables, cfg, device, shard, args.shard_games, args.games, args.seed,
                                args.mixture, args.players, args.raw, args.skipped, args.progress)
        torch.save(data, target + ".tmp")
        os.replace(target + ".tmp", target)
        print(json.dumps(data["meta"]), flush=True)
    return summary(args.dir)


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--ckpt", required=True)
    p.add_argument("--dir", required=True, help="the recording's folder: its shards and recording.json")
    p.add_argument("--games", type=int, default=4096)
    p.add_argument("--shard-games", type=int, default=1024, help="games a shard plays at once")
    p.add_argument("--mixture", default="self", choices=MIXTURES)
    p.add_argument("--players", default="5", help="table sizes, comma-separated, dealt to the games in turn")
    p.add_argument("--raw", default="argmax", choices=["argmax", "sample"], help="how raw seats play under one-in")
    p.add_argument("--skipped", action="store_true", help="also keep the decisions the search skipped (`source` 1, 2)")
    p.add_argument("--k", type=int, default=3)
    p.add_argument("--r", type=int, default=6)
    p.add_argument("--leaf", default="own")
    p.add_argument("--kinds", default="reinforce,attack")
    p.add_argument("--skip-mass", type=float, default=0.95)
    p.add_argument("--margin", type=float, default=0.02)
    p.add_argument("--r-max", type=int, default=None, help="with --z-stop, the adaptive budget (`search.py`)")
    p.add_argument("--z-stop", type=float, default=None)
    p.add_argument("--hidden", default="resample", choices=["resample", "real"])
    p.add_argument("--crn", action=argparse.BooleanOptionalAction, default=True)
    p.add_argument("--cap", type=int, default=600)
    p.add_argument("--chunk", type=int, default=8192)
    p.add_argument("--max-copies", type=int, default=65536)
    p.add_argument("--check", action=argparse.BooleanOptionalAction, default=True)
    p.add_argument("--seed", type=int, default=1)
    p.add_argument("--hours", type=float, default=None, help="start no shard once this many hours have passed")
    p.add_argument("--device", default="cuda", choices=["cuda", "cpu"])
    p.add_argument("--bf16", action=argparse.BooleanOptionalAction, default=None,
                   help="the network in bfloat16 autocast (default: on for cuda, off for cpu)")
    p.add_argument("--threads", type=int, default=0)
    p.add_argument("--progress", action="store_true")
    p.add_argument("--out", default="", help="write the recording's summary as JSON here too")
    return p


def search_config(args: argparse.Namespace, bf16: bool) -> SearchConfig:
    """The search's config from the arguments; `args.players` read into its table sizes too."""
    args.players = [int(x) for x in args.players.split(",") if x]
    assert args.players and all(3 <= n <= MAX_SEATS for n in args.players), args.players
    kinds = tuple(KINDS) if args.kinds == "all" else tuple(x for x in args.kinds.split(",") if x)
    return SearchConfig(k=args.k, r=args.r, leaf=args.leaf, kinds=kinds, skip_mass=args.skip_mass, margin=args.margin,
                        hidden=args.hidden, crn=args.crn, cap=args.cap, chunk=args.chunk, max_copies=args.max_copies,
                        bf16=bf16, check=args.check, seed=args.seed, r_max=args.r_max, z_stop=args.z_stop)


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    device = args.device
    if device == "cuda":
        assert torch.cuda.is_available(), "--device cuda, but no CUDA device: is the GPU there?"
        torch.cuda.set_per_process_memory_fraction(0.92)
    bf16 = (device == "cuda") if args.bf16 is None else args.bf16
    assert not (bf16 and device == "cpu"), "bfloat16 autocast is for cuda: --no-bf16 on cpu"
    if bf16 and torch.cuda.get_device_capability(device) < (8, 0):
        raise RuntimeError(f"{torch.cuda.get_device_name(device)} has no native bfloat16: run with --no-bf16")
    if args.threads:
        torch.set_num_threads(args.threads)
    cfg = search_config(args, bf16)
    from .ladder import load_net
    board = Board.load(device)
    tables = BlitzTables.load(os.path.join(DATA, "blitz-256"), device)
    tables.scaled_oversize = True
    net = load_net(args.ckpt, board, device)
    out = record(args, net, board, tables, cfg, device)
    text = json.dumps(out, indent=1)
    print(text)
    if args.out:
        with open(args.out, "w") as f:
            f.write(text + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())


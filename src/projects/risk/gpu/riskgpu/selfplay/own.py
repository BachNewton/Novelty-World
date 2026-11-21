"""Recording a net's own play, with no search, as the targets a copy of it learns: a larger net
trained from random weights to play as the recorded one does (`ideas/learned-bot.md`):

    python -m riskgpu.selfplay.own --ckpt runs/selfplay/d4/snap-500.pt --dir runs/own-records/d4-500
        [--games 16384] [--shard-games 2048] [--players 3,4,5,6] [--weights 0.35,0.2,0.3,0.15] [--cap 600]
        [--seed 1] [--device cuda] [--out own.json]

run from `src/projects/risk/gpu/`. `distil.py` trains on it (`--width`/`--layers` for a fresh net)
and `tpu/prepare.py distil` prepares it for the TPU: it is a recording in `record.py`'s format, its
shards and `recording.json` read by `distil.Recording` as a search's are.

**The play.** The net in every seat of every game, each seat sampling its moves as net-v1 and the
trainer's rollouts do (the main choice from the masked softmax, then the amount given it), so the
positions are spread as the net's own games spread them. A net that reads the clock (`obs.py`)
sees the player-turns left before `--cap`, the panel's and the harness's fixed 600. Each game's
table size is drawn from `--players` at `--weights` (the trainer's mix by default), from `--seed`
alone, so a game's size is the same whichever shard plays it. Deals are the recording's own
(`own-<seed>-<game>`).

**What a sample is.** One per decision with more than one legal move, of every kind and every seat:
the state before the move as `imitate.py` keeps it (so the observation, the clock included, and the
legal choices are rebuilt from it exactly as the net saw them, and nothing derived is stored), and
the target: the net's **most likely** move there, its main choice and amount (`cand_main`,
`cand_amount`, one candidate) and the engine move they decode to (`move`), which is what the seated
bot plays. The move the game went on with was the sample; `off_target` says whether it was another
move than the target. Beside them the net's probabilities of the target (`p_main`, and `p_amount`
given its main choice), and in `record.py`'s other fields what a recording with no search holds
(no rollouts, nothing overruled); its `source` is `record.PLAYED`. Each game keeps every seat's
final score (`env.scores`, the win reward's), the value head's target, as every trainer defines it.

**Held out by game**, as `distil.Recording` holds out every recording: game g when g % 5 == 4.

**Shards** are `record.py`'s: game g in shard g // `--shard-games`, each shard one batch of games
from its own sampling seed, written whole by rename, skipped when a run finds it there, so a
recording stopped anywhere resumes by running the same command; `recording.json` holds what it was
made with, and a run whose arguments differ refuses. The summary (`--out`) counts games, decisions
by table size and by kind, the share of games capped, the mean turns, the off-target share and the
bytes on disk.
"""

import argparse
import json
import os
import sys
import time

import torch

from ..board import MAX_SEATS, Board
from ..data import DATA
from ..options import Options, options
from ..runner import TurnLog
from ..state import State, new_games
from ..tables import BlitzTables
from .actions import decode, decode_exact
from .env import scores
from .imitate import DECISION_KINDS, decision_kind, kept_fields, normalize
from .net import Net, amount_choice, masked
from .record import CONFIG, PLAYED, file_hash, shard_path, shard_seed
from .search import SearchConfig, Searcher, gumbel_argmax


def game_seed(seed: int, game: int) -> str:
    return f"own-{seed}-{game}"


def table_sizes(players: list[int], weights: list[float], games: int, seed: int) -> list[int]:
    """Every game's table size, drawn at `weights` from `seed` alone."""
    draw = torch.multinomial(torch.tensor(weights, dtype=torch.float64), games, replacement=True,
                             generator=torch.Generator().manual_seed(seed))
    return [players[i] for i in draw.tolist()]


class Recorder:
    """Collects the samples of one shard on the host, a step's kept decisions at a time."""

    def __init__(self, first_game: int):
        self.first_game = first_game
        self.parts: list[dict[str, torch.Tensor]] = []

    def keep(self, s: State, o: Options, log: TurnLog, games: torch.Tensor, decision: torch.Tensor,
             fields: dict[str, torch.Tensor]) -> None:
        """`s`, `o`, `log`: the kept decisions' states before their moves; `games`: their games' rows
        in the shard."""
        sample = kept_fields(s, log)
        sample.update({"decision_kind": decision_kind(o).to(torch.int8), "game": (games + self.first_game).to(torch.int32),
                       "decision": decision.to(torch.int32), **fields})
        self.parts.append({name: v.cpu() for name, v in sample.items()})

    def samples(self) -> dict[str, torch.Tensor]:
        assert self.parts, "a shard with no decision kept"
        return {name: torch.cat([p[name] for p in self.parts]) for name in self.parts[0]}


def play(searcher: Searcher, seeds: list[str], sizes: list[int], gen: torch.Generator, recorder: Recorder,
         progress: bool = False) -> dict:
    """Plays every game to its end or cap, every seat sampling, and shows the recorder each decision
    with more than one legal move and its target. Returns each game's winner (−1 capped), turns and
    every seat's score."""
    net, board, cap, dev = searcher.net, searcher.board, searcher.cfg.cap, searcher.device
    g = len(seeds)
    s = new_games(seeds, sizes, board, dev)
    log = TurnLog.empty(g, dev)
    places = torch.ones(g, MAX_SEATS, dtype=torch.int64, device=dev)
    in_game = s.players.to(torch.int64).clone()
    decision = torch.zeros(g, dtype=torch.int64, device=dev)
    started, steps = time.time(), 0
    while True:
        live = (s.phase != 3) & (s.turn.to(torch.int64) <= cap)
        if not bool(live.any()):
            break
        o = options(s, board)
        idx = live.nonzero()[:, 0]
        sub, so, slog = s.select(idx), o.select(idx), log.select(idx)
        x, logits, _, legal = searcher.heads(sub, so, slog)
        z = masked(logits, legal)
        with searcher.autocast():
            main0 = z.argmax(1)
            za0, alegal0, c0 = amount_choice(net, x, main0, sub, so, board)
            main = gumbel_argmax(z, gen)
            za, _, c = amount_choice(net, x, main, sub, so, board)
        a0, amount = za0.argmax(1), gumbel_argmax(za, gen)
        if net.exact:
            target, played = decode_exact(main0, a0, sub, so, board, c0), decode_exact(main, amount, sub, so, board, c)
        else:
            target, played = decode(main0, a0, sub, so, board), decode(main, amount, sub, so, board)
        kept = ~((legal.sum(1) == 1) & (alegal0.sum(1) == 1))
        if bool(kept.any()):
            k = kept.nonzero()[:, 0]
            rows = torch.arange(k.shape[0], device=dev)
            ks, ko = sub.select(k), so.select(k)
            p_main = torch.softmax(z[k], 1)[rows, main0[k]]
            p_amount = torch.softmax(za0[k].float(), 1)[rows, a0[k]]
            off = (normalize(played[k], ks, ko) != normalize(target[k], ks, ko)).any(1)
            one = torch.ones(k.shape[0], 1, dtype=torch.bool, device=dev)
            recorder.keep(ks, ko, slog.select(k), idx[k], decision[idx[k]], {
                "cand_main": main0[k, None].to(torch.int16), "cand_amount": a0[k, None].to(torch.int8), "cand_ok": one,
                "mean": torch.zeros(k.shape[0], 1, device=dev), "count": torch.zeros(k.shape[0], 1, dtype=torch.int16, device=dev),
                "p_main": p_main[:, None].float(), "p_amount": p_amount[:, None].float(),
                "chosen": torch.zeros(k.shape[0], dtype=torch.int8, device=dev),
                "overruled": torch.zeros(k.shape[0], dtype=torch.bool, device=dev),
                "move": target[k].to(torch.int16), "off_target": off,
                "source": torch.full((k.shape[0],), PLAYED, dtype=torch.int8, device=dev)})
        moves = torch.zeros(g, 5, dtype=torch.int64, device=dev)
        moves[idx] = played
        searcher.advance(s, log, places, in_game, moves, live)
        decision += live.to(torch.int64)
        steps += 1
        if progress and steps % 500 == 0:
            print(f"  step {steps}: {int(live.sum())} games running, turn {int(s.turn.max())}, "
                  f"{time.time() - started:.0f}s", flush=True)
    won = s.phase == 3
    return {"winner": torch.where(won, s.winner.to(torch.int64), -1).cpu(), "turns": s.turn.cpu(),
            "scores": scores(s.players, places, s.eliminated, won, in_game).cpu()}


def record_shard(net: Net, board: Board, tables: BlitzTables, args: argparse.Namespace, device: str, shard: int,
                 sizes: list[int]) -> dict:
    """Plays shard `shard`'s games and returns what its file holds."""
    span = range(shard * args.shard_games, min(args.games, (shard + 1) * args.shard_games))
    mine = sizes[span.start:span.stop]
    cfg = SearchConfig(cap=args.cap, chunk=args.chunk, bf16=args.bf16, check=args.check, seed=args.seed)
    searcher = Searcher(net, board, tables, cfg, device)
    gen = torch.Generator(device=device).manual_seed(shard_seed(args.seed, shard))
    recorder = Recorder(span.start)
    started = time.time()
    result = play(searcher, [game_seed(args.seed, g) for g in span], mine, gen, recorder, args.progress)
    data = recorder.samples()
    data["games"] = {"seed": [game_seed(args.seed, g) for g in span], "index": torch.tensor(list(span)),
                     "players": torch.tensor(mine, dtype=torch.int8), "scores": result["scores"],
                     "winner": result["winner"], "turns": result["turns"].to(torch.int32)}
    kind = data["decision_kind"].to(torch.int64)
    off = data["off_target"]
    data["meta"] = {"shard": shard, "games": len(span), "samples": int(len(data["game"])),
                    "by_kind": {name: int((kind == i).sum()) for i, name in enumerate(DECISION_KINDS)},
                    "off_target": {name: int((off & (kind == i)).sum()) for i, name in enumerate(DECISION_KINDS)},
                    "wall_s": round(time.time() - started, 1)}
    return data


def recording_config(args: argparse.Namespace, net: Net) -> dict:
    """What every shard was made with; `bf16`, `chunk` and `check` are left out: they change how the
    work is batched or checked, not what is played (up to bfloat16's rounding)."""
    return {"kind": "own", "ckpt": args.ckpt, "ckpt_sha256": file_hash(args.ckpt), "net": net.config(),
            "actions": net.actions, "cap": args.cap, "seed": args.seed, "games": args.games,
            "shard_games": args.shard_games, "players": args.players, "weights": args.weights}


def summary(folder: str) -> dict:
    """Every shard's counts, totalled, by table size and by kind."""
    with open(os.path.join(folder, CONFIG)) as f:
        config = json.load(f)
    shards = sorted(p for p in os.listdir(folder) if p.startswith("shard-") and p.endswith(".pt"))
    total = {"shards": len(shards), "games": 0, "capped": 0, "samples": 0, "off_target": 0, "bytes": 0, "wall_s": 0.0,
             "by_players": {}, "by_kind": {name: {"samples": 0, "off_target": 0} for name in DECISION_KINDS}}
    turns = 0
    for name in shards:
        path = os.path.join(folder, name)
        shard = torch.load(path, weights_only=False)
        meta, games = shard["meta"], shard["games"]
        total["games"] += meta["games"]
        total["capped"] += int((games["winner"] < 0).sum())
        total["samples"] += meta["samples"]
        total["bytes"] += os.path.getsize(path)
        total["wall_s"] += meta["wall_s"]
        turns += int(games["turns"].sum())
        for kind in DECISION_KINDS:
            total["by_kind"][kind]["samples"] += meta["by_kind"][kind]
            total["by_kind"][kind]["off_target"] += meta["off_target"][kind]
            total["off_target"] += meta["off_target"][kind]
        first = int(games["index"].min())
        per_game = torch.bincount(shard["game"].to(torch.int64) - first, minlength=meta["games"])
        for n in games["players"].unique().tolist():
            at = games["players"] == n
            row = total["by_players"].setdefault(str(n), {"games": 0, "samples": 0, "capped": 0, "turns": 0})
            row["games"] += int(at.sum())
            row["samples"] += int(per_game[at].sum())
            row["capped"] += int((games["winner"][at] < 0).sum())
            row["turns"] += int(games["turns"][at].sum())
    for row in total["by_players"].values():
        row["mean_turns"] = round(row.pop("turns") / max(row["games"], 1), 1)
        row["samples_per_game"] = round(row["samples"] / max(row["games"], 1), 1)
    for row in total["by_kind"].values():
        row["off_target_share"] = round(row["off_target"] / max(row["samples"], 1), 4)
    games = max(total["games"], 1)
    total.update({"capped_share": round(total["capped"] / games, 4), "mean_turns": round(turns / games, 1),
                  "samples_per_game": round(total["samples"] / games, 1),
                  "off_target_share": round(total["off_target"] / max(total["samples"], 1), 4),
                  "bytes_per_sample": round(total["bytes"] / max(total["samples"], 1), 1), "wall_s": round(total["wall_s"], 1)})
    return {"config": config, **total}


def record(args: argparse.Namespace, net: Net, board: Board, tables: BlitzTables, device: str) -> dict:
    os.makedirs(args.dir, exist_ok=True)
    config = json.loads(json.dumps(recording_config(args, net)))  # as a reload reads it: lists, not tuples
    path = os.path.join(args.dir, CONFIG)
    if os.path.exists(path):
        with open(path) as f:
            theirs = json.load(f)
        assert theirs == config, f"{args.dir} holds a recording made otherwise: {theirs} against {config}"
    else:
        with open(path, "w") as f:
            json.dump(config, f, indent=1)
    sizes = table_sizes(args.players, args.weights, args.games, args.seed)
    for shard in range(-(-args.games // args.shard_games)):
        target = shard_path(args.dir, shard)
        if os.path.exists(target):
            continue
        with torch.inference_mode():
            data = record_shard(net, board, tables, args, device, shard, sizes)
        torch.save(data, target + ".tmp")
        os.replace(target + ".tmp", target)
        print(json.dumps(data["meta"]), flush=True)
    return summary(args.dir)


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--ckpt", required=True)
    p.add_argument("--dir", required=True, help="the recording's folder: its shards and recording.json")
    p.add_argument("--games", type=int, default=16384)
    p.add_argument("--shard-games", type=int, default=2048, help="games a shard plays at once")
    p.add_argument("--players", default="3,4,5,6", help="the table sizes, comma-separated")
    p.add_argument("--weights", default="0.35,0.2,0.3,0.15", help="each table size's share, as the trainer's mix")
    p.add_argument("--cap", type=int, default=600, help="the player-turn cap, which a net with the clock sees")
    p.add_argument("--chunk", type=int, default=8192, help="rows the network takes at once")
    p.add_argument("--check", action=argparse.BooleanOptionalAction, default=True)
    p.add_argument("--seed", type=int, default=1)
    p.add_argument("--device", default="cuda", choices=["cuda", "cpu"])
    p.add_argument("--bf16", action=argparse.BooleanOptionalAction, default=None,
                   help="the network in bfloat16 autocast (default: on for cuda, off for cpu)")
    p.add_argument("--progress", action="store_true")
    p.add_argument("--out", default="", help="write the recording's summary as JSON here too")
    return p


def parse(argv: list[str] | None = None) -> argparse.Namespace:
    args = parser().parse_args(argv)
    args.players = [int(x) for x in args.players.split(",") if x]
    args.weights = [float(x) for x in args.weights.split(",") if x]
    assert args.players and all(3 <= n <= MAX_SEATS for n in args.players), args.players
    assert len(args.weights) == len(args.players) and all(w > 0 for w in args.weights), (args.players, args.weights)
    if args.bf16 is None:
        args.bf16 = args.device == "cuda"
    assert not (args.bf16 and args.device == "cpu"), "bfloat16 autocast is for cuda: --no-bf16 on cpu"
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse(argv)
    device = args.device
    if device == "cuda":
        assert torch.cuda.is_available(), "--device cuda, but no CUDA device: is the GPU there?"
        torch.cuda.set_per_process_memory_fraction(0.92)
    from .ladder import load_net
    board = Board.load(device)
    tables = BlitzTables.load(os.path.join(DATA, "blitz-256"), device)
    tables.scaled_oversize = True
    net = load_net(args.ckpt, board, device)
    out = record(args, net, board, tables, device)
    text = json.dumps(out, indent=1)
    print(text)
    if args.out:
        with open(args.out, "w") as f:
            f.write(text + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())

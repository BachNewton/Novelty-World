"""Imitation of a teacher's recorded games (`ideas/learned-bot.md`, stage 1): the net's policy
trained to make the teacher's decisions, its value head to the recorded games' outcomes.

    python -m riskgpu.selfplay.imitate extract runs/records/native-v2 --out runs/imitate/native-v2
    python -m riskgpu.selfplay.imitate train --data runs/imitate/native-v2 --name imit-1 [--fraction 1]
    python -m riskgpu.selfplay.imitate read --data runs/imitate/native-v2 --ckpt runs/imitate/imit-1/best.pt

run from `src/projects/risk/gpu/`.

**Extract.** Every record under the folder (one subfolder per seating) is replayed on the GPU
engine, a batch of games at a time, every move checked legal and the state's hash compared with
the record's every `--check` decisions and at the end. A game whose replay diverges (a blitz on
one of the rare inputs where the recording machine's `pow` differs from this one's) is cut at its
last verified state, counted and reported. At each decision of a teacher's seat it keeps the state
(everything the options and the observation read) and the turn so far, the target and the
decision's kinds; a seating's samples go to `<out>/<seating>.pt`. Games are held out by shard:
shard k of a recording (`<seeds>-<k>-<core>.jsonl.gz`) is held out when k % 5 == 4, a fifth of the
games, none split.

**The target.** The teacher's move as the action space's main choice and amount bucket
(`actions.py`). A move the space can't express exactly (an amount between the buckets, a battle
with fewer than the most dice, another set or bonus than the trade rule's) is mapped to the nearest
choice and flagged: the flagged share by kind is a measurement of the action space, and a flagged
target's decoded move is the move the net would play in its place. Unflagged targets decode to the
teacher's move exactly.

**Train.** Cross-entropy over the legal main choices and over the amount where its group has
buckets, and the value head (every present slot) fitted to its seat's score in the recorded game
(`env.scores`, the win reward). The observations are rebuilt on the GPU from the kept states each
minibatch, as PPO's update does. Checkpoints are kept by held-out main-choice agreement, read on a
fixed sample of the held-out decisions. The rate holds until `--lr-patience` reads bring no gain,
then drops by `--lr-drop` from the best weights; training stops at the plateau (`--patience` reads
without a gain) or at `--max-samples`, so a run on a small share is trained to its own plateau as
the full one is. `--fraction` trains on that share of the training games (the same games
at every run, nested: a quarter holds the sixteenth), for the data curve.

**Read.** Held-out agreement over every held-out decision, by the teacher's move kind and by the
decision's kind as the crate's `agree` tallies it, the main choice alone and the whole move, with
95% intervals by bootstrap over games.
"""

import argparse
import glob
import json
import math
import os
import re
import sys
import time

import numpy as np
import torch
from torch.nn import functional as F

from ..board import MAX_SEATS, TERRITORIES, Board
from ..canonical import hash_bytes, state_ints
from ..data import DATA, load_best
from ..engine import ATTACK as K_ATTACK
from ..engine import BLITZ as K_BLITZ
from ..engine import PLACE as K_PLACE
from ..engine import TRADE as K_TRADE
from ..engine import IllegalMove, step
from ..options import KIND_ATTACK, KIND_OCCUPY, KIND_REINFORCE, Options, options
from ..records import read_records
from ..runner import TurnLog
from ..state import LAYOUT, State, new_games
from .actions import (ATTACK, END_ATTACK, END_TURN, FORTIFY, OCCUPY, TRADE, amount_group, decode, legal_amount,
                      legal_main)
from .env import KEPT, scores
from .net import Net, masked
from .obs import observe, slots

GPU = os.path.dirname(DATA)
RUNS = os.path.join(GPU, "runs", "imitate")

# The teacher's move kinds, by the engine's move kind (PLACE … END_TURN).
MOVE_KINDS = ("place", "trade", "attack", "end-attack", "move-in", "fortify", "end-turn")
MOVE_KIND_OF = torch.tensor([0, 1, 2, 2, 4, 3, 5, 6])
# The decision's kinds as the crate's `agree` tallies them (`native/src/decide.rs`).
DECISION_KINDS = ("placement", "trade", "attack", "move-in", "fortify")
LOG_FIELDS = ("placed_on", "attacks", "captured")
HELD_OUT_EVERY = 5


def held_out(path: str) -> bool:
    shard = re.search(r"-(\d+)-\d+\.jsonl(\.gz)?$", os.path.basename(path))
    assert shard, f"{path}: not a recorder's file (<seeds>-<shard>-<core>.jsonl.gz)"
    return int(shard.group(1)) % HELD_OUT_EVERY == HELD_OUT_EVERY - 1


# --- targets -----------------------------------------------------------------------------------


def normalize(move: torch.Tensor, s: State, o: Options) -> torch.Tensor:
    """A move `[N, 5]` in one form per meaning, for comparing two: a trade's cards sorted, and its
    bonus −1 where the engine would choose it anyway (one qualifying card or none)."""
    move = move.clone()
    trading = move[:, 0] == K_TRADE
    cards = torch.where(trading[:, None], move[:, 1:4], 0)
    owner = s.owner.to(torch.int64).gather(1, cards.clamp(0, TERRITORIES - 1))
    choices = ((cards < TERRITORIES) & (owner == s.active.to(torch.int64)[:, None])).sum(1)
    move[:, 1:4] = torch.where(trading[:, None], cards.sort(1).values, move[:, 1:4])
    move[:, 4] = torch.where(trading & (choices <= 1), -1, move[:, 4])
    return move


def _nearest(buckets: torch.Tensor, value: torch.Tensor) -> torch.Tensor:
    """The bucket closest to `value`, the first of a tie."""
    return (buckets - value[:, None]).abs().argmin(1)


def targets(s: State, o: Options, move: torch.Tensor, board: Board, edge_of: torch.Tensor):
    """`(main, amount, flagged)` for the teacher's moves `[N, 5]` int64 at states `s`."""
    rows = torch.arange(s.batch, device=s.device)
    kind, x, y, z = move[:, 0], move[:, 1], move[:, 2], move[:, 3]
    one = torch.ones_like(x)

    to_place = o.to_place.to(torch.int64)
    place_amount = _nearest(torch.stack([to_place, (to_place + 1) // 2, one], 1).clamp(min=1), y)
    source = s.armies.to(torch.int64)[rows, x.clamp(0, TERRITORIES - 1)]
    blitz_amount = _nearest(torch.stack([one, (source // 2).clamp(min=1)], 1), z)
    lo, hi = o.occ_min.to(torch.int64), o.occ_max.to(torch.int64)
    occupy = _nearest(torch.stack([lo, torch.maximum(lo, (lo + hi + 1) // 2), hi], 1), x)
    pair = x.clamp(0, TERRITORIES - 1) * TERRITORIES + y.clamp(0, TERRITORIES - 1)
    most = o.fortify_max.reshape(s.batch, -1)[rows, pair].to(torch.int64)
    fortify_amount = _nearest(torch.stack([most, (most + 1) // 2], 1), z)
    edge = edge_of[x.clamp(0, TERRITORIES - 1), y.clamp(0, TERRITORIES - 1)]

    move_kind = MOVE_KIND_OF.to(s.device)[kind]
    by_kind = [
        (x, place_amount),
        (torch.full_like(x, TRADE), 0 * x),
        (ATTACK + edge, torch.where(kind == K_ATTACK, 2, blitz_amount)),
        (torch.full_like(x, END_ATTACK), 0 * x),
        (OCCUPY + occupy, 0 * x),
        (FORTIFY + pair, fortify_amount),
        (torch.full_like(x, END_TURN), 0 * x),
    ]
    main = torch.zeros_like(x)
    amount = torch.zeros_like(x)
    for k, (m, a) in enumerate(by_kind):
        main = torch.where(move_kind == k, m, main)
        amount = torch.where(move_kind == k, a, amount)
    assert bool((edge[(kind == K_ATTACK) | (kind == K_BLITZ)] >= 0).all()), "an attack along no border"
    legal = legal_main(o)
    bad = ~legal[rows, main]
    assert not bool(bad.any()), f"a teacher's move maps to an illegal choice: {move[bad][:4].tolist()}"
    played = decode(main, amount, s, o, board)
    flagged = (normalize(played, s, o) != normalize(move, s, o)).any(1)
    return main, amount, flagged


def decision_kind(o: Options) -> torch.Tensor:
    """The crate's `agree` kinds (`DECISION_KINDS`)."""
    kind = o.kind.to(torch.int64)
    reinforce = torch.where(o.sets.any(-1), 1, 0)
    return torch.where(kind == KIND_REINFORCE, reinforce,
                       torch.where(kind == KIND_ATTACK, 2, torch.where(kind == KIND_OCCUPY, 3, 4)))


def edge_index(board: Board) -> torch.Tensor:
    """`[42, 42]` int64: each directed border's index in `board.edges`, −1 where there is none."""
    out = torch.full((TERRITORIES, TERRITORIES), -1, dtype=torch.int64, device=board.edges.device)
    e = board.edges.to(torch.int64)
    out[e[:, 0], e[:, 1]] = torch.arange(e.shape[0], device=out.device)
    return out


# --- extraction --------------------------------------------------------------------------------


def final_scores(record: dict) -> list[float]:
    """Each seat's score in the recorded game, the win reward's (`env.scores`)."""
    n = record["players"]
    result = record["result"]
    places = torch.tensor(result["places"] + [1] * (MAX_SEATS - n))[None]
    won = not result["capped"]
    eliminated = (places > 1) & (torch.arange(MAX_SEATS) < n)[None]
    in_game = (n - eliminated.sum(1))
    return scores(torch.tensor([n]), places, eliminated, torch.tensor([won]), in_game)[0].tolist()


def replay(records: list[dict], teacher, board: Board, tables, device: str, check_every: int = 32):
    """Replays `records` as one batch. Returns the samples (a dict of host tensors), each game's
    cut (the decisions kept: all of them, or up to its last verified state) and its reason."""
    batch = len(records)
    s = new_games([r["seed"] for r in records], [r["players"] for r in records], board, device)
    log = TurnLog.empty(batch, device)
    edge_of = edge_index(board)
    lengths = [len(r["moves"]) for r in records]
    longest = max(lengths)
    moves_np = np.zeros((batch, longest, 6), dtype=np.int32)
    for g, r in enumerate(records):
        moves_np[g, : lengths[g]] = np.asarray(r["moves"], dtype=np.int32)
    n_moves = torch.tensor(lengths, device=device)
    max_turns = torch.tensor([r["maxTurns"] for r in records], device=device)
    is_teacher = torch.tensor([[teacher(b) for b in r["bots"]] + [False] * (MAX_SEATS - len(r["bots"]))
                               for r in records], device=device)
    failed = torch.zeros(batch, dtype=torch.bool, device=device)
    verified = [0] * batch  # decisions whose states are verified: the game's samples up to here are kept
    reason: list[str | None] = [None] * batch
    rows = torch.arange(batch, device=device)

    initial = state_ints(s).cpu().numpy()
    for g, r in enumerate(records):
        if hash_bytes(initial[g].astype("<i4").tobytes()) != r["initialHash"]:
            failed[g] = True
            reason[g] = "initial state"

    def verify(d: int, games: torch.Tensor) -> None:
        """Compares the state after decision `d` with the record for `games`; a mismatch cuts the
        game at its last verified state."""
        if not games.numel():
            return
        ints =state_ints(s.select(games)).cpu().numpy()
        for i, g in enumerate(games.tolist()):
            if hash_bytes(ints[i].astype("<i4").tobytes()) == records[g]["stateHashes"][d]:
                verified[g] = d + 1
            else:
                failed[g] = True
                reason[g] = f"state hash at decision {d}"

    out: dict[str, list[torch.Tensor]] = {}
    d = 0
    while True:
        over = (s.phase == 3) | (s.turn > max_turns)
        live = ~over & (d < n_moves) & ~failed
        if not bool(live.any()):
            break
        move6 = torch.from_numpy(np.ascontiguousarray(moves_np[:, min(d, longest - 1)])).to(device=device, dtype=torch.int64)
        seat, move = move6[:, 0], move6[:, 1:]
        wrong_seat = live & (seat != s.active.to(torch.int64))
        for g in torch.nonzero(wrong_seat)[:, 0].tolist():
            failed[g] = True
            reason[g] = f"seat at decision {d}"
        live &= ~failed
        o = options(s, board)
        while True:
            try:
                before = s.clone()
                info = step(s, torch.where(live[:, None], move, 0), board, tables, done=~live, legal=o)
                break
            except IllegalMove as e:
                failed[e.game] = True
                reason[e.game] = f"illegal move at decision {d}"
                live &= ~failed
        del info
        mine = live & is_teacher[rows, seat.clamp(0, MAX_SEATS - 1)]
        idx = torch.nonzero(mine)[:, 0]
        if idx.numel():
            sb, ob = before.select(idx), o.select(idx)
            main, amount, flagged = targets(sb, ob, move[idx], board, edge_of)
            lb = log.select(idx)
            sample = {name: getattr(sb, name) for name in KEPT}
            sample["armies"] = sample["armies"].to(torch.int16)
            sample.update({name: getattr(lb, name) for name in LOG_FIELDS})
            sample.update({
                "main": main.to(torch.int16), "amount": amount.to(torch.int8), "flagged": flagged,
                "move": move[idx].to(torch.int16),
                "move_kind": MOVE_KIND_OF.to(device)[move[idx, 0]].to(torch.int8),
                "decision_kind": decision_kind(ob).to(torch.int8),
                "turn_start": (move[idx, 0] == K_PLACE) & ~lb.placed_on.any(1) & (lb.attacks == 0),
                "game": idx.to(torch.int32), "decision": torch.full_like(idx, d, dtype=torch.int32),
            })
            for k, v in sample.items():
                out.setdefault(k, []).append(v.cpu())
        log.update(before, s, move, live)
        d += 1
        ending = live & ((d >= n_moves) | (s.phase == 3) | (s.turn > max_turns))
        if d % check_every == 0:
            verify(d - 1, torch.nonzero(live & ~ending)[:, 0])
        if bool(ending.any()):
            verify(d - 1, torch.nonzero(ending)[:, 0])

    phase, turn, winner = s.phase.cpu().tolist(), s.turn.cpu().tolist(), s.winner.cpu().tolist()
    for g, r in enumerate(records):
        if failed[g]:
            continue
        result = r["result"]
        ok = (winner[g] == result["winner"] and turn[g] == result["turns"]) if phase[g] == 3 else (
            result["capped"] and turn[g] > r["maxTurns"])
        if not ok:
            failed[g] = True
            reason[g] = "result"
            # The divergence came after the last verified state; keep what was verified.
    samples = {k: torch.cat(v) for k, v in out.items()}
    keep = samples["decision"] <= torch.tensor(verified, dtype=torch.int32)[samples["game"].to(torch.int64)]
    samples = {k: v[keep] for k, v in samples.items()}
    return samples, verified, reason


def extract(folder: str, out: str, teacher_label: str, device: str, batch: int, check_every: int) -> None:
    board = Board.load(device)
    tables = load_best(device)
    teacher = (lambda b: True) if teacher_label == "*" else (lambda b: b == teacher_label)
    os.makedirs(out, exist_ok=True)
    seatings = sorted(d for d in os.listdir(folder) if os.path.isdir(os.path.join(folder, d)))
    summary = {}
    for seating in seatings:
        target = os.path.join(out, f"{seating}.pt")
        if os.path.exists(target):
            print(f"{seating}: already extracted", flush=True)
            continue
        t0 = time.time()
        files = sorted(glob.glob(os.path.join(folder, seating, "*.jsonl*")))
        games = []
        for path in files:
            for r in read_records(path):
                games.append({"seed": r["seed"], "players": r["players"], "maxTurns": r["maxTurns"], "bots": r["bots"],
                              "initialHash": r["initialHash"], "moves": r["moves"], "stateHashes": r["stateHashes"],
                              "result": r["result"], "held_out": held_out(path)})
        games.sort(key=lambda r: len(r["moves"]))
        parts, cuts = [], []
        for at in range(0, len(games), batch):
            chunk = games[at:at + batch]
            samples, verified, reason = replay(chunk, teacher, board, tables, device, check_every)
            samples["game"] = samples["game"] + at
            parts.append(samples)
            for g, (v, why) in enumerate(zip(verified, reason)):
                if why is not None:
                    cuts.append({"seed": chunk[g]["seed"], "kept": v, "of": len(chunk[g]["moves"]), "why": why})
            print(f"{seating}: games {at + len(chunk)}/{len(games)}, samples {sum(len(p['game']) for p in parts)}, "
                  f"{time.time() - t0:.0f}s", flush=True)
        data = {k: torch.cat([p[k] for p in parts]) for k in parts[0]}
        data["games"] = {
            "seed": [r["seed"] for r in games],
            "held_out": torch.tensor([r["held_out"] for r in games]),
            "scores": torch.tensor([final_scores(r) for r in games], dtype=torch.float32),
            "players": torch.tensor([r["players"] for r in games], dtype=torch.int8),
            "moves": torch.tensor([len(r["moves"]) for r in games]),
        }
        data["cuts"] = cuts
        torch.save(data, target)
        flagged = {MOVE_KINDS[k]: [int((data["flagged"] & (data["move_kind"] == k)).sum()), int((data["move_kind"] == k).sum())]
                   for k in range(len(MOVE_KINDS))}
        summary[seating] = {"games": len(games), "moves": int(sum(len(r["moves"]) for r in games)),
                            "samples": int(len(data["game"])), "cut": len(cuts), "flagged": flagged,
                            "seconds": round(time.time() - t0)}
        print(json.dumps({seating: summary[seating]}), flush=True)
        for c in cuts[:20]:
            print(f"  cut {c['seed']}: kept {c['kept']} of {c['of']} decisions ({c['why']})", flush=True)
        del data, parts, games
    with open(os.path.join(out, "extract.json"), "a") as f:
        f.write(json.dumps({"time": time.time(), "summary": summary}) + "\n")


# --- the dataset -------------------------------------------------------------------------------


class Dataset:
    """Every seating's samples, on the host, games numbered across seatings."""

    def __init__(self, folder: str, seatings: list[str] | None = None):
        files = sorted(glob.glob(os.path.join(folder, "*.pt")))
        if seatings:
            files = [f for f in files if os.path.basename(f)[:-3] in seatings]
        assert files, f"no extracted seatings in {folder}"
        parts, games, offset = [], [], 0
        self.seatings = []
        for path in files:
            d = torch.load(path, weights_only=False)
            g = d.pop("games")
            d.pop("cuts")
            d["game"] = d["game"].to(torch.int64) + offset
            parts.append(d)
            games.append(g)
            self.seatings.append((os.path.basename(path)[:-3], offset, offset + len(g["seed"])))
            offset += len(g["seed"])
        self.x = {k: torch.cat([p[k] for p in parts]) for k in parts[0]}
        self.held_out = torch.cat([g["held_out"] for g in games])
        self.scores = torch.cat([g["scores"] for g in games])
        self.seeds = [seed for g in games for seed in g["seed"]]
        self.seat_of_game = torch.cat([torch.full((len(g["seed"]),), i) for i, g in enumerate(games)])
        self.n = len(self.x["game"])

    def train_games(self, fraction: float) -> torch.Tensor:
        """`[G]` bool: the training games of a run at `fraction`, the same nested subset every time
        (each seating's training games in a fixed shuffled order, the first `fraction` of them)."""
        chosen = torch.zeros_like(self.held_out)
        gen = torch.Generator().manual_seed(2026)
        for _, lo, hi in self.seatings:
            train = torch.nonzero(~self.held_out[lo:hi])[:, 0] + lo
            order = train[torch.randperm(len(train), generator=gen)]
            chosen[order[: math.ceil(fraction * len(order))]] = True
        return chosen

    def inputs(self, idx: torch.Tensor, board: Board, device: str):
        """The rebuilt states' options, observation and targets for samples `idx`."""
        game_scores = self.scores[self.x["game"][idx]].to(device)
        x = {k: v[idx].to(device, non_blocking=True) for k, v in self.x.items()}
        n = idx.shape[0]
        fields = {name: x[name] for name in KEPT}
        fields["armies"] = fields["armies"].to(torch.int32)
        fields["rng"] = torch.zeros(n, dtype=torch.int64, device=device)
        fields["deck"] = torch.full((n, LAYOUT["deck"][0][0]), -1, dtype=torch.int8, device=device)
        s = State(**{name: fields[name] for name in LAYOUT})
        o = options(s, board)
        legal = legal_main(o)
        node, slot, glob_ = observe(s, o, x["placed_on"], x["attacks"], x["captured"], board)
        seat_of_slot, _ = slots(s)
        value = game_scores.gather(1, seat_of_slot.clamp(min=0))
        value_ok = seat_of_slot >= 0
        return {"s": s, "o": o, "legal": legal, "node": node, "slot": slot, "glob": glob_, "value": value,
                "value_ok": value_ok, "main": x["main"].to(torch.int64), "amount": x["amount"].to(torch.int64),
                "x": x}


def forward(net: Net, b: dict, bf16: bool):
    with torch.autocast("cuda", dtype=torch.bfloat16, enabled=bf16):
        t = net.trunk(b["node"], b["slot"], b["glob"])
        logits, value, _ = net.heads_main(t)
        amount_logits = net.amount_logits(t, b["main"])
    return masked(logits, b["legal"]), amount_logits.float(), value.float(), t


def losses(net: Net, b: dict, bf16: bool) -> dict:
    z, za, value, _ = forward(net, b, bf16)
    main_ce = F.cross_entropy(z, b["main"])
    group_legal = legal_amount(amount_group(b["main"]))
    has = group_legal[:, 1]
    za = masked(za, group_legal)
    amount_ce = F.cross_entropy(za[has], b["amount"][has]) if bool(has.any()) else z.sum() * 0
    v = (((value - b["value"]) ** 2) * b["value_ok"]).sum() / b["value_ok"].sum()
    with torch.no_grad():
        agree = (z.argmax(1) == b["main"]).float().mean()
    return {"main": main_ce, "amount": amount_ce, "value": v, "agree": agree}


@torch.no_grad()
def predict(net: Net, b: dict, bf16: bool, board: Board):
    """The net's most likely main choice and amount, and the move they decode to."""
    with torch.autocast("cuda", dtype=torch.bfloat16, enabled=bf16):
        t = net.trunk(b["node"], b["slot"], b["glob"])
        logits, value, _ = net.heads_main(t)
        main = masked(logits.float(), b["legal"]).argmax(1)
        za = net.amount_logits(t, main).float()
    amount = masked(za, legal_amount(amount_group(main))).argmax(1)
    move = decode(main, amount, b["s"], b["o"], board)
    return main, amount, move, value.float()


@torch.no_grad()
def agreement(net: Net, data: Dataset, idx: torch.Tensor, board: Board, device: str, bf16: bool, chunk: int = 8192):
    """Per sample in `idx`: whether the net's main choice and its whole move agree with the
    teacher's, and the value's squared error on the present slots (summed, with the count)."""
    net.eval()
    main_ok, move_ok, verr, vcount = [], [], 0.0, 0
    for at in range(0, len(idx), chunk):
        part = idx[at:at + chunk]
        b = data.inputs(part, board, device)
        main, _, move, value = predict(net, b, bf16, board)
        teacher_move = b["x"]["move"].to(torch.int64)
        main_ok.append((main == b["main"]).cpu())
        move_ok.append((normalize(move, b["s"], b["o"]) == normalize(teacher_move, b["s"], b["o"])).all(1).cpu())
        verr += float((((value - b["value"]) ** 2) * b["value_ok"]).sum())
        vcount += int(b["value_ok"].sum())
    net.train()
    return torch.cat(main_ok), torch.cat(move_ok), verr / max(vcount, 1)


# --- training ----------------------------------------------------------------------------------


def require_cuda(device: str) -> None:
    if device.startswith("cuda"):
        assert torch.cuda.is_available(), "no CUDA device: is the eGPU connected?"
        # Past this the allocator raises rather than letting the Windows driver spill into system
        # memory, which runs on but tens of times slower.
        torch.cuda.set_per_process_memory_fraction(0.92)
        print(f"device {torch.cuda.get_device_name(0)}", flush=True)


def train(args) -> None:
    device = args.device
    require_cuda(device)
    torch.manual_seed(args.seed)
    out_dir = os.path.join(RUNS, args.name)
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "args.json"), "w") as f:
        json.dump(vars(args), f, indent=1)
    board = Board.load(device)
    data = Dataset(args.data)
    chosen = data.train_games(args.fraction)
    sample_game = data.x["game"]
    train_idx = torch.nonzero(chosen[sample_game])[:, 0]
    held_idx = torch.nonzero(data.held_out[sample_game])[:, 0]
    gen = torch.Generator().manual_seed(7)
    monitor = held_idx[torch.randperm(len(held_idx), generator=gen)[: args.monitor]].sort().values
    print(f"{args.name}: {int(chosen.sum())} training games, {len(train_idx)} samples; "
          f"{int(data.held_out.sum())} held-out games, {len(held_idx)} samples (monitor {len(monitor)})", flush=True)

    net = Net(args.width, args.layers, args.heads, edges=board.edges, adjacency=board.adjacency).to(device)
    opt = torch.optim.AdamW(net.parameters(), lr=args.lr, weight_decay=args.wd, eps=1e-6)
    steps_per_epoch = len(train_idx) // args.minibatch
    total_steps = args.epochs * steps_per_epoch
    if args.max_samples:
        total_steps = min(total_steps, math.ceil(args.max_samples / args.minibatch))
    # A small training set is read more often than once in two epochs, so its plateau is caught.
    read_every = max(25, min(args.read_every, steps_per_epoch // 2))
    lr = args.lr

    def lr_at(step_: int) -> float:
        return lr * min(1.0, (step_ + 1) / args.warmup)

    log_path = os.path.join(out_dir, "log.jsonl")
    best, best_step, reads_since, stalled = -1.0, 0, 0, 0
    step_, samples, t0 = 0, 0, time.time()
    sums: dict[str, float] = {}
    count = 0
    done = False
    while not done:
        perm = train_idx[torch.randperm(len(train_idx))]
        for at in range(0, len(perm) - args.minibatch + 1, args.minibatch):
            for group in opt.param_groups:
                group["lr"] = lr_at(step_)
            b = data.inputs(perm[at:at + args.minibatch], board, device)
            parts = losses(net, b, args.bf16)
            loss = parts["main"] + args.amount_weight * parts["amount"] + args.vf * parts["value"]
            opt.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(net.parameters(), args.grad_clip)
            opt.step()
            for k, v in parts.items():
                sums[k] = sums.get(k, 0.0) + float(v)
            count += 1
            step_ += 1
            samples += args.minibatch
            if step_ % read_every == 0 or step_ >= total_steps:
                main_ok, move_ok, verr = agreement(net, data, monitor, board, device, args.bf16)
                held = float(main_ok.float().mean())
                record = {"step": step_, "samples": samples, "epoch": round(samples / len(train_idx), 3),
                          "lr": lr_at(step_), **{f"train_{k}": round(v / count, 5) for k, v in sums.items()},
                          "held_main": round(held, 5), "held_move": round(float(move_ok.float().mean()), 5),
                          "held_value_mse": round(verr, 5), "seconds": round(time.time() - t0, 1),
                          "samples_per_s": round(samples / (time.time() - t0))}
                sums, count = {}, 0
                if held > best:
                    best, best_step, reads_since = held, step_, 0
                    torch.save({"net": net.state_dict(), "config": net.config(), "step": step_, "held_main": held},
                               os.path.join(out_dir, "best.pt"))
                else:
                    reads_since += 1
                    stalled += 1
                    if stalled >= args.lr_patience:
                        # The plateau at this rate: a lower one, from the best weights so far.
                        lr *= args.lr_drop
                        stalled = 0
                        net.load_state_dict(torch.load(os.path.join(out_dir, "best.pt"), weights_only=False)["net"])
                record["best"] = round(best, 5)
                with open(log_path, "a") as f:
                    f.write(json.dumps(record) + "\n")
                print(json.dumps(record), flush=True)
                if reads_since >= args.patience:
                    print(f"plateau: no gain in {args.patience} reads since step {best_step}", flush=True)
                    done = True
            if step_ >= total_steps or done:
                done = True
                break
    torch.save({"net": net.state_dict(), "config": net.config(), "step": step_}, os.path.join(out_dir, "last.pt"))
    print(f"{args.name}: best held-out main agreement {best:.4f} at step {best_step}", flush=True)


# --- the read ----------------------------------------------------------------------------------


def bootstrap(per_game_hit: np.ndarray, per_game_n: np.ndarray, reps: int = 1000, seed: int = 1):
    """The share and its 95% interval, by bootstrap over games."""
    total = per_game_n.sum()
    if total == 0:
        return None
    rng = np.random.default_rng(seed)
    g = len(per_game_n)
    w = rng.multinomial(g, np.full(g, 1 / g), size=reps)
    shares = (w @ per_game_hit) / np.maximum(w @ per_game_n, 1)
    lo, hi = np.percentile(shares, [2.5, 97.5])
    return {"share": round(float(per_game_hit.sum() / total), 4), "lo": round(float(lo), 4), "hi": round(float(hi), 4),
            "n": int(total)}


def read(args) -> dict:
    device = args.device
    require_cuda(device)
    board = Board.load(device)
    data = Dataset(args.data, args.seatings.split(",") if args.seatings else None)
    from .ladder import load_net
    net = load_net(args.ckpt, board, device)
    games = data.x["game"]
    idx = torch.nonzero(data.held_out[games])[:, 0]
    if args.games_file:
        with open(args.games_file) as f:
            seeds = {line.strip() for line in f if line.strip()}
        wanted = torch.tensor([seed in seeds for seed in data.seeds])
        idx = torch.nonzero(wanted[games])[:, 0]
    main_ok, move_ok, verr = agreement(net, data, idx, board, device, args.bf16)
    g = games[idx].numpy()
    uniq, inverse = np.unique(g, return_inverse=True)

    def read_of(hit: torch.Tensor, mask: torch.Tensor) -> dict | None:
        m = mask.numpy()
        hits = np.bincount(inverse[m], weights=hit.numpy()[m].astype(np.float64), minlength=len(uniq))
        ns = np.bincount(inverse[m], minlength=len(uniq)).astype(np.float64)
        return bootstrap(hits, ns)

    x = {k: data.x[k][idx] for k in ("move_kind", "decision_kind", "turn_start", "flagged")}
    seating_of = data.seat_of_game[games[idx]]
    all_ = torch.ones(len(idx), dtype=torch.bool)
    report = {"ckpt": args.ckpt, "held_out_games": len(uniq), "value_mse": round(verr, 5),
              "main": {"all": read_of(main_ok, all_)}, "move": {"all": read_of(move_ok, all_)},
              "flagged": {"all": read_of(x["flagged"], all_)}}
    for k, name in enumerate(MOVE_KINDS):
        m = x["move_kind"] == k
        report["main"][name] = read_of(main_ok, m)
        report["move"][name] = read_of(move_ok, m)
        report["flagged"][name] = read_of(x["flagged"], m)
    ts = x["turn_start"]
    report["main"]["turn-start place"] = read_of(main_ok, ts)
    report["move"]["turn-start place"] = read_of(move_ok, ts)
    report["main"]["other place"] = read_of(main_ok, (x["move_kind"] == 0) & ~ts)
    report["move"]["other place"] = read_of(move_ok, (x["move_kind"] == 0) & ~ts)
    report["main"]["all but turn-start"] = read_of(main_ok, ~ts)
    report["by_decision"] = {name: read_of(move_ok, x["decision_kind"] == k) for k, name in enumerate(DECISION_KINDS)}
    report["by_seating"] = {name: read_of(main_ok, seating_of == i) for i, (name, _, _) in enumerate(data.seatings)}
    return report


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = p.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("extract")
    e.add_argument("records", help="a folder of seatings, each a folder of recorders' files")
    e.add_argument("--out", required=True)
    e.add_argument("--teacher", default="native-v2", help="the seats' recorded label to learn from ('*': every seat)")
    e.add_argument("--device", default="cuda")
    e.add_argument("--batch", type=int, default=2048)
    e.add_argument("--check", type=int, default=32, help="compare the state's hash every this many decisions")
    t = sub.add_parser("train")
    t.add_argument("--data", required=True)
    t.add_argument("--name", required=True)
    t.add_argument("--fraction", type=float, default=1.0)
    t.add_argument("--device", default="cuda")
    t.add_argument("--width", type=int, default=128)
    t.add_argument("--layers", type=int, default=4)
    t.add_argument("--heads", type=int, default=8)
    t.add_argument("--lr", type=float, default=5e-4)
    t.add_argument("--lr-patience", type=int, default=2, help="reads without a gain before the rate drops")
    t.add_argument("--lr-drop", type=float, default=0.3)
    t.add_argument("--wd", type=float, default=0.01)
    t.add_argument("--warmup", type=int, default=500)
    t.add_argument("--minibatch", type=int, default=4096)
    t.add_argument("--epochs", type=int, default=60)
    t.add_argument("--max-samples", type=int, default=100_000_000, help="stop after this many samples (0: --epochs decides)")
    t.add_argument("--amount-weight", type=float, default=0.5)
    t.add_argument("--vf", type=float, default=0.25)
    t.add_argument("--grad-clip", type=float, default=1.0)
    t.add_argument("--read-every", type=int, default=500)
    t.add_argument("--monitor", type=int, default=131072, help="held-out samples read at each checkpoint")
    t.add_argument("--patience", type=int, default=6, help="reads without a gain before training stops")
    t.add_argument("--seed", type=int, default=1)
    t.add_argument("--no-bf16", dest="bf16", action="store_false")
    r = sub.add_parser("read")
    r.add_argument("--data", required=True)
    r.add_argument("--ckpt", required=True)
    r.add_argument("--seatings", default="", help="only these seatings, comma-separated")
    r.add_argument("--games-file", default="", help="only the games whose seeds this file lists, one per line")
    r.add_argument("--device", default="cuda")
    r.add_argument("--out", default="", help="write the report as JSON here too")
    r.add_argument("--no-bf16", dest="bf16", action="store_false")
    args = p.parse_args(argv)
    if args.cmd == "extract":
        require_cuda(args.device)
        extract(args.records, args.out, args.teacher, args.device, args.batch, args.check)
    elif args.cmd == "train":
        train(args)
    else:
        report = read(args)
        text = json.dumps(report, indent=1)
        print(text)
        if args.out:
            with open(args.out, "w") as f:
                f.write(text + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())

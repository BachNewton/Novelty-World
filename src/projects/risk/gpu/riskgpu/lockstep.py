"""Lockstep (`ideas/gpu-engine.md`, "Correctness"): reference games' records replayed on the batched
engine, all of them as one batch, comparing at every decision the options' hash before the move
and the state's hash after it, then each game's result.

    python -m riskgpu.lockstep fixtures/*.jsonl.gz [--device cpu|cuda] [--tables data/blitz-256] [--invariants]

run from `src/projects/risk/gpu/`. A game is done when its record is spent, it is over, or it is
past its turn cap before a decision, as the harness reads it. A game stops at its first
mismatch; one whose blitz went past the tables (`oversize`) is reported apart, exact or not, and
only a mismatch in an unflagged game fails the run.
"""

import argparse
import os
import sys
from dataclasses import dataclass

import numpy as np
import torch

from .board import Board
from .canonical import hash_bytes, options_ints, state_ints
from .data import load_best
from .engine import IllegalMove, step
from .invariants import InvariantError, check_state, check_step
from .options import options
from .records import read_records
from .state import new_games
from .tables import BlitzTables


@dataclass
class GameReport:
    file: str
    seed: str
    moves: int
    mismatch: str | None = None
    decision: int | None = None
    oversize: bool = False

    @property
    def exact(self) -> bool:
        return self.mismatch is None


def _first_difference(ours: np.ndarray, theirs: list[int]) -> str:
    theirs_a = np.asarray(theirs, dtype=np.int64)
    n = min(len(ours), len(theirs_a))
    diff = np.nonzero(ours[:n].astype(np.int64) != theirs_a[:n])[0]
    if len(diff):
        k = int(diff[0])
        return f"int32 field {k}: ours {int(ours[k])}, the record's {int(theirs_a[k])}"
    return f"lengths differ: ours {len(ours)}, the record's {len(theirs_a)}"


def run(
    games: list[tuple[str, dict]], device: torch.device | str, tables: BlitzTables, *, invariants: bool = False
) -> list[GameReport]:
    """Plays every `(file, record)` as one batch; a report per game, in order."""
    board = Board.load(device)
    records = [r for _, r in games]
    reports = [GameReport(file=f, seed=r["seed"], moves=len(r["moves"])) for f, r in games]
    batch = len(records)
    s = new_games([r["seed"] for r in records], [r["players"] for r in records], board, device)
    n_moves = torch.tensor([len(r["moves"]) for r in records], device=device)
    max_turns = torch.tensor([r["maxTurns"] for r in records], device=device)
    failed = torch.zeros(batch, dtype=torch.bool, device=device)
    oversize = torch.zeros(batch, dtype=torch.bool, device=device)
    places = [[1] * r["players"] for r in records]
    in_game = [r["players"] for r in records]

    def mismatch(g: int, decision: int | None, message: str) -> None:
        reports[g].mismatch = message
        reports[g].decision = decision
        failed[g] = True

    def compare_state(g: int, decision: int | None, ints: np.ndarray, expected: str, dump: list[int] | None) -> None:
        got = hash_bytes(ints.astype("<i4").tobytes())
        if got != expected:
            detail = f"; {_first_difference(ints, dump)}" if dump is not None else ""
            mismatch(g, decision, f"state hash {got}, the record has {expected}{detail}")

    initial = state_ints(s).cpu().numpy()
    for g, r in enumerate(records):
        compare_state(g, None, initial[g], r["initialHash"], r.get("initialState"))

    def run_invariants(check, *args) -> None:
        while True:
            try:
                check(*args)
                return
            except InvariantError as e:
                mismatch(e.game, decision, f"invariant {e}")
                args = (*args[:-1], args[-1] & ~failed)

    decision = 0
    while True:
        over = (s.phase == 3) | (s.turn > max_turns)
        spent = decision >= n_moves
        for g in torch.nonzero(over & ~spent & ~failed)[:, 0].tolist():
            mismatch(g, decision, "the game is over, and the record has more moves")
        deciding = ~over & ~spent & ~failed
        if not bool(deciding.any()):
            break
        legal = options(s, board)
        option_rows = options_ints(legal)
        active = s.active.cpu().tolist()
        moves = torch.zeros(batch, 5, dtype=torch.int64)
        for g in torch.nonzero(deciding)[:, 0].tolist():
            r = records[g]
            seat, *move = r["moves"][decision]
            if seat != active[g]:
                mismatch(g, decision, f"seat {active[g]} is to move, the record has seat {seat}")
                continue
            expected = r.get("optionsHashes")
            if expected is not None:
                got = hash_bytes(option_rows[g].tobytes())
                if got != expected[decision]:
                    dump = r.get("options")
                    detail = f"; {_first_difference(option_rows[g], dump[decision])}" if dump is not None else ""
                    mismatch(g, decision, f"options hash {got}, the record has {expected[decision]}{detail}")
                    continue
            moves[g] = torch.tensor(move)
        deciding &= ~failed

        before = s.clone() if invariants else None
        eliminated_before = s.eliminated.clone()
        while True:
            try:
                info = step(s, moves, board, tables, done=~deciding, legal=legal)
                break
            except IllegalMove as e:
                # `step` validates every move before touching any game, so it can be retried.
                mismatch(e.game, decision, f"illegal move {e.move}: {e.reason}")
                deciding &= ~failed
        oversize |= info.oversize & deciding

        if invariants:
            run_invariants(check_step, before, s, info, deciding.clone())
            run_invariants(check_state, s, ~failed)
        newly_out = (s.eliminated & ~eliminated_before & deciding[:, None]).cpu()
        for g, seat in torch.nonzero(newly_out).tolist():
            places[g][seat] = in_game[g]
            in_game[g] -= 1
        after = state_ints(s).cpu().numpy()
        for g in torch.nonzero(deciding & ~failed)[:, 0].tolist():
            r = records[g]
            if r.get("stateHashes") is not None:
                dumps = r.get("states")
                compare_state(g, decision, after[g], r["stateHashes"][decision], dumps[decision] if dumps else None)
        decision += 1

    phase, turn, winner = s.phase.cpu().tolist(), s.turn.cpu().tolist(), s.winner.cpu().tolist()
    for g, r in enumerate(records):
        reports[g].oversize = bool(oversize[g])
        if failed[g]:
            continue
        if phase[g] == 3:
            result = {"winner": winner[g], "turns": turn[g], "capped": False, "places": places[g]}
        elif turn[g] > r["maxTurns"]:
            result = {"winner": -1, "turns": r["maxTurns"], "capped": True, "places": places[g]}
        else:
            mismatch(g, len(r["moves"]), f"the record ends and the game goes on (turn {turn[g]})")
            continue
        if result != r["result"]:
            mismatch(g, len(r["moves"]), f"the result is {result}, the record has {r['result']}")
    return reports


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("files", nargs="+")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--tables", default=None, help="a blitz table's path prefix (default: the largest present)")
    parser.add_argument("--invariants", action="store_true")
    args = parser.parse_args(argv)
    if args.device == "cpu":
        # The batch's tensors are tiny: a thread pool's overhead outweighs its work, many times
        # over on a loaded machine.
        torch.set_num_threads(1)

    tables = BlitzTables.load(args.tables, args.device) if args.tables else load_best(args.device)
    games = [(path, record) for path in args.files for record in read_records(path)]
    reports = run(games, args.device, tables, invariants=args.invariants)

    print(f"blitz table bound {tables.bound}, device {args.device}, {len(games)} games")
    failing = 0
    for path in args.files + [None]:
        mine = [r for r in reports if path is None or r.file == path]
        name = "total" if path is None else os.path.basename(path)
        flagged = [r for r in mine if r.oversize]
        print(
            f"{name:28} games {len(mine):5}  moves {sum(r.moves for r in mine):7}  "
            f"exact {sum(r.exact for r in mine):5}  oversize {len(flagged)} ({sum(r.exact for r in flagged)} exact)"
        )
    for r in reports:
        if r.exact:
            continue
        label = "oversize, " if r.oversize else ""
        print(f"  MISMATCH ({label}{os.path.basename(r.file)}) seed {r.seed!r} decision {r.decision}: {r.mismatch}")
        failing += not r.oversize
    return 1 if failing else 0


if __name__ == "__main__":
    sys.exit(main())

"""Lockstep on the JAX engine: reference games' records replayed as one batch, comparing at every
decision the options' hash before the move and the state's hash after it, then each game's result,
as `riskgpu/lockstep.py` holds the PyTorch engine.

    python -m riskgpu.jaxengine.lockstep fixtures/*.jsonl.gz [--tables data/blitz-256]

run from `src/projects/risk/gpu/`. Every recorded move must also be legal by `legal_move`. A game
whose blitz left the table (`oversize`) is resolved approximately, so it is reported apart and only
a mismatch in an unflagged game fails the run.
"""

import argparse
import os
import sys
from types import SimpleNamespace

import jax
import jax.numpy as jnp
import numpy as np
import torch

from ..board import Board
from ..canonical import hash_bytes, options_ints, state_ints
from ..data import best_tables_prefix
from ..lockstep import GameReport
from ..records import read_records
from . import blitz
from .engine import Options, Rules
from .state import new_games, seed_states, to_torch


def options_to_torch(o: Options) -> SimpleNamespace:
    return SimpleNamespace(**{name: torch.from_numpy(np.array(getattr(o, name))) for name in Options._fields})


def run(games: list[tuple[str, dict]], tables: blitz.Tables, board: Board | None = None) -> list[GameReport]:
    board = board or Board.load("cpu")
    rules = Rules(board)
    records = [r for _, r in games]
    reports = [GameReport(file=f, seed=r["seed"], moves=len(r["moves"])) for f, r in games]
    batch = len(records)
    s = jax.jit(new_games)(rules.setup, seed_states([r["seed"] for r in records]),
                           jnp.asarray([r["players"] for r in records], jnp.int32))
    options = jax.jit(rules.options)
    legal_move = jax.jit(rules.legal_move)
    step = jax.jit(rules.step)
    n_moves = np.array([len(r["moves"]) for r in records])
    max_turns = np.array([r["maxTurns"] for r in records])
    failed = np.zeros(batch, bool)
    oversize = np.zeros(batch, bool)
    places = [[1] * r["players"] for r in records]
    in_game = [r["players"] for r in records]

    def mismatch(g: int, decision: int | None, message: str) -> None:
        reports[g].mismatch, reports[g].decision = message, decision
        failed[g] = True

    def compare_states(decision: int | None, deciding: np.ndarray) -> None:
        rows = state_ints(to_torch(s)).numpy()
        for g in np.nonzero(deciding & ~failed)[0]:
            r = records[g]
            expected = r["initialHash"] if decision is None else r["stateHashes"][decision]
            got = hash_bytes(rows[g].astype("<i4").tobytes())
            if got != expected:
                mismatch(int(g), decision, f"state hash {got}, the record has {expected}")

    compare_states(None, np.ones(batch, bool))
    decision = 0
    while True:
        phase, turn, active = (np.asarray(x) for x in (s.phase, s.turn, s.active))
        over = (phase == 3) | (turn > max_turns)
        spent = decision >= n_moves
        for g in np.nonzero(over & ~spent & ~failed)[0]:
            mismatch(int(g), decision, "the game is over, and the record has more moves")
        deciding = ~over & ~spent & ~failed
        if not deciding.any():
            break
        o = options(s)
        option_rows = options_ints(options_to_torch(o))
        moves = np.zeros((batch, 5), np.int32)
        for g in np.nonzero(deciding)[0]:
            seat, *move = records[g]["moves"][decision]
            if seat != active[g]:
                mismatch(int(g), decision, f"seat {active[g]} is to move, the record has seat {seat}")
                continue
            got = hash_bytes(option_rows[g].tobytes())
            if got != records[g]["optionsHashes"][decision]:
                mismatch(int(g), decision, f"options hash {got}, the record has {records[g]['optionsHashes'][decision]}")
                continue
            moves[g] = move
        deciding &= ~failed
        ok = np.asarray(legal_move(s, o, jnp.asarray(moves)))
        for g in np.nonzero(deciding & ~ok)[0]:
            mismatch(int(g), decision, f"legal_move refuses the recorded move {moves[g].tolist()}")
        deciding &= ~failed

        eliminated_before = np.asarray(s.eliminated)
        s, flagged = step(tables, s, jnp.asarray(moves), jnp.asarray(~deciding))
        oversize |= np.asarray(flagged) & deciding
        newly_out = np.asarray(s.eliminated) & ~eliminated_before & deciding[:, None]
        for g, seat in zip(*np.nonzero(newly_out)):
            places[g][seat] = in_game[g]
            in_game[g] -= 1
        compare_states(decision, deciding)
        decision += 1

    phase, turn, winner = (np.asarray(x).tolist() for x in (s.phase, s.turn, s.winner))
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


def load_tables(prefix: str | None = None) -> blitz.Tables:
    return blitz.Tables.of(blitz.cached_thresholds(prefix or best_tables_prefix()))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("files", nargs="+")
    parser.add_argument("--tables", default=None, help="a blitz table's path prefix (default: the largest present)")
    args = parser.parse_args(argv)
    tables = load_tables(args.tables)
    games = [(path, record) for path in args.files for record in read_records(path)]
    reports = run(games, tables)
    print(f"blitz table bound {tables.bound}, {len(games)} games")
    failing = 0
    for path in args.files + [None]:
        mine = [r for r in reports if path is None or r.file == path]
        flagged = [r for r in mine if r.oversize]
        name = "total" if path is None else os.path.basename(path)
        print(f"{name:28} games {len(mine):5}  moves {sum(r.moves for r in mine):7}  exact {sum(r.exact for r in mine):5}  "
              f"oversize {len(flagged)} ({sum(r.exact for r in flagged)} exact)")
    for r in reports:
        if not r.exact:
            print(f"  MISMATCH ({'oversize, ' if r.oversize else ''}{os.path.basename(r.file)}) seed {r.seed!r} "
                  f"decision {r.decision}: {r.mismatch}")
            failing += not r.oversize
    return 1 if failing else 0


if __name__ == "__main__":
    sys.exit(main())

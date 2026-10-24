"""The bot seam and the game runner (`ideas/gpu-engine.md`, "The bots on the GPU"), the batched
counterpart of the harness's `eval/runner.ts`: a batch of seeded games, a bot label per seat,
each played to its end or its turn cap.

A bot is a function of one `Decision` (the batch's state and options, what the turn so far did,
and each game's own random seed) and a mask of the games where its seat is to move; it returns a
move per game, and only the masked rows are read. A bot reads the whole state, the hidden parts
included: the bots ported here read only what their seat may see, and nothing measured on the GPU
ever decides a seating.

The bots' random stream is the harness's: `bots|<seed>` hashed, in base 36, then
`<botSeed>/<decision>`, the decision counted per game across every seat.
"""

from collections.abc import Callable
from dataclasses import dataclass, field
from functools import cached_property

import platform
import sys
from datetime import datetime, timezone

import torch

from .board import MAX_SEATS, TERRITORIES, Board
from .canonical import hash_bytes, options_ints, state_ints
from .engine import ATTACK, BLITZ, PLACE, TRADE, step
from .options import Options, options
from .records import write_records
from .rng import bot_seed, decision_seed
from .state import State, new_games
from .tables import BlitzTables


@dataclass
class TurnLog:
    """What the turn under way has done, per game, as `bots/history.ts`'s `turnSoFar` reads it from
    the history, and the one thing a bot remembers across turns (GD's Stacker turning
    Aggressive)."""

    attacks: torch.Tensor  # [B] int32: battles and blitzes this turn
    captured: torch.Tensor  # [B] int32: territories captured this turn
    placed_on: torch.Tensor  # [B, 42] bool: placed on by `place` this turn, in any reinforce phase
    traded: torch.Tensor  # [B] int32: sets traded this turn
    # [B, 6] bool, sticky: the seat ended one of its turns holding more armies than every other seat
    # together (`StackerAIPersona.EndTurn`, read by GD's `personaNow`).
    stacker_swapped: torch.Tensor

    @staticmethod
    def empty(batch: int, device: torch.device | str) -> "TurnLog":
        def zeros(*shape, dtype=torch.int32):
            return torch.zeros(batch, *shape, dtype=dtype, device=device)

        return TurnLog(zeros(), zeros(), zeros(TERRITORIES, dtype=torch.bool), zeros(),
                       zeros(MAX_SEATS, dtype=torch.bool))

    def update(self, before: State, after: State, moves: torch.Tensor, moved: torch.Tensor) -> None:
        """Adds the step from `before` to `after` (the `moves [B, 5]` of the games in `moved`), then
        starts a new turn wherever the step ended one."""
        rows = torch.arange(after.batch, device=after.device)
        kind = moves[:, 0]
        mover = before.active.to(torch.int64)
        fought = moved & ((kind == ATTACK) | (kind == BLITZ))
        target = torch.where(fought, moves[:, 2], 0).to(torch.int64)
        took = fought & (after.owner[rows, target].to(torch.int64) == mover)
        self.attacks += fought.to(torch.int32)
        self.captured += took.to(torch.int32)
        placing = moved & (kind == PLACE)
        self.placed_on[rows, torch.where(placing, moves[:, 1], 0).to(torch.int64)] |= placing
        self.traded += (moved & (kind == TRADE)).to(torch.int32)

        # A turn's end is the moment the next one begins: the board after the step.
        ended = moved & (after.turn != before.turn)
        mine = (after.owner.to(torch.int64) == mover[:, None])
        armies = after.armies.to(torch.int64)
        held = (armies * mine).sum(1)
        stacked = ended & (held > armies.sum(1) - held)
        self.stacker_swapped[rows, mover] |= stacked
        self.attacks = torch.where(ended, 0, self.attacks)
        self.captured = torch.where(ended, 0, self.captured)
        self.placed_on &= ~ended[:, None]
        self.traded = torch.where(ended, 0, self.traded)


@dataclass
class Decision:
    """What every bot is handed at one step of the batch."""

    state: State
    options: Options
    board: Board
    tables: BlitzTables
    log: TurnLog
    decision: torch.Tensor  # [B] int64: the game's decisions so far
    humans: torch.Tensor  # [B, 6] bool: all false, every seat is a bot
    bot_seeds: list[str] = field(repr=False)  # per game, `bot_seed(seed)`

    @cached_property
    def seed(self) -> torch.Tensor:
        """[B] int64: each game's stream for this decision, `decision_seed(botSeed, decision)`.
        Hashed on the host and only when a bot asks."""
        n = self.decision.cpu().tolist()
        return torch.tensor([decision_seed(b, d) for b, d in zip(self.bot_seeds, n)],
                            dtype=torch.int64, device=self.decision.device)


Bot = Callable[[Decision, torch.Tensor], torch.Tensor]


@dataclass
class GameResult:
    seed: str
    bots: list[str]
    winner: int  # −1 when the turn cap ended the game
    turns: int
    capped: bool
    places: list[int]
    decisions: int
    oversize: bool


def provenance(device: torch.device | str) -> dict[str, str]:
    """Where a GPU record's floats came from: the odds are the exported tables' (their meta says
    which Node computed them) and, past the tables, this process's slow path."""
    tables_meta = "see data/blitz-<bound>.json"
    return {
        "engine": "riskgpu", "torch": torch.__version__, "device": str(torch.device(device)),
        "python": platform.python_version(), "platform": sys.platform, "tables": tables_meta,
        "exportedAt": datetime.now(timezone.utc).isoformat(),
    }


def play_games(
    seeds: list[str], seatings: list[list[str]], *, bots: dict[str, Bot] | None = None, board: Board,
    tables: BlitzTables, max_turns: int, device: torch.device | str, check: bool = True, record: bool = False,
) -> tuple[list[GameResult], list[dict] | None]:
    """Plays every game as one batch to its end: game i from `seeds[i]`, a bot label per seat in
    `seatings[i]`. With `record`, also each game's record in the doc's format, every hash worked
    out on the host. `check` validates every move against the options (an illegal move raises)."""
    if bots is None:
        # Imported here: the bots import the seam above, and the registry imports the bots.
        from .bots import GPU_BOTS
        bots = GPU_BOTS
    assert len(seeds) == len(seatings) and seeds, (len(seeds), len(seatings))
    labels = sorted({label for seating in seatings for label in seating})
    unknown = [label for label in labels if label not in bots]
    assert not unknown, f"no GPU bot for {unknown}; the GPU has {sorted(bots)}"

    batch = len(seeds)
    s = new_games(seeds, [len(seating) for seating in seatings], board, device)
    rows = torch.arange(batch, device=device)
    seat_label = torch.tensor(
        [[labels.index(label) for label in seating] + [-1] * (MAX_SEATS - len(seating)) for seating in seatings],
        dtype=torch.int64, device=device,
    )
    log = TurnLog.empty(batch, device)
    decisions = torch.zeros(batch, dtype=torch.int64, device=device)
    oversize = torch.zeros(batch, dtype=torch.bool, device=device)
    places = torch.ones(batch, MAX_SEATS, dtype=torch.int64, device=device)
    in_game = s.players.to(torch.int64)
    humans = torch.zeros(batch, MAX_SEATS, dtype=torch.bool, device=device)
    bot_seeds = [bot_seed(seed) for seed in seeds]

    initial = [hash_bytes(row.tobytes()) for row in state_ints(s).cpu().numpy().astype("<i4")] if record else []
    moves_log: list[list[list[int]]] = [[] for _ in seeds]
    state_hashes: list[list[str]] = [[] for _ in seeds]
    options_hashes: list[list[str]] = [[] for _ in seeds]

    while True:
        # The harness's end rule, read before each decision: game over, or past the turn cap.
        deciding = (s.phase != 3) & (s.turn <= max_turns)
        if not bool(deciding.any()):
            break
        legal = options(s, board)
        decision = Decision(s, legal, board, tables, log, decisions.clone(), humans, bot_seeds)
        label_now = seat_label[rows, s.active.to(torch.int64)]
        moves = torch.zeros(batch, 5, dtype=torch.int64, device=device)
        for k, label in enumerate(labels):
            mine = deciding & (label_now == k)
            chosen = bots[label](decision, mine)
            assert chosen.shape == (batch, 5), (label, chosen.shape)
            moves = torch.where(mine[:, None], chosen.to(torch.int64), moves)

        if record:
            option_rows = options_ints(legal)
            playing = deciding.nonzero()[:, 0].cpu().tolist()
            active = s.active.cpu().tolist()
            moves_host = moves.cpu().tolist()
            for g in playing:
                moves_log[g].append([active[g], *moves_host[g]])
                options_hashes[g].append(hash_bytes(option_rows[g].tobytes()))

        before = s.clone()
        info = step(s, moves, board, tables, done=~deciding, legal=legal, check=check)
        oversize |= info.oversize & deciding
        decisions += deciding.to(torch.int64)
        log.update(before, s, moves, deciding)

        newly_out = s.eliminated & ~before.eliminated
        out_count = newly_out.sum(1)
        assert not check or bool((out_count <= 1).all()), "two seats eliminated by one move"
        places = torch.where(newly_out, in_game[:, None], places)
        in_game -= out_count

        if record:
            after = state_ints(s).cpu().numpy().astype("<i4")
            for g in playing:
                state_hashes[g].append(hash_bytes(after[g].tobytes()))

    phase, turn, winner = s.phase.cpu().tolist(), s.turn.cpu().tolist(), s.winner.cpu().tolist()
    places_host, decisions_host, oversize_host = places.cpu().tolist(), decisions.cpu().tolist(), oversize.cpu().tolist()
    results = []
    for g, (seed, seating) in enumerate(zip(seeds, seatings)):
        over = phase[g] == 3
        results.append(GameResult(
            seed=seed, bots=list(seating), winner=winner[g] if over else -1, turns=turn[g] if over else max_turns,
            capped=not over, places=places_host[g][: len(seating)], decisions=decisions_host[g], oversize=oversize_host[g],
        ))
    if not record:
        return results, None
    records = [
        {
            "seed": r.seed, "players": len(r.bots), "maxTurns": max_turns, "bots": r.bots,
            "initialHash": initial[g], "moves": moves_log[g], "stateHashes": state_hashes[g],
            "optionsHashes": options_hashes[g],
            "result": {"winner": r.winner, "turns": r.turns, "capped": r.capped, "places": r.places},
            "oversize": r.oversize,
            "provenance": provenance(device),
        }
        for g, r in enumerate(results)
    ]
    return results, records


__all__ = ["Bot", "Decision", "GameResult", "TurnLog", "play_games", "write_records"]

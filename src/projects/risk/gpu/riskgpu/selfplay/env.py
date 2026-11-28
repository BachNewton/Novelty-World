"""The training environment: a batch of games that never stops, every step one decision per game,
captured as one CUDA graph (`ideas/gpu-engine.md`, phase 3).

Each step: the options and the acting seat's observation, the learner network's move (sampled),
each league snapshot's move, greedy's move, the seat's controller picks one, the engine applies it
(no checks: every move comes from the masks), and the bookkeeping: places at eliminations, a game
over at a win or at its own turn cap, its seats' scores, and the game replaced in place by a fresh
deal from a pool. Nothing in the step reads a value back to the host, so the whole of it replays as
one graph; the host only launches it and, between rollouts, refills the pool and trains.

**Scores** (`scores`). By default the winner scores +1 and the other places run from 0 (second) to
−1 (the first out); the `place` reward is linear in the place, and the `winner` reward pays +1 for
the win and −1 to every other seat, so only the goal is paid and nothing for outlasting. A capped game's seats still in it
score by `cap_score`: `loss`, −1 each, the same as finishing last, so no finish is worse than a cap;
or `survivors` (the rule before the choice existed), each as k-th of n (k survivors) less 0.5, never
below −1, which pays two survivors −0.5 each, above the bottom half of real finishes, so a seat that
expects to lose does better by never finishing. The seats out before the cap keep their place's score.

**A sooner win** (`time_discount`, g; 1 is off). The winner's +1 is g^(turn / 100), the game's
length in player-turns read off its last turn: g = 0.9 makes a win at turn 100 worth 0.9 and one at
600 worth 0.53. Only the win is discounted: a loss discounted too would pay a losing seat for
putting its loss off, the stall again. It sits in the terminal score, not in GAE's γ, so every
target (the GAE return, a held decision's, the other slots' final scores) reads the same number,
and since the turn is among the inputs (`obs.py`), the value of a position stays a function of what
the net sees. γ per decision would also tax a turn by its decisions, so attacking more than ending.
The win rate in the statistics stays the undiscounted count; the mean score is the discounted one,
with the undiscounted beside it (`score_undiscounted`).

**The turn cap is drawn per game** (`cap_low` to `cap_high` player-turns), so a policy can't count
on outlasting a clock it knows, unless its net reads the clock (`Net.clock`): then each of its
decisions sees the turns left before its own game's cap. Each net observes the graph inputs
exactly when it reads them (`Net.graph`).

**Service under saturation** (`serve`). Each controller runs on at most its capacity of rows a step;
a row due past it waits the step (`waited` counts the steps in a row it has waited, by controller in
the stats' `unserved` row). `lowest` serves the lowest rows first, and the rows are laid out by table
size, so a saturated controller freezes the same games (the 6-player, then the 5-player) step after
step. `oldest` serves the rows that have waited longest, ties to the lowest row: a row waits at most
⌈due / capacity⌉ − 1 steps, and a step with room for every due row is the same step as `lowest`'s.

**The league.** Each seat of a new game is a controller kind: 0 the learner, 1 greedy, 2 to 5 GD's
personas (their graphable port: exact inside the blitz table, approximate past it, with their
jitter from a device stream rather than the harness's), 6 + k the k-th snapshot network. At least one seat is the learner, at a random seat; the others are drawn
from `kind_probs`, which the trainer may change between rollouts.
"""

import math
from dataclasses import dataclass, fields
from types import SimpleNamespace

import torch

from ..board import MAX_SEATS, Board
from ..bots.greedy import greedy_bot
from ..engine import step
from ..options import Options, on_device, options
from ..runner import Decision, TurnLog
from ..state import LAYOUT, State, new_games
from ..tables import BlitzTables
from .actions import EXACT_MAIN, decode, decode_exact, legal_main
from .net import Net, act
from .obs import observe, slots

LEARNER, GREEDY = 0, 1
# GD's four Expert personas, kinds 2 to 5, in this order; snapshots follow them.
GD_PERSONAS = ("defensive", "continental", "aggressive", "stacker")
GD = 2
SNAPSHOT = GD + len(GD_PERSONAS)
# Fields the buffer keeps of each decision's state: everything the observation and the options
# read (the random stream and the deck order are never needed again).
KEPT = [name for name in LAYOUT if name not in ("rng", "deck")]
LOG_FIELDS = ("placed_on", "attacks", "captured")


@dataclass
class EnvConfig:
    batch: int = 16384
    sizes: tuple[int, ...] = (3, 4, 5, 6)
    size_weights: tuple[float, ...] = (0.35, 0.2, 0.3, 0.15)
    cap_low: int = 150
    cap_high: int = 600
    pool: int = 4096
    snapshots: int = 4
    horizon: int = 64  # rollout steps kept in the buffer
    aux_steps: int = 32  # the auxiliary target's look-ahead, in steps of the batch
    record: bool = True
    reset: bool = True  # False: a finished game stays finished (evaluation)
    learner_greedy: bool = False  # the learner plays its most likely move instead of sampling
    snapshot_greedy: bool = False  # likewise the snapshots (evaluation)
    bf16: bool = True  # the networks' forward pass in bfloat16 autocast
    # The most rows each controller is run on per step, as a share of the batch; a decision past it
    # waits a step (counted as `unserved`, by controller). Sized to the league's mix.
    cap_learner: float = 0.5
    cap_snapshot: float = 0.12
    cap_greedy: float = 1.0
    serve: str = "lowest"  # which due rows a saturated controller serves: "lowest" or "oldest"
    reward: str = "win"  # `scores`: "win", "place" or "winner"
    cap_score: str = "survivors"  # `scores`: a capped game's survivors, "survivors" or "loss"
    time_discount: float = 1.0  # `scores`: a win's score falls by this factor every 100 player-turns (1: off)
    gd: bool = False  # build the GD personas (slow to build: their odds tables)
    cap_gd: tuple[float, ...] = (0.2, 0.2, 0.2, 0.08)  # by persona; Stacker's walk is the costly one


def scores(players: torch.Tensor, places: torch.Tensor, eliminated: torch.Tensor, won: torch.Tensor,
           in_game: torch.Tensor, reward: str = "win", cap_score: str = "survivors",
           turn: torch.Tensor | None = None, time_discount: float = 1.0) -> torch.Tensor:
    """`[B, 6]` float32, each seat's score for a game that just ended (0 for absent seats).
    `place`: linear in the place, +1 first to −1 last. `win`: +1 for the win, the other places
    linear from 0 (second) to −1 (last), so second place is worth nothing over a loss in the way a
    win is (placement alone taught m2a to settle for a place). `winner`: +1 for the win and −1 for
    every other place, the goal alone with no credit for a place, so a capped game, which has no
    winner, scores −1 for every seat under either `cap_score`. A capped game's survivors score by
    `cap_score`, and with `time_discount` below 1 the winner's +1 by the game's length, `turn`
    (the module's docstring)."""
    n = players.to(torch.float32)[:, None]
    seats = torch.arange(MAX_SEATS, device=players.device)[None, :]
    present = seats < players.to(torch.int64)[:, None]

    def score(p):
        p = p.to(torch.float32)
        if reward == "place":
            return 1 - 2 * (p - 1) / (n - 1)
        if reward == "winner":
            return torch.where(p <= 1, 1.0, -1.0)
        return torch.where(p <= 1, 1.0, -(p - 2) / (n - 2))

    if cap_score == "loss":
        survivors = torch.full((players.shape[0], MAX_SEATS), -1.0, device=players.device)
    elif cap_score == "survivors":
        survivors = (score(in_game[:, None].expand(-1, MAX_SEATS)) - 0.5).clamp(min=-1)
    else:
        raise ValueError(f"cap_score is 'survivors' or 'loss', not {cap_score!r}")
    capped_score = torch.where(eliminated, score(places), survivors)
    out = torch.where(won[:, None], score(places), capped_score)
    if time_discount != 1.0:
        assert 0 < time_discount < 1 and turn is not None, "a time discount below 1 is above 0 and reads the game's length"
        factor = torch.exp(turn.to(torch.float32) * (math.log(time_discount) / 100))
        out = torch.where(won[:, None] & ~eliminated, out * factor[:, None], out)
    return torch.where(present, out, 0.0)


_POOL = None


def shared_pool():
    """One memory pool for every captured step in the process (the training batch, the
    evaluations, the ladders): they replay one at a time and keep everything that outlives a replay
    in tensors allocated outside the capture, so their scratch memory can be the same."""
    global _POOL
    if _POOL is None:
        _POOL = torch.cuda.graph_pool_handle()
    return _POOL


class Env:
    def __init__(self, cfg: EnvConfig, board: Board, tables: BlitzTables, learner: Net, device: str = "cuda",
                 seed_prefix: str = "sp", gd_bots: list | None = None):
        assert tables.scaled_oversize, "training resolves oversize fights on the device"
        assert cfg.serve in ("lowest", "oldest"), f"serve is 'lowest' or 'oldest', not {cfg.serve!r}"
        assert cfg.cap_score in ("survivors", "loss"), f"cap_score is 'survivors' or 'loss', not {cfg.cap_score!r}"
        assert 0 < cfg.time_discount <= 1, f"time_discount is in (0, 1], not {cfg.time_discount}"
        if cfg.bf16 and torch.device(device).type == "cuda" and torch.cuda.get_device_capability(device) < (8, 0):
            # Before Ampere there is no native bfloat16: PyTorch emulates it, slowly, without saying so.
            raise RuntimeError(f"{torch.cuda.get_device_name(device)} has no native bfloat16: run with --no-bf16")
        self.cfg, self.board, self.tables, self.learner, self.device = cfg, board, tables, learner, device
        self.seed_prefix = seed_prefix
        self.generation = 0
        B = cfg.batch
        self.rows = torch.arange(B, device=device)
        weights = torch.tensor(cfg.size_weights, dtype=torch.float64)
        counts = (weights / weights.sum() * B).floor().to(torch.int64)
        counts[0] += B - int(counts.sum())
        self.size_index = torch.repeat_interleave(torch.arange(len(cfg.sizes)), counts).to(device)
        self.players_of_slot = torch.tensor(cfg.sizes, device=device)[self.size_index]
        # The run's own snapshots, of the learner's shape and space; an anchor of another shape or
        # space replaces its slot's net (`ladder.load_net`) before the step is captured.
        self.snapshots = [Net(**learner.config(), edges=board.edges, adjacency=board.adjacency).to(device)
                          for _ in range(cfg.snapshots)]
        self.active_snapshots = 0  # how many of them the captured step runs
        self.gd_bots = gd_bots or []
        if cfg.gd and not self.gd_bots:
            from ..bots.gd import gd_bot_graphable
            self.gd_bots = [gd_bot_graphable(p, tables) for p in GD_PERSONAS]
        for net in self.snapshots:
            net.requires_grad_(False)
        kinds = SNAPSHOT + cfg.snapshots
        self.kind_probs = torch.zeros(kinds, device=device)
        self.kind_probs[GREEDY] = 1.0

        # The pool: `pool` fresh deals per table size, side by side.
        self.pool_base = torch.arange(len(cfg.sizes), device=device) * cfg.pool
        self.cursor = torch.zeros(len(cfg.sizes), dtype=torch.int64, device=device)
        self.pool = self._deal_pool()
        self.state = self._fresh(self.players_of_slot.cpu().tolist())
        self.log = TurnLog.empty(B, device)
        self.places = torch.ones(B, MAX_SEATS, dtype=torch.int64, device=device)
        self.in_game = self.state.players.to(torch.int64).clone()
        self.seat_kind = torch.zeros(B, MAX_SEATS, dtype=torch.int64, device=device)
        self.cap = torch.zeros(B, dtype=torch.int64, device=device)
        self.game_id = torch.zeros(B, dtype=torch.int64, device=device)
        self.done = torch.zeros(B, dtype=torch.bool, device=device)
        self._draw_seats(torch.ones(B, dtype=torch.bool, device=device))
        self.stats = torch.zeros(8, kinds, dtype=torch.float64, device=device)
        # Each seat's slot-0 value at its first learner decision of the game, where it has decided.
        self.first_value = torch.zeros(B, MAX_SEATS, dtype=torch.float32, device=device)
        self.opened = torch.zeros(B, MAX_SEATS, dtype=torch.bool, device=device)
        # Over the learner seats of the games that ended: the sum of their first values and how
        # many decided; by table size, their scores and how many there were.
        self.first_stats = torch.zeros(2, dtype=torch.float64, device=device)
        self.size_stats = torch.zeros(2, len(cfg.sizes), dtype=torch.float64, device=device)
        # By controller kind, the scores the stats' row 2 would hold without the time discount.
        self.undiscounted = (torch.zeros(kinds, dtype=torch.float64, device=device)
                             if cfg.time_discount != 1.0 else None)
        self.t =torch.zeros((), dtype=torch.int64, device=device)
        # Steps in a row each row has waited past its controller's capacity, and the most since the
        # stats were last taken.
        self.waited = torch.zeros(B, dtype=torch.int64, device=device)
        self.longest_wait = torch.zeros((), dtype=torch.int64, device=device)
        # Exact-space decisions whose range had more choices than the argument's slots (`spread`).
        self.overflow = torch.zeros((), dtype=torch.int64, device=device)
        if cfg.record:
            T = cfg.horizon
            self.buf = {name: torch.zeros(T, B, *LAYOUT[name][0], dtype=LAYOUT[name][1], device=device) for name in KEPT}
            self.buf["placed_on"] = torch.zeros(T, B, 42, dtype=torch.bool, device=device)
            self.buf["attacks"] = torch.zeros(T, B, dtype=torch.int32, device=device)
            self.buf["captured"] = torch.zeros(T, B, dtype=torch.int32, device=device)
            self.buf["main"] = torch.zeros(T, B, dtype=torch.int64, device=device)
            self.buf["amount"] = torch.zeros(T, B, dtype=torch.int64, device=device)
            self.buf["moved"] = torch.zeros(T, B, dtype=torch.bool, device=device)
            self.buf["logp"] = torch.zeros(T, B, dtype=torch.float32, device=device)
            self.buf["value"] = torch.zeros(T, B, dtype=torch.float32, device=device)
            self.buf["learner"] = torch.zeros(T, B, dtype=torch.bool, device=device)
            self.buf["ended"] = torch.zeros(T, B, dtype=torch.bool, device=device)
            self.buf["reward"] = torch.zeros(T, B, MAX_SEATS, dtype=torch.float32, device=device)
            self.buf["share"] = torch.zeros(T, B, MAX_SEATS, dtype=torch.float32, device=device)
            self.buf["game_id"] = torch.zeros(T, B, dtype=torch.int64, device=device)
            self.buf["cap"] = torch.zeros(T, B, dtype=torch.int64, device=device)
        self.graph: torch.cuda.CUDAGraph | None = None

    # --- dealing -----------------------------------------------------------------------------

    def _fresh(self, players: list[int]) -> State:
        self.generation += 1
        seeds = [f"{self.seed_prefix}-{self.generation}-{i}" for i in range(len(players))]
        return new_games(seeds, players, self.board, self.device)

    def _deal_pool(self) -> State:
        return self._fresh([p for p in self.cfg.sizes for _ in range(self.cfg.pool)])

    def refill_pool(self) -> None:
        """New deals for the pool (outside the graph: the setup reads its loop bounds on the host)."""
        fresh = self._deal_pool()
        for name in LAYOUT:
            getattr(self.pool, name).copy_(getattr(fresh, name))
        self.cursor.zero_()

    def _draw_seats(self, m: torch.Tensor) -> None:
        """New controllers and turn caps for the games in `m`."""
        B = self.cfg.batch
        # Inverse-CDF draws rather than `multinomial`/`randint`, which a graph can't always capture.
        cdf = self.kind_probs.cumsum(0)
        u = torch.rand(B, MAX_SEATS, device=self.device) * cdf[-1]
        others = torch.searchsorted(cdf, u.reshape(-1), right=True).clamp(max=cdf.shape[0] - 1).view(B, MAX_SEATS)
        players = self.players_of_slot
        learner_seat = (torch.rand(B, device=self.device) * players).floor().to(torch.int64)
        kinds = torch.where(torch.arange(MAX_SEATS, device=self.device)[None, :] == learner_seat[:, None], LEARNER, others)
        self.seat_kind.copy_(torch.where(m[:, None], kinds, self.seat_kind))
        span = self.cfg.cap_high + 1 - self.cfg.cap_low
        cap = self.cfg.cap_low + (torch.rand(B, device=self.device) * span).floor().to(torch.int64).clamp(max=span - 1)
        self.cap.copy_(torch.where(m, cap, self.cap))

    # --- the step ------------------------------------------------------------------------------

    def _step(self) -> None:
        cfg, board, B = self.cfg, self.board, self.cfg.batch
        s = State(**{name: getattr(self.state, name) for name in LAYOUT})
        # `TurnLog.update` replaces some of its tensors; the graph must keep writing into these.
        log_static = {name: getattr(self.log, name) for name in ("attacks", "captured", "placed_on", "traded", "stacker_swapped")}
        rows = self.rows
        o = options(s, board)
        legal = legal_main(o)
        active = s.active.to(torch.int64)
        kind_now = self.seat_kind[rows, active]
        live = ~self.done

        def pick(need: torch.Tensor, capacity: int) -> tuple[torch.Tensor, torch.Tensor]:
            # The rows that need a controller first, then the first `capacity` of them: a static
            # shape for the graph. A row past the capacity sits this step out (`unserved`).
            if cfg.serve == "oldest":
                # The `capacity` rows that have waited longest, ties to the lowest row; then taken
                # in row order as `lowest` takes its rows, so when every due row fits, the rows and
                # their order (which the samplers' random draws follow) are `lowest`'s.
                longest = torch.argsort(torch.where(need, -self.waited, 1), stable=True)[:capacity]
                need = torch.zeros_like(need).index_fill_(0, longest, True) & need
            order = torch.argsort((~need).to(torch.int8), stable=True)
            chosen = order[:capacity]
            return chosen, need[chosen]

        def subset_options(idx: torch.Tensor) -> Options:
            return Options(**{f.name: getattr(o, f.name)[idx] for f in fields(Options)})

        main = torch.zeros(B, dtype=torch.int64, device=self.device)
        amount = torch.zeros_like(main)
        logp = torch.zeros(B, dtype=torch.float32, device=self.device)
        value = torch.zeros(B, dtype=torch.float32, device=self.device)
        served = torch.zeros(B, dtype=torch.bool, device=self.device)
        learner_rows = torch.zeros(B, dtype=torch.bool, device=self.device)
        nets = [(LEARNER, self.learner, cfg.cap_learner, cfg.learner_greedy)]
        nets += [(SNAPSHOT + k, net, cfg.cap_snapshot, cfg.snapshot_greedy) for k, net in enumerate(self.snapshots[: self.active_snapshots])]
        # The networks of the exact action space decode their own rows; the bucket space's are
        # decoded together below. A step with no exact network computes nothing for them.
        exact = any(net.exact for _, net, _, _ in nets)
        if exact:
            exact_legal = legal & on_device("exact_main", EXACT_MAIN, self.device)
            exact_move = torch.zeros(B, 5, dtype=torch.int64, device=self.device)
            exact_rows = torch.zeros(B, dtype=torch.bool, device=self.device)
        for kind, net, share, greedy_pick in nets:
            idx, ok = pick(live & (kind_now == kind), max(1, int(share * B)))
            sub, sub_o = s.select(idx), subset_options(idx)
            node, slot, glob = observe(sub, sub_o, self.log.placed_on[idx], self.log.attacks[idx],
                                       self.log.captured[idx], board, self.cap[idx] if net.clock else None, net.graph)
            with torch.autocast("cuda", dtype=torch.bfloat16, enabled=cfg.bf16):
                m, a, lp, v, c = act(net, node, slot, glob, (exact_legal if net.exact else legal)[idx], greedy_pick,
                                     sub, sub_o, board)
            if net.exact:
                exact_move.index_copy_(0, idx, torch.where(ok[:, None], decode_exact(m, a, sub, sub_o, board, c), exact_move[idx]))
                exact_rows.index_copy_(0, idx, exact_rows[idx] | ok)
                self.overflow.add_((ok & c.overflow).sum())
            main.index_copy_(0, idx, torch.where(ok, m, main[idx]))
            amount.index_copy_(0, idx, torch.where(ok, a, amount[idx]))
            if kind == LEARNER:
                logp.index_copy_(0, idx, lp.float())
                value.index_copy_(0, idx, v[:, 0].float())
                learner_rows.index_copy_(0, idx, ok)
            served.index_copy_(0, idx, served[idx] | ok)
        opening = learner_rows & ~self.opened[rows, active]
        self.first_value[rows, active] = torch.where(opening, value, self.first_value[rows, active])
        self.opened[rows, active] = self.opened[rows, active] | learner_rows
        net_move = decode(main, amount, s, o, board)
        if exact:
            net_move = torch.where(exact_rows[:, None], exact_move, net_move)
        idx, ok = pick(live & (kind_now == GREEDY), max(1, int(cfg.cap_greedy * B)))
        humans = torch.zeros(idx.shape[0], MAX_SEATS, dtype=torch.bool, device=self.device)
        decision = Decision(s.select(idx), subset_options(idx), board, self.tables, None, None, humans, [])
        greedy = torch.zeros(B, 5, dtype=torch.int64, device=self.device)
        greedy.index_copy_(0, idx, greedy_bot(decision, ok, graphable=True).to(torch.int64))
        greedy_rows = torch.zeros(B, dtype=torch.bool, device=self.device).index_copy_(0, idx, ok)
        moves = torch.where(greedy_rows[:, None], greedy, net_move)
        moving = served | greedy_rows
        for k, bot in enumerate(self.gd_bots):
            idx, ok = pick(live & (kind_now == GD + k), max(1, int(cfg.cap_gd[k] * B)))
            humans = torch.zeros(idx.shape[0], MAX_SEATS, dtype=torch.bool, device=self.device)
            decision = Decision(s.select(idx), subset_options(idx), board, self.tables, self.log.select(idx), None,
                                humans, [])
            seed = (torch.rand(idx.shape[0], device=self.device, dtype=torch.float64) * 4294967296.0).floor().to(torch.int64)
            theirs = torch.zeros(B, 5, dtype=torch.int64, device=self.device)
            theirs.index_copy_(0, idx, bot(decision, ok, seed).to(torch.int64))
            rows_k = torch.zeros(B, dtype=torch.bool, device=self.device).index_copy_(0, idx, ok)
            moves = torch.where(rows_k[:, None], theirs, moves)
            moving = moving | rows_k
        unserved = live & ~moving
        by_kind = torch.nn.functional.one_hot(kind_now, self.stats.shape[1]).to(torch.float64)
        self.stats[7] += (by_kind * unserved.to(torch.float64)[:, None]).sum(0)
        self.waited.copy_(torch.where(unserved, self.waited + 1, 0))
        self.longest_wait.copy_(torch.maximum(self.longest_wait, self.waited.max()))

        if cfg.record:
            t = self.t.view(1)
            for name in KEPT:
                self.buf[name].index_copy_(0, t, getattr(s, name)[None])
            for name in LOG_FIELDS:
                self.buf[name].index_copy_(0, t, getattr(self.log, name)[None])
            self.buf["main"].index_copy_(0, t, main[None])
            self.buf["amount"].index_copy_(0, t, amount[None])
            self.buf["logp"].index_copy_(0, t, logp[None])
            self.buf["value"].index_copy_(0, t, value[None])
            self.buf["learner"].index_copy_(0, t, learner_rows[None])
            self.buf["moved"].index_copy_(0, t, moving[None])
            self.buf["game_id"].index_copy_(0, t, self.game_id[None])
            self.buf["cap"].index_copy_(0, t, self.cap[None])

        before = SimpleNamespace(active=s.active.clone(), turn=s.turn.clone())
        eliminated_before = s.eliminated.clone()
        step(s, moves, board, self.tables, done=~moving, check=False)
        self.log.update(before, s, moves, moving)

        newly_out = s.eliminated & ~eliminated_before
        self.places.copy_(torch.where(newly_out, self.in_game[:, None], self.places))
        self.in_game.sub_(newly_out.sum(1))
        won = s.phase == 3
        ended = ~self.done & (won | (s.turn.to(torch.int64) > self.cap))
        reward = scores(s.players, self.places, s.eliminated, won, self.in_game, cfg.reward, cfg.cap_score,
                        s.turn, cfg.time_discount)
        reward = torch.where(ended[:, None], reward, 0.0)

        # Board shares, per seat, for the auxiliary target.
        owner = s.owner.to(torch.int64)
        seats = torch.arange(MAX_SEATS, device=self.device)
        mine = (owner[:, None, :] == seats[None, :, None]).to(torch.float32)
        armies = s.armies.to(torch.float32)
        share = 0.5 * mine.mean(-1) + 0.5 * (mine * armies[:, None, :]).sum(-1) / armies.sum(1, keepdim=True)

        if cfg.record:
            t = self.t.view(1)
            self.buf["ended"].index_copy_(0, t, ended[None])
            self.buf["reward"].index_copy_(0, t, reward[None])
            self.buf["share"].index_copy_(0, t, share[None])

        # statistics, by controller kind: seats, wins, score, games (row 3, kind 0 column only),
        # capped games, turns, seats in decisive games; row 7, the rows each left unserved, above
        kinds = self.stats.shape[1]
        present = seats[None, :] < s.players.to(torch.int64)[:, None]
        onehot = torch.nn.functional.one_hot(self.seat_kind, kinds).to(torch.float64)  # [B, 6, K]
        counted = (ended[:, None] & present).to(torch.float64)[:, :, None] * onehot
        winner = (seats[None, :] == s.winner.to(torch.int64)[:, None]) & won[:, None]
        self.stats[0] += counted.sum((0, 1))
        self.stats[1] += (counted * winner.to(torch.float64)[:, :, None]).sum((0, 1))
        self.stats[2] += (counted * reward.to(torch.float64)[:, :, None]).sum((0, 1))
        if self.undiscounted is not None:
            plain = scores(s.players, self.places, s.eliminated, won, self.in_game, cfg.reward, cfg.cap_score)
            self.undiscounted += (counted * plain.to(torch.float64)[:, :, None]).sum((0, 1))
        self.stats[3, 0] += ended.sum()
        self.stats[4, 0] += (ended & ~won).sum()
        self.stats[5, 0] += torch.where(ended, s.turn, 0).sum()
        decisive = (ended & won).to(torch.float64)[:, None, None] * onehot * present.to(torch.float64)[:, :, None]
        self.stats[6] += decisive.sum((0, 1))  # seats in decisive games, for the win rate's par
        learner_seats = counted[:, :, LEARNER]
        decided = learner_seats * self.opened.to(torch.float64)
        self.first_stats[0] += (decided * self.first_value.to(torch.float64)).sum()
        self.first_stats[1] += decided.sum()
        self.size_stats[0].index_add_(0, self.size_index, (learner_seats * reward.to(torch.float64)).sum(1))
        self.size_stats[1].index_add_(0, self.size_index, learner_seats.sum(1))

        if cfg.reset:
            idx = torch.zeros(B, dtype=torch.int64, device=self.device)
            for k in range(len(cfg.sizes)):
                group = ended & (self.size_index == k)
                rank = group.cumsum(0) - 1
                idx = torch.where(group, self.pool_base[k] + (self.cursor[k] + rank) % cfg.pool, idx)
                self.cursor[k] += group.sum()
            for name in LAYOUT:
                field = getattr(s, name)
                fresh = getattr(self.pool, name)[idx]
                setattr(s, name, torch.where(ended.view(-1, *([1] * (field.dim() - 1))), fresh, field))
            log = self.log
            log.attacks.copy_(torch.where(ended, 0, log.attacks))
            log.captured.copy_(torch.where(ended, 0, log.captured))
            log.traded.copy_(torch.where(ended, 0, log.traded))
            log.placed_on.copy_(log.placed_on & ~ended[:, None])
            log.stacker_swapped.copy_(log.stacker_swapped & ~ended[:, None])
            self.places.copy_(torch.where(ended[:, None], 1, self.places))
            self.in_game.copy_(torch.where(ended, s.players.to(torch.int64), self.in_game))
            self.opened.copy_(self.opened & ~ended[:, None])
            self.game_id.add_(ended.to(torch.int64))
            self._draw_seats(ended)
        else:
            self.done.copy_(self.done | ended)

        for name in LAYOUT:
            static = getattr(self.state, name)
            if getattr(s, name) is not static:
                static.copy_(getattr(s, name))
        for name, static in log_static.items():
            if getattr(self.log, name) is not static:
                static.copy_(getattr(self.log, name))
                setattr(self.log, name, static)
        self.t.add_(1)

    def capture(self) -> None:
        """Warms the step up on a side stream, then captures it."""
        assert self.device.startswith("cuda")
        saved = self._save()
        side = torch.cuda.Stream()
        side.wait_stream(torch.cuda.current_stream())
        with torch.cuda.stream(side), torch.no_grad():
            for _ in range(3):
                self.t.zero_()
                self._step()
        torch.cuda.current_stream().wait_stream(side)
        self._restore(saved)
        self.graph = torch.cuda.CUDAGraph()
        with torch.cuda.graph(self.graph, pool=shared_pool()), torch.no_grad():
            self._step()
        self._restore(saved)

    def _tensors(self) -> list[torch.Tensor]:
        log = self.log
        return ([getattr(self.state, n) for n in LAYOUT]
                + [log.attacks, log.captured, log.placed_on, log.traded, log.stacker_swapped]
                + [self.places, self.in_game, self.seat_kind, self.cap, self.game_id, self.done, self.cursor, self.stats, self.t,
                   self.waited, self.longest_wait, self.overflow, self.first_value, self.opened, self.first_stats,
                   self.size_stats]
                + ([self.undiscounted] if self.undiscounted is not None else []))

    def _save(self) -> list[torch.Tensor]:
        return [x.clone() for x in self._tensors()]

    def _restore(self, saved: list[torch.Tensor]) -> None:
        for x, y in zip(self._tensors(), saved):
            x.copy_(y)

    def run(self, steps: int) -> None:
        """`steps` steps; with `record`, the buffer is filled from row 0."""
        if self.cfg.record:
            assert steps == self.cfg.horizon
        self.t.zero_()
        with torch.no_grad():
            for _ in range(steps):
                if self.graph is not None:
                    self.graph.replay()
                else:
                    self._step()

    def bootstrap(self) -> torch.Tensor:
        """`[B, 6]` by seat: the learner's value vector for every seat, read from the acting seat's
        view of the current state, for the games still running at the buffer's end. A seat not acting
        gets an other-slot value, which slot 0 is never trained to agree with: the trainer's
        `--bootstrap acting`, kept as its control (`ppo.py`)."""
        with torch.no_grad():
            s = self.state
            o = options(s, self.board)
            node, slot, glob = observe(s, o, self.log.placed_on, self.log.attacks, self.log.captured, self.board,
                                       self.cap if self.learner.clock else None, self.learner.graph)
            values = []
            # In chunks: a whole batch through a large network at once outgrows the card.
            for at in range(0, s.batch, 2048):
                part = slice(at, at + 2048)
                with torch.autocast("cuda", dtype=torch.bfloat16, enabled=self.cfg.bf16):
                    _, v, _ = self.learner.heads_main(self.learner.trunk(node[part], slot[part], glob[part]))
                values.append(v.float())
            value = torch.cat(values)
            seat_of_slot, _ = slots(s)
            by_seat = torch.zeros(self.cfg.batch, MAX_SEATS + 1, device=self.device)
            by_seat.scatter_(1, torch.where(seat_of_slot >= 0, seat_of_slot, MAX_SEATS), value)
            return by_seat[:, :MAX_SEATS]

    def spread(self, rollouts: int) -> None:
        """Plays `rollouts` rollouts that are neither kept nor trained on, each game of the batch's
        first deal cut (by its cap, set below every turn) at the start of a rollout drawn uniformly
        among them, unless it has ended by then: the deals that replace them start spread through
        that window, so the first rollouts trained on hold games at every stage rather than a batch
        dealt at once. Their statistics are dropped."""
        assert self.cfg.reset, "a spread replaces the games it cuts"
        first = self.game_id.clone()
        cut_at = (torch.rand(self.cfg.batch, device=self.device) * rollouts).floor().to(torch.int64)
        for k in range(rollouts):
            self.cap.copy_(torch.where((cut_at == k) & (self.game_id == first), -1, self.cap))
            self.run(self.cfg.horizon)
            if int(self.cursor.max()) > self.cfg.pool // 2:
                self.refill_pool()
        self.take_stats()

    def take_stats(self) -> dict:
        # A copy: on the CPU `.cpu()` is the tensor itself, which the zeroing below would empty.
        st = self.stats.to("cpu", copy=True)
        longest_wait = int(self.longest_wait)
        overflow = int(self.overflow)
        first_value, first_n = self.first_stats.tolist()
        size_score, size_seats = self.size_stats.tolist()
        self.stats.zero_()
        self.longest_wait.zero_()
        self.overflow.zero_()
        self.first_stats.zero_()
        self.size_stats.zero_()
        out = {"seats": st[0].tolist(), "wins": st[1].tolist(), "score": st[2].tolist(), "games": float(st[3, 0]),
               "capped": float(st[4, 0]), "turns": float(st[5, 0]), "decisive_seats": st[6].tolist(),
               "unserved": st[7].tolist(), "longest_wait": longest_wait, "overflow": overflow,
               "first_value": first_value, "first_n": first_n, "sizes": list(self.cfg.sizes),
               "size_score": size_score, "size_seats": size_seats}
        if self.undiscounted is not None:
            out["score_undiscounted"] = self.undiscounted.tolist()
            self.undiscounted.zero_()
        return out

"""The training environment: a batch of games that never stops, every step one decision per game,
captured as one CUDA graph (`ideas/gpu-engine.md`, phase 3).

Each step: the options and the acting seat's observation, the learner network's move (sampled),
each league snapshot's move, greedy's move, the seat's controller picks one, the engine applies it
(no checks: every move comes from the masks), and the bookkeeping: places at eliminations, a game
over at a win or at its own turn cap, its seats' scores, and the game replaced in place by a fresh
deal from a pool. Nothing in the step reads a value back to the host, so the whole of it replays as
one graph; the host only launches it and, between rollouts, refills the pool and trains.

**Scores** (`scores`). By default the winner scores +1 and the other places run from 0 (second) to
−1 (the first out); the `place` reward is linear in the place. The survivors of a capped game all score as k-th of n (k survivors) less 0.5, never below
−1: a draw at the cap is never better than placing just behind the survivors, so no table can
settle into the stall and call it a result (`ideas/stalled-games.md`).

**The turn cap is drawn per game** (`cap_low` to `cap_high` player-turns), so a policy can't count
on outlasting a clock it knows.

**The league.** Each seat of a new game is a controller kind: 0 the learner, 1 greedy, 2 to 5 GD's
personas (their graphable port: exact inside the blitz table, approximate past it, with their
jitter from a device stream rather than the harness's), 6 + k the k-th snapshot network. At least one seat is the learner, at a random seat; the others are drawn
from `kind_probs`, which the trainer may change between rollouts.
"""

from dataclasses import dataclass, fields
from types import SimpleNamespace

import torch

from ..board import MAX_SEATS, Board
from ..bots.greedy import greedy_bot
from ..engine import step
from ..options import Options, options
from ..runner import Decision, TurnLog
from ..state import LAYOUT, State, new_games
from ..tables import BlitzTables
from .actions import decode, legal_main
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
    # waits a step (counted as `stalled`). Sized to the league's mix.
    cap_learner: float = 0.6
    cap_snapshot: float = 0.25
    cap_greedy: float = 1.0
    reward: str = "win"  # `scores`: "win" or "place"
    gd: bool = False  # build the GD personas (slow to build: their odds tables)
    cap_gd: tuple[float, ...] = (0.2, 0.2, 0.2, 0.08)  # by persona; Stacker's walk is the costly one


def scores(players: torch.Tensor, places: torch.Tensor, eliminated: torch.Tensor, won: torch.Tensor,
           in_game: torch.Tensor, reward: str = "win") -> torch.Tensor:
    """`[B, 6]` float32, each seat's score for a game that just ended (0 for absent seats).
    `place`: linear in the place, +1 first to −1 last. `win`: +1 for the win, the other places
    linear from 0 (second) to −1 (last), so second place is worth nothing over a loss in the way a
    win is (placement alone taught m2a to settle for a place)."""
    n = players.to(torch.float32)[:, None]
    seats = torch.arange(MAX_SEATS, device=players.device)[None, :]
    present = seats < players.to(torch.int64)[:, None]

    def score(p):
        p = p.to(torch.float32)
        if reward == "place":
            return 1 - 2 * (p - 1) / (n - 1)
        return torch.where(p <= 1, 1.0, -(p - 2) / (n - 2))

    survivors = (score(in_game[:, None].expand(-1, MAX_SEATS)) - 0.5).clamp(min=-1)
    capped_score = torch.where(eliminated, score(places), survivors)
    out = torch.where(won[:, None], score(places), capped_score)
    return torch.where(present, out, 0.0)


class Env:
    def __init__(self, cfg: EnvConfig, board: Board, tables: BlitzTables, learner: Net, device: str = "cuda",
                 seed_prefix: str = "sp", gd_bots: list | None = None):
        assert tables.scaled_oversize, "training resolves oversize fights on the device"
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
        self.t = torch.zeros((), dtype=torch.int64, device=device)
        self.stalled = torch.zeros((), dtype=torch.int64, device=device)
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
            # shape for the graph. A row past the capacity sits this step out (`stalled`).
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
        for kind, net, share, greedy_pick in nets:
            idx, ok = pick(live & (kind_now == kind), max(1, int(share * B)))
            sub = s.select(idx)
            node, slot, glob = observe(sub, subset_options(idx), self.log.placed_on[idx], self.log.attacks[idx],
                                       self.log.captured[idx], board)
            with torch.autocast("cuda", dtype=torch.bfloat16, enabled=cfg.bf16):
                m, a, lp, v = act(net, node, slot, glob, legal[idx], greedy_pick)
            main.index_copy_(0, idx, torch.where(ok, m, main[idx]))
            amount.index_copy_(0, idx, torch.where(ok, a, amount[idx]))
            if kind == LEARNER:
                logp.index_copy_(0, idx, lp.float())
                value.index_copy_(0, idx, v[:, 0].float())
                learner_rows.index_copy_(0, idx, ok)
            served.index_copy_(0, idx, served[idx] | ok)
        net_move = decode(main, amount, s, o, board)
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
        self.stalled.add_((live & ~moving).sum())

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

        before = SimpleNamespace(active=s.active.clone(), turn=s.turn.clone())
        eliminated_before = s.eliminated.clone()
        step(s, moves, board, self.tables, done=~moving, check=False)
        self.log.update(before, s, moves, moving)

        newly_out = s.eliminated & ~eliminated_before
        self.places.copy_(torch.where(newly_out, self.in_game[:, None], self.places))
        self.in_game.sub_(newly_out.sum(1))
        won = s.phase == 3
        ended = ~self.done & (won | (s.turn.to(torch.int64) > self.cap))
        reward = scores(s.players, self.places, s.eliminated, won, self.in_game, cfg.reward)
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
        # capped games, turns, oversize-free games
        kinds = self.stats.shape[1]
        present = seats[None, :] < s.players.to(torch.int64)[:, None]
        onehot = torch.nn.functional.one_hot(self.seat_kind, kinds).to(torch.float64)  # [B, 6, K]
        counted = (ended[:, None] & present).to(torch.float64)[:, :, None] * onehot
        winner = (seats[None, :] == s.winner.to(torch.int64)[:, None]) & won[:, None]
        self.stats[0] += counted.sum((0, 1))
        self.stats[1] += (counted * winner.to(torch.float64)[:, :, None]).sum((0, 1))
        self.stats[2] += (counted * reward.to(torch.float64)[:, :, None]).sum((0, 1))
        self.stats[3, 0] += ended.sum()
        self.stats[4, 0] += (ended & ~won).sum()
        self.stats[5, 0] += torch.where(ended, s.turn, 0).sum()
        decisive = (ended & won).to(torch.float64)[:, None, None] * onehot * present.to(torch.float64)[:, :, None]
        self.stats[6] += decisive.sum((0, 1))  # seats in decisive games, for the win rate's par

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
        with torch.cuda.graph(self.graph), torch.no_grad():
            self._step()
        self._restore(saved)

    def _tensors(self) -> list[torch.Tensor]:
        log = self.log
        return ([getattr(self.state, n) for n in LAYOUT]
                + [log.attacks, log.captured, log.placed_on, log.traded, log.stacker_swapped]
                + [self.places, self.in_game, self.seat_kind, self.cap, self.game_id, self.done, self.cursor, self.stats, self.t, self.stalled])

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
        view of the current state, for the games still running at the buffer's end."""
        with torch.no_grad():
            s = self.state
            o = options(s, self.board)
            node, slot, glob = observe(s, o, self.log.placed_on, self.log.attacks, self.log.captured, self.board)
            with torch.autocast("cuda", dtype=torch.bfloat16, enabled=self.cfg.bf16):
                _, value, _ = self.learner.heads_main(self.learner.trunk(node, slot, glob))
            value = value.float()
            seat_of_slot, _ = slots(s)
            by_seat = torch.zeros(self.cfg.batch, MAX_SEATS + 1, device=self.device)
            by_seat.scatter_(1, torch.where(seat_of_slot >= 0, seat_of_slot, MAX_SEATS), value)
            return by_seat[:, :MAX_SEATS]

    def take_stats(self) -> dict:
        st = self.stats.cpu()
        stalled = int(self.stalled)
        self.stats.zero_()
        self.stalled.zero_()
        return {"seats": st[0].tolist(), "wins": st[1].tolist(), "score": st[2].tolist(), "games": float(st[3, 0]),
                "capped": float(st[4, 0]), "turns": float(st[5, 0]), "decisive_seats": st[6].tolist(),
                "stalled": stalled}

"""PPO in a league on the GPU engine (`ideas/gpu-engine.md`, phase 3):

    python -m riskgpu.selfplay.ppo --name m1 [--resume] [--hours 48]

run from `src/projects/risk/gpu/`. Output (checkpoints, `log.jsonl`) goes to
`runs/selfplay/<name>/`, which git ignores; `--resume` continues from `latest.pt`.

Each iteration: a rollout of `horizon` steps of the whole batch (one CUDA graph replay a step),
GAE over each learner seat's own decisions (γ = 1: the score comes at the game's end), then PPO
epochs over the learner's decisions, their observations and masks rebuilt from the kept states.
The value head is a vector over slots: slot 0 learns the GAE return (and real outcomes, below), the other slots their seat's
final score where the game ended inside the rollout; the auxiliary head learns each slot's board
share `aux_steps` steps on.

**A turn's end has its own λ** (`--lam-turn`). A seat's chain runs through its turns, each a run of
its own decisions; the link from a turn's last decision to its next turn's first is the only one
across which the other seats reply. With `--lam` alone a turn of thirty decisions spends most of the
λ-return's reach inside itself; a separate λ for the crossing links lets the decisions of a turn
share that turn's outcome (`--lam 1`) while the return still discounts by the turn.

**A seat's chain crosses the rollout's end** (`--bootstrap carry`, the default). A learner seat's
last decision in a rollout, its game still running, has no successor yet: it is held back (`Carry`)
and trained in the rollout where the seat decides again or its game ends, with the target a long
rollout would give it. So every target is built from slot-0 values, the ones the net gives for the
seat deciding, and from real scores. `--bootstrap acting`, the old reading, instead closes every
seat's chain at the rollout's end with the value the net gives that seat from the view of whichever
seat is acting there: an other-slot value whenever another seat is, which slot 0 was never trained
to agree with. A resumed run keeps the bootstrap it was trained with (a checkpoint from before the
choice existed was trained with `acting`).

**Slot 0 also learns real outcomes** (`--outcome-share`, `--vz`). A GAE return is cut at the
rollout's end and closed with slot 0's own value, so a game's real outcome reaches its opening
decisions only through a chain of bootstrapped targets as many rollouts long as the game: about
eighteen. Whatever the head reads wrong at the opening, the chain carries back to it, and the
policy's advantages, differences of the head, carry it too. So a random share of each rollout's
learner decisions waits in a store (`Outcomes`) until its game ends, and each is then trained once,
the value alone, on its seat's final score: the target AlphaZero's z is, at every stage of a game.
The same entries, read before the update trains on them, are the log's calibration readings
(`outcome_*`). A resumed run keeps its share; the store is not saved and starts empty, as the
carry does.

**The league** seats the learner's opponents by share (`league_mix`): copies of the learner, the
snapshot slots, GD's personas, and greedy in what they leave. The snapshot slots hold the anchors
(`--league-fixed`) for good and the run's own snapshots in the rest. A best response to one frozen
net (an exploiter) gives it every slot and every seat: `--league-fixed <it> --snapshots 1
--snapshot-share 1 --self-share 0 --gd-share 0`, with `--snapshot-cap` raised to most of the batch,
since that one net then makes most of the decisions. A frozen net observes as its own checkpoint
does, the clock included. A pool of other runs' strong networks (`--league-pool`) starts a run's
league ahead of its own snapshots and is drawn, recorded and kept exactly as they are; a pool net is
of the learner's shape, and one without the clock joins a run with it at zero clock weight.

**Moving averages of the weights** (`--ema`): at a constant learning rate a run jitters round an
optimum, and an exponential moving average of its weights over some iterations sits nearer the
middle. Each horizon's average is saved beside each snapshot as `ema<h>-<iter>.pt`, a plain state
dict the ladder, the panel and `pairs` read. It is a reading device only: it changes no training,
no league and no random draw.

`--actions` chooses a new network's action space (`actions.py`): the buckets, or the exact space,
which `--init` may start from a bucket-space checkpoint's trunk and main heads, its argument head
fresh. The league, the evaluations and the panel seat each network in its own space.

Two levers on the stall, each off by default: `--time-discount` discounts a win's score by the
game's length (`env.py`, "A sooner win"), so `learner_score` and the value targets are then on the
discounted scale and `learner_score_undiscounted` is logged beside them; `--obs-turn` gives a new
network the clock, the turns left before its game's cap (`obs.py`), which `--init` from a net
without it starts at zero weight. A resumed run keeps both, as it keeps every `RECIPE` choice.
"""

import argparse
import json
import math
import os
import random
import sys
import time
from dataclasses import asdict

import torch

from ..board import CARDS, MAX_SEATS, Board
from ..data import DATA
from ..options import options
from ..state import LAYOUT, State
from ..tables import BlitzTables
from .actions import legal_main
from .env import GD, GD_PERSONAS, GREEDY, KEPT, LEARNER, LOG_FIELDS, SNAPSHOT, Env, EnvConfig
from .net import Net, evaluate, init_from, shape_of
from .obs import observe, slots
from .verdict import panel_readings, verdict

GPU = os.path.dirname(DATA)
RUNS = os.path.join(GPU, "runs", "selfplay")


def rebuild(buf: dict, t: torch.Tensor, b: torch.Tensor) -> State:
    return state_of(lambda name: buf[name][t, b], t)


def state_of(at, t: torch.Tensor) -> State:
    """The kept state of the rows `t` indexes, each field read by `at(name)`."""
    n = t.shape[0]
    fields = {name: at(name) for name in KEPT}
    fields["rng"] = torch.zeros(n, dtype=torch.int64, device=t.device)
    fields["deck"] = torch.full((n, CARDS), -1, dtype=torch.int8, device=t.device)
    return State(**{name: fields[name] for name in LAYOUT})


# What a held-back decision keeps of the buffer: what `update` rebuilds it from and trains it on.
CARRIED = KEPT + list(LOG_FIELDS) + ["main", "amount", "logp", "value", "cap"]


class Carry:
    """Each learner seat's pending decision, `[6 seats, B rows]`: its last decision in a rollout
    whose game ran on past the rollout's end, held until a later rollout gives it a successor (the
    seat's next own decision, or its game's end). A seat has at most one: its next decision either
    completes it or comes after a game end that does. `age` counts the rollout ends it has crossed,
    so a decision trained at age k was taken by the policy of k updates ago."""

    def __init__(self, buf: dict, batch: int, device):
        self.fields = {name: torch.zeros(MAX_SEATS, *buf[name].shape[1:], dtype=buf[name].dtype, device=device)
                       for name in CARRIED}
        self.held = torch.zeros(MAX_SEATS, batch, dtype=torch.bool, device=device)
        self.age = torch.zeros(MAX_SEATS, batch, dtype=torch.int64, device=device)

    def at(self, buf: dict, name: str, t: torch.Tensor, b: torch.Tensor) -> torch.Tensor:
        """A field of the samples `(t, b)` index in the buffer and the carry together: `t` below
        the horizon is a buffer step, `horizon + k` seat k's held decision."""
        T = buf[name].shape[0]
        mine = buf[name][t.clamp(max=T - 1), b]
        held = self.fields[name][(t - T).clamp(min=0), b]
        return torch.where((t < T).view(-1, *([1] * (mine.dim() - 1))), mine, held)

    def hold(self, env: Env, targets: dict) -> dict:
        """After the update: drops the decisions just trained, ages the rest, and holds this
        rollout's newly pending ones. Returns the carry's readings for the log."""
        trained = targets["complete"]
        out = {"carried": int(targets["hold"].sum()), "carried_trained": int(trained.sum())}
        if out["carried_trained"]:
            ages = self.age[trained].float()
            out["carried_age"] = float(ages.mean())
            out["carried_age_max"] = int(ages.max())
        self.held &= ~trained
        self.age += self.held
        t, b = targets["hold"].nonzero(as_tuple=True)
        seat = env.buf["active"][t, b].to(torch.int64)
        assert not bool(self.held[seat, b].any()), "a seat held two pending decisions at once"
        for name in CARRIED:
            self.fields[name][seat, b] = env.buf[name][t, b]
        self.held[seat, b] = True
        self.age[seat, b] = 1
        return out


# What the outcome store keeps of a decision to rebuild its observation.
STORED = KEPT + list(LOG_FIELDS) + ["cap"]


class Outcomes:
    """A fixed-capacity store of learner decisions waiting on their game's real outcome (the module's
    docstring). Each entry is a decision's kept state, its row, acting seat and `game_id`; it waits
    until that row ends that game, then is ready, its target the seat's final score, and leaves the
    store once an update has trained it. A full store overwrites its oldest entries, counting them.
    Its random draws come from a generator of its own, so it changes no game the env plays."""

    def __init__(self, buf: dict, capacity: int, device, seed: int):
        self.fields = {name: torch.zeros(capacity, *buf[name].shape[2:], dtype=buf[name].dtype, device=device)
                       for name in STORED}
        self.row = torch.zeros(capacity, dtype=torch.int64, device=device)
        self.seat = torch.zeros(capacity, dtype=torch.int64, device=device)
        self.game = torch.zeros(capacity, dtype=torch.int64, device=device)
        self.target = torch.zeros(capacity, dtype=torch.float32, device=device)
        self.born = torch.zeros(capacity, dtype=torch.int64, device=device)  # the rollout it was taken in
        self.order = torch.zeros(capacity, dtype=torch.int64, device=device)  # insertion order, for the oldest
        self.used = torch.zeros(capacity, dtype=torch.bool, device=device)
        self.ready = torch.zeros(capacity, dtype=torch.bool, device=device)
        self.capacity, self.rollouts, self.inserted = capacity, 0, 0
        self.generator = torch.Generator(device=device).manual_seed(seed)

    def store(self, buf: dict, share: float) -> int:
        """Copies a random `share` of the rollout's learner decisions in; returns how many entries
        were dropped to make room."""
        self.rollouts += 1
        t, b = buf["learner"].nonzero(as_tuple=True)
        take = torch.rand(t.shape[0], generator=self.generator, device=t.device) < share
        t, b = t[take], b[take]
        dropped = max(0, t.shape[0] - self.capacity)
        t, b = t[dropped:], b[dropped:]
        n = t.shape[0]
        free = (~self.used).nonzero()[:, 0]
        if free.shape[0] >= n:
            slots = free[:n]
        else:
            over = n - free.shape[0]
            age = torch.where(self.used, self.order, torch.iinfo(torch.int64).max)
            slots = torch.cat([free, age.topk(over, largest=False).indices])
            dropped += over
        for name in STORED:
            self.fields[name][slots] = buf[name][t, b]
        self.row[slots] = b
        self.seat[slots] = buf["active"][t, b].to(torch.int64)
        self.game[slots] = buf["game_id"][t, b]
        self.born[slots] = self.rollouts
        self.order[slots] = self.inserted + torch.arange(n, device=slots.device)
        self.used[slots] = True
        self.ready[slots] = False
        self.inserted += n
        return dropped

    def resolve(self, buf: dict) -> None:
        """Makes ready every waiting entry whose game ended in the rollout, its target its seat's
        score there. A row's k-th game end in the rollout ends the game it began the rollout in plus
        k, so an entry finds its own game's end by its `game_id`."""
        ended = buf["ended"]
        ends = ended.sum(0)
        most = int(ends.max())
        if most == 0:
            return
        t, b = ended.nonzero(as_tuple=True)
        rank = ended.cumsum(0) - 1
        final = torch.zeros(ended.shape[1], most, MAX_SEATS, device=ended.device)
        final[b, rank[t, b]] = buf["reward"][t, b]
        waiting = self.used & ~self.ready
        k = self.game - buf["game_id"][0][self.row]
        assert not bool((waiting & (k < 0)).any()), "an entry waits on a game its row ended in an earlier rollout"
        now = waiting & (k < ends[self.row])
        self.target = torch.where(now, final[self.row, k.clamp(0, most - 1), self.seat], self.target)
        self.ready |= now

    def value(self, net: Net, env: Env, idx: torch.Tensor) -> torch.Tensor:
        """Slot 0's value at the entries `idx`, their observations rebuilt as `update` rebuilds a sample's."""
        def at(name: str) -> torch.Tensor:
            return self.fields[name][idx]

        s = state_of(at, idx)
        with torch.no_grad():
            o = options(s, env.board)
            node, slot, glob = observe(s, o, at("placed_on"), at("attacks"), at("captured"), env.board,
                                       at("cap") if net.clock else None)
        with torch.autocast("cuda", dtype=torch.bfloat16, enabled=env.cfg.bf16):
            _, value, _ = net.heads_main(net.trunk(node, slot, glob))
        return value[:, 0].float()

    @torch.no_grad()
    def readings(self, net: Net, env: Env, chunk: int) -> dict:
        """The head against real outcomes on the ready entries, read before the update trains on
        them: its squared error and bias, and the bias split at the median of how many rollouts an
        entry waited (`early`, the longer waits: decisions taken earlier in their games)."""
        ready = self.ready.nonzero()[:, 0]
        out = {"outcome_ready": ready.shape[0], "outcome_waiting": int((self.used & ~self.ready).sum())}
        if not ready.shape[0]:
            return out
        v = torch.cat([self.value(net, env, part) for part in ready.split(chunk)])
        y = self.target[ready]
        out["outcome_mse"] = float(((v - y) ** 2).mean())
        out["outcome_bias"] = float(v.mean() - y.mean())
        waited = torch.argsort(self.rollouts - self.born[ready], stable=True)
        half = ready.shape[0] // 2
        for name, part in (("late", waited[:half]), ("early", waited[half:])):
            if part.shape[0]:
                out[f"outcome_bias_{name}"] = float(v[part].mean() - y[part].mean())
        return out

    def release(self, idx: torch.Tensor) -> None:
        self.used[idx] = False
        self.ready[idx] = False


def by_slot(values: torch.Tensor, seat_of_slot: torch.Tensor) -> torch.Tensor:
    """`[N, 6]` by seat → by slot (0 where the slot is absent)."""
    out = values.gather(1, seat_of_slot.clamp(min=0))
    return torch.where(seat_of_slot >= 0, out, 0.0)


def potential(owner: torch.Tensor, armies: torch.Tensor) -> torch.Tensor:
    """`[N, 6]` by seat: the shaping potential Φ, half the seat's share of the territories and
    half its share of the armies."""
    held = torch.nn.functional.one_hot(owner.to(torch.int64).clamp(min=0), MAX_SEATS).float()
    held = held * (owner >= 0)[..., None]
    land = held.mean(1)
    troops = (held * armies.float()[..., None]).sum(1)
    return 0.5 * land + 0.5 * troops / troops.sum(1, keepdim=True).clamp(min=1)


def link_lam(turn: torch.Tensor, next_turn: torch.Tensor, lam: float, lam_turn: float) -> torch.Tensor:
    """Each link's λ: `lam` between two decisions of one turn, `lam_turn` across a turn's end."""
    return torch.where(turn == next_turn, torch.tensor(lam, device=turn.device),
                       torch.tensor(lam_turn, device=turn.device))


def advantages(env: Env, boot: torch.Tensor | None, lam: float, shaping: float = 0.0,
               carry: Carry | None = None, lam_turn: float | None = None) -> dict:
    """GAE over each seat's chain of learner decisions. A link decays by `lam`, or by `lam_turn`,
    when given, where it crosses from one of the seat's turns to its next: where the two decisions'
    `turn`, the game's player-turn counter, differs. With `shaping`, each link also earns
    shaping × (Φ at the seat's next decision − Φ at this one), Φ 0 once the game has ended: over a
    game the extra rewards sum to −shaping × Φ at its first decision, so they move credit earlier
    without changing which policy is best (Ng et al., potential-based shaping).

    Where a chain is cut at the rollout's end, one of two things (the module's docstring):
    `boot` (`[B, 6]` by seat, `Env.bootstrap`) closes every chain with its value, or `carry`
    holds each chain's last decision back (`hold`, the decisions newly held) and completes the
    ones held from earlier rollouts whose successor this rollout reached (`complete`, `[6, B]`).
    With the carry the λ-return of the decisions before a held one is truncated at it, its value
    their bootstrap, as a single rollout ending on that decision would be. `train` marks the
    samples the update takes: `[T, B]` buffer steps, then with the carry `[6, B]` held decisions
    as steps `T + seat` (`Carry.at`)."""
    assert (boot is None) != (carry is None), "close the chains with a bootstrap or carry them, one of the two"
    buf, T, B = env.buf, env.cfg.horizon, env.cfg.batch
    device = buf["value"].device
    rows = torch.arange(B, device=device)
    next_v = boot.clone() if boot is not None else torch.zeros(B, MAX_SEATS, device=device)
    next_a = torch.zeros_like(next_v)
    next_turn = torch.zeros(B, MAX_SEATS, dtype=buf["turn"].dtype, device=device) if lam_turn is not None else None
    next_phi = None
    if shaping:
        next_phi = (shaping * potential(env.state.owner, env.state.armies) if boot is not None
                    else torch.zeros_like(next_v))
    pending = torch.zeros_like(next_v)
    final = torch.zeros_like(next_v)
    final_ok = torch.zeros(B, dtype=torch.bool, device=device)
    adv = torch.zeros(T, B, device=device)
    mc = torch.zeros(T, B, MAX_SEATS, device=device)
    mc_ok = torch.zeros(T, B, dtype=torch.bool, device=device)
    # With the carry: the seats whose chain is still open at the rollout's end, reached by
    # neither a decision of theirs nor a game end since step t.
    open_ = torch.ones(B, MAX_SEATS, dtype=torch.bool, device=device) if carry is not None else None
    hold = torch.zeros(T, B, dtype=torch.bool, device=device)
    for t in reversed(range(T)):
        ended = buf["ended"][t]
        reward = buf["reward"][t]
        next_v = torch.where(ended[:, None], 0.0, next_v)
        next_a = torch.where(ended[:, None], 0.0, next_a)
        if next_phi is not None:
            next_phi = torch.where(ended[:, None], 0.0, next_phi)
        pending = torch.where(ended[:, None], reward, pending)
        final = torch.where(ended[:, None], reward, final)
        final_ok = final_ok | ended
        a = buf["active"][t].to(torch.int64)
        v = buf["value"][t]
        delta = pending[rows, a] + next_v[rows, a] - v
        if next_phi is not None:
            phi = shaping * potential(buf["owner"][t], buf["armies"][t])[rows, a]
            delta = delta + torch.where(buf["learner"][t], next_phi[rows, a] - phi, 0.0)
        if next_turn is None:
            advantage = delta + lam * next_a[rows, a]
        else:
            turn = buf["turn"][t]
            advantage = delta + link_lam(turn, next_turn[rows, a], lam, lam_turn) * next_a[rows, a]
        # Only the learner's own decisions are links in a seat's chain; other rows pass through.
        mine = buf["learner"][t]
        if open_ is not None:
            open_ = open_ & ~ended[:, None]
            last = mine & open_[rows, a]
            hold[t] = last
            # Held back: nothing past it is known, so the links before it stop their λ-sum here.
            advantage = torch.where(last, 0.0, advantage)
            open_[rows, a] = open_[rows, a] & ~mine
        adv[t] = advantage
        next_v[rows, a] = torch.where(mine, v, next_v[rows, a])
        next_a[rows, a] = torch.where(mine, advantage, next_a[rows, a])
        if next_turn is not None:
            next_turn[rows, a] = torch.where(mine, turn, next_turn[rows, a])
        if next_phi is not None:
            next_phi[rows, a] = torch.where(mine, phi, next_phi[rows, a])
        pending[rows, a] = torch.where(mine, 0.0, pending[rows, a])
        mc[t] = final
        mc_ok[t] = final_ok
    if carry is None:
        return {"adv": adv, "ret": adv + buf["value"], "mc": mc, "mc_ok": mc_ok, "train": buf["learner"]}

    # The held decisions: at step 0 each one's game is still the row's, so the chain's state there
    # (by seat, `[B, 6]`, turned to `[6, B]`) is what follows it.
    complete = carry.held & ~open_.T
    v_c = carry.fields["value"]
    if next_turn is None:
        adv_c = pending.T + next_v.T - v_c + lam * next_a.T
    else:
        adv_c = pending.T + next_v.T - v_c + link_lam(carry.fields["turn"], next_turn.T, lam, lam_turn) * next_a.T
    if next_phi is not None:
        seats = torch.arange(MAX_SEATS, device=device)
        held_phi = potential(carry.fields["owner"].flatten(0, 1), carry.fields["armies"].flatten(0, 1))
        phi_c = shaping * held_phi.view(MAX_SEATS, B, MAX_SEATS)[seats, :, seats]
        adv_c = adv_c + next_phi.T - phi_c
    adv_c = torch.where(complete, adv_c, 0.0)
    return {"adv": torch.cat([adv, adv_c]), "ret": torch.cat([adv + buf["value"], adv_c + v_c]),
            "mc": torch.cat([mc, final[None].expand(MAX_SEATS, -1, -1)]),
            "mc_ok": torch.cat([mc_ok, final_ok[None].expand(MAX_SEATS, -1)]),
            "train": torch.cat([buf["learner"] & ~hold, complete]), "hold": hold, "complete": complete}


def value_health(env: Env, targets: dict) -> dict:
    """The value head read against real outcomes, beside the trainer's explained variance (which is
    read against the GAE returns, themselves mostly the head's own predictions):

    - `fresh_value`: the mean slot-0 value at each learner seat's first decision in a game dealt
      inside this rollout, overall and by table size (`fresh_value_<players>`). Read beside
      `learner_score`, the mean real score of the learner seats whose games ended: an unbiased head
      brings the two together.
    - `ended_explained`: the explained variance of slot 0 against the seat's real final score, over
      the learner decisions whose game ended inside this rollout. It covers only a game's last steps
      (at most one rollout before its end), where the outcome is nearly settled: it says nothing of
      the head's reading of a game's opening.

    A reading with no decisions this rollout is left out, and the explained variance where every
    outcome was the same, since it has none to explain."""
    buf, T, B = env.buf, env.cfg.horizon, env.cfg.batch
    rows = torch.arange(B, device=env.device)
    sizes = len(env.cfg.sizes)
    seen = torch.zeros(B, MAX_SEATS, dtype=torch.bool, device=env.device)
    fresh = torch.zeros(B, dtype=torch.bool, device=env.device)
    total = torch.zeros(sizes, device=env.device)
    count = torch.zeros(sizes, device=env.device)
    for t in range(T):
        if t > 0:
            dealt = buf["game_id"][t] != buf["game_id"][t - 1]
            fresh = fresh | dealt
            seen = seen & ~dealt[:, None]
        a = buf["active"][t].to(torch.int64)
        mine = buf["learner"][t]
        first = mine & fresh & ~seen[rows, a]
        seen[rows, a] = seen[rows, a] | mine
        total.index_add_(0, env.size_index, torch.where(first, buf["value"][t], 0.0))
        count.index_add_(0, env.size_index, first.float())
    out = {}
    if count.sum() > 0:
        out["fresh_value"] = float(total.sum() / count.sum())
        out["fresh_n"] = int(count.sum())
        for k, players in enumerate(env.cfg.sizes):
            if count[k] > 0:
                out[f"fresh_value_{players}"] = float(total[k] / count[k])
    ended = buf["learner"] & targets["mc_ok"][:T]
    seat = buf["active"].to(torch.int64)
    y = targets["mc"][:T].gather(2, seat[..., None])[..., 0][ended]
    if y.numel() > 1 and float(y.var()) > 0:
        v = buf["value"][ended]
        out["ended_explained"] = float(1 - (y - v).var() / y.var())
        out["ended_n"] = y.numel()
    return out


def minibatches(perm: torch.Tensor, size: int) -> tuple[torch.Tensor, ...]:
    """`perm`'s samples in ⌈n / size⌉ minibatches of nearly equal size. Never a short remainder: each
    minibatch normalises its own advantages, and one of a single sample has no spread to normalise
    by (b1's iteration 194: 524,289 samples, a last minibatch of one, whose NaN took every weight)."""
    n = perm.shape[0]
    assert n != 1, "one sample has no advantage spread to normalise by"
    return torch.tensor_split(perm, max(1, -(-n // size)))


class NonFinite(RuntimeError):
    """A loss or gradient that isn't finite, caught before the optimizer step. `report` says where
    (JSON); `tensors` hold what reproduces it: the chunk's samples as the update read them and the
    minibatch's indices and advantages."""

    def __init__(self, report: dict, tensors: dict):
        super().__init__(json.dumps(report))
        self.report, self.tensors = report, tensors


def policy_ages(carry: Carry | None, t: torch.Tensor, b: torch.Tensor, T: int) -> torch.Tensor:
    """How many updates old the policy that took each sample is: 0 for this rollout's, a held
    decision's age for one from the carry."""
    if carry is None:
        return torch.zeros_like(t)
    return torch.where(t >= T, carry.age[(t - T).clamp(min=0, max=MAX_SEATS - 1), b], 0)


class Averages:
    """Exponential moving averages of a network's floating-point weights, one per horizon in
    iterations. Each optimizer step moves an average toward the weights by 1 / (h × the
    iteration's steps), so it spans about h iterations whatever the minibatch count."""

    def __init__(self, net: torch.nn.Module, horizons: list[int], kept: dict[int, dict] | None = None):
        kept = kept or {}
        self.states = {h: kept[h] if h in kept else {k: v.detach().clone() for k, v in net.state_dict().items()}
                       for h in horizons}

    @torch.no_grad()
    def step(self, net: torch.nn.Module, steps: int) -> None:
        weights = net.state_dict()
        for h, state in self.states.items():
            for k, avg in state.items():
                if avg.is_floating_point():
                    avg.lerp_(weights[k], 1 / (h * steps))


def update(net: Net, opt: torch.optim.Optimizer, env: Env, targets: dict, args, carry: Carry | None = None,
           averages: Averages | None = None, outcomes: Outcomes | None = None) -> dict:
    """PPO epochs over `targets["train"]`'s samples. A held decision (with the carry) is trained on
    its own target and its value targets; it has no auxiliary target, its look-ahead lying in a
    rollout no longer kept. One taken more than `args.carry_policy_age` updates ago (0: no limit)
    trains the value only: PPO's ratio is a correction for a policy an update or so old, and a
    stale decision's ratio, unclipped wherever it falls on the pessimistic side, is a gradient from
    a policy that no longer exists.

    With `outcomes`, each epoch also takes every ready entry once, a share with each minibatch:
    `args.vz` times slot 0's squared error against the entry's real outcome joins the minibatch's
    loss, the value alone trained on it. The entries trained leave the store.

    A loss or gradient that isn't finite raises `NonFinite` before the optimizer steps, so the
    weights stay the last finite ones."""
    buf, board, H = env.buf, env.board, env.cfg.aux_steps
    T = env.cfg.horizon
    idx = targets["train"].nonzero()
    n = idx.shape[0]
    sums = {"pg": 0.0, "v": 0.0, "vo": 0.0, "aux": 0.0, "ent": 0.0, "kl": 0.0, "clip": 0.0}
    count = 0
    limit = args.carry_policy_age
    ready = outcomes.ready.nonzero()[:, 0] if outcomes is not None else None
    vz_sum, vz_steps = 0.0, 0
    if averages is not None and n:
        steps = args.epochs * len(minibatches(idx, args.minibatch))
    for epoch in range(args.epochs):
        perm = idx[torch.randperm(n, device=idx.device)]
        parts = minibatches(perm, args.minibatch) if n else ()
        shares = ()
        if ready is not None and ready.shape[0] and parts:
            order = torch.randperm(ready.shape[0], generator=outcomes.generator, device=ready.device)
            shares = torch.tensor_split(ready[order], len(parts))
        for k, mb in enumerate(parts):
            mb_adv = targets["adv"][mb[:, 0], mb[:, 1]]
            adv_mean, adv_std = mb_adv.mean(), mb_adv.std() + 1e-8
            opt.zero_grad(set_to_none=False)
            # A minibatch larger than fits in memory is taken in chunks, its gradient summed before the step.
            for c0 in range(0, mb.shape[0], args.chunk):
                part = mb[c0:c0 + args.chunk]
                weight = part.shape[0] / mb.shape[0]
                t, b = part[:, 0], part[:, 1]

                def at(name: str) -> torch.Tensor:
                    return buf[name][t, b] if carry is None else carry.at(buf, name, t, b)

                s = state_of(at, t)
                with torch.no_grad():
                    o = options(s, board)
                    legal = legal_main(o, net.exact)
                    node, slot, glob = observe(s, o, at("placed_on"), at("attacks"), at("captured"), board,
                                               at("cap") if net.clock else None)
                    seat_of_slot, _ = slots(s)
                    adv = (targets["adv"][t, b] - adv_mean) / adv_std
                    ret = targets["ret"][t, b]
                    mc = by_slot(targets["mc"][t, b], seat_of_slot)
                    mc_ok = targets["mc_ok"][t, b][:, None] & (seat_of_slot >= 0)
                    mc_ok[:, 0] = False
                    # A held decision's step is past the buffer (`t` ≥ T), so it has no look-ahead.
                    ahead = (t + H).clamp(max=T - 1)
                    aux_ok = ((t + H) < T) & (buf["game_id"][ahead, b] == buf["game_id"][t.clamp(max=T - 1), b])
                    aux_target = by_slot(buf["share"][ahead, b], seat_of_slot)
                    aux_mask = aux_ok[:, None] & (seat_of_slot >= 0)
                    logp_then = at("logp")
                    policy = policy_ages(carry, t, b, T) <= limit if limit else None
                with torch.autocast("cuda", dtype=torch.bfloat16, enabled=env.cfg.bf16):
                    logp, entropy_rows, value, aux = evaluate(net, node, slot, glob, legal, at("main"), at("amount"),
                                                              s, o, board)
                value, aux = value.float(), aux.float()
                entropy = entropy_rows.mean()
                ratio = torch.exp(logp - logp_then)
                pg_rows = -torch.minimum(ratio * adv, ratio.clamp(1 - args.clip, 1 + args.clip) * adv)
                pg = (pg_rows if policy is None else torch.where(policy, pg_rows, 0.0)).mean()
                v_loss = ((value[:, 0] - ret) ** 2).mean()
                vo_loss = (((value - mc) ** 2) * mc_ok).sum() / mc_ok.sum().clamp(min=1)
                aux_loss = (((aux - aux_target) ** 2) * aux_mask).sum() / aux_mask.sum().clamp(min=1)
                terms = {"pg": float(pg), "v": float(v_loss), "vo": float(vo_loss), "aux": float(aux_loss),
                         "ent": float(entropy)}
                if not all(math.isfinite(x) for x in terms.values()):
                    rows = {"adv": adv, "ret": ret, "logp_then": logp_then, "logp": logp, "entropy": entropy_rows,
                            "value": value, "aux": aux, "mc": mc}
                    raise NonFinite(
                        {"term": [k for k, x in terms.items() if not math.isfinite(x)], "epoch": epoch, "minibatch": k,
                         "minibatch_size": mb.shape[0], "chunk_start": c0, "adv_mean": float(adv_mean),
                         "adv_std": float(adv_std), "rows": offending(rows, t, b, T, carry, buf)},
                        {"mb": mb.cpu(), "mb_adv": mb_adv.cpu(), "chunk": part.cpu(),
                         "samples": {name: at(name).cpu() for name in CARRIED},
                         "ret": ret.cpu(), "mc": targets["mc"][t, b].cpu(), "mc_ok": targets["mc_ok"][t, b].cpu()})
                loss = pg + args.vf * v_loss + args.vo * vo_loss + args.aux * aux_loss - args.ent * entropy
                (loss * weight).backward()
                with torch.no_grad():
                    for name, x in terms.items():
                        sums[name] += x * weight
                    sums["kl"] += float((logp_then - logp).mean()) * weight
                    sums["clip"] += float(((ratio - 1).abs() > args.clip).float().mean()) * weight
            share = shares[k] if shares else ()
            for c0 in range(0, len(share), args.chunk):
                part = share[c0:c0 + args.chunk]
                vz = ((outcomes.value(net, env, part) - outcomes.target[part]) ** 2).mean()
                if not math.isfinite(float(vz)):
                    raise NonFinite({"term": ["vz"], "epoch": epoch, "minibatch": k, "outcomes": share.shape[0],
                                     "chunk_start": c0}, {"entries": part.cpu(), "target": outcomes.target[part].cpu()})
                weight = part.shape[0] / share.shape[0]
                (args.vz * vz * weight).backward()
                vz_sum += float(vz) * weight
            vz_steps += len(share) > 0
            norm = float(torch.nn.utils.clip_grad_norm_(net.parameters(), args.grad_clip))
            if not math.isfinite(norm):
                bad = [name for name, p in net.named_parameters() if p.grad is not None and not bool(torch.isfinite(p.grad).all())]
                raise NonFinite({"term": ["gradient"], "epoch": epoch, "minibatch": k, "minibatch_size": mb.shape[0],
                                 "grad_norm": norm, "parameters": bad},
                                {"mb": mb.cpu(), "mb_adv": mb_adv.cpu()})
            opt.step()
            if averages is not None:
                averages.step(net, steps)
            count += 1
    out = {k: v / max(count, 1) for k, v in sums.items()}
    out["samples"] = n
    if limit:
        out["carried_value_only"] = int((policy_ages(carry, idx[:, 0], idx[:, 1], T) > limit).sum())
    if vz_steps:
        out["vz"] = vz_sum / vz_steps
        outcomes.release(ready)
    return out


def offending(rows: dict, t: torch.Tensor, b: torch.Tensor, T: int, carry: Carry | None, buf: dict) -> list[dict]:
    """The samples of a chunk where any per-row quantity isn't finite, by identity: the buffer step
    and row (with the game), or the held seat and its age; the quantities each fails on."""
    bad = {name: ~torch.isfinite(x).reshape(x.shape[0], -1).all(1) for name, x in rows.items()}
    out = []
    for i in torch.stack(list(bad.values())).any(0).nonzero()[:, 0].tolist():
        step, row = int(t[i]), int(b[i])
        where = {"step": step, "row": row}
        if step >= T:
            seat = step - T
            where.update(held_seat=seat, age=int(carry.age[seat, row]))
        else:
            where.update(game_id=int(buf["game_id"][step, row]))
        where["fails"] = [name for name, m in bad.items() if bool(m[i])]
        out.append(where)
    return out


def summarize(stats: dict, kinds: list[str]) -> dict:
    # `unserved`: the decisions due that waited a step past their controller's capacity, by
    # controller (logs from before it split them call the total `stalled`).
    out = {"games": stats["games"], "capped": stats["capped"] / max(stats["games"], 1),
           "unserved": int(sum(stats["unserved"])), "longest_wait": stats["longest_wait"],
           "overflow": stats["overflow"], "turns": stats["turns"] / max(stats["games"], 1)}
    for k, name in enumerate(kinds):
        if stats["unserved"][k] > 0:
            out[f"{name}_unserved"] = int(stats["unserved"][k])
        seats = stats["seats"][k]
        if seats > 0:
            out[f"{name}_score"] = stats["score"][k] / seats
            if "score_undiscounted" in stats:
                out[f"{name}_score_undiscounted"] = stats["score_undiscounted"][k] / seats
            out[f"{name}_win"] = stats["wins"][k] / max(stats["decisive_seats"][k], 1)
            out[f"{name}_seats"] = seats
    # The learner's seats again, by table size and by the slot-0 value each read at its first
    # decision of the game: beside `learner_score`, the head's opening bias on the same seats.
    for players, score, seats in zip(stats["sizes"], stats["size_score"], stats["size_seats"]):
        if seats > 0:
            out[f"learner_score_{players}"] = score / seats
            out[f"learner_seats_{players}"] = seats
    if stats["first_n"] > 0:
        out["ended_first_value"] = stats["first_value"] / stats["first_n"]
        out["ended_first_n"] = stats["first_n"]
    return out


KIND_NAMES = ["learner", "greedy"] + [f"gd-{p}" for p in GD_PERSONAS]


class Evaluator:
    """Fixed deals played to their end, the learner (its most likely move) in one seat against one
    opponent kind (greedy or a GD persona) in the rest: its win rate among decisive games against
    par (one seat in n), its mean score, and the cap rate. The same seeds every time, so
    evaluations compare."""

    def __init__(self, board, tables, net, players: int, games: int, device: str, opponent: str = "greedy",
                 gd_bots: list | None = None, greedy: bool = True, bf16: bool = True):
        kind = KIND_NAMES.index(opponent)
        cfg = EnvConfig(batch=games, sizes=(players,), size_weights=(1.0,), cap_low=600, cap_high=600,
                        pool=8, snapshots=0, record=False, reset=False, learner_greedy=greedy,
                        gd=kind >= GD, cap_gd=(0.9,) * len(GD_PERSONAS), cap_learner=0.5, cap_greedy=1.0, bf16=bf16)
        self.env = Env(cfg, board, tables, net, device, seed_prefix=f"eval{players}",
                       gd_bots=[gd_bots[kind - GD]] if kind >= GD else None)
        if kind >= GD:
            # One persona's bot, in the first GD slot: the seats are that kind.
            kind = GD
        self.env.kind_probs.zero_()
        self.env.kind_probs[kind] = 1.0
        self.env._draw_seats(torch.ones(games, dtype=torch.bool, device=device))
        self.players, self.opponent, self.kind = players, opponent, kind
        self.saved = self.env._save()
        self.env.capture()

    def run(self) -> dict:
        env = self.env
        env._restore(self.saved)
        steps = 0
        while True:
            env.run(64)
            steps += 64
            if bool(env.done.all()) or steps > 40000:
                break
        st = env.take_stats()
        decisive = st["games"] - st["capped"]
        win = st["wins"][LEARNER] / max(decisive, 1)
        return {"players": self.players, "opponent": self.opponent, "games": st["games"], "capped": st["capped"] / max(st["games"], 1),
                "win": win, "par": 1 / self.players, "score": st["score"][LEARNER] / max(st["seats"][LEARNER], 1),
                "opponent_score": st["score"][self.kind] / max(st["seats"][self.kind], 1), "steps": steps,
                "unfinished": float((~env.done).sum())}


def seat_draw(kinds: torch.Tensor, games: int, players: int) -> tuple[torch.Tensor, torch.Tensor]:
    """Fixed seatings for a ladder: `(pick [games, players]` index into `kinds`, `seat_kind [games, 6])`,
    distinct kinds per game while there are enough, the same draw every time."""
    g = torch.Generator().manual_seed(12345)
    if len(kinds) >= players:
        pick = torch.rand(games, len(kinds), generator=g).argsort(1)[:, :players]
    else:
        pick = torch.randint(0, len(kinds), (games, players), generator=g)
    seat_kind = torch.full((games, MAX_SEATS), GREEDY, dtype=torch.int64)
    seat_kind[:, :players] = kinds[pick]
    return pick, seat_kind


def luce_elo(pick: torch.Tensor, winner: torch.Tensor, n: int) -> tuple[list[float], int]:
    """Win Elo of each of `n` entrants (the first at 0) by a Luce fit over who won each decisive
    game (Hunter's MM); `pick [games, players]` the entrant in each seat, `winner [games]` the
    winning seat or −1."""
    decisive = winner >= 0
    seated = pick[decisive]
    wins = torch.zeros(n)
    won_by = seated.gather(1, winner[decisive][:, None])[:, 0]
    wins.index_add_(0, won_by, torch.ones_like(won_by, dtype=torch.float32))
    counts = torch.zeros(seated.shape[0], n)
    counts.scatter_add_(1, seated, torch.ones_like(seated, dtype=torch.float32))
    gamma = torch.ones(n)
    for _ in range(500):
        denom = (counts / (counts @ gamma)[:, None]).sum(0)
        gamma = torch.where(denom > 0, wins.clamp(min=0.5) / denom, gamma)
        gamma = gamma / gamma[0]
    return (400 * torch.log10(gamma)).tolist(), int(decisive.sum())


class PairEval:
    """The head-to-head test against one fixed network (the progress metric, `ideas/gpu-engine.md`):
    the learner alone among copies of it (one-in) on half the fixed 5-player deals, the reverse
    (one-out) on the rest, the lone seat rotated, every seat sampling (`greedy`: the learner plays its
    most likely move; `anchor_greedy`: the fixed network too, as two seated bots meet). Strength among networks is not the strength the GD evals measure (m2a-50
    crushed a net that beat GD harder), so both are watched."""

    def __init__(self, board, tables, net, anchor_label: str, anchor_path: str, games: int, device: str,
                 players: int = 5, greedy: bool = False, bf16: bool = True, anchor_greedy: bool = False):
        from .ladder import load_net
        cfg = EnvConfig(batch=games, sizes=(players,), size_weights=(1.0,), cap_low=600, cap_high=600, pool=8,
                        snapshots=0, record=False, reset=False, cap_learner=0.85, cap_snapshot=0.85, cap_greedy=0.01,
                        learner_greedy=greedy, snapshot_greedy=anchor_greedy, bf16=bf16)
        env = self.env = Env(cfg, board, tables, net, device, seed_prefix="pair")
        env.snapshots = [load_net(anchor_path, board, device)]
        env.active_snapshots = 1
        env.kind_probs = torch.zeros(SNAPSHOT + 1, device=device)
        env.stats = torch.zeros(8, SNAPSHOT + 1, dtype=torch.float64, device=device)
        self.half = games // 2
        g = torch.arange(games)
        lone = (g % players)[:, None] == torch.arange(players)[None, :]
        self.mine = torch.where(g[:, None] < self.half, lone, ~lone)  # seats the learner holds
        seat_kind = torch.full((games, MAX_SEATS), GREEDY, dtype=torch.int64)
        seat_kind[:, :players] = torch.where(self.mine, LEARNER, SNAPSHOT)
        env.seat_kind.copy_(seat_kind.to(device))
        self.label, self.players, self.games = anchor_label, players, games
        self.base = env._save()
        env.capture()

    def run(self) -> dict:
        env = self.env
        env._restore(self.base)
        steps = 0
        while not bool(env.done.all()) and steps <= 40000:
            env.run(64)
            steps += 64
        env.take_stats()
        winner = env.state.winner.to(torch.int64).cpu()
        decisive = winner >= 0
        won = torch.zeros(self.games, dtype=torch.bool)
        won[decisive] = self.mine[decisive].gather(1, winner[decisive][:, None])[:, 0]
        out = {"anchor": self.label}
        for name, rows in (("one_in", slice(0, self.half)), ("one_out", slice(self.half, None))):
            out[name] = round(int(won[rows].sum()) / max(int(decisive[rows].sum()), 1), 4)
            out[f"{name}_capped"] = int((~decisive[rows]).sum())
        return out


class MirrorEval:
    """Copies of the learner in every seat of fixed 5-player deals, each playing its most likely move
    unless `greedy` is off: the share of games that reach the cap, the stall's health reading (an
    argmax copy of imit-1 capped 4 of 10 such games, its teacher none of 160)."""

    def __init__(self, board, tables, net, games: int, device: str, players: int = 5, greedy: bool = True,
                 bf16: bool = True):
        cfg = EnvConfig(batch=games, sizes=(players,), size_weights=(1.0,), cap_low=600, cap_high=600, pool=8,
                        snapshots=0, record=False, reset=False, learner_greedy=greedy, cap_learner=1.0, cap_greedy=0.01,
                        bf16=bf16)
        env = self.env = Env(cfg, board, tables, net, device, seed_prefix="mirror")
        env.kind_probs.zero_()
        env.kind_probs[LEARNER] = 1.0
        seat_kind = torch.full((games, MAX_SEATS), GREEDY, dtype=torch.int64)
        seat_kind[:, :players] = LEARNER
        env.seat_kind.copy_(seat_kind.to(device))
        self.games = games
        self.base = env._save()
        env.capture()

    def run(self) -> dict:
        env = self.env
        env._restore(self.base)
        steps = 0
        while not bool(env.done.all()) and steps <= 40000:
            env.run(64)
            steps += 64
        st = env.take_stats()
        return {"games": st["games"], "capped": st["capped"] / max(st["games"], 1),
                "turns": st["turns"] / max(st["games"], 1), "unfinished": float((~env.done).sum())}


class Ladder:
    """The checkpoint ladder: is the network still climbing against itself, not only against the
    league's fixed bots? The current network and up to `slots` earlier checkpoints are seated
    together on fixed 5-player deals (each game's seats drawn from them, with repeats only while
    fewer than five exist), every seat playing its most likely move, and a Luce (Bradley–Terry)
    fit over who won each decisive game gives each its win Elo, the oldest at 0."""

    def __init__(self, board, tables, net, games: int, device: str, players: int = 5, slots: int = 7,
                 greedy: bool = True, bf16: bool = True):
        cfg = EnvConfig(batch=games, sizes=(players,), size_weights=(1.0,), cap_low=600, cap_high=600, pool=8,
                        snapshots=slots, record=False, reset=False, learner_greedy=greedy, snapshot_greedy=greedy,
                        cap_learner=0.5, cap_snapshot=0.5, cap_greedy=0.01, bf16=bf16)
        self.env = Env(cfg, board, tables, net, device, seed_prefix="ladder")
        self.env.active_snapshots = slots
        self.players, self.slots, self.games, self.device = players, slots, games, device
        self.base = self.env._save()
        self.env.capture()

    def run(self, past: list[tuple[str, str]], current: str) -> dict:
        """`past`: (label, state-dict path) of earlier checkpoints, oldest first."""
        from .ladder import load_net
        env = self.env
        past = past[-self.slots:]
        recapture = False
        for k, (_, path) in enumerate(past):
            state = torch.load(path, map_location=self.device, weights_only=False)
            state = state.get("net", state)
            if shape_of(state) == env.snapshots[k].config():
                env.snapshots[k].load_state_dict(state)
            else:
                # Another shape or action space (an earlier run's checkpoint): its own net, and the
                # step captured again around it.
                env.snapshots[k] = load_net(path, env.board, self.device)
                recapture = True
        if recapture:
            env.capture()
        labels = [label for label, _ in past] + [current]
        kinds = torch.tensor([SNAPSHOT + k for k in range(len(past))] + [LEARNER])
        env._restore(self.base)
        pick, seat_kind = seat_draw(kinds, self.games, self.players)
        env.seat_kind.copy_(seat_kind.to(self.device))
        steps = 0
        while not bool(env.done.all()) and steps <= 40000:
            env.run(64)
            steps += 64
        env.take_stats()
        elo, decisive = luce_elo(pick, env.state.winner.to(torch.int64).cpu(), len(labels))
        return {"ladder": {label: round(e, 1) for label, e in zip(labels, elo)},
                "ladder_games": decisive, "ladder_capped": self.games - decisive}


PRIOR_WIN, PRIOR_SEATS = 0.22, 20.0  # par at the run's mix of table sizes, worth 20 seats


def pick_by_results(candidates: list[str], k: int, record_of: dict[str, list[float]]) -> list[str]:
    """`k` of the candidates without replacement, each weighted by x², x its share of the seats it
    won while in the league (prioritized fictitious self-play): the snapshots that still beat the
    learner come back, the ones it beats fade. One never seated counts at par."""
    pool = list(candidates)
    chosen = []
    for _ in range(min(k, len(pool))):
        weights = []
        for path in pool:
            won, seats = record_of.get(path, (0.0, 0.0))
            weights.append(((won + PRIOR_WIN * PRIOR_SEATS) / (seats + PRIOR_SEATS)) ** 2)
        chosen.append(pool.pop(random.choices(range(len(pool)), weights)[0]))
    return chosen


def seat_league(league: list[str], own: int, pick: str, record_of: dict[str, list[float]]) -> list[str]:
    """The `own` entries of the league to seat in the slots after the anchors. By `results` the
    newest always and the rest by `pick_by_results`; by `recent` the newest half of the slots and the
    rest drawn from older entries: a learner must keep beating its recent selves (m2a regressed
    against them while beating the fixed bots)."""
    if pick == "results":
        return league[-1:] + pick_by_results(league[:-1], own - 1, record_of) if own else []
    n_recent = own - own // 2
    recent = league[len(league) - n_recent:] if n_recent else []
    rest = league[:len(league) - n_recent]
    return recent + random.sample(rest, min(own // 2, len(rest)))


def pool_paths(spec: str) -> list[str]:
    """`--league-pool`'s checkpoints as the league keeps its entries: relative to the GPU folder, with '/'."""
    return [os.path.relpath(os.path.join(GPU, p), GPU).replace("\\", "/") for p in spec.split(",") if p]


def league_pool(asked: str, trained: dict | None) -> list[str]:
    """The run's pool: a new run's is the one asked for, and starts its league; a resumed run's is
    its checkpoint's, already in the league it carries, and naming another is refused."""
    if trained is None:
        return pool_paths(asked)
    theirs = pool_paths(trained.get("league_pool", ""))
    assert not asked or pool_paths(asked) == theirs, \
        f"the run was trained with --league-pool {','.join(theirs) or '(none)'}: a resumed run keeps its pool"
    return theirs


def check_pool(pool: list[str], learner: dict, root: str = GPU) -> None:
    """Each pool net exists and is of the learner's shape (`Net.config()`), apart from a clock the
    learner reads and the net doesn't, which it joins with at zero weight (`init_from`)."""
    for path in pool:
        full = os.path.join(root, path)
        assert os.path.exists(full), f"--league-pool: {path} doesn't exist"
        state = torch.load(full, map_location="cpu", weights_only=False)
        theirs = shape_of(state.get("net", state))
        assert {**theirs, "clock": learner["clock"]} == learner and theirs["clock"] <= learner["clock"], \
            f"--league-pool: {path} is {theirs}, the learner {learner}: a pool net is of the learner's shape"


def league_label(path: str) -> str:
    """A league entry's name in the log: its path without `runs/selfplay/` and `.pt`."""
    return path.removeprefix("runs/selfplay/").removesuffix(".pt")


def league_mix(kinds: int, self_share: float, snapshot_share: float, gd_share: float, fixed: int, slots: int,
               own_snapshots: int) -> tuple[torch.Tensor, int, int]:
    """The league's mix: each controller kind's share of the non-learner seats, the anchors seated and
    how many of the run's own snapshots are. The anchors (`fixed` of them, `--league-fixed`) hold the
    first of the `slots` snapshot slots for good and the run's own snapshots fill the rest, so anchors
    in every slot make a league of them alone: with the snapshot share the whole, every opponent seat is
    one of them, and the run's own snapshots are saved and read but never met. Greedy takes what the
    other shares leave, and the snapshot share is greedy's until a slot holds a net."""
    probs = torch.zeros(kinds)
    probs[LEARNER] = self_share
    own = min(own_snapshots, slots - fixed) if snapshot_share > 0 else 0
    anchors = fixed if snapshot_share > 0 else 0
    snaps = anchors + own
    snap_share = snapshot_share if snaps else 0.0
    probs[GREEDY] = max(0.0, 1.0 - self_share - snap_share - gd_share)
    for k in range(len(GD_PERSONAS)):
        probs[GD + k] = gd_share / len(GD_PERSONAS)
    for k in range(snaps):
        probs[SNAPSHOT + k] = snap_share / snaps
    return probs, anchors, own


def trained_from_log(out_dir: str, iteration: int) -> float:
    """Training time up to `iteration`, for a checkpoint saved before checkpoints kept it."""
    with open(os.path.join(out_dir, "log.jsonl")) as f:
        records = [json.loads(line) for line in f]
    first = records[0]
    start = first["time"] - first["rollout_s"] - first["update_s"]
    return max(r["time"] for r in records if r["iter"] <= iteration) - start


# The choices a resumed run keeps: each one's default for a new run, and what a checkpoint from
# before the choice existed was trained with.
RECIPE = {
    "bootstrap": ("carry", "acting"),
    "carry_policy_age": (1, 0),  # 0: no limit
    "cap_score": ("loss", "survivors"),
    "serve": ("oldest", "lowest"),
    "deal_spread": (0, 0),
    "time_discount": (1.0, 1.0),
    "obs_turn": (False, False),
    "lam_turn": (None, None),  # None: --lam's
    "outcome_share": (0.0, 0.0),
}


def kept(key: str, asked, trained: dict | None):
    """The run's value of a `RECIPE` choice: a new run's is the one asked for, else its default; a
    resumed run's is the one its checkpoint's arguments (`trained`) record, the old behaviour for a
    checkpoint from before the choice existed, and asking for another is refused."""
    new, old = RECIPE[key]
    if trained is None:
        return new if asked is None else asked
    trained_with = trained.get(key)
    if trained_with is None:
        trained_with = old
    assert asked in (None, trained_with), \
        f"the run was trained with --{key.replace('_', '-')} {trained_with}: a resumed run keeps its recipe"
    return trained_with


def resolve_recipe(args: argparse.Namespace, trained: dict | None) -> None:
    """Every `RECIPE` choice of `args`, resolved in place by `kept`."""
    for key in RECIPE:
        setattr(args, key, kept(key, getattr(args, key), trained))


def finite_weights(weights: dict[str, torch.Tensor]) -> bool:
    return all(bool(torch.isfinite(x).all()) for x in weights.values() if x.is_floating_point())


def save_checkpoint(obj, weights: dict[str, torch.Tensor], path: str) -> None:
    """Saves a checkpoint of a network's `weights` (atomically), refused when any isn't finite."""
    if not finite_weights(weights):
        raise RuntimeError(f"refusing to write {path}: the network has non-finite weights")
    torch.save(obj, path + ".tmp")
    os.replace(path + ".tmp", path)


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--name", required=True)
    p.add_argument("--resume", action="store_true")
    p.add_argument("--hours", type=float, default=48.0)
    p.add_argument("--iters", type=int, default=10**9)
    p.add_argument("--batch", type=int, default=16384)
    p.add_argument("--horizon", type=int, default=64)
    p.add_argument("--sizes", default="3,4,5,6")
    p.add_argument("--size-weights", default="0.35,0.2,0.3,0.15")
    p.add_argument("--width", type=int, default=128)
    p.add_argument("--layers", type=int, default=4)
    p.add_argument("--heads", type=int, default=8)
    p.add_argument("--actions", default="buckets", choices=["buckets", "exact"],
                   help="a new network's action space: the amount buckets, or exact counts and trades (`actions.py`)")
    p.add_argument("--lr", type=float, default=3e-4)
    p.add_argument("--epochs", type=int, default=3)
    p.add_argument("--minibatch", type=int, default=8192)
    p.add_argument("--chunk", type=int, default=8192, help="rows a forward and backward pass takes at once; a larger minibatch sums its chunks")
    p.add_argument("--clip", type=float, default=0.2)
    p.add_argument("--lam", type=float, default=0.95)
    p.add_argument("--lam-turn", type=float, default=None,
                   help="the GAE lambda of a link that crosses from one of a seat's turns to its next, where --lam "
                        "decays the links inside a turn (unset: --lam for every link, a new run's default); a resumed "
                        "run keeps the one it was trained with")
    p.add_argument("--shaping", type=float, default=0.0, help="weight of the territory-and-army potential's shaping reward (0: the win alone)")
    p.add_argument("--bootstrap", default=None, choices=["carry", "acting"],
                   help="where a learner seat's chain meets the rollout's end: carry its last decision into the next "
                        "rollout (a new run's default), or close it with the value read from the acting seat's view (the "
                        "old reading); a resumed run keeps the one it was trained with")
    p.add_argument("--carry-policy-age", type=int, default=None,
                   help="with --bootstrap carry, a held decision taken more than this many updates ago trains the value "
                        "only (0: no limit; a new run's default 1); a resumed run keeps the one it was trained with")
    p.add_argument("--cap-score", default=None, choices=["loss", "survivors"],
                   help="what a capped game's seats still in it score: -1, as finishing last (a new run's default), or "
                        "their place among the survivors less 0.5 (the old rule); a resumed run keeps the one it was trained with")
    p.add_argument("--serve", default=None, choices=["oldest", "lowest"],
                   help="which due rows a controller over its capacity serves: those that have waited longest (a new "
                        "run's default), or the lowest rows (the old order); a resumed run keeps the one it was trained with")
    p.add_argument("--deal-spread", type=int, default=None,
                   help="at every start and resume, play this many rollouts untrained, the first deal's games cut at "
                        "times spread through them, so training starts on games at every stage (0: none, a new run's "
                        "default); a resumed run keeps the one it was trained with")
    p.add_argument("--time-discount", type=float, default=None,
                   help="a win's score falls by this factor every 100 player-turns of the game, so a sooner win is "
                        "worth more; losses are not discounted (1: off, a new run's default); a resumed run keeps the "
                        "one it was trained with")
    p.add_argument("--obs-turn", action=argparse.BooleanOptionalAction, default=None,
                   help="the network reads the player-turns left before its game's cap (the turn so far is always an "
                        "input); --init from a net without it starts the new input's weights at zero (off: a new "
                        "run's default); a resumed run keeps the one it was trained with")
    p.add_argument("--outcome-share", type=float, default=None,
                   help="the share of each rollout's learner decisions kept until their game ends and trained, the "
                        "value alone, on the seat's real final score (0: none, a new run's default); a resumed run "
                        "keeps the one it was trained with")
    p.add_argument("--outcome-store", type=int, default=1_000_000,
                   help="the most decisions waiting on their game's end at once; past it the oldest are dropped")
    p.add_argument("--vz", type=float, default=0.5, help="weight of slot 0's squared error against real outcomes")
    p.add_argument("--vf", type=float, default=0.5)
    p.add_argument("--vo", type=float, default=0.25)
    p.add_argument("--aux", type=float, default=0.25)
    p.add_argument("--ent", type=float, default=0.01)
    p.add_argument("--grad-clip", type=float, default=1.0)
    p.add_argument("--self-share", type=float, default=0.2, help="share of non-learner seats taken by the learner")
    p.add_argument("--snapshot-share", type=float, default=0.0, help="share of non-learner seats taken by past checkpoints")
    p.add_argument("--reward", default="win", choices=["win", "place", "winner"],
                   help="a decisive game's scores: the win +1 and the other places 0 to -1, linear in the place, or "
                        "the win +1 and every other seat -1 (`env.scores`)")
    p.add_argument("--lr-end", type=float, default=None, help="anneal the learning rate linearly to this over --iters")
    p.add_argument("--gd-share", type=float, default=0.0, help="share of non-learner seats taken by GD's personas")
    p.add_argument("--snapshot-every", type=int, default=50)
    p.add_argument("--snapshots", type=int, default=4, help="snapshot slots in the league")
    p.add_argument("--snapshot-cap", type=float, default=EnvConfig.cap_snapshot,
                   help="the most rows each snapshot slot's net is run on per step, as a share of the batch (a "
                        "decision past it waits a step); a league of one net in every opponent seat needs most of it")
    p.add_argument("--league-fixed", default="",
                   help="checkpoints always in the league's snapshot slots, comma-separated; as many as --snapshots "
                        "make the league theirs alone, the run's own snapshots never seated")
    p.add_argument("--league-pool", default="",
                   help="other runs' checkpoints, comma-separated, that start a new run's league ahead of its own "
                        "snapshots and are drawn as they are; a resumed run keeps its pool")
    p.add_argument("--league-pick", default="recent", choices=["recent", "results"],
                   help="how the run's own slots are filled: the newest half and a random rest, or the newest and the rest by results")
    p.add_argument("--ema", default="",
                   help="horizons in iterations, comma-separated, of moving averages of the weights, each saved beside "
                        "every snapshot as ema<h>-<iter>.pt")
    p.add_argument("--eval-every", type=int, default=25)
    p.add_argument("--eval-games", type=int, default=2048)
    p.add_argument("--eval", default="greedy@3,greedy@5", help="opponent@players, comma-separated")
    p.add_argument("--init", default=None,
                   help="start the network from this checkpoint's weights (a bucket-space one's trunk and main heads for an exact-space net)")
    p.add_argument("--ladder-games", type=int, default=2048)
    p.add_argument("--pair", default="", help="label=checkpoint of each head-to-head test's fixed opponent, comma-separated")
    p.add_argument("--pair-games", type=int, default=1024)
    p.add_argument("--panel", type=int, default=0, help="read the stage-0 panel (`panel.py`) at every eval on this many games a check")
    p.add_argument("--eval-sample", action="store_true", help="evaluations sample moves as in training, not the most likely")
    p.add_argument("--ladder-extra", default="", help="label=path of earlier runs' checkpoints for the ladder, comma-separated")
    p.add_argument("--ckpt-every", type=int, default=25)
    p.add_argument("--seed", type=int, default=1)
    p.add_argument("--bf16", action=argparse.BooleanOptionalAction, default=True,
                   help="the networks' forward passes in bfloat16 autocast; a GPU before Ampere (a T4) needs --no-bf16")
    p.add_argument("--session-hours", type=float, default=None,
                   help="stop this process after this many hours, saving latest.pt (a session cap, as Kaggle's); --hours caps the run")
    p.add_argument("--stop-when", default="never", choices=["never", "flat", "falling"],
                   help="stop once the --stop-key panel reading's verdict (`verdict.py`) is flat or falling (flat), or falling")
    p.add_argument("--stop-key", default="", help="the panel reading the stop reads, e.g. 'sample s2-2-150 one-in'")
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    assert args.stop_when == "never" or (args.stop_key and args.panel), "--stop-when reads --stop-key on the panel: give both"

    device = "cuda"
    # Past this the allocator raises rather than letting the Windows driver spill into system
    # memory, which runs on but tens of times slower.
    torch.cuda.set_per_process_memory_fraction(0.92)
    torch.manual_seed(args.seed)
    random.seed(args.seed)
    out_dir = os.path.join(RUNS, args.name)
    os.makedirs(out_dir, exist_ok=True)
    stopped_path = os.path.join(out_dir, "stopped.txt")
    if os.path.exists(stopped_path):
        os.remove(stopped_path)
    board = Board.load(device)
    tables = BlitzTables.load(os.path.join(DATA, "blitz-256"), device)
    tables.scaled_oversize = True
    latest = os.path.join(out_dir, "latest.pt")
    ck = torch.load(latest, map_location=device, weights_only=False) if args.resume and os.path.exists(latest) else None
    # Before the net is built: the recipe says whether it reads the clock.
    resolve_recipe(args, None if ck is None else ck.get("args", {}))
    pool = league_pool(args.league_pool, None if ck is None else ck.get("args", {}))
    args.league_pool = ",".join(pool)
    horizons = [int(x) for x in args.ema.split(",") if x]
    assert all(h > 0 for h in horizons) and len(set(horizons)) == len(horizons), "--ema is distinct horizons in iterations"
    net = Net(args.width, args.layers, args.heads, edges=board.edges, adjacency=board.adjacency, actions=args.actions,
              clock=args.obs_turn).to(device)
    if ck is None:
        check_pool(pool, net.config())
    opt = torch.optim.Adam(net.parameters(), lr=args.lr, eps=1e-5)
    iteration, steps_done, league = 0, 0, list(pool)
    # Each own snapshot's record while it held a league slot: [seats won, seats in decisive games].
    record_of: dict[str, list[float]] = {}
    trained_s = 0.0
    if ck is not None:
        net.load_state_dict(ck["net"])
        opt.load_state_dict(ck["opt"])
        iteration, steps_done = ck["iteration"], ck["steps"]
        # Paths saved on Windows carry backslashes, which Linux (a Kaggle session) reads as part of a name.
        league = [p.replace("\\", "/") for p in ck["league"]]
        record_of = {p.replace("\\", "/"): r for p, r in ck.get("record_of", {}).items()}
        trained_s = ck["trained_s"] if "trained_s" in ck else trained_from_log(out_dir, iteration)
        print(f"resumed {args.name} at iteration {iteration}, {trained_s / 3600:.2f} h trained", flush=True)
    assert args.deal_spread >= 0, "--deal-spread is a count of rollouts"
    assert 0 < args.time_discount <= 1, "--time-discount is a factor in (0, 1]"
    assert 0 <= args.outcome_share <= 1 and args.outcome_store > 0, "--outcome-share is a share; --outcome-store a count"
    with open(os.path.join(out_dir, "args.json"), "w") as f:
        json.dump(vars(args), f, indent=1)

    sizes = tuple(int(x) for x in args.sizes.split(","))
    weights = tuple(float(x) for x in args.size_weights.split(","))
    if args.init and iteration == 0:
        init_from(net, torch.load(args.init, map_location=device, weights_only=False))
        print(f"initialised from {args.init}", flush=True)
    averages = Averages(net, horizons, None if ck is None else ck.get("ema")) if horizons else None
    evals = [(e.split("@")[0], int(e.split("@")[1])) for e in args.eval.split(",")]
    need_gd = args.gd_share > 0 or args.panel > 0 or any(o.startswith("gd-") for o, _ in evals)
    gd_bots = None
    if need_gd:
        from ..bots.gd import gd_bot_graphable
        gd_bots = [gd_bot_graphable(p, tables) for p in GD_PERSONAS]
    cfg = EnvConfig(batch=args.batch, sizes=sizes, size_weights=weights, horizon=args.horizon, gd=args.gd_share > 0,
                    reward=args.reward, cap_score=args.cap_score, serve=args.serve, time_discount=args.time_discount,
                    snapshots=args.snapshots, cap_snapshot=args.snapshot_cap, bf16=args.bf16)
    fixed = [x for x in args.league_fixed.split(",") if x]
    assert len(fixed) <= cfg.snapshots, "the league's anchors need a slot each: give --snapshots at least as many"
    env = Env(cfg, board, tables, net, device, seed_prefix=f"{args.name}-{iteration}",
              gd_bots=gd_bots if args.gd_share > 0 else None)
    kinds = KIND_NAMES + [f"snap{k}" for k in range(cfg.snapshots)]
    # Empty at every start: a resumed run deals fresh games, so no chain runs on from before.
    carry = Carry(env.buf, cfg.batch, device) if args.bootstrap == "carry" else None
    # Empty at every start too: its entries' games are gone with the env that played them.
    outcomes = Outcomes(env.buf, args.outcome_store, device, args.seed) if args.outcome_share > 0 else None
    if fixed:
        from .ladder import load_net
        for k, path in enumerate(fixed):
            env.snapshots[k] = load_net(path, board, device)

    slot_paths: list[str] = []  # the league entry (own snapshot or pool net) in each slot after the anchors

    def set_league() -> None:
        probs, anchors, own = league_mix(len(kinds), args.self_share, args.snapshot_share, args.gd_share, len(fixed),
                                         cfg.snapshots, len(league))
        chosen = seat_league(league, own, args.league_pick, record_of)
        slot_paths[:] = chosen
        snaps = anchors + len(chosen)
        # The anchors (`--league-fixed`) hold the first slots for good, nets of their own sizes.
        for k, path in enumerate(chosen):
            init_from(env.snapshots[anchors + k], torch.load(os.path.join(GPU, path), map_location=device, weights_only=False))
        env.kind_probs.copy_(probs.to(device))
        if snaps != env.active_snapshots:
            env.active_snapshots = snaps
            env.capture()

    set_league()
    if env.graph is None:
        env.capture()
    evaluators = [Evaluator(board, tables, net, n, args.eval_games, device, o, gd_bots, not args.eval_sample, bf16=args.bf16)
                  for o, n in evals]
    ladder = (Ladder(board, tables, net, args.ladder_games, device, greedy=not args.eval_sample, bf16=args.bf16)
              if args.ladder_games > 0 else None)
    extra = [tuple(x.split("=", 1)) for x in args.ladder_extra.split(",") if x]
    pairs = [PairEval(board, tables, net, *x.split("=", 1), args.pair_games, device, bf16=args.bf16)
             for x in args.pair.split(",") if x]
    panel = None
    if args.panel:
        from .panel import Panel
        panel = Panel(board, tables, net, args.panel, device, gd_bots, bf16=args.bf16)
    log_path = os.path.join(out_dir, "log.jsonl")
    headline = panel_readings(log_path, args.stop_key) if args.stop_key else []
    session_started = time.time()
    if args.deal_spread:
        # Counts against the session's hours, which are the host's, but not as training time.
        env.spread(args.deal_spread)
        print(f"spread the deals over {args.deal_spread} untrained rollouts "
              f"({args.deal_spread * args.batch * args.horizon:,} decisions) in {time.time() - session_started:.0f}s",
              flush=True)
    n_params = sum(x.numel() for x in net.parameters())
    started = time.time() - trained_s
    print(f"{args.name}: batch {args.batch} x horizon {args.horizon}, {sum(x.numel() for x in net.parameters()):,} weights",
          flush=True)

    def save_latest() -> None:
        save_checkpoint({"net": net.state_dict(), "opt": opt.state_dict(), "iteration": iteration, "steps": steps_done,
                         "league": league, "record_of": record_of, "args": vars(args), "env": asdict(cfg),
                         "trained_s": time.time() - started,
                         **({"ema": averages.states} if averages is not None else {})}, net.state_dict(), latest)

    assert args.lr_end is None or args.iters < 10**9, "--lr-end anneals over --iters: give it"
    stopped = ""
    while iteration < args.iters and time.time() - started < args.hours * 3600:
        if args.session_hours is not None and time.time() - session_started > args.session_hours * 3600:
            stopped = "session"
            break
        t0 = time.time()
        if args.lr_end is not None:
            # By iterations, not the clock: two runs sharing the GPU stay on the same schedule.
            for group in opt.param_groups:
                group["lr"] = args.lr + (args.lr_end - args.lr) * iteration / args.iters
        env.run(args.horizon)
        if carry is None:
            targets = advantages(env, env.bootstrap(), args.lam, args.shaping, lam_turn=args.lam_turn)
        else:
            targets = advantages(env, None, args.lam, args.shaping, carry=carry, lam_turn=args.lam_turn)
        mine = targets["train"]
        # The value head's explained variance on the learner's decisions: 1 − Var(ret − v) / Var(ret),
        # against the GAE returns, so mostly against its own predictions (`value_health` reads real outcomes).
        explained = float(1 - targets["adv"][mine].var() / targets["ret"][mine].var().clamp(min=1e-8))
        health = value_health(env, targets)
        if outcomes is not None:
            dropped = outcomes.store(env.buf, args.outcome_share)
            outcomes.resolve(env.buf)
            health.update(outcomes.readings(net, env, args.chunk), outcome_dropped=dropped)
        torch.cuda.synchronize()
        t1 = time.time()
        try:
            losses = update(net, opt, env, targets, args, carry, averages, outcomes)
        except NonFinite as stop:
            # `latest.pt` stays the last checkpoint written, from finite weights.
            stop.report["iteration"] = iteration + 1
            with open(os.path.join(out_dir, "nonfinite.json"), "w") as f:
                json.dump(stop.report, f, indent=1)
            torch.save({"net": net.state_dict(), "opt": opt.state_dict(), **stop.tensors},
                       os.path.join(out_dir, "nonfinite.pt"))
            print(f"stopped: non-finite {', '.join(stop.report['term'])} in iteration {iteration + 1}'s update "
                  f"(nonfinite.json, nonfinite.pt): {json.dumps(stop.report)}", file=sys.stderr, flush=True)
            return 1
        if carry is not None:
            health.update(carry.hold(env, targets))
        t2 = time.time()
        iteration += 1
        steps_done += args.batch * args.horizon
        if int(env.cursor.max()) > env.cfg.pool // 2:
            env.refill_pool()
        stats = env.take_stats()
        first_own = SNAPSHOT + (len(fixed) if args.snapshot_share > 0 else 0)
        for k, path in enumerate(slot_paths):
            record_of.setdefault(path, [0.0, 0.0])
            record_of[path][0] += stats["wins"][first_own + k]
            record_of[path][1] += stats["decisive_seats"][first_own + k]
        record = {"iter": iteration, "steps": steps_done, "time": time.time(), "rollout_s": t1 - t0, "update_s": t2 - t1,
                  "steps_per_s": args.batch * args.horizon / (t1 - t0), "params": n_params, "lr": opt.param_groups[0]["lr"],
                  "explained": explained, **health, **summarize(stats, kinds), **losses}
        if iteration % args.snapshot_every == 0:
            path = os.path.join(out_dir, f"snap-{iteration}.pt")
            save_checkpoint(net.state_dict(), net.state_dict(), path)
            for h, state in (averages.states.items() if averages is not None else ()):
                save_checkpoint(state, state, os.path.join(out_dir, f"ema{h}-{iteration}.pt"))
            # Kept relative to the GPU folder, so a run resumes in any checkout of the repo.
            league.append(os.path.relpath(path, GPU).replace("\\", "/"))
            set_league()
        if iteration % args.eval_every == 0:
            record["eval"] = [e.run() for e in evaluators]
            record["league"] = [league_label(p) for p in slot_paths]
            if panel is not None:
                record["panel"] = panel.run()
                if args.stop_key:
                    headline.append(record["panel"][args.stop_key])
                    record["verdict"] = verdict(headline)
            if pairs:
                record["pair"] = [pair.run() for pair in pairs]
            if ladder is not None:
                # The reference checkpoints always, then this run's newest.
                own = [(f"{args.name}-{os.path.basename(p)[5:-3]}", p) for p in league if p not in pool]
                past = extra + own[max(0, len(own) - (ladder.slots - len(extra))):]
                record.update(ladder.run(past, f"{args.name}-{iteration}"))
        if iteration % args.ckpt_every == 0:
            save_latest()
        with open(log_path, "a") as f:
            f.write(json.dumps(record) + "\n")
        brief = {k: (round(v, 3) if isinstance(v, float) else v) for k, v in record.items()
                 if k in ("iter", "steps_per_s", "update_s", "learner_score", "learner_score_undiscounted", "learner_win", "greedy_score", "gd-stacker_score", "capped",
                          "turns", "ent", "kl", "clip", "explained", "fresh_value", "ended_first_value", "ended_explained",
                          "outcome_bias", "v", "vz", "unserved", "longest_wait", "samples")}
        print(json.dumps(brief), flush=True)
        if "eval" in record:
            print("  eval", json.dumps(record["eval"]), flush=True)
            if "pair" in record:
                print("  pair", json.dumps(record["pair"]), flush=True)
            if "panel" in record:
                print("  panel", json.dumps({k: v.get("win", v.get("share")) for k, v in record["panel"].items()}), flush=True)
            if "ladder" in record:
                print("  ladder", json.dumps(record["ladder"]), record["ladder_games"], "decisive", flush=True)
            if "verdict" in record:
                print(f"  verdict on {args.stop_key}: {record['verdict']}", flush=True)
                stops_on = {"never": (), "flat": ("flat", "falling"), "falling": ("falling",)}[args.stop_when]
                if record["verdict"] in stops_on:
                    stopped = record["verdict"]
                    break
    save_latest()
    if stopped:
        print(f"stopped: {stopped}", flush=True)
        with open(os.path.join(out_dir, "stopped.txt"), "w") as f:
            f.write(f"{stopped} at iteration {iteration}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())

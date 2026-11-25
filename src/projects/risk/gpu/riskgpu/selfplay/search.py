"""Does a shallow search that uses a network play better than the network alone? (the
`machine-learning` skill's diagnosis, cause 7: the improvement operator's strength):

    python -m riskgpu.selfplay.search --ckpt runs/selfplay/s2-2/snap-150.pt [--k 4] [--r 8] [--leaf own]
        [--games 1024] [--mixtures one-in,one-out] [--raw argmax,sample] [--device cuda] [--out search.json]

run from `src/projects/risk/gpu/`. A measuring tool, not a bot that ships.

**The searcher** (rollout policy improvement). At a decision of a searching seat whose kind is
searched (`--kinds`), the candidates are the network's K most likely moves: its first choice (the
move its most likely main choice and most likely amount make, exactly what the raw network plays
with `argmax`), then the most likely of the rest of the grid of its K most likely main choices by
their K most likely amounts, by joint probability. A decision with one legal move, or whose first
choice holds `--skip-mass` of the probability or more, isn't searched: the first choice is played.
Each candidate is played in R copies of the game, then the network samples every seat's moves in
every copy until the leaf: the searching seat is deciding again in a later turn of its own, after
every other seat's turn (`own`, the default), the searching seat's turn has ended (`turn`), N
player-turns have ended counting the one under way (`turns:N`; `turns:1` is `turn`), or the game's
end or cap (`end`). A copy scores the searching seat's real score (`env.scores`, the training
reward) where the game ended or the seat is out, and otherwise the network's value for that seat's
slot, read from the view of the seat to move at the leaf. `own` is the default because it reads
the searcher's value from its own view (slot 0), the one slot the trainer fits; the other leaves
read it from another seat's view, a slot fitted only to neighbours' final scores, so a search
read on them can't tell a weak search from a badly trained slot. The candidate with the best mean
is played if it beats the first choice's mean by more than `--margin`; otherwise the first choice
is.

**The clock.** A network that reads the clock (`obs.py`, `Net.clock`) sees the player-turns left
before `--cap`, in the real games and in every copy: a copy keeps its game's turn counter and ends
at the same cap, so the clock counts down to the same end there. A network without it sees exactly
what it always did.

**No cheating.** A copy never sees the real game's future dice: its random stream is replaced by
one hashed from the game's seed, the decision's index, the copy's index and (with `--no-crn`) the
candidate's, so the tool is reproducible and the real rolls are out of reach. By default the
candidates share each copy index's stream and deal (common random numbers: copy r of every
candidate starts from the same dice and the same guess at the hidden cards, so the comparison
between candidates isn't swamped by luck they don't share). Hidden information (`--hidden`):
`resample` (the default) deals the cards the searching seat can't see afresh in every copy: every
card not in its own hand is shuffled from the copy's stream and dealt to the other hands at their
real sizes, the rest becoming the deck in that order. It ignores one public fact, that a traded
card went back into the deck below its top three (the GPU state keeps only the count of trades),
so it errs only in the searcher's disfavour. `real` leaves the real hidden cards in the copies: an
optimism, reported in the output.

**The reading.** Fixed 5-player deals, seated as `PairEval` seats them (game i is the deal
`pair-2-i`): `one-in` the searcher alone among four copies of the same network playing raw, or of
`--raw-ckpt`'s, a network of its own such as an exploiter (par 20%), `one-out` four searchers and one raw seat (par 80%), the lone seat rotated. Raw seats play
as `--raw` says (`argmax`, the network's most likely move, is the comparison that counts: "search
beats sampling" could be "argmax beats sampling"). `--skip-mass 0` searches nothing, the searching
seats playing the network's first choice: the control the search's reading is read against. The
output: each side's win share of the decisive games with its Wilson 95% interval, capped games,
games, the share of searched decisions where the search overruled the first choice (by decision
kind), and the work: the rows the network's trunk ran on (the real games', the rollouts' and the
leaves').

**Stopping and going on.** A searched reading plays for hours, so with `--out` the run's place (the
games, the turn logs, both generators, the tallies so far) is saved beside it every
`--save-minutes`, and `--resume` goes on from it to exactly the result an unbroken run gives. A
save is refused unless every argument that shapes the games and both nets' bytes match it, and a
run without `--resume` refuses to start over a save rather than lose it.
"""

import argparse
import hashlib
import json
import math
import os
import sys
import time
from dataclasses import asdict, dataclass, fields
from types import SimpleNamespace

import torch

from ..board import CARDS, MAX_SEATS, Board
from ..data import DATA
from ..engine import step
from ..options import KIND_ATTACK, KIND_FORTIFY, KIND_OCCUPY, KIND_REINFORCE, Options, options
from ..rng import MASK, imul, next_draws, xmur3
from ..runner import TurnLog
from ..state import HAND_MAX, LAYOUT, State, new_games
from ..tables import BlitzTables
from .actions import decode, decode_exact, legal_main
from .env import scores
from .net import NEG, Net, amount_choice, masked
from .obs import observe, slots
from .panel import wilson

KINDS = {"reinforce": KIND_REINFORCE, "attack": KIND_ATTACK, "occupy": KIND_OCCUPY, "fortify": KIND_FORTIFY}
KIND_NAMES = {v: k for k, v in KINDS.items()}
MIXTURES = ("one-in", "one-out")
OWN_LEAF = ("leaf=own: a copy is scored when the searcher is next deciding, by its value from its own view (slot 0), "
            "the slot the trainer fits")
OTHER_LEAF = ("leaf={leaf}: most copies are scored by the searcher's value from another seat's view, a slot fitted only "
              "to neighbours' final scores, so a weak reading may be the slot, not the search")


@dataclass
class SearchConfig:
    k: int = 4
    r: int = 8
    leaf: str = "own"  # "own", "turn", "turns:N" or "end"
    kinds: tuple[str, ...] = ("reinforce", "attack")
    skip_mass: float = 0.95
    margin: float = 0.02
    hidden: str = "resample"  # or "real"
    crn: bool = True
    cap: int = 600  # player-turns, as PairEval's
    chunk: int = 8192  # rows the network takes at once
    max_copies: int = 65536  # copies played at once; a larger search is split
    bf16: bool = False
    check: bool = True  # every move, real and in the copies, validated by the engine
    seed: int = 1

    def __post_init__(self) -> None:
        assert self.k >= 1 and self.r >= 1, (self.k, self.r)
        assert self.hidden in ("resample", "real"), self.hidden
        assert all(kind in KINDS for kind in self.kinds), self.kinds
        self.leaf_turns()

    def leaf_turns(self) -> int | None:
        """Player-turns a copy plays to its leaf, counting the one under way; None where the leaf
        isn't a count of player-turns (`own`, `end`)."""
        if self.leaf == "turn":
            return 1
        if self.leaf in ("own", "end"):
            return None
        assert self.leaf.startswith("turns:"), f"--leaf is own, turn, turns:N or end, not {self.leaf}"
        n = int(self.leaf.split(":", 1)[1])
        assert n >= 1, self.leaf
        return n


# --- the copies' streams ---------------------------------------------------------------------


def _fmix(h: torch.Tensor) -> torch.Tensor:
    """MurmurHash3's 32-bit finalizer, on int64 lanes holding unsigned 32-bit values."""
    h = h ^ (h >> 16)
    h = imul(h, 0x85EBCA6B)
    h = h ^ (h >> 13)
    h = imul(h, 0xC2B2AE35)
    return h ^ (h >> 16)


def _mix(h: torch.Tensor, v: torch.Tensor | int) -> torch.Tensor:
    if not isinstance(v, torch.Tensor):
        v = torch.full_like(h, v)
    return _fmix(h ^ imul((v.to(torch.int64) + 1) & MASK, 0x9E3779B1))


def game_base(seed: str) -> int:
    """A game's root for its copies' streams: never the game's own stream's state."""
    return xmur3(f"search|{seed}")


def copy_streams(base: torch.Tensor, decision: torch.Tensor, candidate: torch.Tensor, copy: torch.Tensor) -> torch.Tensor:
    """`[N]` int64: each copy's dice stream, a hash of its game's root, the decision's index in the
    game, the candidate (0 for every candidate under common random numbers) and the copy's index."""
    return _mix(_mix(_mix(base, decision), candidate), copy)


def resample_hidden(s: State, seat: torch.Tensor, stream: torch.Tensor) -> None:
    """Deals, in place, every card `seat [N]` can't see afresh: the cards outside its own hand,
    shuffled from `stream [N]`, to the other hands at their real sizes, then the deck."""
    n, device = s.batch, s.device
    rows = torch.arange(n, device=device)
    draws = []
    st = _mix(stream, 0xCA4D)
    for _ in range(CARDS):
        d, st = next_draws(st)
        draws.append(d)
    keys = torch.stack(draws, 1)
    own_len = s.hand_len[rows, seat].to(torch.int64)
    own_hand = s.hand[rows, seat].to(torch.int64)
    held = torch.arange(HAND_MAX, device=device)[None, :] < own_len[:, None]
    own = torch.zeros(n, CARDS + 1, dtype=torch.bool, device=device)
    own.scatter_(1, torch.where(held, own_hand, CARDS), True)
    order = torch.where(own[:, :CARDS], 2.0, keys).argsort(dim=1, stable=True)  # the unseen cards first
    seats = torch.arange(MAX_SEATS, device=device)[None, :]
    is_seat = seats == seat[:, None]
    lens = torch.where(is_seat, 0, s.hand_len.to(torch.int64))
    dealt_total = lens.sum(1)
    deck_len = s.deck_len.to(torch.int64)
    unseen = CARDS - own_len
    assert bool((dealt_total + deck_len == unseen).all()), "a card is neither in a hand nor in the deck"
    j = torch.arange(HAND_MAX, device=device)[None, None, :]
    position = (lens.cumsum(1) - lens)[:, :, None] + j
    dealt = order.gather(1, position.clamp(max=CARDS - 1).reshape(n, -1)).reshape(n, MAX_SEATS, HAND_MAX)
    others = torch.where(j < lens[:, :, None], dealt, -1)
    s.hand = torch.where(is_seat[:, :, None], s.hand.to(torch.int64), others).to(s.hand.dtype)
    k = torch.arange(CARDS, device=device)[None, :]
    deck = order.gather(1, (dealt_total[:, None] + k).clamp(max=CARDS - 1))
    s.deck = torch.where(k < deck_len[:, None], deck, -1).to(s.deck.dtype)


def copy_states(s: State, seat: torch.Tensor, base: torch.Tensor, decision: torch.Tensor, k: int, r: int,
                hidden: str, crn: bool) -> State:
    """`E * k * r` copies of the `E` games of `s`, ordered game, candidate, copy: each with its own
    stream, and with `resample` its own deal of what `seat [E]` can't see."""
    e, device = s.batch, s.device
    game = torch.arange(e, device=device).repeat_interleave(k * r)
    candidate = torch.arange(k, device=device).repeat_interleave(r).repeat(e)
    copy = torch.arange(r, device=device).repeat(e * k)
    c = s.select(game)
    stream = copy_streams(base[game], decision[game], torch.zeros_like(candidate) if crn else candidate, copy)
    c.rng = stream
    if hidden == "resample":
        resample_hidden(c, seat[game], stream)
    return c


# --- the network -------------------------------------------------------------------------------


def observation(net: Net, cap: int, s: State, o: Options, log: TurnLog,
                board: Board) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """What `net` sees in every game of `s`: with the clock where it reads it, counted down to the
    game's cap. A copy keeps its game's turn counter and plays to the same cap, so the clock means
    in a rollout what it means in the real game."""
    caps = torch.full((s.batch,), cap, dtype=torch.int64, device=s.device) if net.clock else None
    return observe(s, o, log.placed_on, log.attacks, log.captured, board, caps)


def gumbel_argmax(z: torch.Tensor, gen: torch.Generator) -> torch.Tensor:
    """A sample from softmax(z), as `net.choose` draws it, from its own generator."""
    return (z - torch.empty_like(z).exponential_(generator=gen).log()).argmax(1)


@dataclass
class Work:
    game: int = 0  # trunk rows of the real games' decisions
    rollout: int = 0  # trunk rows of the copies' decisions
    leaf: int = 0  # trunk rows of the leaves' values


class Searcher:
    def __init__(self, net: Net, board: Board, tables: BlitzTables, cfg: SearchConfig, device: str,
                 raw_net: Net | None = None):
        self.net, self.board, self.tables, self.cfg, self.device = net, board, tables, cfg, device
        # The network the raw seats play; the search's own copies still model every seat with `net`.
        self.raw_net = net if raw_net is None else raw_net
        self.leaf_turns = cfg.leaf_turns()
        # The rollouts' own generator: what a search draws never moves the real games' sampling.
        self.gen = torch.Generator(device=device).manual_seed(cfg.seed + 1)
        self.work = Work()
        self.searched = {name: 0 for name in KINDS}
        self.overruled = {name: 0 for name in KINDS}
        self.skipped = {name: 0 for name in KINDS}
        self.searchable = torch.tensor([KIND_NAMES[k] in cfg.kinds for k in range(4)], device=device)

    def autocast(self):
        return torch.autocast(device_type=torch.device(self.device).type, dtype=torch.bfloat16, enabled=self.cfg.bf16)

    def heads(self, s: State, o: Options, log: TurnLog, net: Net | None = None) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        """`(x, logits, value [n, 6] by slot, legal)` for every game of `s`, in chunks, by `net`
        (the searcher's when None)."""
        net = self.net if net is None else net
        node, slot, glob = observation(net, self.cfg.cap, s, o, log, self.board)
        xs, ls, vs = [], [], []
        for at in range(0, s.batch, self.cfg.chunk):
            part = slice(at, at + self.cfg.chunk)
            with self.autocast():
                x = net.trunk(node[part], slot[part], glob[part])
                logits, value, _ = net.heads_main(x)
            xs.append(x)
            ls.append(logits)
            vs.append(value)
        return torch.cat(xs), torch.cat(ls), torch.cat(vs), legal_main(o, net.exact)

    def policy(self, x, logits, legal, s: State, o: Options, gen: torch.Generator | None,
               net: Net | None = None) -> torch.Tensor:
        """The engine move `[n, 5]`: `net`'s (the searcher's when None) first choice (`gen` None) or
        a sample."""
        net = self.net if net is None else net
        z = masked(logits, legal)
        with self.autocast():
            main = z.argmax(1) if gen is None else gumbel_argmax(z, gen)
            za, _, c = amount_choice(net, x, main, s, o, self.board)
            amount = za.argmax(1) if gen is None else gumbel_argmax(za, gen)
        if net.exact:
            return decode_exact(main, amount, s, o, self.board, c)
        return decode(main, amount, s, o, self.board)

    # --- one batch of searched decisions --------------------------------------------------------

    def choose(self, s: State, o: Options, log: TurnLog, places: torch.Tensor, in_game: torch.Tensor, base: torch.Tensor,
               decision: torch.Tensor, x: torch.Tensor, logits: torch.Tensor, legal: torch.Tensor,
               first: torch.Tensor) -> tuple[torch.Tensor, dict]:
        """The searcher's moves `[D, 5]` for D decisions of searching seats (`first` the network's
        first choice in each), and what the search saw: each searched decision's candidates and
        their mean scores."""
        cfg, d = self.cfg, s.batch
        kind = o.kind.to(torch.int64)
        z = masked(logits, legal)
        p_main = torch.softmax(z, 1)
        rows = torch.arange(d, device=self.device)
        with self.autocast():
            main0 = z.argmax(1)
            za0, alegal0, _ = amount_choice(self.net, x, main0, s, o, self.board)
        p_first = p_main[rows, main0] * torch.softmax(za0.float(), 1)[rows, za0.argmax(1)]
        forced = (legal.sum(1) == 1) & (alegal0.sum(1) == 1)
        go = self.searchable[kind] & ~forced & (p_first < cfg.skip_mass)
        for k, name in KIND_NAMES.items():
            self.skipped[name] += int((self.searchable[kind] & ~go & (kind == k)).sum())
        moves = first.clone()
        # `go`, `forced` and `main0`/`a0` (the first choice's main choice and amount) are what a
        # recording of the decisions not searched keeps.
        detail = {"rows": [], "candidates": [], "means": [], "chosen": [], "overruled": [], "grid": [],
                  "go": go, "forced": forced, "main0": main0, "a0": za0.argmax(1)}
        todo = go.nonzero()[:, 0]
        per = max(1, cfg.max_copies // (cfg.k * cfg.r))
        for at in range(0, todo.shape[0], per):
            idx = todo[at:at + per]
            cand, cand_ok, grid = self.candidates(s.select(idx), o.select(idx), x[idx], z[idx], first[idx])
            means = self.score(s.select(idx), log.select(idx), places[idx], in_game[idx], base[idx], decision[idx],
                               cand, cand_ok)
            best = means.argmax(1)
            better = means.gather(1, best[:, None])[:, 0] > means[:, 0] + cfg.margin
            pick = torch.where(better, best, 0)
            moves[idx] = cand[torch.arange(idx.shape[0], device=self.device), pick]
            # A candidate may decode to the first choice's own move (two buckets of one count).
            better = better & (moves[idx] != first[idx]).any(1)
            for k, name in KIND_NAMES.items():
                mine = kind[idx] == k
                self.searched[name] += int(mine.sum())
                self.overruled[name] += int((mine & better).sum())
            detail["rows"].append(idx)
            detail["candidates"].append(cand)
            detail["means"].append(means)
            detail["chosen"].append(pick)
            detail["overruled"].append(better)
            detail["grid"].append(grid)
        return moves, detail

    def candidates(self, s: State, o: Options, x: torch.Tensor, z: torch.Tensor, first: torch.Tensor):
        """`(moves [E, K, 5], legal [E, K], grid)`: the first choice, then the most likely of the
        rest of the grid of the K most likely main choices by their K most likely amounts. `grid`
        holds each candidate in the network's own space (`main`, `amount` [E, K]: the main choice and
        the amount bucket or argument slot) and the network's probabilities of them (`p_main`,
        `p_amount` [E, K]: the main choice's, and the amount's given that main choice)."""
        e, k = s.batch, self.cfg.k
        dev = self.device
        lp_main = torch.log_softmax(z, 1)
        main0 = z.argmax(1)
        rows = torch.arange(e, device=dev)
        if k > 1:
            rest = z.clone()
            rest[rows, main0] = NEG
            top = rest.topk(min(k - 1, z.shape[1] - 1), 1)
            mains = torch.cat([main0[:, None], top.indices], 1)
            main_ok = torch.cat([torch.ones(e, 1, dtype=torch.bool, device=dev), top.values > NEG], 1)
        else:
            mains, main_ok = main0[:, None], torch.ones(e, 1, dtype=torch.bool, device=dev)
        km = mains.shape[1]
        rep = rows.repeat_interleave(km)
        sr, orr = s.select(rep), o.select(rep)
        with self.autocast():
            za, alegal, _ = amount_choice(self.net, x[rep], mains.reshape(-1), sr, orr, self.board)
        za = za.float()
        la = torch.log_softmax(za, 1)
        a0 = za.argmax(1)
        ka = min(k, za.shape[1])
        if ka > 1:
            rest_a = za.clone()
            rest_a[torch.arange(rep.shape[0], device=dev), a0] = NEG
            top_a = rest_a.topk(ka - 1, 1).indices
            amounts = torch.cat([a0[:, None], top_a], 1)
        else:
            amounts = a0[:, None]
        amount_ok = alegal.gather(1, amounts)
        joint = lp_main.gather(1, mains)[:, :, None] + la.gather(1, amounts).view(e, km, ka)
        ok = main_ok[:, :, None] & amount_ok.view(e, km, ka)
        score = torch.where(ok, joint, -math.inf).reshape(e, km * ka)
        score[:, 0] = math.inf  # the grid's first cell is the first choice
        n_cand = min(k, km * ka)
        pick = score.topk(n_cand, 1).indices  # [E, n]
        cand_ok = ok.reshape(e, -1).gather(1, pick)
        cand_main = mains.gather(1, pick // ka)
        cand_amount = amounts.view(e, km * ka).gather(1, pick)
        rep2 = rows.repeat_interleave(n_cand)
        s2, o2 = s.select(rep2), o.select(rep2)
        flat_main, flat_amount = cand_main.reshape(-1), cand_amount.reshape(-1)
        if self.net.exact:
            moves = decode_exact(flat_main, flat_amount, s2, o2, self.board)
        else:
            moves = decode(flat_main, flat_amount, s2, o2, self.board)
        moves = moves.view(e, n_cand, 5).clone()
        # The first candidate is the first choice exactly as the real game computed it.
        moves[:, 0] = first
        cand_ok[:, 0] = True
        grid = {"main": cand_main, "amount": cand_amount, "p_main": lp_main.gather(1, cand_main).exp(),
                "p_amount": la.gather(1, amounts).view(e, km * ka).gather(1, pick).exp()}
        if n_cand < k:
            moves = torch.cat([moves, moves[:, :1].expand(-1, k - n_cand, -1)], 1)
            cand_ok = torch.cat([cand_ok, torch.zeros(e, k - n_cand, dtype=torch.bool, device=dev)], 1)
            grid = {name: torch.cat([v, v[:, :1].expand(-1, k - n_cand)], 1) for name, v in grid.items()}
        return moves, cand_ok, grid

    # --- the copies ------------------------------------------------------------------------------

    def score(self, s: State, log: TurnLog, places, in_game, base, decision, cand: torch.Tensor,
              cand_ok: torch.Tensor) -> torch.Tensor:
        """`[E, K]`: each candidate's mean score over its R copies (−inf where it isn't a candidate)."""
        cfg, dev = self.cfg, self.device
        e, k, r = s.batch, cfg.k, cfg.r
        seat = s.active.to(torch.int64)
        cs = copy_states(s, seat, base, decision, k, r, cfg.hidden, cfg.crn)
        game = torch.arange(e, device=dev).repeat_interleave(k * r)
        clog = log.select(game)
        cplaces, cin_game = places[game].clone(), in_game[game].clone()
        cseat = seat[game]
        turn0 = s.turn.to(torch.int64)[game]
        dead = ~cand_ok.repeat_interleave(r, 1).reshape(-1)
        first = cand.repeat_interleave(r, 1).reshape(-1, 5)
        result = self.rollout(cs, clog, cplaces, cin_game, cseat, turn0, first, dead)
        result = torch.where(dead, 0.0, result).view(e, k, r).mean(2)
        return torch.where(cand_ok, result, -math.inf)

    def advance(self, s: State, log: TurnLog, places, in_game, moves: torch.Tensor, moving: torch.Tensor) -> None:
        before = SimpleNamespace(active=s.active.clone(), turn=s.turn.clone())
        eliminated_before = s.eliminated.clone()
        step(s, moves, self.board, self.tables, done=~moving, check=self.cfg.check)
        log.update(before, s, moves, moving)
        newly_out = s.eliminated & ~eliminated_before
        places.copy_(torch.where(newly_out, in_game[:, None], places))
        in_game.sub_(newly_out.sum(1))

    def leaf_values(self, s: State, log: TurnLog, seat: torch.Tensor) -> torch.Tensor:
        """`[N]`: the network's value for `seat [N]` in each leaf state, read from the view of the
        seat to move there (slot 0 under `own`, where that is the searcher)."""
        _, _, value, _ = self.heads(s, options(s, self.board), log)
        self.work.leaf += s.batch
        _, slot_of_seat = slots(s)
        ar = torch.arange(s.batch, device=self.device)
        slot = slot_of_seat[ar, seat]
        if self.cfg.leaf == "own":
            assert bool((slot == 0).all()), "an own leaf where the searcher isn't the seat deciding"
        return value.float()[ar, slot]

    def rollout(self, s: State, log: TurnLog, places, in_game, seat, turn0, first: torch.Tensor,
                dead: torch.Tensor) -> torch.Tensor:
        """`[N]`: each copy's score for `seat` after `first` and the network's sampled play to the
        leaf. Copies in `dead` are never played."""
        cfg, dev = self.cfg, self.device
        n = s.batch
        out = torch.zeros(n, dtype=torch.float32, device=dev)
        home = torch.arange(n, device=dev)  # each row's copy, as finished copies are dropped
        self.advance(s, log, places, in_game, first, ~dead)
        open_ = ~dead
        while True:
            rows = torch.arange(s.batch, device=dev)
            won = s.phase == 3
            final = open_ & (won | s.eliminated[rows, seat] | (s.turn.to(torch.int64) > cfg.cap))
            if bool(final.any()):
                real = scores(s.players, places, s.eliminated, won, in_game)[rows, seat]
                out[home[final]] = real[final]
            leaf = open_ & ~final
            if cfg.leaf == "own":
                # The turn counter moves with the acting seat, so the searcher acting in a later turn
                # is its next turn, however many seats are out.
                leaf = leaf & (s.active.to(torch.int64) == seat) & (s.turn.to(torch.int64) > turn0)
            elif self.leaf_turns is not None:
                leaf = leaf & (s.turn.to(torch.int64) - turn0 >= self.leaf_turns)
            else:
                leaf = leaf & False
            if bool(leaf.any()):
                at = leaf.nonzero()[:, 0]
                out[home[at]] = self.leaf_values(s.select(at), log.select(at), seat[at])
            open_ = open_ & ~final & ~leaf
            if not bool(open_.any()):
                return out
            if int(open_.sum()) * 2 < s.batch:
                keep = open_.nonzero()[:, 0]
                s, log = s.select(keep), log.select(keep)
                places, in_game, seat, turn0, home = places[keep], in_game[keep], seat[keep], turn0[keep], home[keep]
                open_ = torch.ones(keep.shape[0], dtype=torch.bool, device=dev)
            o = options(s, self.board)
            at = open_.nonzero()[:, 0]
            sub, so = s.select(at), o.select(at)
            x, logits, _, legal = self.heads(sub, so, log.select(at))
            self.work.rollout += at.shape[0]
            moves = torch.zeros(s.batch, 5, dtype=torch.int64, device=dev)
            moves[at] = self.policy(x, logits, legal, sub, so, self.gen)
            self.advance(s, log, places, in_game, moves, open_)

    # --- whole games -----------------------------------------------------------------------------

    def play(self, seeds: list[str], players: int | list[int], searcher: torch.Tensor, raw_greedy: bool,
             progress: bool = False, recorder=None, saver=None, resume: dict | None = None) -> dict:
        """Plays every game to its end or cap: the seats in `searcher [G, 6]` search, the rest play
        the raw network (its first choice, or sampled). Returns each game's winner (−1 capped), its
        turns, every seat's score (`env.scores`) and the wall time. `players` is every game's table
        size, or each game's. A `recorder` (`record.py`) is shown every searching seat's decision as
        it is made. A `saver` (`due(steps)`, `save(place)`) is handed the run's place between steps
        whenever it is due, and `resume`, a place it was handed, goes on from there exactly as the
        run would have, given the same seeds, seating and searcher."""
        cfg, dev = self.cfg, self.device
        g = len(seeds)
        assert recorder is None or (saver is None and resume is None), "a recording isn't saved part way"
        s = new_games(seeds, [players] * g if isinstance(players, int) else list(players), self.board, dev)
        log = TurnLog.empty(g, dev)
        places = torch.ones(g, MAX_SEATS, dtype=torch.int64, device=dev)
        in_game = s.players.to(torch.int64).clone()
        decision = torch.zeros(g, dtype=torch.int64, device=dev)
        base = torch.tensor([game_base(seed) for seed in seeds], dtype=torch.int64, device=dev)
        game_gen = torch.Generator(device=dev).manual_seed(cfg.seed)
        searcher = searcher.to(dev)
        started, steps = time.time(), 0
        if resume is not None:
            assert len(resume["seeds"]) == g and resume["seeds"] == seeds, "a place saved from other games"
            s = State(**{name: v.to(dev) for name, v in resume["state"].items()})
            log = TurnLog(**{name: v.to(dev) for name, v in resume["log"].items()})
            places, in_game, decision = (resume[name].to(dev) for name in ("places", "in_game", "decision"))
            game_gen.set_state(resume["game_gen"])
            self.gen.set_state(resume["gen"])
            self.work = Work(**resume["work"])
            self.searched, self.overruled, self.skipped = (dict(resume[name]) for name in ("searched", "overruled", "skipped"))
            started, steps = time.time() - resume["wall"], resume["steps"]

        def place() -> dict:
            return {"seeds": seeds, "steps": steps, "wall": time.time() - started,
                    "state": {name: getattr(s, name).cpu() for name in LAYOUT},
                    "log": {f.name: getattr(log, f.name).cpu() for f in fields(TurnLog)},
                    "places": places.cpu(), "in_game": in_game.cpu(), "decision": decision.cpu(),
                    "game_gen": game_gen.get_state(), "gen": self.gen.get_state(), "work": asdict(self.work),
                    "searched": dict(self.searched), "overruled": dict(self.overruled), "skipped": dict(self.skipped)}

        while True:
            live = (s.phase != 3) & (s.turn.to(torch.int64) <= cfg.cap)
            if not bool(live.any()):
                break
            o = options(s, self.board)
            idx = live.nonzero()[:, 0]
            sub, so, slog = s.select(idx), o.select(idx), log.select(idx)
            x, logits, _, legal = self.heads(sub, so, slog)
            self.work.game += idx.shape[0]
            first = self.policy(x, logits, legal, sub, so, None)
            if self.raw_net is self.net:
                raw_first = first
                # Sampled for every live row, so the real games' generator moves the same way whoever searches.
                raw_sampled = self.policy(x, logits, legal, sub, so, game_gen)
            else:
                xr, lr, _, legal_r = self.heads(sub, so, slog, self.raw_net)
                self.work.game += idx.shape[0]
                raw_first = self.policy(xr, lr, legal_r, sub, so, None, self.raw_net)
                raw_sampled = self.policy(xr, lr, legal_r, sub, so, game_gen, self.raw_net)
            searching = searcher[idx, sub.active.to(torch.int64)]
            move = torch.where(searching[:, None], first, raw_first if raw_greedy else raw_sampled)
            if bool(searching.any()):
                w = searching.nonzero()[:, 0]
                chosen, detail = self.choose(sub.select(w), so.select(w), slog.select(w), places[idx[w]],
                                             in_game[idx[w]], base[idx[w]], decision[idx[w]], x[w], logits[w], legal[w],
                                             first[w])
                move[w] = chosen
                if recorder is not None:
                    recorder.decisions(sub.select(w), so.select(w), slog.select(w), idx[w], decision[idx[w]], first[w],
                                       chosen, detail)
            moves = torch.zeros(g, 5, dtype=torch.int64, device=dev)
            moves[idx] = move
            self.advance(s, log, places, in_game, moves, live)
            decision += live.to(torch.int64)
            steps += 1
            if progress and steps % 200 == 0:
                # The tally so far, so a reading stopped before its last game still says something.
                ended = s.phase == 3
                won = searcher[ended].gather(1, s.winner[ended].to(torch.int64)[:, None])
                print(f"  step {steps}: {int(live.sum())} games running, turn {int(s.turn.max())}, "
                      f"{sum(self.searched.values())} searched, {time.time() - started:.0f}s; "
                      f"{int(ended.sum())} decided, the search side won {int(won.sum())}", flush=True)
            if saver is not None and saver.due(steps):
                saver.save(place())
        won = s.phase == 3
        return {"winner": torch.where(won, s.winner.to(torch.int64), -1).cpu(), "turns": s.turn.cpu(), "state": s,
                "scores": scores(s.players, places, s.eliminated, won, in_game).cpu(), "wall": time.time() - started}


# --- the reading ---------------------------------------------------------------------------------


def seating(mixtures: list[str], games: int, players: int) -> tuple[list[str], torch.Tensor, list[tuple[str, slice]]]:
    """`(seeds, searcher [G, 6], (mixture, its rows))`: PairEval's deals and seats, `games` per
    mixture (its one-in half first, then its one-out half: game i is the deal `pair-2-i`)."""
    seeds, masks, spans = [], [], []
    for name in mixtures:
        offset = 0 if name == "one-in" else games
        g = torch.arange(offset, offset + games)
        lone = (g % players)[:, None] == torch.arange(MAX_SEATS)[None, :]
        present = torch.arange(MAX_SEATS)[None, :] < players
        mask = lone if name == "one-in" else (~lone & present)
        spans.append((name, slice(len(seeds), len(seeds) + games)))
        seeds += [f"pair-2-{i}" for i in g.tolist()]
        masks.append(mask)
    return seeds, torch.cat(masks), spans


class SaveFile:
    """A long reading's place on disk, written every `every` seconds and swapped in whole, so a run
    stopped for any reason goes on with `--resume`. `key` is what the run was asked; a save made
    for another question is refused."""

    def __init__(self, path: str, every: float, key: dict):
        self.path, self.every, self.key = path, every, key
        self.last = time.time()
        self.readings: list[dict] = []  # the readings already finished, kept with the place

    def due(self, steps: int) -> bool:
        return time.time() - self.last >= self.every

    def save(self, place: dict) -> None:
        tmp = self.path + ".tmp"
        torch.save({"key": self.key, "readings": self.readings, "place": place}, tmp)
        os.replace(tmp, self.path)
        self.last = time.time()

    def load(self) -> dict:
        saved = torch.load(self.path, weights_only=True)
        differ = {k for k in self.key.keys() | saved["key"].keys() if self.key.get(k) != saved["key"].get(k)}
        assert not differ, f"{self.path} was saved by a run asked otherwise: {sorted(differ)}"
        return saved


def file_digest(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def reading(net: Net, board: Board, tables: BlitzTables, cfg: SearchConfig, device: str, games: int,
            mixtures: list[str], raw: str, players: int = 5, progress: bool = False, raw_net: Net | None = None,
            saver: SaveFile | None = None, resume: dict | None = None) -> dict:
    seeds, searcher, spans = seating(mixtures, games, players)
    s = Searcher(net, board, tables, cfg, device, raw_net)
    result = s.play(seeds, players, searcher, raw == "argmax", progress, saver=saver, resume=resume)
    wall = result["wall"]
    winner = result["winner"]
    out = {"raw": raw}
    for name, rows in spans:
        w = winner[rows]
        decisive = w >= 0
        won = searcher[rows][decisive].gather(1, w[decisive][:, None])[:, 0]
        d, wins = int(decisive.sum()), int(won.sum())
        par = 1 / players if name == "one-in" else (players - 1) / players
        lo, hi = wilson(wins, d)
        interval = (max(0.0, lo), min(1.0, hi))  # max(0.0, -0.0) is 0.0: no "-0.000" printed
        out[name] = {"win": round(wins / max(d, 1), 4), "par": round(par, 4), "interval": interval, "decisive": d,
                     "capped": int((~decisive).sum()), "games": int(w.shape[0])}
    searched = sum(s.searched.values())
    out["searched"] = {name: {"searched": s.searched[name], "overruled": s.overruled[name],
                              "overruled_share": round(s.overruled[name] / max(s.searched[name], 1), 4),
                              "skipped": s.skipped[name]} for name in KINDS if name in cfg.kinds}
    out["overruled_share"] = round(sum(s.overruled.values()) / max(searched, 1), 4)
    work = asdict(s.work)
    out["work"] = {**work, "total": sum(work.values()), "per_game": round(sum(work.values()) / len(seeds), 1),
                   "per_search": round((work["rollout"] + work["leaf"]) / max(searched, 1), 1)}
    out["wall_s"] = round(wall, 1)
    return out


def print_table(out: dict) -> None:
    print(f"\n{out['ckpt']}: K={out['config']['k']} R={out['config']['r']} leaf={out['config']['leaf']} "
          f"kinds={','.join(out['config']['kinds'])} hidden={out['config']['hidden']}")
    print(f"  NOTE: {out['leaf_note']}")
    if out["config"]["hidden"] == "real":
        print("  NOTE: hidden=real: the copies hold the real hidden cards (the other hands, the deck's order): optimistic")
    for r in out["readings"]:
        print(f"  raw seats {r['raw']}  ({r['wall_s']} s)")
        for name in MIXTURES:
            if name in r:
                m = r[name]
                print(f"    {name:8s} search side wins {m['win']:.3f} [{m['interval'][0]:.3f}, {m['interval'][1]:.3f}] "
                      f"of {m['decisive']} decisive (par {m['par']:.2f}), {m['capped']} capped of {m['games']}")
        for name, k in r["searched"].items():
            print(f"    {name:10s} searched {k['searched']:7d}  overruled {k['overruled_share']:.3f}  skipped {k['skipped']}")
        w = r["work"]
        print(f"    work: trunk rows {w['total']:,} ({w['per_game']:,.0f} a game; game {w['game']:,}, "
              f"rollout {w['rollout']:,}, leaf {w['leaf']:,}; {w['per_search']:,.0f} a search)")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--ckpt", required=True)
    p.add_argument("--k", type=int, default=4)
    p.add_argument("--r", type=int, default=8)
    p.add_argument("--leaf", default="own", help="own (the searcher's next decision of a later turn), turn, turns:N or end")
    p.add_argument("--kinds", default="reinforce,attack", help="decision kinds searched, comma-separated, or all")
    p.add_argument("--skip-mass", type=float, default=0.95,
                   help="a first choice with this much probability or more isn't searched (0: search nothing, the control)")
    p.add_argument("--margin", type=float, default=0.02, help="how far a candidate's mean must beat the first choice's")
    p.add_argument("--hidden", default="resample", choices=["resample", "real"])
    p.add_argument("--crn", action=argparse.BooleanOptionalAction, default=True,
                   help="candidates share each copy index's stream and deal (common random numbers)")
    p.add_argument("--games", type=int, default=1024, help="games per mixture")
    p.add_argument("--mixtures", default="one-in,one-out")
    p.add_argument("--raw", default="argmax", help="how raw seats play: argmax, sample, or both comma-separated")
    p.add_argument("--raw-ckpt", default="", help="the network the raw seats play (default: --ckpt's)")
    p.add_argument("--cap", type=int, default=600, help="the turn cap in player-turns")
    p.add_argument("--chunk", type=int, default=8192)
    p.add_argument("--max-copies", type=int, default=65536)
    p.add_argument("--check", action=argparse.BooleanOptionalAction, default=True,
                   help="validate every move against the options (a few host syncs a step)")
    p.add_argument("--seed", type=int, default=1)
    p.add_argument("--device", default="cuda", choices=["cuda", "cpu"])
    p.add_argument("--bf16", action=argparse.BooleanOptionalAction, default=None,
                   help="the network in bfloat16 autocast (default: on for cuda, off for cpu)")
    p.add_argument("--threads", type=int, default=0, help="CPU threads (0: torch's default)")
    p.add_argument("--progress", action="store_true")
    p.add_argument("--out", default="")
    p.add_argument("--save-minutes", type=float, default=10,
                   help="with --out, the run's place is saved beside it (<out>.resume.pt) this often")
    p.add_argument("--resume", action="store_true", help="go on from the place saved beside --out")
    args = p.parse_args(argv)
    assert args.out or not args.resume, "--resume reads the place saved beside --out: name it"

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
    torch.manual_seed(args.seed)
    kinds = tuple(KINDS) if args.kinds == "all" else tuple(x for x in args.kinds.split(",") if x)
    cfg = SearchConfig(k=args.k, r=args.r, leaf=args.leaf, kinds=kinds, skip_mass=args.skip_mass, margin=args.margin,
                       hidden=args.hidden, crn=args.crn, cap=args.cap, chunk=args.chunk, max_copies=args.max_copies,
                       bf16=bf16, check=args.check, seed=args.seed)
    mixtures = [m for m in args.mixtures.split(",") if m]
    assert all(m in MIXTURES for m in mixtures), mixtures
    raws = [r for r in args.raw.split(",") if r]
    assert all(r in ("argmax", "sample") for r in raws), raws

    from .ladder import load_net
    board = Board.load(device)
    tables = BlitzTables.load(os.path.join(DATA, "blitz-256"), device)
    tables.scaled_oversize = True
    net = load_net(args.ckpt, board, device)
    raw_net = load_net(args.raw_ckpt, board, device) if args.raw_ckpt else None
    out = {"ckpt": args.ckpt, "raw_ckpt": args.raw_ckpt or args.ckpt, "device": str(torch.device(device)), "config": asdict(cfg), "games": args.games,
           "mixtures": mixtures, "readings": [],
           "leaf_note": OWN_LEAF if cfg.leaf == "own" else OTHER_LEAF.format(leaf=cfg.leaf)}
    if cfg.hidden == "real":
        out["warning"] = "hidden=real: copies hold the real other hands and deck order (optimistic)"
    saver, saved = None, None
    if args.out:
        # What the run is asked: every argument that changes its games, and the nets' own bytes.
        asked = {k: v for k, v in vars(args).items() if k not in ("progress", "out", "save_minutes", "resume", "threads")}
        key = {**asked, "ckpt_sha": file_digest(args.ckpt), "raw_ckpt_sha": file_digest(args.raw_ckpt) if args.raw_ckpt else ""}
        saver = SaveFile(args.out + ".resume.pt", args.save_minutes * 60, key)
        if args.resume:
            saved = saver.load()
            saver.readings = out["readings"] = saved["readings"]
            print(f"resuming from {saver.path}: {len(saved['readings'])} readings done, "
                  f"step {saved['place']['steps']} of the next", flush=True)
        else:
            assert not os.path.exists(saver.path), \
                f"{saver.path} holds a stopped run: --resume to go on with it, or delete it to start again"
            saver.readings = out["readings"]
    with torch.inference_mode():
        for i, raw in enumerate(raws):
            if i < len(out["readings"]):
                assert out["readings"][i]["raw"] == raw, (out["readings"][i]["raw"], raw)
                continue
            resume = saved["place"] if saved is not None and i == len(saved["readings"]) else None
            out["readings"].append(reading(net, board, tables, cfg, device, args.games, mixtures, raw,
                                           progress=args.progress, raw_net=raw_net, saver=saver, resume=resume))
    print(json.dumps(out, indent=1))
    print_table(out)
    if args.out:
        with open(args.out, "w") as f:
            f.write(json.dumps(out, indent=1) + "\n")
        if os.path.exists(saver.path):
            os.remove(saver.path)
    return 0


if __name__ == "__main__":
    sys.exit(main())

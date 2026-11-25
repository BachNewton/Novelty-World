"""Games played by networks on the JAX engine: a batch of games, every tick one decision per game,
each seat's move from its network's raw policy (sampled, or its most likely move) or uniformly at
random among the legal choices.

    python -m riskgpu.jaxengine.play pair --ckpt A.pt --anchor B.pt [--games 1024] [--argmax]
    python -m riskgpu.jaxengine.play mirror --ckpt A.pt [--games 1024]
    python -m riskgpu.jaxengine.play bench [--ckpt A.pt] [--batch 1024 4096] [--ticks 64]

run from `src/projects/risk/gpu/`. `pair` is the panel's head-to-head reading (`selfplay/panel.py`,
`ppo.PairEval`): the network alone among four copies of the anchor on half the fixed 5-player deals,
the lone seat rotated, the reverse on the rest, the anchor always sampling; its win share of the
decisive games against par, with a 95% Wilson interval. `mirror` is the stall's health reading: five
copies of the network each playing its most likely move, and the share of games that reach the cap
of 600 player-turns. The deals are the PyTorch panel's own (the same seeds on the same stream), the
moves the networks' own draws. `bench` counts decisions a second: the engine alone with uniformly
random legal moves, or with the network in every seat.

**Every network runs over every row** in this first version, and its rows are picked after; a
reading with two networks pays for both on every row (`ideas/tpu.md`).
"""

import argparse
import json
import sys
import time
from typing import NamedTuple

import jax
import jax.numpy as jnp
import numpy as np

from ..board import MAX_SEATS, Board
from ..selfplay.obs import GLOBAL
from ..selfplay.panel import reading, wilson
from ..tpu.convert import load
from ..tpu.net import NEG, Forward, constants
from .actions import amount_group, decode, legal_amount, legal_main
from .engine import Rules
from .lockstep import load_tables
from .obs import TurnLog, clock, observe
from .state import I32, State, new_games, seed_states, take

RANDOM = -1  # a seat's controller: uniformly random among the legal choices


class Seat(NamedTuple):
    """A network as a controller: its parameters (the tick's argument), whether it reads the clock
    and whether it plays its most likely move (both static)."""
    clock: bool
    greedy: bool


class Games(NamedTuple):
    s: State
    log: TurnLog
    seat_net: jnp.ndarray  # [B, 6]: each seat's controller, an index into the networks or RANDOM
    cap: jnp.ndarray  # [B] the turn cap
    done: jnp.ndarray  # [B] bool
    key: jnp.ndarray


def choose(z, key, greedy: bool):
    """The most likely choice, or a sample (Gumbel-max)."""
    if greedy:
        return jnp.argmax(z, 1)
    return jnp.argmax(z + jax.random.gumbel(key, z.shape), 1)


def act(forward: Forward, params: dict, node, slot, glob, legal, key, greedy: bool):
    """`(main, amount)` of a bucket-space network (`net.act`)."""
    x = forward.trunk(params, node, slot, glob)
    logits, _ = forward.heads_main(params, x)
    k_main, k_amount = jax.random.split(key)
    main = choose(jnp.where(legal, logits, NEG), k_main, greedy)
    za = jnp.where(legal_amount(amount_group(main)), forward.amount_buckets(params, x, main), NEG)
    return main, choose(za, k_amount, greedy)


class Player:
    """The rules, the tables and the networks' forward pass, and the jitted tick."""

    def __init__(self, board: Board, tables, seats: list[Seat], dtype=jnp.bfloat16):
        self.rules = Rules(board)
        self.tables = tables
        self.seats = seats
        self.forward = Forward(constants(board.edges.numpy(), board.adjacency.numpy()), dtype)
        self.run = jax.jit(self._run, static_argnums=3)
        self.deal = jax.jit(lambda seeds, players: new_games(self.rules.setup, seeds, players))

    def tick(self, params: list[dict], tables, g: Games) -> tuple[Games, jnp.ndarray]:
        rules, s = self.rules, g.s
        o = rules.options(s)
        legal = legal_main(o)
        node, slot, glob = observe(rules, s, o, g.log)
        controller = take(g.seat_net, s.active)
        key, k_random, *k_nets = jax.random.split(g.key, 2 + len(self.seats))
        main = choose(jnp.where(legal, 0.0, NEG), k_random, False)
        amount = choose(jnp.where(legal_amount(amount_group(main)), 0.0, NEG), jax.random.fold_in(k_random, 1), False)
        for i, (seat, p) in enumerate(zip(self.seats, params)):
            seen = jnp.concatenate([glob, clock(s.turn, g.cap)], 1) if seat.clock else glob
            m, a = act(self.forward, p, node, slot, seen, legal, k_nets[i], seat.greedy)
            main = jnp.where(controller == i, m, main)
            amount = jnp.where(controller == i, a, amount)
        moves = decode(rules, main, amount, s, o)
        live = ~g.done & (s.phase != 3)
        after, _ = rules.step(tables, s, moves, ~live)
        log = g.log.update(s, after, moves, live)
        ended = live & ((after.phase == 3) | (after.turn > g.cap))
        return g._replace(s=after, log=log, done=g.done | ended, key=key), live.sum()

    def _run(self, params, g: Games, tables, ticks: int):
        def body(g, _):
            return self.tick(params, tables, g)

        g, live = jax.lax.scan(body, g, None, length=ticks)
        return g, live.sum()

    def start(self, seeds: list[str], players: int, seat_net: np.ndarray, cap: int, key: int) -> Games:
        batch = len(seeds)
        s = self.deal(seed_states(seeds), jnp.full(batch, players, I32))
        return Games(s, TurnLog.empty(batch), jnp.asarray(seat_net, I32), jnp.full(batch, cap, I32),
                     jnp.zeros(batch, bool), jax.random.PRNGKey(key))

    def play_out(self, params, g: Games, chunk: int = 64, most: int = 40000) -> Games:
        ticks = 0
        while not bool(g.done.all()) and ticks <= most:
            g, _ = self.run(params, g, self.tables, chunk)
            ticks += chunk
        return g


def net_seat(path: str, greedy: bool) -> tuple[Seat, dict]:
    params = load(path)
    return Seat(clock=params["glob_in.weight"].shape[1] > GLOBAL, greedy=greedy), {k: jnp.asarray(v) for k, v in params.items()}


def pair_reading(board, tables, ckpt: str, anchor: str, games: int, greedy: bool, players: int = 5, seed: int = 0,
                 dtype=jnp.bfloat16) -> dict:
    me, p_me = net_seat(ckpt, greedy)
    them, p_them = net_seat(anchor, False)
    player = Player(board, tables, [me, them], dtype)
    half = games // 2
    g_ = np.arange(games)
    lone = (g_ % players)[:, None] == np.arange(players)[None, :]
    mine = np.where(g_[:, None] < half, lone, ~lone)
    seat_net = np.full((games, MAX_SEATS), RANDOM)
    seat_net[:, :players] = np.where(mine, 0, 1)
    g = player.start([f"pair-2-{i}" for i in range(games)], players, seat_net, 600, seed)
    g = player.play_out([p_me, p_them], g)
    winner = np.asarray(g.s.winner)
    decisive = winner >= 0
    won = np.zeros(games, bool)
    won[decisive] = mine[decisive, winner[decisive]]
    out = {}
    for name, rows, par in (("one-in", slice(0, half), 1 / players), ("one-out", slice(half, None), 1 - 1 / players)):
        n = int(decisive[rows].sum())
        out[name] = {**reading(int(won[rows].sum()) / max(n, 1), n, par), "capped": int((~decisive[rows]).sum())}
    return out


def mirror_reading(board, tables, ckpt: str, games: int, players: int = 5, seed: int = 0, dtype=jnp.bfloat16) -> dict:
    me, params = net_seat(ckpt, True)
    player = Player(board, tables, [me], dtype)
    seat_net = np.full((games, MAX_SEATS), RANDOM)
    seat_net[:, :players] = 0
    g = player.start([f"mirror-2-{i}" for i in range(games)], players, seat_net, 600, seed)
    g = player.play_out([params], g)
    capped = int((np.asarray(g.s.winner) < 0).sum())
    return {"games": games, "capped": round(capped / games, 4), "interval": wilson(capped, games),
            "turns": round(float(np.asarray(g.s.turn).mean()), 1)}


def bench(board, tables, ckpt: str | None, batches: list[int], ticks: int, repeats: int, dtype=jnp.bfloat16) -> list[dict]:
    """Decisions a second at each batch, over `repeats` runs of `ticks` ticks after one to compile,
    every game at 5 players from a fresh deal; the decisions counted are the games' live steps."""
    if ckpt:
        seat, params = net_seat(ckpt, False)
        seats, params = [seat], [params]
    else:
        seats, params = [], []
    player = Player(board, tables, seats, dtype)
    out = []
    for batch in batches:
        seat_net = np.full((batch, MAX_SEATS), 0 if ckpt else RANDOM)
        g = player.start([f"bench-{i}" for i in range(batch)], 5, seat_net, 600, 0)
        t0 = time.perf_counter()
        g, live = player.run(params, g, tables, ticks)
        live.block_until_ready()
        compile_s = time.perf_counter() - t0
        decisions, seconds = 0, 0.0
        for _ in range(repeats):
            t0 = time.perf_counter()
            g, live = player.run(params, g, tables, ticks)
            decisions += int(live)
            seconds += time.perf_counter() - t0
        out.append({"batch": batch, "ticks": ticks * repeats, "decisions": decisions,
                    "decisions_per_s": round(decisions / seconds), "first_run_s": round(compile_s, 1)})
        print(json.dumps(out[-1]), flush=True)
    return out


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = p.add_subparsers(dest="what", required=True)
    pair = sub.add_parser("pair")
    pair.add_argument("--ckpt", required=True)
    pair.add_argument("--anchor", required=True)
    pair.add_argument("--argmax", action="store_true", help="the network plays its most likely move")
    mirror = sub.add_parser("mirror")
    mirror.add_argument("--ckpt", required=True)
    b = sub.add_parser("bench")
    b.add_argument("--ckpt", default="")
    b.add_argument("--batch", type=int, nargs="+", default=[1024])
    b.add_argument("--ticks", type=int, default=64)
    b.add_argument("--repeats", type=int, default=3)
    for q in (pair, mirror):
        q.add_argument("--games", type=int, default=1024)
    for q in (pair, mirror, b):
        q.add_argument("--tables", default=None)
        q.add_argument("--f32", action="store_true", help="the network in float32 (default bfloat16)")
        q.add_argument("--out", default="")
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    board = Board.load("cpu")
    tables = load_tables(args.tables)
    dtype = jnp.float32 if args.f32 else jnp.bfloat16
    result = {"device": str(jax.devices()[0]), "devices": jax.device_count(), "what": args.what}
    if args.what == "pair":
        result |= {"ckpt": args.ckpt, "anchor": args.anchor, "argmax": args.argmax,
                   **pair_reading(board, tables, args.ckpt, args.anchor, args.games, args.argmax, dtype=dtype)}
    elif args.what == "mirror":
        result |= {"ckpt": args.ckpt, **mirror_reading(board, tables, args.ckpt, args.games, dtype=dtype)}
    else:
        result |= {"ckpt": args.ckpt or None, "rates": bench(board, tables, args.ckpt or None, args.batch, args.ticks,
                                                              args.repeats, dtype)}
    text = json.dumps(result, indent=1)
    print(text)
    if args.out:
        with open(args.out, "w") as f:
            f.write(text + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())

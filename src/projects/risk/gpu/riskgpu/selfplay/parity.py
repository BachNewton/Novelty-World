"""The parity fixture of the TypeScript bots `net-v1` (`bots/net-v1/`, the bucket space) and
`net-v2` (`bots/net-v2/`, the exact space): GPU-engine games with the network in some seats and
greedy in the rest, the network choosing its most likely main choice and amount in fp32 on the CPU,
kept as game records with, for every network decision, a digest of what the Python network
computed. Each bot's `parity.test.ts` replays the records on the reference engine and holds the
TypeScript bot to every digest and every move.

    python -m riskgpu.selfplay.parity --out ../bots/net-v1/__fixtures__/parity-tiny.json.gz --random 32,2,4,2
    python -m riskgpu.selfplay.parity --out ../bots/net-v2/__fixtures__/parity-tiny.json.gz --random 32,2,4,2 --actions exact
    python -m riskgpu.selfplay.parity --out ../bots/net-v1/__fixtures__/parity-m1a-25.json.gz \\
        --ckpt latest-copy.pt --weights m1a-25

run from `src/projects/risk/gpu/`. `--random width,layers,heads,ff_mult` makes a random network
whose every parameter is perturbed off its initial value (a zero border bias would leave the
attention's map untested) and keeps its weights in the fixture; `--ckpt` plays a checkpoint and
names the exported weight set (`--weights`) the test loads instead.

A digest is the decision's index in its game, the five highest legal main logits (index and value,
highest first, ties to the lower index), the value vector, the chosen main choice and amount, the
amount logits of the legal buckets or argument slots, a weighted checksum of the observation and, for every
`--obs-every`-th network decision of the fixture, the observation itself. An exact-space fixture
also keeps `spread`'s counts over many ranges, since its games seldom outgrow the slots.
"""

import argparse
import gzip
import json
import os
import sys
from dataclasses import fields

import numpy as np
import torch

from ..board import Board
from ..bots.greedy import greedy_bot
from ..data import load_best
from ..options import Options
from ..runner import Decision, play_games
from .actions import SLOTS, decode, decode_exact, legal_main, spread
from .export import load_state_dict, weights_object
from .net import Net, amount_choice, masked, shape_of
from .obs import observe

SEATINGS = [
    ["net", "greedy", "greedy"],
    ["greedy", "net", "greedy", "net"],
    ["net", "greedy", "net", "greedy", "greedy"],
    ["greedy", "greedy", "net", "greedy", "net", "greedy"],
]


def f32(x) -> float:
    """A float32 as the shortest decimal that reads back as it."""
    return float(repr(np.float32(x)))


def checksum(flat: torch.Tensor) -> float:
    """Σ obs[i] · (1 + (i mod 7) / 10 + (i mod 13) / 100), in float64, in index order (the
    TypeScript's `checksum` in the test)."""
    i = torch.arange(flat.shape[0], dtype=torch.float64)
    w = 1 + (i % 7) / 10 + (i % 13) / 100
    total = 0.0
    for v, k in zip(flat.to(torch.float64).tolist(), w.tolist()):
        total += v * k
    return total


def random_net(width: int, layers: int, heads: int, ff_mult: int, board: Board, seed: int, actions: str = "buckets") -> Net:
    torch.manual_seed(seed)
    net = Net(width, layers, heads, ff_mult, edges=board.edges, adjacency=board.adjacency, actions=actions)
    with torch.no_grad():
        for name, p in net.named_parameters():
            if name.endswith("border") or name == "edge_bias":
                p.copy_(torch.randn_like(p))
            elif name == "identity":
                p.copy_(torch.randn_like(p) * 0.5)
            elif ".ln" in name or name.startswith("ln."):
                p.add_(torch.randn_like(p) * 0.2)
            else:
                p.add_(torch.randn_like(p) * 0.02)
    return net


def net_bot(net: Net, board: Board, digests: dict, obs_every: int):
    count = [0]

    def bot(d: Decision, mask: torch.Tensor) -> torch.Tensor:
        moves = torch.zeros(d.state.batch, 5, dtype=torch.int64)
        idx = mask.nonzero()[:, 0]
        if idx.numel() == 0:
            return moves
        s = d.state.select(idx)
        o = Options(**{f.name: getattr(d.options, f.name)[idx] for f in fields(Options)})
        node, slot, glob = observe(s, o, d.log.placed_on[idx], d.log.attacks[idx], d.log.captured[idx], board)
        with torch.no_grad():
            x = net.trunk(node, slot, glob)
            logits, value, _ = net.heads_main(x)
            legal = legal_main(o, net.exact)
            z = masked(logits, legal)
            main = z.argmax(1)
            za, amount_legal, c = amount_choice(net, x, main, s, o, board)
            amount = za.argmax(1)
        moves[idx] = decode_exact(main, amount, s, o, board, c) if net.exact else decode(main, amount, s, o, board)
        decision = d.decision[idx].tolist()
        for r, g in enumerate(idx.tolist()):
            legal_idx = legal[r].nonzero()[:, 0]
            vals = logits[r, legal_idx]
            # highest first, ties to the lower index (a stable sort of the negated values)
            order = torch.sort(-vals, stable=True).indices[:5]
            flat = torch.cat([node[r].reshape(-1), slot[r].reshape(-1), glob[r]])
            digest = {
                "decision": decision[r],
                "top": [[int(legal_idx[k]), f32(vals[k])] for k in order.tolist()],
                "value": [f32(v) for v in value[r].tolist()],
                "main": int(main[r]),
                "amount": int(amount[r]),
                "amountLogits": [f32(v) for v, ok in zip(za[r].tolist(), amount_legal[r].tolist()) if ok],
                "checksum": checksum(flat),
            }
            if count[0] % obs_every == 0:
                digest["obs"] = [f32(v) for v in flat.tolist()]
            count[0] += 1
            digests.setdefault(g, []).append(digest)
        return moves

    return bot


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--out", required=True)
    p.add_argument("--random", help="width,layers,heads,ff_mult of a random network")
    p.add_argument("--seed", type=int, default=7, help="the random network's seed")
    p.add_argument("--actions", default="buckets", choices=["buckets", "exact"], help="the random network's action space")
    p.add_argument("--ckpt", help="a checkpoint to play")
    p.add_argument("--weights", help="the exported weight set of --ckpt")
    p.add_argument("--prefix", default="net-parity")
    p.add_argument("--games", type=int, default=4, help="games, one per seating in turn (3 to 6 players)")
    p.add_argument("--turns", type=int, default=40)
    p.add_argument("--obs-every", type=int, default=10)
    args = p.parse_args(argv)
    if (args.random is None) == (args.ckpt is None):
        p.error("give one of --random and --ckpt")
    if args.ckpt is not None and args.weights is None:
        p.error("--ckpt needs --weights, the weight set it was exported as")
    torch.set_num_threads(1)
    device = "cpu"
    board = Board.load(device)
    tables = load_best(device)
    if args.random is not None:
        width, layers, heads, ff_mult = (int(x) for x in args.random.split(","))
        net = random_net(width, layers, heads, ff_mult, board, args.seed, args.actions)
        net_spec = {"inline": weights_object({k: v.detach().clone() for k, v in net.state_dict().items()})}
    else:
        state = load_state_dict(args.ckpt)
        net = Net(**shape_of(state), edges=board.edges, adjacency=board.adjacency)
        net.load_state_dict(state)
        net_spec = {"weights": args.weights}
    net.eval()

    digests: dict[int, list] = {}
    seatings = [SEATINGS[i % len(SEATINGS)] for i in range(args.games)]
    seeds = [f"{args.prefix}-{i}" for i in range(args.games)]
    bots = {"net": net_bot(net, board, digests, args.obs_every), "greedy": greedy_bot}
    results, records = play_games(seeds, seatings, bots=bots, board=board, tables=tables, max_turns=args.turns,
                                  device=device, record=True)
    for g, record in enumerate(records):
        record["net"] = digests.get(g, [])
        record.pop("provenance", None)
    fixture = {"net": net_spec, "records": records}
    if net.exact:
        # The games rarely reach a range wider than the slots, so `spread` is pinned on its own.
        hi = torch.tensor([w for w in range(1, 121)] + list(range(150, 701, 50)))
        fixture["spread"] = []
        for slots in (SLOTS - 1, SLOTS):
            for lo in (1, 3):
                values, legal, _ = spread(torch.full_like(hi, lo), hi + lo - 1, slots)
                fixture["spread"] += [{"lo": lo, "hi": int(h) + lo - 1, "slots": slots, "values": values[r][legal[r]].tolist()}
                                      for r, h in enumerate(hi)]
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with gzip.open(args.out, "wt", encoding="utf-8", compresslevel=9) as f:
        json.dump(fixture, f, separators=(",", ":"))
    n = sum(len(v) for v in digests.values())
    print(f"{len(records)} games ({sum(r.capped for r in results)} capped), {sum(r.decisions for r in results)} moves, "
          f"{n} network decisions -> {args.out} ({os.path.getsize(args.out):,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

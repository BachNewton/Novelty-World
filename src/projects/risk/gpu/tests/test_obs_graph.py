"""The graph inputs (`riskgpu/selfplay/obs.py`, `graph`): each held to a slow reference that walks
the board a territory at a time, on random legal states and the positions of recorded games; the
observation of a net that reads them is its plain observation with them after each group; and a net
given them from a checkpoint without them starts as that checkpoint, on d4-500's weights."""

import base64
import os
import re

import numpy as np
import torch

from riskgpu.board import Board
from riskgpu.bots.random import random_bot
from riskgpu.data import fixture_paths, load_best
from riskgpu.engine import step
from riskgpu.options import options
from riskgpu.records import read_records
from riskgpu.runner import Decision, TurnLog
from riskgpu.selfplay.env import KEPT
from riskgpu.selfplay.export import BOTS
from riskgpu.selfplay.imitate import replay
from riskgpu.selfplay.net import Net, init_from
from riskgpu.selfplay.obs import BLITZ_BOUND, GLOBAL, NODE, SLOT, capture_chances, graph_inputs, observe, slots
from riskgpu.state import LAYOUT, State, new_games


def cat(states: list[State]) -> State:
    return State(**{name: torch.cat([getattr(s, name) for s in states]) for name in LAYOUT})


def random_states(board: Board, games: int = 48, every: int = 25, decisions: int = 200) -> State:
    """Snapshots of random-legal games at 3 to 6 players, every `every` decisions."""
    tables = load_best("cpu")
    s = new_games([f"graph-{i}" for i in range(games)], [3 + i % 4 for i in range(games)], board, "cpu")
    everyone = torch.ones(games, dtype=torch.bool)
    kept = []
    for decision in range(decisions):
        live = s.phase != 3
        d = Decision(s, options(s, board), board, tables, TurnLog.empty(games, "cpu"), torch.full((games,), decision),
                     torch.zeros(games, 6, dtype=torch.bool), [""] * games)
        step(s, random_bot(d, everyone & live), board, tables, done=~live, check=True)
        if (decision + 1) % every == 0:
            kept.append(s.select(torch.nonzero(s.phase != 3)[:, 0]))
    return cat(kept)


def recorded_positions(board: Board, games: int = 4):
    """Every decision of the shortest few committed reference games, with the turn so far."""
    records = sorted((r for path in fixture_paths() for r in read_records(path)), key=lambda r: len(r["moves"]))[:games]
    samples, _, _ = replay(records, lambda label: True, board, load_best("cpu"), "cpu")
    n = len(samples["game"])
    fields = {name: samples[name] for name in KEPT}
    fields["armies"] = fields["armies"].to(torch.int32)
    fields["rng"] = torch.zeros(n, dtype=torch.int64)
    fields["deck"] = torch.full((n, LAYOUT["deck"][0][0]), -1, dtype=torch.int8)
    return State(**{name: fields[name] for name in LAYOUT}), samples


def reference(s: State, board: Board):
    """The graph inputs worked out game by game, territory by territory."""
    neighbours = [[n for n in row if n >= 0] for row in board.adjacent.tolist()]
    continent = board.continent_of.tolist()
    members = [[t for t in range(42) if continent[t] == c] for c in range(6)]
    table = capture_chances("cpu").to(torch.float64).numpy()

    def chance(a: int, d: int) -> float:
        most = max(a, d)
        if most > BLITZ_BOUND:
            a, d = (min(max((x * BLITZ_BOUND + most // 2) // most, 1), BLITZ_BOUND) for x in (a, d))
        return float(table[a, d])

    def norm(x: float) -> float:
        return float(np.log1p(np.float32(x)) / 4)

    node, seat, glob = [], [], []
    for owner, armies, me in zip(s.owner.tolist(), s.armies.tolist(), s.active.tolist()):
        foes = [[n for n in neighbours[t] if owner[n] != owner[t]] for t in range(42)]
        exposed = [sum(armies[n] for n in foes[t]) for t in range(42)]
        node.append([[norm(exposed[t]), norm(max((armies[n] for n in foes[t]), default=0)),
                      sum(owner[u] != owner[t] for u in members[continent[t]]) / len(members[continent[t]]),
                      max((chance(armies[t] - 1, armies[n]) for n in foes[t]), default=0.0) if armies[t] > 1 else 0.0]
                     for t in range(42)])
        bordering = {n for t in range(42) if owner[t] == me for n in neighbours[t]}
        rows = []
        for k in range(6):
            near = [n for n in bordering if owner[n] == k] if k != me else []
            rows.append([sum(owner[u] == k for u in m) / len(m) for m in members]
                        + [norm(sum(armies[n] for n in near)), len(near) / 42])
        seat.append(rows)
        mine = [t for t in range(42) if owner[t] == me]
        glob.append([norm(sum(exposed[t] for t in mine)), sum(armies[t] == 1 and bool(foes[t]) for t in mine) / 42])
    return (torch.tensor(node, dtype=torch.float64), torch.tensor(seat, dtype=torch.float64),
            torch.tensor(glob, dtype=torch.float64))


def test_the_graph_inputs_are_what_a_walk_over_the_board_reads():
    board = Board.load("cpu")
    played = random_states(board)
    recorded, _ = recorded_positions(board)
    # The same boards with every stack nine times over, so fights past the blitz table's bound are read.
    massed = cat([played, recorded])
    massed.armies = massed.armies * 9
    s = cat([played, recorded, massed])
    assert s.batch > 300 and int(s.armies.max()) > 4 * BLITZ_BOUND
    got = graph_inputs(s, board)
    want = reference(s, board)
    for name, g, w in zip(("node", "seat", "glob"), got, want):
        assert g.shape == w.shape, (name, g.shape, w.shape)
        assert torch.allclose(g.to(torch.float64), w, atol=1e-6, rtol=0), (name, (g.to(torch.float64) - w).abs().max())


def test_a_net_with_the_graph_inputs_sees_the_plain_observation_with_them_after_each_group():
    board = Board.load("cpu")
    s, x = recorded_positions(board)
    o = options(s, board)
    cap = torch.full((s.batch,), 600)
    plain = observe(s, o, x["placed_on"], x["attacks"], x["captured"], board, cap)
    node, slot, glob = observe(s, o, x["placed_on"], x["attacks"], x["captured"], board, cap, graph=True)
    g_node, g_seat, g_glob = graph_inputs(s, board)
    seat_of_slot, _ = slots(s)
    by_slot = g_seat.gather(1, seat_of_slot.clamp(min=0)[:, :, None].expand(-1, -1, g_seat.shape[2]))
    by_slot = by_slot * (seat_of_slot >= 0)[:, :, None]
    assert torch.equal(node, torch.cat([plain[0], g_node], 2))
    assert torch.equal(slot, torch.cat([plain[1], by_slot], 2))
    assert torch.equal(glob, torch.cat([plain[2], g_glob], 1))
    assert (node.shape[2], slot.shape[2], glob.shape[1]) == (NODE + 4, SLOT + 8, GLOBAL + 1 + 2)


def committed_weights(name: str) -> tuple[dict, dict[str, np.ndarray]]:
    """A net-v1 weight set as `export.py` wrote it: its header and its tensors, flat."""
    with open(os.path.join(BOTS, "net-v1", "weights", f"{name}.ts"), encoding="utf-8") as f:
        text = f.read()
    header = {k: v for k, v in re.findall(r"^  (\w+): (\d+|true|false),$", text, re.M)}
    tensors = {k: np.frombuffer(base64.b64decode(v), dtype="<f4") for k, v in re.findall(r'^    "([^"]+)": "([^"]+)",$', text, re.M)}
    return header, tensors


def test_a_net_given_the_graph_inputs_starts_as_the_checkpoint_it_is_given():
    board = Board.load("cpu")
    header, tensors = committed_weights("d4-500")  # runs/selfplay/d4/snap-500.pt, exported
    width = int(header["width"])
    shape = {"width": width, "layers": int(header["layers"]), "heads": int(header["heads"]),
             "ff_mult": int(header["ff"]) // width, "clock": header["clock"] == "true"}
    plain = Net(**shape, edges=board.edges, adjacency=board.adjacency)
    state = {k: torch.from_numpy(tensors[k].copy()).reshape(v.shape) for k, v in plain.state_dict().items()}
    plain.load_state_dict(state)
    graphed = Net(**shape, edges=board.edges, adjacency=board.adjacency, graph=True)
    init_from(graphed, {"net": state})
    assert graphed.graph and graphed.clock and graphed.node_in.in_features == plain.node_in.in_features + 4

    s, x = recorded_positions(board)
    o = options(s, board)
    cap = torch.full((s.batch,), 600)
    with torch.no_grad():
        outs = []
        for net in (plain, graphed):
            node, slot, glob = observe(s, o, x["placed_on"], x["attacks"], x["captured"], board, cap, net.graph)
            logits, value, aux = net.heads_main(net.trunk(node, slot, glob))
            outs.append((logits, value, aux))
    for a, b in zip(*outs):
        assert torch.allclose(a, b, atol=1e-4, rtol=1e-5), (a - b).abs().max()

"""The graphable GD bots against the eager ones: the committed GD fixtures replayed as one batch,
and at every decision a GD seat made the graphable bot asked about just those games (a subset of
the batch, its options and its turn so far, as the self-play step asks), with the exact decision
seeds supplied, compared with the recorded move. `test_gd.py` holds the eager bots to every one of
those moves, so agreeing with the record is agreeing with the eager bot. And one graphable call
captured in a CUDA graph and replayed, against the eager bot."""

import os
from collections import Counter

import pytest
import torch

from riskgpu.board import Board
from riskgpu.bots.gd import GD_BOTS, gd_bot_graphable
from riskgpu.bots.gd_personas import PERSONAS
from riskgpu.data import FIXTURES, load_best
from riskgpu.engine import step
from riskgpu.options import options
from riskgpu.records import read_records
from riskgpu.rng import bot_seed
from riskgpu.runner import Decision, TurnLog
from riskgpu.state import new_games

FILES = ("gd-5p", "gd-greedy-3p")
KINDS = {0: "place", 1: "trade", 3: "attack", 5: "attack", 4: "occupy", 6: "fortify", 7: "fortify"}


def _subset(d: Decision, idx: torch.Tensor) -> Decision:
    return Decision(d.state.select(idx), d.options.select(idx), d.board, d.tables, d.log.select(idx),
                    d.decision[idx], d.humans[idx], [d.bot_seeds[g] for g in idx.tolist()])


def _inside(d: Decision) -> torch.Tensor:
    """`[B]`: every fight GD weighs here fits the table (no attack it asks about exceeds two of the
    board's stacks and the armies to place, nor any defence a stack), so the graphable odds are
    exact."""
    most = d.state.armies.to(torch.int64).max(1).values
    return 2 * most + d.state.reinf_to_place.to(torch.int64) <= d.tables.bound


def test_graphable_gd_agrees_with_the_eager_gd_on_every_recorded_decision():
    board, tables = Board.load("cpu"), load_best("cpu")
    records = [r for name in FILES for r in read_records(os.path.join(FIXTURES, f"{name}.jsonl.gz"))]
    bots = {f"gd-{p}": gd_bot_graphable(p, tables) for p in PERSONAS}
    batch = len(records)
    s = new_games([r["seed"] for r in records], [r["players"] for r in records], board, "cpu")
    labels = [r["bots"] + [""] * (6 - r["players"]) for r in records]
    log = TurnLog.empty(batch, "cpu")
    seeds = [bot_seed(r["seed"]) for r in records]
    humans = torch.zeros(batch, 6, dtype=torch.bool)
    compared: Counter = Counter()
    outside = 0
    disagreements: list[str] = []
    for decision in range(max(len(r["moves"]) for r in records)):
        live = torch.tensor([decision < len(r["moves"]) for r in records])
        recorded = torch.tensor([r["moves"][decision][1:] if decision < len(r["moves"]) else [0] * 5 for r in records])
        legal = options(s, board)
        d = Decision(s, legal, board, tables, log, torch.full((batch,), decision, dtype=torch.int64), humans, seeds)
        active = s.active.tolist()
        seated = [labels[g][active[g]] for g in range(batch)]
        inside = _inside(d)
        for label, bot in bots.items():
            mine = live & torch.tensor([seat == label for seat in seated])
            outside += int((mine & ~inside).sum())
            idx = (mine & inside).nonzero()[:, 0]
            if len(idx) == 0:
                continue
            sub = _subset(d, idx)
            ours = bot(sub, torch.ones(len(idx), dtype=torch.bool), sub.seed).to(torch.int64)
            for k, g in enumerate(idx.tolist()):
                kind = KINDS[int(recorded[g, 0])]
                compared[kind] += 1
                if ours[k].tolist() != recorded[g].tolist():
                    disagreements.append(f"{kind}: {records[g]['seed']} ({label}) decision {decision}: "
                                         f"graphable {ours[k].tolist()}, recorded {recorded[g].tolist()}")
        before = s.clone()
        step(s, recorded, board, tables, done=~live, legal=legal)
        log.update(before, s, recorded, live)
    print(dict(compared), "outside the table:", outside)
    print("\n".join(disagreements))
    assert disagreements == []
    assert sum(compared.values()) + outside == 2267
    if tables.bound >= 256:
        assert outside == 0  # the 256 table holds every fight these games weigh


def _positions(device: str, games: int) -> tuple[Decision, torch.Tensor]:
    """`games` positions from the GD fixtures, replayed to a spread of decisions, as one batch."""
    board, tables = Board.load(device), load_best(device)
    records = [r for name in FILES for r in read_records(os.path.join(FIXTURES, f"{name}.jsonl.gz"))]
    picked = [(records[g % len(records)], (37 * g) % min(400, len(records[g % len(records)]["moves"]))) for g in range(games)]
    s = new_games([r["seed"] for r, _ in picked], [r["players"] for r, _ in picked], board, device)
    log = TurnLog.empty(games, device)
    for decision in range(max(n for _, n in picked)):
        live = torch.tensor([decision < n for _, n in picked], device=device)
        moves = torch.tensor([r["moves"][decision][1:] if decision < n else [0] * 5 for r, n in picked], device=device)
        before = s.clone()
        step(s, moves, board, tables, done=~live)
        log.update(before, s, moves, live)
    d = Decision(s, options(s, board), board, tables, log, torch.tensor([n for _, n in picked], device=device),
                 torch.zeros(games, 6, dtype=torch.bool, device=device), [bot_seed(r["seed"]) for r, _ in picked])
    return d, _inside(d)


@pytest.mark.skipif(not torch.cuda.is_available(), reason="no CUDA device")
@pytest.mark.parametrize("persona", ["aggressive", "stacker"])
def test_a_graphable_gd_call_replays_in_a_cuda_graph(persona):
    d, inside = _positions("cuda", 48)
    everyone = torch.ones(d.state.batch, dtype=torch.bool, device="cuda")
    eager = GD_BOTS[f"gd-{persona}"](d, everyone)
    bot = gd_bot_graphable(persona, d.tables)
    seed = d.seed.clone()
    stream = torch.cuda.Stream()
    stream.wait_stream(torch.cuda.current_stream())
    with torch.cuda.stream(stream):
        for _ in range(2):  # warm-up, outside the graph, as capture requires
            bot(d, everyone, seed)
    torch.cuda.current_stream().wait_stream(stream)
    graph = torch.cuda.CUDAGraph()
    with torch.cuda.graph(graph):
        moves = bot(d, everyone, seed)
    graph.replay()
    torch.cuda.synchronize()
    assert bool(inside.all())
    assert moves.tolist() == eager.tolist()

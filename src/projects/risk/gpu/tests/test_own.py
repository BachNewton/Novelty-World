"""Recording a net's own play (`riskgpu/selfplay/own.py`) and copying it into a fresh net
(`riskgpu/selfplay/distil.py`): a sample rebuilt from its file is what the net saw, its clock
included, and its target the net's most likely move there, while the games went on with its sampled
moves; every kind of decision is kept; held-out games are whole; and a net from random weights
learns the recording."""

import pytest
import torch

from riskgpu.board import Board
from riskgpu.data import load_best
from riskgpu.selfplay import distil, own, record
from riskgpu.selfplay.actions import legal_main
from riskgpu.selfplay.imitate import DECISION_KINDS, predict
from riskgpu.selfplay.net import Net, init_from
from riskgpu.selfplay.obs import GLOBAL, clock
from riskgpu.selfplay.parity import random_net
from riskgpu.selfplay.search import observation

CAP = 40
ARGS = ["--games", "10", "--shard-games", "6", "--cap", str(CAP), "--device", "cpu", "--no-bf16"]


@pytest.fixture(scope="module")
def setup(tmp_path_factory):
    board = Board.load("cpu")
    tables = load_best("cpu")
    tables.scaled_oversize = True
    plain = random_net(32, 1, 4, 2, board, seed=3)
    # The net reads the clock, its weights on it away from zero.
    net = Net(**{**plain.config(), "clock": True}, edges=board.edges, adjacency=board.adjacency)
    init_from(net, {"net": plain.state_dict()})
    with torch.no_grad():
        net.glob_in.weight[:, GLOBAL:] = 1.0
    net.requires_grad_(False)
    ckpt = str(tmp_path_factory.mktemp("ckpt") / "net.pt")
    torch.save({"net": net.state_dict(), "config": net.config()}, ckpt)
    return board, tables, net, ckpt


class Seen(own.Recorder):
    """Keeps what the network saw at every decision kept, in the order they are kept."""
    seen: list = []
    board = net = None

    def keep(self, s, o, log, games, decision, fields):
        Seen.seen.append((*observation(Seen.net, CAP, s, o, log, Seen.board), legal_main(o)))
        super().keep(s, o, log, games, decision, fields)


@pytest.fixture(scope="module")
def recording(setup, tmp_path_factory):
    board, tables, net, ckpt = setup
    folder = str(tmp_path_factory.mktemp("own") / "rec")
    Seen.seen, Seen.board, Seen.net = [], board, net
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(own, "Recorder", Seen)
        out = own.record(own.parse(["--ckpt", ckpt, "--dir", folder, *ARGS]), net, board, tables, "cpu")
    return folder, out, list(Seen.seen)


def test_a_sample_is_what_the_net_saw_and_its_target_the_net_s_most_likely_move(setup, recording):
    board, net = setup[0], setup[2]
    folder, out, seen = recording
    data = distil.Recording(folder)
    assert data.n == out["samples"] and out["games"] == 10 and out["shards"] == 2
    b = data.inputs(torch.arange(data.n), board, "cpu", True)
    node, slot, glob, legal = (torch.cat(parts) for parts in zip(*seen))
    assert torch.equal(b["node"], node) and torch.equal(b["slot"], slot) and torch.equal(b["glob"], glob)
    assert torch.equal(b["legal"], legal)
    turn = data.x["turn"]
    assert torch.equal(glob[:, GLOBAL:], clock(turn, torch.full_like(turn, CAP)))
    main, amount, move, _ = predict(net, b, False, board)
    assert torch.equal(main, b["main"]) and torch.equal(amount, b["amount"])
    assert torch.equal(move, data.x["move"].to(torch.int64))
    assert bool((data.x["source"] == record.PLAYED).all()) and not bool(data.x["overruled"].any())
    # The games went on with sampled moves: some were the target, some weren't.
    off = data.x["off_target"]
    assert 0 < int(off.sum()) < data.n and int(off.sum()) == out["off_target"]


def test_every_kind_of_decision_is_kept_and_counted(recording):
    folder, out, _ = recording
    data = distil.Recording(folder)
    kinds = data.x["decision_kind"].to(torch.int64)
    assert sorted(kinds.unique().tolist()) == list(range(len(DECISION_KINDS)))
    assert {k: int((kinds == i).sum()) for i, k in enumerate(DECISION_KINDS)} == \
        {k: row["samples"] for k, row in out["by_kind"].items()}
    assert sum(row["games"] for row in out["by_players"].values()) == out["games"]
    assert sum(row["samples"] for row in out["by_players"].values()) == out["samples"]


def test_held_out_games_are_whole_and_apart_from_the_training_games(recording):
    folder, _, _ = recording
    data = distil.Recording(folder)
    game = data.sample_game()
    held = data.held_out[game]
    assert bool(held.any()) and bool((~held).any())
    assert set(game[held].tolist()).isdisjoint(game[~held].tolist())
    assert all(g % 5 == 4 for g in game[held].unique().tolist())


def test_a_fresh_net_learns_the_recording(setup, recording, tmp_path):
    board = setup[0]
    folder, _, _ = recording
    args = distil.parser().parse_args(["--data", folder, "--width", "32", "--layers", "1", "--heads", "4", "--clock",
                                       "--dir", str(tmp_path / "d"), "--device", "cpu", "--no-bf16", "--minibatch", "64",
                                       "--max-samples", "6400", "--lr", "3e-3", "--warmup", "5", "--read-every", "1000",
                                       "--monitor", "256"])
    data = distil.Recording(folder)
    train = torch.nonzero(~data.held_out[data.sample_game()])[:, 0]
    from riskgpu.selfplay.ladder import load_net

    def loss(net) -> float:
        with torch.no_grad():
            parts = distil.losses(net, data.inputs(train, board, "cpu", True), args)
        return float(parts["main"] + parts["amount"])

    torch.manual_seed(args.seed)
    fresh = Net(32, 1, 4, edges=board.edges, adjacency=board.adjacency, clock=True)
    out = distil.train(args)
    trained = load_net(str(tmp_path / "d" / "last.pt"), board, "cpu")
    assert trained.clock and trained.width == 32
    assert loss(trained) < 0.8 * loss(fresh)
    assert out["held_out"]["main"]["searched"]["n"] == out["held_out"]["samples"]

"""Recording a search's choices (`riskgpu/selfplay/record.py`) and distilling them
(`riskgpu/selfplay/distil.py`): a sample rebuilt from its file is the decision the search saw, its
target the move it played, a net's clock included; a recording resumed after a stop is the one an
unbroken run makes; and the distiller fits a recording and reads it in parts that add up. Each holds
for a net without the clock and for one with it."""

import os
import shutil

import pytest
import torch

from riskgpu.board import Board
from riskgpu.data import load_best
from riskgpu.selfplay import distil, record
from riskgpu.selfplay.actions import decode, legal_main
from riskgpu.selfplay.net import Net, init_from
from riskgpu.selfplay.obs import GLOBAL, clock
from riskgpu.selfplay.parity import random_net
from riskgpu.selfplay.search import observation

# Small and short: leaves at the end of the searcher's turn, two candidates of two rollouts.
CAP = 4
GAMES = ["--games", "5", "--shard-games", "4", "--players", "3", "--k", "2", "--r", "2", "--leaf", "turn",
         "--cap", str(CAP), "--skip-mass", "0.6", "--skipped", "--device", "cpu", "--no-bf16"]


@pytest.fixture(scope="module", params=[False, True], ids=["clockless", "clock"])
def setup(request, tmp_path_factory):
    board = Board.load("cpu")
    tables = load_best("cpu")
    tables.scaled_oversize = True
    net = random_net(32, 1, 4, 2, board, seed=3)
    if request.param:
        # The same net reading the clock, its weights on it away from zero.
        plain = net
        net = Net(**{**plain.config(), "clock": True}, edges=board.edges, adjacency=board.adjacency)
        init_from(net, {"net": plain.state_dict()})
        with torch.no_grad():
            net.glob_in.weight[:, GLOBAL:] = 1.0
    net.requires_grad_(False)
    ckpt = str(tmp_path_factory.mktemp("ckpt") / "net.pt")
    torch.save({"net": net.state_dict(), "config": net.config()}, ckpt)
    return board, tables, net, ckpt


def run(setup, folder: str, extra: list[str] = ()) -> dict:
    board, tables, net, ckpt = setup
    args = record.parser().parse_args(["--ckpt", ckpt, "--dir", folder, *GAMES, *extra])
    return record.record(args, net, board, tables, record.search_config(args, bf16=False), "cpu")


class Seen(record.Recorder):
    """Keeps what the network saw at every decision kept, in the order they are kept."""
    seen: list = []
    board = net = None

    def _keep(self, s, o, log, rows, games, decision, fields):
        sub, so, sl = s.select(rows), o.select(rows), log.select(rows)
        Seen.seen.append((*observation(Seen.net, CAP, sub, so, sl, Seen.board), legal_main(so)))
        super()._keep(s, o, log, rows, games, decision, fields)


@pytest.fixture(scope="module")
def recording(setup, tmp_path_factory):
    folder = str(tmp_path_factory.mktemp("rec") / "a")
    Seen.seen, Seen.board, Seen.net = [], setup[0], setup[2]
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(record, "Recorder", Seen)
        out = run(setup, folder)
    return folder, out, list(Seen.seen)


def test_a_rebuilt_sample_is_the_decision_the_search_saw_and_its_target_the_move_it_played(setup, recording):
    board, net = setup[0], setup[2]
    folder, out, seen = recording
    data = distil.Recording(folder)
    assert out["games"] == 5 and out["shards"] == 2 and data.n == out["samples"]
    source = data.x["source"]
    assert int((source == record.SEARCHED).sum()) == out["searched"]
    assert int(data.x["overruled"].sum()) == out["overruled"] > 0
    assert {int(v) for v in source.unique()} == {record.SEARCHED, record.CONFIDENT, record.UNSEARCHED_KIND}
    b = data.inputs(torch.arange(data.n), board, "cpu", net.clock)
    node, slot, glob, legal = (torch.cat(parts) for parts in zip(*seen))
    assert torch.equal(b["node"], node) and torch.equal(b["slot"], slot) and torch.equal(b["glob"], glob)
    assert torch.equal(b["legal"], legal)
    # A clock counts down to the recording's cap, and a recording rebuilds for a net with or without it.
    assert glob.shape[1] == GLOBAL + net.clock
    turn = data.x["turn"]
    other = data.inputs(torch.arange(data.n), board, "cpu", not net.clock)
    clocked = b["glob"] if net.clock else other["glob"]
    assert torch.equal(clocked, torch.cat([glob[:, :GLOBAL], clock(turn, torch.full_like(turn, CAP))], 1))
    assert torch.equal(other["node"], node) and torch.equal(other["legal"], legal)
    # The target decodes to the move played, and is the first choice unless the search overruled it.
    assert torch.equal(decode(b["main"], b["amount"], b["s"], b["o"], board), data.x["move"].to(torch.int64))
    assert bool((data.x["chosen"][~data.x["overruled"]] == 0).all())
    assert bool((data.x["chosen"][data.x["overruled"]] > 0).all())


def test_a_resumed_recording_is_the_one_an_unbroken_run_makes(setup, recording, tmp_path):
    folder, _, _ = recording
    again = str(tmp_path / "b")
    shutil.copytree(folder, again)
    os.remove(record.shard_path(again, 1))
    first = os.stat(record.shard_path(again, 0)).st_mtime_ns
    run(setup, again)
    assert os.stat(record.shard_path(again, 0)).st_mtime_ns == first  # not played again
    a = torch.load(record.shard_path(folder, 1), weights_only=False)
    b = torch.load(record.shard_path(again, 1), weights_only=False)
    for name in a:
        if name == "meta":
            a[name].pop("wall_s"), b[name].pop("wall_s")
            assert a[name] == b[name]
        elif name == "games":
            for k, v in a[name].items():
                assert torch.equal(v, b[name][k]) if torch.is_tensor(v) else v == b[name][k], k
        else:
            assert torch.equal(a[name], b[name]), name
    with pytest.raises(AssertionError, match="made otherwise"):
        run(setup, again, ["--r", "3"])


def test_the_distiller_fits_a_recording_and_its_read_adds_up(setup, recording, tmp_path):
    board, _, _, ckpt = setup
    folder, _, _ = recording
    args = distil.parser().parse_args(["--data", folder, "--init", ckpt, "--dir", str(tmp_path / "d"), "--device", "cpu",
                                       "--no-bf16", "--minibatch", "64", "--max-samples", "3200", "--lr", "3e-3",
                                       "--warmup", "5", "--read-every", "1000", "--monitor", "256"])
    data = distil.Recording(folder)
    train = torch.nonzero(~data.held_out[data.sample_game()])[:, 0]

    def loss(path: str) -> float:
        from riskgpu.selfplay.ladder import load_net
        with torch.no_grad():
            net = load_net(path, board, "cpu")
            parts = distil.losses(net, data.inputs(train, board, "cpu", net.clock), args)
        return float(parts["main"] + parts["amount"])

    before = loss(ckpt)
    out = distil.train(args)
    assert loss(str(tmp_path / "d" / "last.pt")) < 0.8 * before

    report = out["held_out"]
    for what in ("main", "move"):
        read = report[what]
        searched = read["searched"]["n"]
        parts = [r for r in read["by_source"].values() if r is not None]
        assert sum(r["n"] for r in parts) == report["samples"]
        assert sum(r["n"] for name, r in read["by_source"].items() if name != "skipped" and r) == searched
        by_kind = [r for r in read["by_kind"].values() if r is not None]
        assert sum(r["n"] for r in by_kind) == searched
        assert sum(round(r["share"] * r["n"]) for r in by_kind) == round(read["searched"]["share"] * searched)


def test_the_soft_target_moves_only_the_candidates_mass_and_counts_a_main_choice_once():
    from riskgpu.selfplay.actions import MAIN
    from riskgpu.selfplay.net import NEG
    z = torch.zeros(1, MAIN)
    z[0, 100:] = NEG  # illegal
    # Two candidates share main choice 5 (two amounts), so its 0.4 counts once: 0.4 + 0.2 on the candidates.
    x = {"cand_main": torch.tensor([[5, 7, 5]]), "cand_ok": torch.tensor([[True, True, True]]),
         "mean": torch.tensor([[0.0, 0.5, 0.0]]), "p_main": torch.tensor([[0.4, 0.2, 0.4]])}
    t = distil.soft_main_target(z, x, tau=0.01)[0]
    assert abs(float(t.sum()) - 1) < 1e-6 and float(t[100:].sum()) == 0
    assert abs(float(t[7]) - 0.6) < 1e-4 and float(t[5]) < 1e-4
    # The rest keeps the trained net's proportions: here even over the 98 other legal choices.
    rest = torch.cat([t[:5], t[6:7], t[8:100]])
    assert torch.allclose(rest, torch.full_like(rest, 0.4 / 98))

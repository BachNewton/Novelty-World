import os

import torch

from riskgpu.board import Board
from riskgpu.canonical import hash_bytes, options_ints
from riskgpu.data import fixture_paths, load_best
from riskgpu.options import options
from riskgpu.records import read_records, write_records
from riskgpu.selfplay.actions import legal_main
from riskgpu.selfplay.imitate import Dataset, extract, losses, replay
from riskgpu.selfplay.net import Net


def shortest(k: int) -> list[dict]:
    games = [r for path in fixture_paths() for r in read_records(path)]
    return sorted(games, key=lambda r: len(r["moves"]))[:k]


def test_every_decision_is_kept_and_its_rebuilt_state_offers_the_recorded_options(tmp_path):
    games = shortest(3)
    folder = tmp_path / "records" / "fx"
    folder.mkdir(parents=True)
    write_records(str(folder / "fx-0-0.jsonl.gz"), games[:2])
    write_records(str(folder / "fx-4-0.jsonl.gz"), games[2:])
    out = tmp_path / "data"
    extract(str(tmp_path / "records"), str(out), "*", "cpu", batch=8, check_every=16)
    saved = torch.load(out / "fx.pt", weights_only=False)
    assert saved["cuts"] == []
    assert len(saved["game"]) == sum(len(r["moves"]) for r in games)

    board = Board.load("cpu")
    data = Dataset(str(out))
    assert data.held_out.tolist() == [g["seed"] == games[2]["seed"] for g in sorted(games, key=lambda r: len(r["moves"]))]
    b = data.inputs(torch.arange(data.n), board, "cpu")
    assert bool(b["legal"][torch.arange(data.n), b["main"]].all())
    by_seed = {r["seed"]: r for r in games}
    rows = options_ints(options(b["s"], board))
    for i in range(0, data.n, 7):
        record = by_seed[data.seeds[int(data.x["game"][i])]]
        assert hash_bytes(rows[i].tobytes()) == record["optionsHashes"][int(data.x["decision"][i])]

    net = Net(32, 1, 4, edges=board.edges, adjacency=board.adjacency)
    parts = losses(net, b, bf16=False)
    assert all(torch.isfinite(v) for v in parts.values())


def test_a_diverging_game_is_cut_at_its_last_verified_state():
    good, bad = shortest(2)
    bad = dict(bad, stateHashes=list(bad["stateHashes"]))
    bad["stateHashes"][47] = "0" * 16
    board = Board.load("cpu")
    samples, verified, reason = replay([good, bad], lambda label: True, board, load_best("cpu"), "cpu", check_every=16)
    assert reason[0] is None and reason[1] == "state hash at decision 47"
    assert verified[1] == 32
    kept = samples["decision"][samples["game"] == 1]
    assert int(kept.max()) == 32 and len(kept) == 33

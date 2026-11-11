"""The Kaggle launcher's bundle and the plateau verdict a session stops on: a file left out of the
bundle, or a stop that misreads the panel, costs a whole session of the week's quota."""

import json
import os

from riskgpu.kaggle import kernel
from riskgpu.kaggle.launch import flat_name
from riskgpu.selfplay.verdict import verdict


def reading(win: float, half: float = 0.02) -> dict:
    return {"win": win, "interval": [win - half, win + half]}


def test_verdicts_follow_the_daily_contract():
    assert verdict([reading(0.3), reading(0.31)]) == "early"
    assert verdict([reading(0.30), reading(0.35), reading(0.40)]) == "climbing"
    assert verdict([reading(0.40), reading(0.41), reading(0.405)]) == "flat"
    # Below the best by more than an interval, twice running.
    assert verdict([reading(0.40), reading(0.45), reading(0.30), reading(0.31)]) == "falling"
    # Once is not falling.
    assert verdict([reading(0.40), reading(0.45), reading(0.44), reading(0.30)]) == "climbing"


def test_a_bundle_lands_where_the_trainer_reads(tmp_path):
    files = ["data/blitz-256.bin", "runs/selfplay/r1/latest.pt", "runs/selfplay/r1/snap-25.pt", "runs/imitate/imit-1/best.pt"]
    mounted = tmp_path / "input" / "datasets" / "someone" / "risk-bundle-r1"
    mounted.mkdir(parents=True)
    for rel in files:
        (mounted / flat_name(rel)).write_text(rel)
    (mounted / "MANIFEST.json").write_text(json.dumps({"id": "b1", "files": {flat_name(r): r for r in files}}))
    gpu, run_dir = tmp_path / "repo" / "gpu", tmp_path / "working" / "r1"

    kernel.restore(kernel.find_bundle(str(tmp_path / "input"), "b1"), str(gpu), str(run_dir), "r1")

    assert (gpu / "data" / "blitz-256.bin").read_text() == "data/blitz-256.bin"
    assert (gpu / "runs" / "imitate" / "imit-1" / "best.pt").exists()
    # The run's own files go to the folder the session keeps, not into the clone.
    assert sorted(os.listdir(run_dir)) == ["latest.pt", "snap-25.pt"]
    assert not (gpu / "runs" / "selfplay" / "r1").exists()

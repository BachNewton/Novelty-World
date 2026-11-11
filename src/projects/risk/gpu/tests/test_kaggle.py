"""The Kaggle launcher's bundle and the plateau verdict a session stops on: a file left out of the
bundle, or a stop that misreads the panel, costs a whole session of the week's quota."""

import json
import os
import sys
import time

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


def run_folder(path, readings: list[int], snaps: list[int], key: str = "k") -> str:
    path.mkdir(parents=True)
    with open(path / "log.jsonl", "w") as f:
        for it in range(25, 301, 25):
            f.write(json.dumps({"iter": it, **({"panel": {key: {}}} if it in readings else {})}) + "\n")
    for it in snaps:
        (path / f"snap-{it}.pt").write_text("")
    return str(path)


def test_a_stopped_run_is_read_sharply_on_its_verdicts_window(tmp_path):
    run_dir = run_folder(tmp_path / "r1", readings=[100, 150, 200, 250], snaps=[150, 200, 250])
    (tmp_path / "r1" / "panel-250-g4096.json").write_text("{}")  # read in an earlier session
    tasks = kernel.sharp_readings("r1", ["--stop-key", "k", "--no-bf16"], run_dir)
    assert [(t["iter"], t["bf16"]) for t in tasks] == [(200, False), (150, False)]
    assert kernel.sharp_readings("r1", ["--panel", "512"], run_dir) == []


def test_every_gpu_works_through_the_queue(tmp_path, monkeypatch):
    monkeypatch.setattr(kernel, "WORKING", str(tmp_path))
    for name in ("a", "b", "c"):
        run_folder(tmp_path / name, readings=[250, 275, 300], snaps=[250, 275, 300])
    job = {"runs": [{"name": n, "args": ["--stop-key", "k"]} for n in ("a", "b", "c")]}
    session = kernel.Session(job, str(tmp_path), gpus=2, deadline=time.time() + 3600)
    done = []
    monkeypatch.setattr(session, "command", lambda task: done.append((task["name"], task["kind"])) or
                        [sys.executable, "-c", "pass"])
    session.run()
    # Every run trains, then each is read on its last three checkpoints; nothing is left or failed.
    assert sorted(done) == sorted([(n, "train") for n in "abc"] + [(n, "read") for n in "abc" for _ in range(3)])
    assert [k for _, k in done[:3]] == ["train"] * 3
    assert session.queue == [] and session.failed == []


def test_no_task_starts_once_the_hours_are_up(tmp_path):
    job = {"runs": [{"name": "a", "args": []}]}
    assert kernel.Session(job, str(tmp_path), gpus=2, deadline=0.0).next_task() is None


def test_a_bundle_lands_where_the_trainers_read(tmp_path):
    files = ["data/blitz-256.bin", "runs/selfplay/r1/latest.pt", "runs/selfplay/r1/snap-25.pt",
             "runs/selfplay/r2/latest.pt", "runs/selfplay/r0/snap-200.pt", "runs/imitate/imit-1/best.pt"]
    mounted = tmp_path / "input" / "datasets" / "someone" / "risk-bundle-r1-r2"
    mounted.mkdir(parents=True)
    for rel in files:
        (mounted / flat_name(rel)).write_text(rel)
    (mounted / "MANIFEST.json").write_text(json.dumps({"id": "b1", "files": {flat_name(r): r for r in files}}))
    gpu, working = tmp_path / "repo" / "gpu", tmp_path / "working"

    kernel.restore(kernel.find_bundle(str(tmp_path / "input"), "b1"), str(gpu), str(working), ["r1", "r2"])

    assert (gpu / "data" / "blitz-256.bin").read_text() == "data/blitz-256.bin"
    assert (gpu / "runs" / "imitate" / "imit-1" / "best.pt").exists()
    # Each run's own files go to the folder the session keeps, not into the clone; a run the session
    # doesn't train (one a league seats snapshots from) stays in the clone.
    assert sorted(os.listdir(working / "r1")) == ["latest.pt", "snap-25.pt"]
    assert sorted(os.listdir(working / "r2")) == ["latest.pt"]
    assert (gpu / "runs" / "selfplay" / "r0" / "snap-200.pt").exists()
    assert not (gpu / "runs" / "selfplay" / "r1").exists()

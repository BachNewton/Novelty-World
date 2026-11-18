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
    # k3's readings slid down by less than "falling" needs: neither falling nor climbing.
    assert verdict([reading(0.203, 0.05), reading(0.160, 0.045), reading(0.144, 0.043)]) == "unsettled"
    assert verdict([reading(0.40), reading(0.41), reading(0.405)]) == "flat"
    # Below the best by more than an interval, twice running.
    assert verdict([reading(0.40), reading(0.45), reading(0.30), reading(0.31)]) == "falling"
    # Once is not falling.
    assert verdict([reading(0.40), reading(0.45), reading(0.44), reading(0.30)]) == "unsettled"


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
    job = {"runs": [{"name": n, "args": ["--stop-key", "k"]} for n in ("a", "b", "c")], "read_hours": 0}
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
    job = {"runs": [{"name": "a", "args": []}], "read_hours": 0}
    assert kernel.Session(job, str(tmp_path), gpus=2, deadline=0.0).next_task() is None


def test_the_readings_hours_go_to_the_newest_checkpoints_first(tmp_path, monkeypatch):
    # The first session that ran two runs started a run's second reading before the other run's first,
    # and the hours ran out on it.
    monkeypatch.setattr(kernel, "WORKING", str(tmp_path))
    for name in ("a", "b"):
        run_folder(tmp_path / name, readings=[250, 275, 300], snaps=[250, 275, 300])
    job = {"runs": [{"name": n, "args": ["--stop-key", "k"]} for n in ("a", "b")], "read_hours": 1}
    session = kernel.Session(job, str(tmp_path), gpus=1, deadline=time.time() + 7200)
    done = []

    def command(task):
        done.append((task["name"], task.get("iter")))
        if task["kind"] == "train":
            # The trainer is given the hours up to the readings' share, not the session's.
            assert 0.9 < float(kernel.Session.command(session, task)[-1]) <= 1.0
        return [sys.executable, "-c", "pass"]
    monkeypatch.setattr(session, "command", command)
    session.run()
    assert done == [("a", None), ("b", None), ("a", 300), ("b", 300), ("a", 275), ("b", 275), ("a", 250), ("b", 250)]


def test_a_reading_cut_at_the_sessions_end_is_not_a_failure(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(kernel, "WORKING", str(tmp_path))
    monkeypatch.setattr(kernel, "GRACE_S", 0)
    run_folder(tmp_path / "a", readings=[300], snaps=[300])
    session = kernel.Session({"runs": [], "read_hours": 0}, str(tmp_path), gpus=1, deadline=time.time())
    # Past the session's hours, so the stopper kills the reading at once.
    monkeypatch.setattr(session, "command", lambda task: [sys.executable, "-c", "import time; time.sleep(60)"])
    session.perform({"kind": "read", "name": "a", "iter": 300, "rank": 0, "bf16": False}, device=0)
    session.run()
    assert session.failed == [] and session.cut == ["a read 300"]
    assert "a read 300" in capsys.readouterr().out


def test_a_bundle_lands_where_the_trainers_read(tmp_path):
    files = ["data/blitz-256.bin", "runs/selfplay/r1/latest.pt", "runs/selfplay/r1/snap-25.pt",
             "runs/selfplay/r2/latest.pt", "runs/selfplay/r0/snap-200.pt", "runs/imitate/imit-1/best.pt"]
    mounted = tmp_path / "input" / "datasets" / "someone" / "risk-bundle-r1-r2"
    mounted.mkdir(parents=True)
    for rel in files:
        (mounted / flat_name(rel)).write_text(rel)
    (mounted / "MANIFEST.json").write_text(json.dumps({"id": "b1", "files": {flat_name(r): r for r in files}}))
    gpu, working = tmp_path / "repo" / "gpu", tmp_path / "working"

    kernel.restore(kernel.find_bundle(str(tmp_path / "input"), "b1"), str(gpu), str(working),
                   [{"name": "r1", "args": []}, {"name": "r2", "args": []}])

    assert (gpu / "data" / "blitz-256.bin").read_text() == "data/blitz-256.bin"
    assert (gpu / "runs" / "imitate" / "imit-1" / "best.pt").exists()
    # Each run's own files go to the folder the session keeps, not into the clone; a run the session
    # doesn't train (one a league seats snapshots from) stays in the clone.
    assert sorted(os.listdir(working / "r1")) == ["latest.pt", "snap-25.pt"]
    assert sorted(os.listdir(working / "r2")) == ["latest.pt"]
    assert (gpu / "runs" / "selfplay" / "r0" / "snap-200.pt").exists()
    assert not (gpu / "runs" / "selfplay" / "r1").exists()


def test_a_push_is_refused_before_upload_if_the_trainer_would_refuse_its_arguments():
    # A push once dropped `--epochs`' value, and the session failed at its first trainer.
    import pytest
    from riskgpu.kaggle.launch import run_args
    good = ["--epochs", "2", "--no-bf16", "--stop-when", "flat", "--stop-key", "k", "--panel", "512"]
    assert run_args(good, "--ent 0.003", "NvidiaTeslaT4", no_stop=False)[-1] == "0.003"
    with pytest.raises(SystemExit):
        run_args(["--epochs", *good[2:]], "", "NvidiaTeslaT4", no_stop=False)


IMITATION = ["--data", "runs/imitate/d", "--init", "runs/imitate/imit-1/best.pt", "--no-bf16", "--max-samples", "5"]


def test_an_imitation_trains_to_the_readings_share_then_is_read_in_its_own_folder(tmp_path, monkeypatch):
    monkeypatch.setattr(kernel, "WORKING", str(tmp_path))
    (tmp_path / "imit-x").mkdir()
    job = {"runs": [{"name": "imit-x", "trainer": "imitate", "args": IMITATION}], "read_hours": 1}
    session = kernel.Session(job, str(tmp_path), gpus=1, deadline=time.time() + 7200)
    done = []

    def command(task):
        cmd = kernel.Session.command(session, task)
        done.append(cmd)
        if task["kind"] == "train":
            # The trainer leaves its best checkpoint, which the readings read.
            return [sys.executable, "-c", f"open(r'{tmp_path / 'imit-x' / 'best.pt'}', 'w')"]
        return [sys.executable, "-c", "pass"]
    monkeypatch.setattr(session, "command", command)
    session.run()

    train, read, panel = [" ".join(c[3:]) for c in done]
    assert train.startswith("riskgpu.selfplay.imitate train --name imit-x --data runs/imitate/d")
    assert 0.9 < float(done[0][-1]) <= 1.0 and done[0][-2] == "--hours"
    assert read == ("riskgpu.selfplay.imitate read --data runs/imitate/d --ckpt runs/imitate/imit-x/best.pt "
                    "--out runs/imitate/imit-x/read.json --no-bf16")
    assert panel == ("riskgpu.selfplay.panel --ckpt runs/imitate/imit-x/best.pt --games 1024 "
                     "--out runs/imitate/imit-x/panel.json --no-bf16")
    assert session.queue == [] and session.failed == []


def gpu_tree(root, files: list[str]) -> None:
    for rel in files:
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        (root / rel).write_text(rel)


def test_an_imitations_bundle_carries_its_data_init_and_anchors_to_where_its_commands_read(tmp_path, monkeypatch):
    from riskgpu.kaggle import launch
    from riskgpu.selfplay import panel
    local = tmp_path / "local"
    data = ["runs/imitate/d/a.pt", "runs/imitate/d/b.pt", "runs/imitate/d/extract.json"]
    anchors = ["runs/selfplay/sw/snap-1.pt", "runs/imitate/imit-1/best.pt"]
    gpu_tree(local, ["data/blitz-256.bin", "data/blitz-256.json", *data, *anchors])
    monkeypatch.setattr(launch, "GPU", str(local))
    monkeypatch.setattr(panel, "ANCHORS", tuple((rel, str(local / rel)) for rel in anchors))
    run = {"name": "imit-x", "trainer": "imitate", "args": IMITATION}

    files = launch.needed_files(run)
    assert set(data + anchors) <= set(files)
    bundle = tmp_path / "input" / "bundle"
    launch.stage(files, str(bundle))
    (bundle / "MANIFEST.json").write_text(json.dumps({"id": "b1", "files": {flat_name(r): r for r in files}}))
    gpu, working = tmp_path / "clone", tmp_path / "working"
    kernel.restore(str(bundle), str(gpu), str(working), [run])

    for rel in data + anchors:
        assert (gpu / rel).read_text() == rel
    assert not (working / "imit-x").exists()


def test_fetch_guards_and_fills_an_imitations_own_folder(tmp_path, monkeypatch):
    from riskgpu.kaggle import launch
    monkeypatch.setattr(launch, "GPU", str(tmp_path))
    run = {"name": "imit-x", "trainer": "imitate", "args": IMITATION}
    job = {"runs": [run], "guard_sha256": {"imit-x": None}}
    output = tmp_path / "output" / "imit-x"
    gpu_tree(tmp_path / "output", ["imit-x/kaggle-sessions.jsonl", "imit-x/best.pt", "imit-x/log.jsonl"])

    launch.check_guards(job)
    launch.copy_back(job, str(tmp_path / "output"))
    assert sorted(os.listdir(tmp_path / "runs" / "imitate" / "imit-x")) == sorted(os.listdir(output))
    assert not (tmp_path / "runs" / "selfplay").exists()
    # A best.pt here that the push didn't see would be overwritten.
    import pytest
    with pytest.raises(AssertionError, match="best.pt changed"):
        launch.check_guards(job)


def test_a_readings_session_is_fetched_into_each_readings_own_folder(tmp_path, monkeypatch):
    from riskgpu.kaggle import launch
    monkeypatch.setattr(launch, "GPU", str(tmp_path))
    readings = [{"name": n, "tool": "panel", "args": []} for n in ("p", "q")]
    job = {"runs": [], "readings": readings, "guard_sha256": {}}
    gpu_tree(tmp_path, ["runs/readings/p/kaggle-push.json", "runs/readings/q/kaggle-push.json"])
    gpu_tree(tmp_path / "output", [f"{n}/{f}" for n in ("p", "q") for f in ("kaggle-sessions.jsonl", "panel.json")])

    launch.check_guards(job)
    for r in readings:
        launch.check_reading_unmoved(r, "kaggle-push.json")
    launch.copy_back(job, str(tmp_path / "output"))
    for n in ("p", "q"):
        assert (tmp_path / "runs" / "readings" / n / "panel.json").read_text() == f"{n}/panel.json"


def test_an_imitation_push_is_refused_before_upload_if_its_trainer_would_refuse_its_arguments():
    import pytest
    from riskgpu.kaggle.launch import run_args
    assert run_args(IMITATION, "--seed 2", "NvidiaTeslaT4", no_stop=False, trainer="imitate")[-1] == "2"
    with pytest.raises(SystemExit):
        run_args([*IMITATION, "--max-samples", "5M"], "", "NvidiaTeslaT4", no_stop=False, trainer="imitate")
    with pytest.raises(AssertionError):
        run_args([*IMITATION, "--hours", "3"], "", "NvidiaTeslaT4", no_stop=False, trainer="imitate")


CHAIN = ("it1=record --ckpt runs/selfplay/b1/snap-100.pt --dir runs/readings/it1/rec --games 64 --no-bf16 ; "
         "distil --data runs/readings/it1/rec --init runs/selfplay/b1/snap-100.pt --dir runs/readings/it1/net --no-bf16 ; "
         "panel --ckpt runs/readings/it1/net/best.pt --no-bf16")


def test_a_chain_runs_its_steps_in_turn_on_one_gpu_its_training_step_leaving_the_readings_hours(tmp_path, monkeypatch):
    import pytest
    from riskgpu.kaggle import launch
    chain = launch.reading_spec(CHAIN)
    assert [s["tool"] for s in chain["steps"]] == ["record", "distil", "panel"]
    launch.check_reading(chain, full_precision=True)
    with pytest.raises(AssertionError, match="drop --hours"):
        launch.check_reading(launch.reading_spec(CHAIN.replace("--dir runs/readings/it1/net", "--hours 2 --dir x")), True)
    # Only what the chain doesn't make itself is uploaded: the checkpoint it starts from, not the one it trains.
    gpu_tree(tmp_path, ["data/blitz-256.bin", "data/blitz-256.json", "runs/selfplay/b1/snap-100.pt"])
    monkeypatch.setattr(launch, "GPU", str(tmp_path))
    from riskgpu.selfplay import panel
    monkeypatch.setattr(panel, "ANCHORS", ())
    assert launch.reading_files(chain) == ["data/blitz-256.bin", "data/blitz-256.json", "runs/selfplay/b1/snap-100.pt"]
    # A recording an earlier session made goes whole, with what it was made from.
    gpu_tree(tmp_path, ["runs/readings/r0/rec/recording.json", "runs/readings/r0/rec/shard-00000.pt"])
    later = launch.reading_spec("d1=distil --data runs/readings/r0/rec --init runs/selfplay/b1/snap-100.pt --dir "
                                "runs/readings/d1/net --no-bf16")
    assert set(launch.reading_files(later)) >= {"runs/readings/r0/rec/recording.json",
                                                 "runs/readings/r0/rec/shard-00000.pt"}

    monkeypatch.setattr(kernel, "WORKING", str(tmp_path))
    (tmp_path / "it1").mkdir()

    def session_running(fail: str | None):
        session = kernel.Session({"runs": [], "readings": [chain], "read_hours": 1}, str(tmp_path), gpus=2,
                                 deadline=time.time() + 7200)
        done = []

        def command(task):
            cmd = kernel.Session.command(session, task)
            done.append(cmd)
            return [sys.executable, "-c", f"raise SystemExit({int(task['tool'] == fail)})"]
        monkeypatch.setattr(session, "command", command)
        return session, done

    session, done = session_running(fail=None)
    session.run()
    record, distil, read = [c[3:] for c in done]
    assert record[0] == "riskgpu.selfplay.record" and record[-2:] == ["--out", "runs/readings/it1/record.json"]
    assert distil[0] == "riskgpu.selfplay.distil" and distil[-4] == "--hours" and 0.9 < float(distil[-3]) <= 1.0
    assert read[0] == "riskgpu.selfplay.panel" and read[-1] == "runs/readings/it1/panel.json"
    assert session.failed == []
    # A step that fails stops the chain: nothing reads what it didn't write.
    session, done = session_running(fail="record")
    with pytest.raises(SystemExit):
        session.run()
    assert len(done) == 1 and session.failed == ["it1 record (1)"]


def test_a_chains_folders_come_home_whole(tmp_path, monkeypatch):
    from riskgpu.kaggle import launch
    monkeypatch.setattr(launch, "GPU", str(tmp_path))
    job = {"runs": [], "readings": [launch.reading_spec(CHAIN)], "guard_sha256": {}}
    files = ["kaggle-sessions.jsonl", "record.json", "rec/recording.json", "rec/shard-00000.pt", "net/best.pt"]
    gpu_tree(tmp_path / "output", [f"it1/{f}" for f in files])
    launch.copy_back(job, str(tmp_path / "output"))
    for f in files:
        assert (tmp_path / "runs" / "readings" / "it1" / f).read_text() == f"it1/{f}"

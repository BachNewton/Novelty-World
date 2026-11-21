"""The TPU probe's launcher: a session the quota can't hold, or arguments the probe would refuse,
must be refused here, before a push spends the week's hours or sits in Kaggle's queue for nothing."""

import json
import os
import subprocess

import pytest

from riskgpu.tpu import launch

QUOTA = json.dumps([
    {"resource": "GPU", "used": "5.65h", "remaining": "24.35h", "total": "30.00h", "refreshAt": "2026-11-21T00:00:00+00:00"},
    {"resource": "TPU", "used": "18.50h", "remaining": "1.50h", "total": "20.00h", "refreshAt": "2026-11-21T00:00:00+00:00"},
])


def test_a_session_longer_than_the_quota_left_or_kaggles_limit_is_refused():
    tpu = launch.quota_row(QUOTA, "TPU")
    launch.check_session("TpuV5E8", 1.5, tpu)
    with pytest.raises(AssertionError, match="exceed"):
        launch.check_session("TpuV5E8", 2.0, tpu)
    # The GPU's hours don't pay for a TPU session, nor the reverse.
    with pytest.raises(AssertionError, match="at most 9"):
        launch.check_session("TpuV6E8", 10.0, {"remaining": "20.00h"})
    launch.check_session("NvidiaTeslaT4", 2.0, launch.quota_row(QUOTA, "GPU"))


@pytest.fixture
def no_kaggle(tmp_path, monkeypatch):
    """Kaggle answered locally: every call recorded, the quota above returned."""
    calls = []

    def kaggle(*args, check=True):
        calls.append(args)
        return subprocess.CompletedProcess(args, 0, QUOTA if args[0] == "quota" else "", "")
    monkeypatch.setattr(launch, "kaggle", kaggle)
    monkeypatch.setattr(launch, "username", lambda: "someone")
    monkeypatch.setattr(launch, "RUNS", str(tmp_path / "runs"))
    monkeypatch.setattr(launch, "STAGING", str(tmp_path / "staging"))
    return calls


def test_a_dry_run_pushes_nothing_and_a_refusal_comes_before_any_push(no_kaggle, tmp_path):
    assert launch.main(["push", "p1", "--session-hours", "1.5", "--dry-run"]) == 0
    run_py = (tmp_path / "staging" / "tpu-p1" / "run.py").read_text()
    assert "JAX_PLATFORMS'] = 'tpu'" in run_py and "'--require', 'tpu'" in run_py
    with pytest.raises(AssertionError, match="exceed"):
        launch.main(["push", "p1", "--session-hours", "2"])
    # The probe's own parser refuses before the quota is even asked.
    with pytest.raises(AssertionError, match="splits over"):
        launch.main(["push", "p1", "--session-hours", "1", "--", "--sizes", "100x4"])
    with pytest.raises(AssertionError, match="the launcher's"):
        launch.main(["push", "p1", "--session-hours", "1", "--", "--require", "cpu"])
    assert [c[0] for c in no_kaggle] == ["quota", "quota"]


def test_a_session_kaggle_ran_without_its_device_is_named_at_fetch(no_kaggle, tmp_path):
    assert launch.main(["push", "p1", "--session-hours", "1.5", "--dry-run"]) == 0
    meta = json.loads((tmp_path / "staging" / "tpu-p1" / "kernel-metadata.json").read_text())
    assert meta["machine_shape"] == "TpuV5E8" and meta["docker_image_pinning_type"] == "latest"
    # A Kaggle log is a JSON list of output lines; these are the ones a CPU machine gave a TPU push.
    log = json.dumps([
        {"stream_name": "stderr", "time": 9.6, "data": '  File "/usr/local/lib/python3.13/dist-packages/jax/_src/xla_bridge.py"\n'},
        {"stream_name": "stderr", "time": 9.7, "data": "RuntimeError: Unable to initialize backend 'tpu': INTERNAL: "
                                                     "Failed to open libtpu.so (set JAX_PLATFORMS='' to choose)\n"},
    ])
    missing = launch.missing_device(log)
    assert missing.startswith("Unable to initialize backend 'tpu'") and "Python is 3.13" in missing
    assert launch.missing_device(json.dumps([{"stream_name": "stdout", "time": 1, "data": "phase x32: ...\n"}])) is None


# --- training sessions -------------------------------------------------------------------------

QUOTA_FULL = QUOTA.replace('"remaining": "1.50h"', '"remaining": "20.00h"')


@pytest.fixture
def gpu(tmp_path, monkeypatch):
    """A GPU folder of its own: an imitation's extraction, a recording, a checkpoint; Kaggle answered
    locally, every call recorded, as the probe's tests answer it."""
    from riskgpu.kaggle import launch as gpu_launch
    root = tmp_path / "gpu"
    for rel, size in (("runs/imitate/fx/a.pt", 300), ("runs/imitate/fx/extract.json", 10),
                      ("runs/readings/e1/rec/shard-00000.pt", 200), ("runs/readings/e1/rec/recording.json", 10),
                      ("runs/selfplay/b1/snap-100.pt", 50)):
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        (root / rel).write_bytes(b"x" * size)
    calls = []
    files = [{"name": "runs__imitate__fx__a.pt", "totalBytes": 300}, {"name": "runs__imitate__fx__extract.json", "totalBytes": 10}]

    def kaggle(*args, check=True):
        calls.append(args)
        out = {"quota": QUOTA_FULL, "files": json.dumps(files), "status": "ready"}.get(args[1] if args[0] == "datasets" else args[0], "")
        return subprocess.CompletedProcess(args, 0, out, "")
    for module in (launch, gpu_launch):
        monkeypatch.setattr(module, "kaggle", kaggle)
    monkeypatch.setattr(launch, "username", lambda: "someone")
    monkeypatch.setattr(gpu_launch, "checkout_commit", lambda: "c0ffee" * 6 + "abcd")
    monkeypatch.setattr(gpu_launch, "GPU", str(root))
    monkeypatch.setattr(launch, "GPU", str(root))
    monkeypatch.setattr(launch, "RUNS", str(root / "runs" / "tpu"))
    monkeypatch.setattr(launch, "STAGING", str(root / "runs" / "kaggle"))
    return root, calls, files


IMITATE = ["train", "i1", "--task", "imitate", "--source", "runs/imitate/fx"]
DISTIL = ["train", "d1", "--task", "distil", "--source", "runs/readings/e1/rec"]


def test_a_training_session_s_arguments_are_refused_before_anything_is_uploaded(gpu):
    root, calls, _ = gpu
    assert launch.main([*IMITATE, "--dry-run", "--", "--width", "256", "--layers", "6", "--minibatch", "32768"]) == 0
    assert launch.main([*DISTIL, "--dry-run", "--", "--init", "runs/selfplay/b1/snap-100.pt"]) == 0
    # A copy from random weights, the set prepared with the clock its net reads.
    assert launch.main([*DISTIL, "--clock", "--dry-run", "--", "--width", "256", "--layers", "6"]) == 0
    for argv, refusal in [
        ([*IMITATE, "--", "--data", "runs/x"], "the launcher's"),
        ([*IMITATE, "--", "--hours", "2"], "the launcher's"),
        ([*IMITATE, "--", "--minibatch", "4100"], "split over the session's 8 chips"),
        ([*IMITATE, "--clock", "--"], "no turn cap"),
        (["train", "i1", "--task", "imitate", "--source", "runs/readings/e1/rec", "--"], "folders under runs/imitate/"),
        ([*DISTIL, "--", "--init", "runs/selfplay/b1/none.pt"], "lacks"),
        ([*IMITATE, "--session-hours", "10", "--"], "at most 9"),
    ]:
        with pytest.raises(AssertionError, match=refusal):
            launch.main(argv)
    (root / "runs" / "tpu" / "i2").mkdir(parents=True)
    (root / "runs" / "tpu" / "i2" / "last.pt").write_bytes(b"x")
    with pytest.raises(AssertionError, match="finished run"):
        launch.main(["train", "i2", *IMITATE[2:], "--"])
    # Only the quota was asked, by the three dry runs and the session too long for it.
    assert [c[0] for c in calls] == ["quota", "quota", "quota", "quota"]


def test_a_set_already_on_kaggle_is_checked_by_name_and_size_and_not_uploaded_again(gpu, capsys):
    root, calls, files = gpu
    launch.main([*IMITATE, "--data-dataset", "someone/risk-bundle-old", "--dry-run", "--"])
    assert "upload 0 files" in capsys.readouterr().out
    files[0]["totalBytes"] = 299
    with pytest.raises(AssertionError, match="299 bytes"):
        launch.main([*IMITATE, "--data-dataset", "someone/risk-bundle-old", "--dry-run", "--"])


def test_a_pushed_session_carries_its_job_the_bundle_and_the_tpu(gpu):
    root, calls, _ = gpu
    # An earlier session's state, which this one carries on from.
    run = root / "runs" / "tpu" / "d1"
    run.mkdir(parents=True)
    (run / "resume.json").write_text("{}")
    assert launch.main([*DISTIL, "--clock", "--", "--init", "runs/selfplay/b1/snap-100.pt", "--minibatch", "8192"]) == 0
    staged = root / "runs" / "kaggle" / "tpu-d1"
    meta = json.loads((staged / "kernel" / "kernel-metadata.json").read_text())
    assert meta["enable_tpu"] and not meta["enable_gpu"] and meta["machine_shape"] == "TpuV5E8"
    assert meta["docker_image_pinning_type"] == "latest" and meta["dataset_sources"] == ["someone/risk-bundle-tpu-d1"]
    manifest = json.loads((staged / "bundle" / "MANIFEST.json").read_text())
    assert sorted(manifest["files"].values()) == ["runs/readings/e1/rec/recording.json", "runs/readings/e1/rec/shard-00000.pt",
                                                  "runs/selfplay/b1/snap-100.pt", "runs/tpu/d1/resume.json"]
    run_py = (staged / "kernel" / "run.py").read_text()
    job = json.loads(run_py.split("\n", 1)[0][len("JOB = "):])
    assert job["task"] == "distil" and job["source"] == "runs/readings/e1/rec" and job["prepare_args"] == ["--clock"]
    assert "--init" in job["train_args"] and "def main(job" in run_py
    pushed = json.loads((run / "kaggle-push.json").read_text())
    assert pushed["kind"] == "train" and pushed["guard_sha256"]["best.pt"] is None
    with pytest.raises(AssertionError, match="not fetched yet"):
        launch.main([*DISTIL, "--", "--init", "runs/selfplay/b1/snap-100.pt"])


def test_a_session_restores_its_run_folder_to_write_and_the_rest_where_mounted(tmp_path, monkeypatch):
    from riskgpu.tpu import session
    inp = tmp_path / "input"
    (inp / "bundle").mkdir(parents=True)
    (inp / "old").mkdir()
    (inp / "bundle" / "MANIFEST.json").write_text(json.dumps({
        "id": "b1", "files": {"runs__tpu__r__resume.json": "runs/tpu/r/resume.json", "runs__x.pt": "runs/x.pt"},
        "external": {"runs__imitate__fx__a.pt": "runs/imitate/fx/a.pt"}}))
    for path in (inp / "bundle" / "runs__tpu__r__resume.json", inp / "bundle" / "runs__x.pt", inp / "old" / "runs__imitate__fx__a.pt"):
        path.write_text(path.name)
    linked = {}
    monkeypatch.setattr(session.os, "symlink", lambda src, dest: linked.__setitem__(dest, src))
    assert session.restore({"bundle": "b1", "name": "r"}, str(inp), str(tmp_path / "gpu"), str(tmp_path / "work")) == 3
    assert (tmp_path / "work" / "r" / "resume.json").read_text() == "runs__tpu__r__resume.json"
    assert linked == {os.path.join(str(tmp_path / "gpu"), "runs/x.pt"): str(inp / "bundle" / "runs__x.pt"),
                      os.path.join(str(tmp_path / "gpu"), "runs/imitate/fx/a.pt"): str(inp / "old" / "runs__imitate__fx__a.pt")}
    with pytest.raises(SystemExit, match="not this job's"):
        session.restore({"bundle": "b2", "name": "r"}, str(inp), str(tmp_path / "gpu"), str(tmp_path / "work"))

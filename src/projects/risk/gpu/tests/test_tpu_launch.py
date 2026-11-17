"""The TPU probe's launcher: a session the quota can't hold, or arguments the probe would refuse,
must be refused here, before a push spends the week's hours or sits in Kaggle's queue for nothing."""

import json
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

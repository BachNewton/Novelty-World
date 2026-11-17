"""The Modal launcher's guards on money and work: a push the month's credit can't cover, hours split
so a run's readings never get their time, a run reading or writing the wrong folder, a fetch that
overwrites local work, an upload of gigabytes already on the Volume, or a one-off reading whose tool
would refuse it on the GPU each waste money or a run."""

import json
import os
import sys
import time
from contextlib import contextmanager
from types import SimpleNamespace

import pytest

from riskgpu.kaggle import kernel
from riskgpu.kaggle import launch as kaggle
from riskgpu.modalgpu import launch


class FakeVolume:
    """A Modal Volume as the launcher uses it: paths relative to its root, files as bytes."""

    def __init__(self, files: dict[str, bytes] | None = None):
        self.files = dict(files or {})
        self.uploaded: list[str] = []

    def listdir(self, path: str):
        prefix = path.strip("/") + "/" if path.strip("/") else ""
        children = {}
        for f in self.files:
            if f.startswith(prefix):
                rest = f[len(prefix):]
                children[prefix + rest.split("/")[0]] = "DIRECTORY" if "/" in rest else "FILE"
        if prefix and not children:
            raise FileNotFoundError(path)
        return [SimpleNamespace(path=p, type=SimpleNamespace(name=kind)) for p, kind in children.items()]

    def read_file(self, path: str):
        yield self.files[path.strip("/")]

    @contextmanager
    def batch_upload(self, force: bool = False):
        yield self

    def put_file(self, local, remote: str) -> None:
        if hasattr(local, "read"):
            data = local.read()
        else:
            with open(local, "rb") as f:
                data = f.read()
        self.files[remote.strip("/")] = data
        self.uploaded.append(remote.strip("/"))

    def remove_file(self, path: str, recursive: bool = False) -> None:
        self.files = {f: d for f, d in self.files.items() if not f.startswith(path.strip("/") + "/")}


def gpu_tree(root, files: dict[str, str]) -> None:
    for rel, text in files.items():
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        (root / rel).write_text(text)


def flying(name: str, trainer: str, now: float, rate: float = 1.5, hours_ago: float = 2, hours: float = 8) -> dict:
    return {"run": {"name": name, "trainer": trainer, "args": []}, "rate": rate, "pushed": now - hours_ago * 3600,
            "hours": hours, "call": f"fc-{name}"}


def test_a_push_that_cant_resume_must_fit_the_months_credit():
    # An imitation's A10 with its four cores and 32 GiB: $1.55 an hour, so 8 hours is $12.37 at worst.
    imitation = 8 * launch.hourly("A10", "imitate")
    assert imitation == pytest.approx(12.37, abs=1e-2)
    now = time.time()
    launch.check_budget(spent=17.5, flight=[], now=now, cost=imitation, can_resume=False)
    with pytest.raises(AssertionError, match="past"):
        launch.check_budget(spent=18.0, flight=[], now=now, cost=imitation, can_resume=False)
    # A run still in flight counts the hours its container may yet hold, which billing hasn't seen.
    running, ended = flying("a", "imitate", now), flying("b", "imitate", now, hours_ago=9)
    assert launch.in_flight([running, ended], now) == pytest.approx(9.0)
    with pytest.raises(AssertionError, match="past"):
        launch.check_budget(spent=10.0, flight=[running], now=now, cost=12.0, can_resume=False)
    # A reading is no more resumable than an imitation.
    reading = {"reading": {"name": "r"}, "rate": 1.5, "pushed": now, "hours": 2}
    assert not launch.resumable(reading) and not launch.resumable(running)


def test_a_resumable_run_may_run_into_the_cap(capsys):
    now = time.time()
    # 24 hours on an A10 is $34, past the whole month's credit, and a PPO run is still pushed.
    launch.check_budget(spent=20.0, flight=[flying("a", "ppo", now)], now=now, cost=24 * launch.hourly("A10", "ppo"),
                        can_resume=True)
    assert "pushing it again" in capsys.readouterr().out
    # A month already spent would stop it at once.
    with pytest.raises(AssertionError, match="next month"):
        launch.check_budget(spent=30.0, flight=[], now=now, cost=1.0, can_resume=True)


def test_a_push_that_cant_resume_is_refused_beside_a_resumable_run_that_could_take_whats_left():
    now = time.time()
    # m1 may still spend $9 and runs to the cap if it must, so a $10 imitation beside it could be cut off.
    trainer = flying("m1", "ppo", now)
    with pytest.raises(AssertionError, match="m1 in flight can resume"):
        launch.check_budget(spent=15.0, flight=[trainer], now=now, cost=10.0, can_resume=False)
    # Where m1's worst case leaves the imitation room, both fit.
    launch.check_budget(spent=5.0, flight=[trainer], now=now, cost=10.0, can_resume=False)


def test_a_dry_run_refuses_only_what_cant_resume_past_the_whole_credit(capsys):
    launch.worst_alone(34.0, can_resume=True)
    assert "no refusal" in capsys.readouterr().out
    launch.worst_alone(30.0, can_resume=False)
    with pytest.raises(AssertionError, match="can't resume"):
        launch.worst_alone(30.5, can_resume=False)


def test_the_volume_is_committed_on_the_line_the_trainer_prints_after_each_checkpoint():
    every = launch.ckpt_every(["--ckpt-every", "5", "--panel", "64"])
    assert every == 5 and launch.ckpt_every([]) == 25
    assert launch.saved_checkpoint(json.dumps({"iter": 10, "steps_per_s": 1.0}) + "\n", every)
    for line in (json.dumps({"iter": 11}), "  eval [1, 2]", "resumed m1 at iteration 10, 1.00 h trained",
                 "{not json", json.dumps([10])):
        assert not launch.saved_checkpoint(line + "\n", every)


def test_a_session_hands_each_line_of_a_tasks_output_to_its_host(tmp_path):
    (tmp_path / "r").mkdir()
    heard = []

    class Host(kernel.Session):
        def on_line(self, task, line):
            heard.append((task["name"], line))

    session = Host({"runs": [{"name": "r", "args": []}], "read_hours": 0}, str(tmp_path), gpus=1,
                   deadline=time.time() + 60, working=str(tmp_path), grace=0)
    session.command = lambda task: [sys.executable, "-c", "print('{\"iter\": 25}'); print('done')"]
    session.perform({"kind": "train", "name": "r", "trainer": "ppo", "args": []}, device=0)
    assert heard == [("r", '{"iter": 25}\n'), ("r", "done\n")]


def test_a_ppo_runs_container_commits_its_folder_at_each_checkpoint_and_at_the_trainers_end(tmp_path, monkeypatch):
    pytest.importorskip("modal")
    from riskgpu.modalgpu import remote
    commits = []
    monkeypatch.setattr(remote, "runs_volume", SimpleNamespace(commit=lambda: commits.append(len(heard))))
    heard = []
    run = {"name": "r", "trainer": "ppo", "args": ["--ckpt-every", "2"]}
    (tmp_path / "r").mkdir()
    session = remote.RunSession({"runs": [run], "read_hours": 0}, str(tmp_path), gpus=1, deadline=time.time() + 60,
                                working=str(tmp_path), grace=0, panel=True)
    lines = [json.dumps({"iter": i}) for i in (1, 2, 3, 4)] + ["stopped: flat"]
    script = "; ".join(f"print({line!r})" for line in lines)
    session.command = lambda task: [sys.executable, "-c", script]
    session.on_line = (lambda hear: lambda task, line: (heard.append(line), hear(task, line)))(session.on_line)
    session.perform(session.next_task(), device=0)
    # After iterations 2 and 4's lines, and once more when the trainer exits.
    assert commits == [2, 4, 5]


def test_a_push_again_resumes_the_run_from_its_folder_on_the_volume(tmp_path, monkeypatch):
    from riskgpu.selfplay import ppo
    monkeypatch.setattr(kaggle, "GPU", str(tmp_path))
    run = {"name": "r", "trainer": "ppo", "args": ["--stop-when", "flat", "--stop-key", "k", "--panel", "64"]}
    assert launch.resume_of(run) is None
    gpu_tree(tmp_path, {"runs/selfplay/r/latest.pt": "fetched once"})
    record = {"run": run, "runs": [run], "call": "fc-1",
              "guard_sha256": {"r": launch.sha256(str(tmp_path / "runs/selfplay/r/latest.pt"))}}
    (tmp_path / "runs/selfplay/r" / launch.PUSHED).write_text(json.dumps(record))
    assert launch.resume_of(run) == record
    volume = FakeVolume({"runs/selfplay/r/latest.pt": b"trained on", f"runs/selfplay/r/{launch.SESSIONS}": b"{}\n"})
    launch.check_resume(record, "failed", volume)
    # Never two containers on one folder.
    with pytest.raises(AssertionError, match="still running"):
        launch.check_resume(record, "running", volume)
    # A plateau's stop is read, not pushed past.
    with pytest.raises(AssertionError, match="plateau"):
        launch.check_resume(record, "ended", FakeVolume({**volume.files, "runs/selfplay/r/stopped.txt": b"flat"}))
    # Trained here since the push: the Volume's folder and this one have forked.
    (tmp_path / "runs/selfplay/r/latest.pt").write_text("trained here meanwhile")
    with pytest.raises(AssertionError, match="changed here"):
        launch.check_resume(record, "ended", volume)
    # An imitation can't resume, so its push must be fetched first.
    imitation = {"name": "i", "trainer": "imitate", "args": []}
    gpu_tree(tmp_path, {f"runs/imitate/i/{launch.PUSHED}": "{}"})
    with pytest.raises(AssertionError, match="can't resume"):
        launch.resume_of(imitation)

    # The container's trainer continues the run: --resume, the run's own recipe, and the session's hours.
    session = kernel.Session({"runs": [run], "read_hours": 0}, str(tmp_path), gpus=1, deadline=time.time() + 3600,
                             working=str(tmp_path), grace=0)
    command = session.command({"kind": "train", **run})
    parsed = ppo.parser().parse_args(command[command.index("riskgpu.selfplay.ppo") + 1:])
    assert parsed.resume and parsed.name == "r" and parsed.stop_key == "k" and parsed.session_hours > 0


def test_a_resume_keeps_the_bootstrap_its_checkpoint_was_trained_with(tmp_path, monkeypatch):
    import torch
    monkeypatch.setattr(kaggle, "GPU", str(tmp_path))
    (tmp_path / "runs/selfplay/r").mkdir(parents=True)
    torch.save({"args": {"bootstrap": "acting"}}, tmp_path / "runs/selfplay/r/latest.pt")
    launch.check_recipe({"name": "r", "trainer": "ppo", "args": []})
    launch.check_recipe({"name": "r", "trainer": "ppo", "args": ["--bootstrap", "acting"]})
    with pytest.raises(AssertionError, match="keeps its recipe"):
        launch.check_recipe({"name": "r", "trainer": "ppo", "args": ["--bootstrap", "carry"]})
    # Every choice a resumed run keeps, not only the bootstrap: this checkpoint predates the cap score.
    with pytest.raises(AssertionError, match="--cap-score survivors"):
        launch.check_recipe({"name": "r", "trainer": "ppo", "args": ["--cap-score", "loss"]})


def test_the_hours_are_split_so_the_readings_get_theirs(tmp_path):
    assert launch.train_hours(8, 2) == pytest.approx(8 - 2 - launch.END_S / 3600)
    for hours, read in ((8, 8), (25, 2), (0, 0), (8, -1)):
        with pytest.raises(AssertionError):
            launch.train_hours(hours, read)
    # The container's session gives the trainer exactly the training share.
    (tmp_path / "r").mkdir()
    job = {"runs": [{"name": "r", "args": []}], "read_hours": 2}
    session = kernel.Session(job, str(tmp_path), gpus=1, deadline=launch.deadline(time.time(), 8),
                             working=str(tmp_path), grace=0)
    train = session.command({"kind": "train", "name": "r", "args": []})
    assert train[-2] == "--session-hours" and float(train[-1]) == pytest.approx(launch.train_hours(8, 2), abs=1e-3)


def test_a_restarted_container_keeps_its_first_starts_deadline(tmp_path):
    log = tmp_path / launch.SESSIONS
    assert launch.first_start(str(log), "p2") is None
    log.write_text("".join(json.dumps(r) + "\n" for r in
                           ({"push": "p1", "started": 100.0}, {"push": "p2", "started": 500.0},
                            {"push": "p2", "started": 900.0})))
    assert launch.first_start(str(log), "p2") == 500.0
    assert launch.first_start(str(log), "p3") is None
    assert launch.deadline(500.0, 1) == 500.0 + 3600 - launch.END_S


def test_precision_is_bf16_on_every_gpu_but_the_t4():
    args = ["--stop-when", "flat", "--stop-key", "k", "--panel", "512"]
    assert launch.run_args(args, "", "A10", no_stop=False, trainer="ppo") == args
    assert launch.run_args([*args, "--no-bf16"], "", "T4", no_stop=False, trainer="ppo")[-1] == "--no-bf16"
    with pytest.raises(AssertionError, match="bf16"):
        launch.run_args([*args, "--no-bf16"], "", "A10", no_stop=False, trainer="ppo")
    with pytest.raises(AssertionError, match="bfloat16"):
        launch.run_args(args, "", "T4", no_stop=False, trainer="ppo")
    # The last word on it wins, as the trainer's parser reads it.
    assert launch.run_args([*args, "--no-bf16"], "--bf16", "A10", no_stop=False, trainer="ppo")


def test_a_runs_own_folder_goes_to_the_runs_volume_and_its_inputs_to_the_data_volume(tmp_path, monkeypatch):
    monkeypatch.setattr(kaggle, "GPU", str(tmp_path))
    gpu_tree(tmp_path, {"data/blitz-256.bin": "", "data/blitz-256.json": "", "runs/selfplay/r/log.jsonl": "",
                        "runs/selfplay/r/modal-push.json": "", "runs/selfplay/base/snap-150.pt": ""})
    run = {"name": "r", "trainer": "ppo", "args": ["--init", "runs/selfplay/base/snap-150.pt"]}
    own, inputs = launch.split_files(run, kaggle.needed_files(run))
    assert own == ["runs/selfplay/r/log.jsonl"]
    assert inputs == ["data/blitz-256.bin", "data/blitz-256.json", "runs/selfplay/base/snap-150.pt"]


def test_a_sharp_reading_reads_at_the_pushs_size_in_the_runs_folder(tmp_path):
    run_dir = tmp_path / "r"
    run_dir.mkdir()
    (run_dir / "log.jsonl").write_text("".join(json.dumps({"iter": it, "panel": {"k": {}}}) + "\n" for it in (2, 3)))
    for it in (2, 3):
        (run_dir / f"snap-{it}.pt").write_text("")
    job = {"runs": [], "read_hours": 0, "sharp_games": 64}
    session = kernel.Session(job, str(tmp_path), gpus=1, deadline=time.time() + 60, working=str(tmp_path), grace=0)
    tasks = kernel.sharp_readings("r", ["--stop-key", "k"], str(run_dir), job["sharp_games"])
    assert [t["iter"] for t in tasks] == [3, 2]
    assert " ".join(session.command(tasks[0])[3:]) == ("riskgpu.selfplay.panel --ckpt runs/selfplay/r/snap-3.pt "
                                                       "--games 64 --out runs/selfplay/r/panel-3-g64.json --bf16")


def test_inputs_already_on_the_data_volume_are_not_uploaded_again(tmp_path, monkeypatch):
    monkeypatch.setattr(kaggle, "GPU", str(tmp_path))
    gpu_tree(tmp_path, {"data/a.bin": "a", "data/b.bin": "b2", "runs/imitate/d/c.pt": "c"})
    files = ["data/a.bin", "data/b.bin", "runs/imitate/d/c.pt"]
    hashes = {f: launch.sha256(str(tmp_path / f)) for f in files}
    # a is there unchanged, b changed since, c missing.
    volume = FakeVolume({"data/a.bin": b"a", "data/b.bin": b"b1", launch.MANIFEST:
                         json.dumps({"data/a.bin": hashes["data/a.bin"], "data/b.bin": "old"}).encode()})
    launch.upload_inputs(volume, files)
    assert volume.uploaded == ["data/b.bin", "runs/imitate/d/c.pt", launch.MANIFEST]
    assert json.loads(volume.files[launch.MANIFEST]) == hashes
    volume.uploaded.clear()
    launch.upload_inputs(volume, files)
    assert volume.uploaded == []


def test_a_runs_folder_on_the_volume_is_replaced_by_the_local_one(tmp_path, monkeypatch):
    monkeypatch.setattr(kaggle, "GPU", str(tmp_path))
    gpu_tree(tmp_path, {"runs/selfplay/r/latest.pt": "new"})
    volume = FakeVolume({"runs/selfplay/r/latest.pt": b"old", "runs/selfplay/r/snap-9.pt": b"gone here",
                         "runs/selfplay/other/latest.pt": b"kept"})
    launch.upload_own(volume, "runs/selfplay/r", ["runs/selfplay/r/latest.pt"])
    assert volume.files == {"runs/selfplay/r/latest.pt": b"new", "runs/selfplay/other/latest.pt": b"kept"}


def test_fetch_refuses_to_overwrite_local_work_and_brings_the_run_back(tmp_path, monkeypatch):
    monkeypatch.setattr(kaggle, "GPU", str(tmp_path))
    run = {"name": "r", "trainer": "ppo", "args": []}
    gpu_tree(tmp_path, {"runs/selfplay/r/latest.pt": "pushed", "runs/selfplay/r/modal-push.json": "{}"})
    record = {"run": run, "runs": [run], "guard_sha256": {"r": launch.sha256(str(tmp_path / "runs/selfplay/r/latest.pt"))}}
    volume = FakeVolume({"runs/selfplay/r/latest.pt": b"trained", "runs/selfplay/r/log.jsonl": b"{}\n",
                         f"runs/selfplay/r/{launch.SESSIONS}": b"{}\n", "runs/selfplay/r/sub/x": b""})

    (tmp_path / "runs/selfplay/r/latest.pt").write_text("trained here meanwhile")
    with pytest.raises(AssertionError, match="latest.pt changed"):
        launch.bring_back(record, volume)
    assert (tmp_path / "runs/selfplay/r/latest.pt").read_text() == "trained here meanwhile"

    (tmp_path / "runs/selfplay/r/latest.pt").write_text("pushed")
    launch.bring_back(record, volume)
    local = tmp_path / "runs" / "selfplay" / "r"
    assert sorted(os.listdir(local)) == sorted(["latest.pt", "log.jsonl", launch.SESSIONS])
    assert (local / "latest.pt").read_text() == "trained"


def test_an_imitations_size_and_device_are_checked_before_anything_is_uploaded():
    shared = ["--data", "runs/imitate/d", "--max-samples", "5"]
    assert launch.run_args(shared, "--width 384 --layers 8", "A10", no_stop=False, trainer="imitate")[-4:] == \
        ["--width", "384", "--layers", "8"]
    # A width the heads don't divide fails only at the net's first step, after the container's start-up.
    with pytest.raises(AssertionError, match="--heads"):
        launch.run_args(shared, "--width 100", "A10", no_stop=False, trainer="imitate")
    # A container on the CPU pays for its GPU and trains tens of times slower.
    with pytest.raises(AssertionError, match="--device"):
        launch.run_args(shared, "--device cpu", "A10", no_stop=False, trainer="imitate")


def test_a_reading_is_one_of_the_reading_tools():
    assert kaggle.reading_spec("p=panel --ckpt runs/a/b.pt --games 64") == \
        {"name": "p", "tool": "panel", "args": ["--ckpt", "runs/a/b.pt", "--games", "64"]}
    for spec in ("p=ppo --iters 1", "p=riskgpu.selfplay.panel --ckpt runs/a/b.pt", "p=", "panel --ckpt runs/a/b.pt",
                 "../p=panel --ckpt runs/a/b.pt"):
        with pytest.raises(AssertionError):
            kaggle.reading_spec(spec)


def test_a_readings_arguments_are_checked_by_its_own_parser_before_anything_is_uploaded():
    def check(spec: str, full_precision: bool = False) -> None:
        kaggle.check_reading(kaggle.reading_spec(spec), full_precision)

    check("p=panel --ckpt runs/a/b.pt --games 64")
    check("s=search --ckpt runs/a/b.pt --k 2 --no-bf16", full_precision=True)
    # A value its parser refuses would fail the container after its start-up.
    with pytest.raises(SystemExit):
        check("p=panel --ckpt runs/a/b.pt --games many")
    with pytest.raises(SystemExit):
        check("c=calibrate --ckpt runs/a/b.pt --no-such-flag")
    # The output is the launcher's, in the reading's folder, however it is spelled.
    with pytest.raises(AssertionError, match="--out"):
        check("p=panel --ckpt runs/a/b.pt --ou elsewhere.json")
    # A reading on the CPU pays for a GPU it never uses.
    with pytest.raises(AssertionError, match="--device"):
        check("c=calibrate --ckpt runs/a/b.pt --device cpu")
    # Each tool's own default is bf16 on CUDA, which a T4 lacks.
    for tool in ("panel", "calibrate", "search"):
        with pytest.raises(AssertionError, match="bfloat16"):
            check(f"r={tool} --ckpt runs/a/b.pt", full_precision=True)


def test_the_checkpoints_a_reading_names_are_its_inputs(tmp_path, monkeypatch):
    from riskgpu.selfplay import panel
    monkeypatch.setattr(kaggle, "GPU", str(tmp_path))
    anchors = ["runs/selfplay/sw/snap-1.pt", "runs/imitate/imit-1/best.pt"]
    gpu_tree(tmp_path, {f: "" for f in ["data/blitz-256.bin", "data/blitz-256.json", "runs/selfplay/a/snap-5.pt",
                                        "runs/selfplay/b/snap-9.pt", *anchors]})
    monkeypatch.setattr(panel, "ANCHORS", tuple((rel, str(tmp_path / rel)) for rel in anchors))

    calibrate = kaggle.reading_spec("c=calibrate --ckpt runs/selfplay/a/snap-5.pt --mixed=runs/selfplay/b/snap-9.pt")
    assert kaggle.reading_files(calibrate) == ["data/blitz-256.bin", "data/blitz-256.json",
                                               "runs/selfplay/a/snap-5.pt", "runs/selfplay/b/snap-9.pt"]
    reading = kaggle.reading_spec("p=panel --ckpt runs/selfplay/a/snap-5.pt")
    assert kaggle.reading_files(reading)[-2:] == anchors
    with pytest.raises(AssertionError, match="lacks"):
        kaggle.reading_files(kaggle.reading_spec("p=panel --ckpt runs/selfplay/a/snap-6.pt"))
    # A path the container can't open where the launcher would find it.
    for path in (str(tmp_path / "runs/selfplay/a/snap-5.pt"), "../runs/selfplay/a/snap-5.pt"):
        with pytest.raises(AssertionError, match="under runs/"):
            kaggle.reading_files({"name": "p", "tool": "panel", "args": ["--ckpt", path]})


def test_a_reading_writes_its_output_and_captured_output_in_its_own_folder(tmp_path):
    reading = {"name": "p", "tool": "panel", "args": ["--ckpt", "runs/a/b.pt", "--games", "64"]}
    (tmp_path / "p").mkdir()
    session = kernel.Session({"runs": [], "readings": [reading], "read_hours": 0}, str(tmp_path), gpus=1,
                             deadline=time.time() + 60, working=str(tmp_path), grace=0)
    task = session.next_task()
    assert " ".join(session.command(task)[3:]) == \
        "riskgpu.selfplay.panel --ckpt runs/a/b.pt --games 64 --out runs/readings/p/panel.json"
    session.command = lambda task: [sys.executable, "-c", "print('read')"]
    session.perform(task, device=0)
    assert session.failed == [] and session.queue == []
    assert (tmp_path / "p" / "out.txt").read_text() == "read\n"


def test_fetch_brings_a_reading_back_only_into_a_folder_holding_just_its_push(tmp_path, monkeypatch):
    monkeypatch.setattr(kaggle, "GPU", str(tmp_path))
    reading = {"name": "p", "tool": "panel", "args": []}
    gpu_tree(tmp_path, {f"runs/readings/p/{launch.PUSHED}": "{}"})
    volume = FakeVolume({"runs/readings/p/panel.json": b"{}", "runs/readings/p/out.txt": b"read\n",
                         f"runs/readings/p/{launch.SESSIONS}": b"{}\n"})
    with pytest.raises(AssertionError, match="name a new one"):
        kaggle.check_new_reading(reading)

    (tmp_path / "runs/readings/p/panel.json").write_text("read here meanwhile")
    with pytest.raises(AssertionError, match="overwrite"):
        launch.bring_back_reading({"reading": reading}, volume)
    (tmp_path / "runs/readings/p/panel.json").unlink()

    launch.bring_back_reading({"reading": reading}, volume)
    assert sorted(os.listdir(tmp_path / "runs/readings/p")) == sorted(["panel.json", "out.txt", launch.SESSIONS])

"""Training runs on Modal's GPUs, launched and read from here:

    python -m riskgpu.modalgpu.launch push <name> [<name>] [--run-args <name>="<its own args>"] [--imitate]
                                      [--no-panel] [--gpu A10] [--hours 8] [--read-hours 2] [--dry-run]
                                      -- <shared trainer args>
    python -m riskgpu.modalgpu.launch push --read <name>="<tool> <its args>" [--read ...] [--gpu A10] [--hours 2]
                                      [--dry-run]
    python -m riskgpu.modalgpu.launch status <name> [<name>]
    python -m riskgpu.modalgpu.launch fetch <name> [<name>]
    python -m riskgpu.modalgpu.launch stop <name> [<name>]
    python -m riskgpu.modalgpu.launch report <name> [<name>] [--key "sample s2-2-150 one-in"]

run from `src/projects/risk/gpu/` (`docs/modal.md`). The jobs and their terms are the Kaggle launcher's
(`kaggle/launch.py`), whose argument checks, bundle, readings and report this reuses: a run is trained
by PPO (its folder `runs/selfplay/<name>/`) or, with `--imitate`, by imitation (`runs/imitate/<name>/`),
and read in the same container once it stops. Each run has a GPU container of its own, in one
detached app per push, so it goes on with this laptop off; its folder lives on the `risk-runs`
Volume, and the inputs that don't change on the `risk-data` Volume, uploaded once and again only when
their hash changes. The code is this checkout's committed GPU package, put in the image as it stands
at HEAD. `--hours` bounds the container, and so the money. A PPO run can resume, so it may run into
the workspace's spend cap, its folder committed to the Volume at every checkpoint, and pushing it
again resumes it; an imitation or a reading can't, so before anything is uploaded its worst case at
Modal's rates, with what this month has spent and what runs still in flight could, must stay under
the month's credit.

A push of readings (`--read`) runs no trainer: each is one reading of existing checkpoints by a
reading tool (`search`, `calibrate` or `panel`), its arguments checked by the tool's own parser, on a
container of its own, its output and captured output in `runs/readings/<name>/`.
"""

import argparse
import hashlib
import io
import json
import os
import shlex
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import uuid

from ..kaggle import launch as kaggle
from ..kaggle.kernel import READINGS, SHARP_GAMES, TRAINERS, reading_folder, reading_output, run_folder, trainer_of

GPUS = ("T4", "L4", "A10", "A100-40GB", "A100-80GB", "H100")
# Modal's published rates, dollars a second: each GPU, and a physical core and a GiB of memory
# (`modal billing rates`; bench.py's).
GPU_RATE = {"T4": 0.000164, "L4": 0.000222, "A10": 0.000306, "A100-40GB": 0.000583, "A100-80GB": 0.000694,
            "H100": 0.001097}
CORE_RATE = 0.0000131
GIB_RATE = 0.00000222
CORES = 4.0
# An imitation holds its whole data set in memory (5.2 GB for native-v2), a PPO run and a reading little.
MEMORY_GIB = {"ppo": 16, "imitate": 32, "read": 16}
# Older than Ampere: no native bfloat16.
FULL_PRECISION = {"T4"}
# The month's credit and the workspace's spend cap, both $30: a run that can't resume must fit under it
# at its worst case, and one that can runs into the cap, which stops it.
CEILING = 30.0
MAX_HOURS = 24.0  # Modal's longest timeout
# The container's last minutes, after the readings are stopped, for the last commit to the Volume.
END_S = 300
READ_HOURS = 2.0  # a training push's default --read-hours
RUNS_VOLUME, DATA_VOLUME = "risk-runs", "risk-data"
MANIFEST = "MANIFEST.json"  # the data Volume's record of each file's hash
SESSIONS = "modal-sessions.jsonl"  # a run folder's record of the containers that ran it
PUSHED = "modal-push.json"


def gpu_dir() -> str:
    return kaggle.GPU


def staging() -> str:
    return os.path.join(gpu_dir(), "runs", "modal")


def bf16(args: list[str]) -> bool:
    """The precision the trainer would run in: bf16 unless the last word on it is --no-bf16."""
    said = [a for a in args if a in ("--bf16", "--no-bf16")]
    return not said or said[-1] == "--bf16"


def run_args(shared: list[str], extra: str, gpu: str, no_stop: bool, trainer: str) -> list[str]:
    """One run's trainer arguments, checked as the Kaggle launcher checks them, with this host's
    precision: bf16 on every GPU but the T4, which has none."""
    args = shared + shlex.split(extra)
    if gpu in FULL_PRECISION:
        assert not bf16(args), f"a {gpu} has no native bfloat16: give the trainer --no-bf16"
    else:
        assert bf16(args), (f"a Modal run on a {gpu} trains in bf16, its recipe here (comparable with the eGPU's): "
                            "drop --no-bf16, or push to a T4")
    args = kaggle.trainer_args(args, no_stop, trainer)
    if trainer == "imitate":
        from ..selfplay.imitate import parser
        parsed = parser().parse_args(["train", "--name", "check", *args])
        # A container pays for its GPU whatever the run trains on.
        assert parsed.device == "cuda", f"a Modal run trains on its GPU: drop --device {parsed.device}"
        assert parsed.width % parsed.heads == 0, \
            f"--width {parsed.width} doesn't split into --heads {parsed.heads}: the net would fail on its first step"
    return args


def train_hours(hours: float, read_hours: float) -> float:
    """The training's share of a container of `hours`: the rest goes to the readings and the end."""
    assert 0 < hours <= MAX_HOURS, f"a container's hours are Modal's timeout: more than 0, at most {MAX_HOURS:g}"
    assert read_hours >= 0, "the readings' hours can't be negative"
    share = hours - read_hours - END_S / 3600
    assert share > 0, f"--read-hours {read_hours:g} leaves {hours:g} hours no training"
    return share


def deadline(first_start: float, hours: float) -> float:
    """When a run's readings are stopped: the container's hours from the run's first start, less its
    end. A container Modal restarts (a preempted one) keeps its first start's deadline, so a restart
    never buys hours the push didn't pay for."""
    return first_start + hours * 3600 - END_S


def first_start(sessions_log: str, push: str) -> float | None:
    """The first start of `push`'s container in a run's log of containers, or None if this is it."""
    if not os.path.exists(sessions_log):
        return None
    with open(sessions_log) as f:
        starts = [r["started"] for r in map(json.loads, f) if r.get("push") == push]
    return min(starts) if starts else None


def ckpt_every(args: list[str]) -> int:
    """How often a PPO run saves `latest.pt`, as its trainer's parser reads its arguments."""
    from ..selfplay.ppo import parser
    return parser().parse_args(["--name", "check", *args]).ckpt_every


def saved_checkpoint(line: str, every: int) -> bool:
    """Whether a line of a PPO trainer's output follows a save of `latest.pt`. The trainer prints one
    JSON line per iteration, after that iteration's checkpoint is written, among other text."""
    if not line.startswith("{"):
        return False
    try:
        record = json.loads(line)
    except ValueError:  # text that merely starts with a brace; the trainer's own lines are JSON
        return False
    return isinstance(record, dict) and "iter" in record and record["iter"] % every == 0


def resume_of(run: dict) -> dict | None:
    """The push a run resumes from on the Volume: its last Modal push, ended and never fetched, whose
    folder there is ahead of the local one. None for a run pushed afresh from its local folder."""
    local = kaggle.local_dir(run)
    assert not os.path.exists(os.path.join(local, "kaggle-push.json")), \
        f"{run_folder(run)} has a Kaggle push not yet fetched"
    path = os.path.join(local, PUSHED)
    if not os.path.exists(path):
        return None
    assert trainer_of(run) == "ppo", f"{run_folder(run)} has a push not yet fetched, and an imitation can't resume"
    with open(path) as f:
        return json.load(f)


def check_resume(record: dict, state: str, volume) -> None:
    """A resume push continues the run's folder on the Volume, so only once its container has ended,
    only if this checkout hasn't trained it since, and not past a plateau stop, which is a diagnosis."""
    name = record["run"]["name"]
    assert state != "running", f"{name} is still running on Modal: `stop` it first, or let it end"
    kaggle.check_guards(record)
    assert not exists(volume, f"{run_folder(record['run'])}/stopped.txt"), \
        f"{name} stopped on its plateau: `fetch` it and read why, rather than pushing more hours"


def check_recipe(run: dict) -> None:
    """A resumed run keeps the recipe its checkpoint was trained with (`ppo.RECIPE`), as its trainer
    insists; refused here, so a changed recipe costs no container."""
    latest = os.path.join(kaggle.local_dir(run), "latest.pt")
    if trainer_of(run) != "ppo" or not os.path.exists(latest):
        return
    import torch
    from ..selfplay.ppo import parser, resolve_recipe
    resolve_recipe(parser().parse_args(["--name", "check", *run["args"]]),
                   torch.load(latest, map_location="cpu", weights_only=False).get("args", {}))


def hourly(gpu: str, trainer: str) -> float:
    """A container's dollars an hour: its GPU, its cores and its memory, which it holds whatever it uses."""
    return (GPU_RATE[gpu] + CORES * CORE_RATE + MEMORY_GIB[trainer] * GIB_RATE) * 3600


def resumable(record: dict) -> bool:
    """A push record's work can resume: a PPO run, which checkpoints as it goes. An imitation starts
    afresh and a reading writes its output only at its end."""
    return "run" in record and trainer_of(record["run"]) == "ppo"


def left(record: dict, now: float) -> float:
    """The hours a pushed container may yet hold."""
    return max(0.0, record["pushed"] + record["hours"] * 3600 - now) / 3600


def in_flight(records: list[dict], now: float) -> float:
    """The worst case still to come of runs pushed and not fetched: each one's rate over the hours its
    container may yet hold. The billing summary has the rest of their cost."""
    return sum(r["rate"] * left(r, now) for r in records)


def check_budget(spent: float, flight: list[dict], now: float, cost: float, can_resume: bool,
                 ceiling: float = CEILING) -> None:
    """A push that can resume runs until it ends or the workspace's cap stops it, so only a month
    already spent refuses it. One that can't must fit at its worst case beside everything in flight;
    a resumable run in flight may take every dollar left, so while its worst case leaves no room
    the push is refused, naming it."""
    committed = in_flight(flight, now)
    worst = spent + committed + cost
    print(f"the month has spent ${spent:.2f}; runs in flight may spend ${committed:.2f} more; this push at most "
          f"${cost:.2f}: ${worst:.2f} of ${ceiling:.2f}", flush=True)
    if can_resume:
        assert spent < ceiling, (f"the month has spent ${spent:.2f} of ${ceiling:.2f}: the workspace's cap would stop "
                                 "the run at once; push it next month")
        if worst > ceiling:
            print(f"this push may run into the workspace's ${ceiling:.0f} cap, which stops it: its folder on the Volume "
                  "keeps its last checkpoint, and pushing it again (next month) resumes it there", flush=True)
        return
    if worst <= ceiling:
        return
    racing = [r["run"]["name"] for r in flight if resumable(r) and left(r, now) > 0]
    beside = (f"; {', '.join(racing)} in flight can resume, so may run to the cap and cut this push off: wait for "
              "them to end, or `stop` them and push them again once this one has run") if racing else ""
    raise AssertionError(f"this push can't resume and could take the month's spend to ${worst:.2f}, past "
                         f"${ceiling:.2f}{beside}; otherwise fewer hours or runs, a cheaper GPU, or wait for the month")


def live(records: list[dict], now: float) -> list[dict]:
    """The push records whose containers may still spend: hours left, and Modal saying still running.
    A run stopped, failed or cut by the cap spends nothing more, fetched or not."""
    return [r for r in records if left(r, now) > 0 and call_state(r["call"])[0] == "running"]


def month_spend() -> float:
    done = kaggle.command(["modal", "billing", "summary", "--json"])
    return float(json.loads(done.stdout)["metered_cost"])


def push_records() -> list[dict]:
    records = []
    for folder in [*TRAINERS.values(), READINGS]:
        root = os.path.join(gpu_dir(), *folder.split("/"))
        if os.path.isdir(root):
            for name in sorted(os.listdir(root)):
                path = os.path.join(root, name, PUSHED)
                if os.path.exists(path):
                    with open(path) as f:
                        records.append(json.load(f))
    return records


def split_files(run: dict, files: list[str]) -> tuple[list[str], list[str]]:
    """A run's files: its own folder's (to the runs Volume, the folder it trains in) and every other
    input (to the data Volume)."""
    own = run_folder(run) + "/"
    return [f for f in files if f.startswith(own)], [f for f in files if not f.startswith(own)]


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 22), b""):
            h.update(block)
    return h.hexdigest()


def stale(files: list[str], hashes: dict[str, str], manifest: dict[str, str]) -> list[str]:
    """The inputs the data Volume lacks, or holds at another hash."""
    return [f for f in files if manifest.get(f) != hashes[f]]


def read_volume_file(volume, path: str) -> bytes:
    return b"".join(volume.read_file(path))


def exists(volume, path: str) -> bool:
    parent = os.path.dirname(path.strip("/"))
    if parent and not exists(volume, parent):
        return False
    return any(e.path.strip("/") == path.strip("/") for e in volume.listdir(parent or "/"))


def volume_manifest(volume) -> dict[str, str]:
    if not exists(volume, MANIFEST):
        return {}
    return json.loads(read_volume_file(volume, MANIFEST))


def upload_inputs(volume, files: list[str]) -> None:
    """The inputs to the data Volume, only those missing there or changed since, then its manifest."""
    manifest = volume_manifest(volume)
    hashes = {f: sha256(os.path.join(gpu_dir(), f)) for f in files}
    send = stale(files, hashes, manifest)
    size = sum(os.path.getsize(os.path.join(gpu_dir(), f)) for f in send)
    print(f"inputs: {len(files) - len(send)} already on {DATA_VOLUME}, uploading {len(send)}, {size / 1e6:.0f} MB",
          flush=True)
    if not send:
        return
    with volume.batch_upload(force=True) as batch:
        for f in send:
            batch.put_file(os.path.join(gpu_dir(), f), f"/{f}")
    with volume.batch_upload(force=True) as batch:
        batch.put_file(io.BytesIO(json.dumps({**manifest, **{f: hashes[f] for f in send}}, indent=1).encode()),
                       f"/{MANIFEST}")


def upload_own(volume, folder: str, files: list[str]) -> None:
    """A run's or reading's own folder, fresh on the runs Volume: what is there from an earlier push
    goes, so the local folder stays its source of truth."""
    if exists(volume, folder):
        volume.remove_file(folder, recursive=True)
    if files:
        with volume.batch_upload(force=True) as batch:
            for f in files:
                batch.put_file(os.path.join(gpu_dir(), f), f"/{f}")


def download_folder(volume, folder: str, dest: str) -> list[str]:
    """Every file of a run's folder on the runs Volume, into `dest`."""
    os.makedirs(dest, exist_ok=True)
    got = []
    for entry in volume.listdir(folder):
        if entry.type.name != "FILE":
            continue
        name = os.path.basename(entry.path)
        with open(os.path.join(dest, name), "wb") as f:
            for chunk in volume.read_file(entry.path):
                f.write(chunk)
        got.append(name)
    return got


def git(*args: str) -> str:
    return kaggle.command(["git", "-C", gpu_dir(), *args]).stdout.strip()


def stage_code(uncommitted: bool) -> str:
    """The GPU package (its code and its committed data) as the image gets it, in `runs/modal/code`:
    HEAD's, refused if the package has changes not committed. `uncommitted` takes the working tree
    instead, for testing the launcher itself, and the run records it so."""
    code = os.path.join(staging(), "code")
    shutil.rmtree(code, ignore_errors=True)
    os.makedirs(code)
    commit = git("rev-parse", "HEAD")
    dirty = git("status", "--porcelain", "--", ".")
    if not uncommitted:
        assert not dirty, f"the GPU package has changes not committed, which the run wouldn't have:\n{dirty}"
        prefix, top = git("rev-parse", "--show-prefix"), git("rev-parse", "--show-toplevel")
        # From the repo's top: git reads the paths against the working directory even inside a tree.
        tar = subprocess.run(["git", "-C", top, "archive", "--format=tar", f"HEAD:{prefix}", "riskgpu", "data"],
                             capture_output=True, check=True).stdout
        with tarfile.open(fileobj=io.BytesIO(tar)) as t:
            t.extractall(code, filter="data")
        return commit
    files = git("ls-files", "--cached", "--others", "--exclude-standard", "--", "riskgpu", "data").splitlines()
    for rel in files:
        if os.path.exists(os.path.join(gpu_dir(), rel)):
            os.makedirs(os.path.dirname(os.path.join(code, rel)), exist_ok=True)
            shutil.copyfile(os.path.join(gpu_dir(), rel), os.path.join(code, rel))
    return f"{commit}+uncommitted" if dirty else commit


def job_for(run: dict, inputs: list[str], push_id: str, commit: str, args: argparse.Namespace) -> dict:
    """What a run's container is given: everything it does is read from this."""
    return {"push": push_id, "commit": commit, "run": run, "inputs": inputs, "gpu": args.gpu, "hours": args.hours,
            "read_hours": args.read_hours, "sharp_games": args.sharp_games, "panel": not args.no_panel}


def dry_run(args: argparse.Namespace, runs: list[dict], rate: float, resumes: dict[str, dict | None]) -> int:
    """What a push would start and upload, its arguments already checked, without asking Modal anything."""
    for r in runs:
        print(f"{run_folder(r)}: {shlex.join(r['args'])}")
        if resumes[r["name"]] is not None:
            print(f"  resumes from its folder on {RUNS_VOLUME}, once Modal says its last push has ended")
    inputs = list(dict.fromkeys(f for r in runs for f in split_files(r, kaggle.needed_files(r))[1]))
    size = sum(os.path.getsize(os.path.join(gpu_dir(), f)) for f in inputs)
    print(f"inputs: {len(inputs)} files, {size / 1e6:,.0f} MB, uploaded to {DATA_VOLUME} where missing or changed")
    cost = rate * args.hours * len(runs)
    print(f"{len(runs)} x {args.gpu} at ${rate:.3f} an hour for at most {args.hours:g} hours each "
          f"({train_hours(args.hours, args.read_hours):.2f} training): at most ${cost:.2f}, "
          f"before the month's spend, which a dry run doesn't ask")
    worst_alone(cost, runs[0]["trainer"] == "ppo")
    return 0


def worst_alone(cost: float, can_resume: bool) -> None:
    """A dry run's share of the budget's rule: the push's worst case alone, the month's spend unasked."""
    if can_resume:
        if cost > CEILING:
            print(f"it can resume, so a worst case past ${CEILING:.0f} is no refusal: the workspace's cap stops it, "
                  "its last checkpoint kept on the Volume, and pushing it again resumes it")
        return
    assert cost <= CEILING, (f"this push can't resume, and its worst case alone, ${cost:.2f}, is past the month's "
                             f"${CEILING:.2f}: fewer hours or runs, or a cheaper GPU")


def push(args: argparse.Namespace) -> int:
    if args.read:
        return push_readings(args)
    names = args.names
    assert names, "name the runs to train, or give --read for readings"
    assert len(set(names)) == len(names), "a run can't be pushed twice at once"
    assert args.gpu in GPUS, f"--gpu is one of {', '.join(GPUS)}"
    args.read_hours = READ_HOURS if args.read_hours is None else args.read_hours
    args.sharp_games = SHARP_GAMES if args.sharp_games is None else args.sharp_games
    train_hours(args.hours, args.read_hours)
    extras = dict(x.split("=", 1) for x in args.run_args)
    assert set(extras) <= set(names), f"--run-args names a run not pushed: {sorted(set(extras) - set(names))}"
    trainer = "imitate" if args.imitate else "ppo"
    assert not args.no_panel or args.imitate, "--no-panel is an imitation's: a PPO run's readings are its panel"
    runs = [{"name": n, "trainer": trainer,
             "args": run_args(list(args.trainer), extras.get(n, ""), args.gpu, args.no_stop, trainer)}
            for n in names]
    resumes = {r["name"]: resume_of(r) for r in runs}
    for r in runs:
        assert trainer != "imitate" or not os.path.exists(os.path.join(kaggle.local_dir(r), "best.pt")), \
            f"{run_folder(r)} already holds a trained imitation, which the run would replace: name a new run"
        check_recipe(r)

    rate = hourly(args.gpu, trainer)
    if args.dry_run:
        return dry_run(args, runs, rate, resumes)
    now = time.time()
    check_budget(month_spend(), live(push_records(), now), now, rate * args.hours * len(runs), trainer == "ppo")
    commit = stage_code(args.uncommitted)
    files = {r["name"]: split_files(r, kaggle.needed_files(r)) for r in runs}

    import modal
    runs_volume = modal.Volume.from_name(RUNS_VOLUME, create_if_missing=True)
    data_volume = modal.Volume.from_name(DATA_VOLUME, create_if_missing=True)
    for r in runs:
        if resumes[r["name"]] is not None:
            check_resume(resumes[r["name"]], call_state(resumes[r["name"]]["call"])[0], runs_volume)
    upload_inputs(data_volume, list(dict.fromkeys(f for r in runs for f in files[r["name"]][1])))
    for r in runs:
        if resumes[r["name"]] is None:
            upload_own(runs_volume, run_folder(r), files[r["name"]][0])
        else:
            print(f"{run_folder(r)}: resuming from its folder on {RUNS_VOLUME}, where its last push left it", flush=True)
    guards = {r["name"]: kaggle.sha256(os.path.join(kaggle.local_dir(r), kaggle.GUARDED[trainer])) for r in runs}
    for r in runs:
        # Made before the runs start, so nothing can stop their records being written once they have.
        os.makedirs(kaggle.local_dir(r), exist_ok=True)

    from . import remote
    push_id = uuid.uuid4().hex
    train = remote.train.with_options(gpu=args.gpu, timeout=int(args.hours * 3600),
                                      memory=(MEMORY_GIB[trainer] * 1024, MEMORY_GIB[trainer] * 1024))
    with modal.enable_output(), remote.app.run(detach=True):
        app_id = remote.app.app_id
        for r in runs:
            job = job_for(r, files[r["name"]][1], push_id, commit, args)
            call = train.spawn(job).object_id
            # Each run's record as soon as it starts, so no run is left running without one.
            record = {**job, "runs": [r], "app": app_id, "call": call, "rate": rate, "pushed": time.time(),
                      "guard_sha256": {r["name"]: guards[r["name"]]}}
            with open(os.path.join(kaggle.local_dir(r), PUSHED), "w") as f:
                json.dump(record, f, indent=1)
    # Modal's own last line ("App completed") speaks of this command's connection, not the runs.
    print(f"pushed {', '.join(names)} on {args.gpu} at {commit[:8]} as {app_id}, detached: "
          f"`status {names[0]}` while it runs, `fetch {names[0]}` once it ends")
    return 0


def readings_of(args: argparse.Namespace) -> list[dict]:
    """A push's readings, each checked by its tool's own parser and for this GPU, before anything is
    asked of Modal or uploaded."""
    assert not (args.names or args.run_args or args.imitate or args.no_panel or args.no_stop or args.trainer
                or args.read_hours is not None or args.sharp_games is not None), \
        "a push of readings names no runs and takes no trainer options: each --read carries its tool's arguments"
    assert args.gpu in GPUS, f"--gpu is one of {', '.join(GPUS)}"
    assert 0 < args.hours <= MAX_HOURS, f"a container's hours are Modal's timeout: more than 0, at most {MAX_HOURS:g}"
    assert args.hours * 3600 > END_S, f"--hours {args.hours:g} leaves a reading no time before the container's end"
    readings = [kaggle.reading_spec(spec) for spec in args.read]
    names = [r["name"] for r in readings]
    assert len(set(names)) == len(names), "two readings share a name"
    for r in readings:
        assert "steps" not in r, f"{r['name']}: a chain of tools runs on Kaggle; a Modal reading is one tool"
        kaggle.check_reading(r, full_precision=args.gpu in FULL_PRECISION)
        kaggle.check_new_reading(r)
    return readings


def push_readings(args: argparse.Namespace) -> int:
    """Readings of existing checkpoints, each on a GPU container of its own, in one detached app."""
    readings = readings_of(args)
    inputs = {r["name"]: kaggle.reading_files(r) for r in readings}
    rate = hourly(args.gpu, "read")
    if args.dry_run:
        for r in readings:
            command = ["python", "-m", f"riskgpu.selfplay.{r['tool']}", *r["args"], "--out", reading_output(r)]
            print(f"{reading_folder(r)}: {shlex.join(command)}")
        files = list(dict.fromkeys(f for r in readings for f in inputs[r["name"]]))
        size = sum(os.path.getsize(os.path.join(gpu_dir(), f)) for f in files)
        print(f"inputs: {len(files)} files, {size / 1e6:,.0f} MB, uploaded to {DATA_VOLUME} where missing or changed")
        cost = rate * args.hours * len(readings)
        print(f"{len(readings)} x {args.gpu} at ${rate:.3f} an hour for at most {args.hours:g} hours each: at most "
              f"${cost:.2f}, before the month's spend, which a dry run doesn't ask")
        worst_alone(cost, False)
        return 0
    now = time.time()
    check_budget(month_spend(), live(push_records(), now), now, rate * args.hours * len(readings), False)
    commit = stage_code(args.uncommitted)

    import modal
    runs_volume = modal.Volume.from_name(RUNS_VOLUME, create_if_missing=True)
    data_volume = modal.Volume.from_name(DATA_VOLUME, create_if_missing=True)
    upload_inputs(data_volume, list(dict.fromkeys(f for r in readings for f in inputs[r["name"]])))
    for r in readings:
        upload_own(runs_volume, reading_folder(r), [])
        # Made before the readings start, so nothing can stop their records being written once they have.
        os.makedirs(kaggle.reading_dir(r), exist_ok=True)

    from . import remote
    push_id = uuid.uuid4().hex
    read = remote.read.with_options(gpu=args.gpu, timeout=int(args.hours * 3600),
                                    memory=(MEMORY_GIB["read"] * 1024, MEMORY_GIB["read"] * 1024))
    with modal.enable_output(), remote.app.run(detach=True):
        app_id = remote.app.app_id
        for r in readings:
            job = {"push": push_id, "commit": commit, "reading": r, "inputs": inputs[r["name"]], "gpu": args.gpu,
                   "hours": args.hours}
            call = read.spawn(job).object_id
            record = {**job, "app": app_id, "call": call, "rate": rate, "pushed": time.time()}
            with open(os.path.join(kaggle.reading_dir(r), PUSHED), "w") as f:
                json.dump(record, f, indent=1)
    names = [r["name"] for r in readings]
    print(f"pushed {', '.join(names)} on {args.gpu} at {commit[:8]} as {app_id}, detached: "
          f"`status {names[0]}` while it runs, `fetch {names[0]}` once it ends")
    return 0


def record_folder(record: dict) -> str:
    """The folder a push record's run or reading lives in, relative to the GPU folder."""
    return reading_folder(record["reading"]) if "reading" in record else run_folder(record["run"])


def pushed(name: str) -> dict:
    found = [r for r in push_records() if (r["reading"] if "reading" in r else r["run"])["name"] == name]
    assert found, f"{name} has no Modal push waiting to be fetched in this checkout"
    assert len(found) == 1, f"{name} has a Modal push waiting in more than one folder"
    return found[0]


def call_state(call_id: str) -> tuple[str, str]:
    """A run's container as Modal tells it: running, finished (with what it returned) or failed (why)."""
    import modal
    from modal.exception import OutputExpiredError
    try:
        result = modal.FunctionCall.from_id(call_id).get(timeout=0)
    except OutputExpiredError:
        return "ended", "Modal no longer keeps its result"
    except TimeoutError:
        return "running", ""
    except Exception as e:  # noqa: BLE001 -- any error the run raised is its failure, reported as such
        return "failed", f"{type(e).__name__}: {e}"
    return "finished", json.dumps(result)


def tail(volume, path: str, lines: int) -> list[str]:
    if not exists(volume, path):
        return []
    text = read_volume_file(volume, path).decode(errors="replace")
    return [line for line in text.splitlines() if line.strip()][-lines:]


def status(args: argparse.Namespace) -> int:
    import modal
    record = pushed(args.name)
    state, detail = call_state(record["call"])
    hours = (time.time() - record["pushed"]) / 3600
    print(f"{args.name}: {state} on {record['gpu']} ({record['app']}), pushed {hours:.2f} hours ago with "
          f"{record['hours']:g} to spend, at most ${record['rate'] * record['hours']:.2f}")
    if detail:
        print(f"  {detail}")
    volume = modal.Volume.from_name(RUNS_VOLUME)
    folder = record_folder(record)
    # The trainer's log reaches the Volume line by line; its output only once a task ends, since the
    # Volume keeps a file still open for writing from the commits the container makes as it runs.
    for line in tail(volume, f"{folder}/log.jsonl", 1):
        print(f"  last log line: {line[:400]}")
    for line in tail(volume, f"{folder}/out.txt", 1):
        print(f"  last output: {line}")
    if state == "failed":
        for line in tail(volume, f"{folder}/err.txt", 20):
            print(f"  err: {line}")
    return 0


def bring_back(record: dict, volume) -> None:
    """The run's folder on the runs Volume, over its local folder, refused if the local run moved
    since the push."""
    kaggle.check_guards(record)
    os.makedirs(staging(), exist_ok=True)
    with tempfile.TemporaryDirectory(dir=staging()) as tmp:
        name = record["run"]["name"]
        download_folder(volume, run_folder(record["run"]), os.path.join(tmp, name))
        kaggle.copy_back(record, tmp, marker=SESSIONS)
    os.remove(os.path.join(kaggle.local_dir(record["run"]), PUSHED))


def bring_back_reading(record: dict, volume) -> None:
    """The reading's folder on the runs Volume into its local folder, which holds nothing but its push."""
    local = kaggle.reading_dir(record["reading"])
    kaggle.check_reading_unmoved(record["reading"], PUSHED)
    download_folder(volume, reading_folder(record["reading"]), local)
    os.remove(os.path.join(local, PUSHED))


def fetch(args: argparse.Namespace) -> int:
    import modal
    record = pushed(args.name)
    state, detail = call_state(record["call"])
    print(f"{args.name}: {state} {detail}".rstrip())
    assert state != "running", "it hasn't ended yet: `stop` it first to fetch it now"
    if "reading" in record:
        bring_back_reading(record, modal.Volume.from_name(RUNS_VOLUME))
        print(f"fetched into {reading_folder(record['reading'])}")
        kaggle.report_reading(args.name)
        return 0
    bring_back(record, modal.Volume.from_name(RUNS_VOLUME))
    print(f"fetched into {run_folder(record['run'])}")
    kaggle.report_run(record["run"], None)
    if trainer_of(record["run"]) == "imitate":
        print(f"  {imitation_fit(kaggle.local_dir(record['run']))}")
    return 0


def report(args: argparse.Namespace) -> int:
    """Kaggle's report (a reading's in its tool's own table), and for an imitation its fit to its own
    training decisions and its size, which a comparison of sizes reads."""
    kaggle.report(args)
    run_dir = kaggle.local_dir({"name": args.name, "trainer": "imitate"})
    if os.path.exists(os.path.join(run_dir, "args.json")):
        print(f"  {imitation_fit(run_dir)}")
    return 0


def imitation_fit(run_dir: str) -> str:
    with open(os.path.join(run_dir, "args.json")) as f:
        a = json.load(f)
    with open(os.path.join(run_dir, "log.jsonl")) as f:
        last = [json.loads(line) for line in f][-1]
    size = f"{a['width']} x {a['layers']} ({a['heads']} heads), fraction {a['fraction']:g}, epoch {last['epoch']:g}"
    # Runs from before the trainer read its fit have only the running mean.
    fit = (f"training-set main agreement {last['fit_main']:.4f}, move {last['fit_move']:.4f}"
           if "fit_main" in last else "no fixed training-set read")
    return f"{size}: {fit}; running train_agree {last['train_agree']:.4f}"


def stop(args: argparse.Namespace) -> int:
    import modal
    record = pushed(args.name)
    state, _ = call_state(record["call"])
    assert state == "running", f"{args.name} isn't running ({state})"
    modal.FunctionCall.from_id(record["call"]).cancel(terminate_containers=True)
    print(f"stopped {args.name}'s container; `fetch {args.name}` brings back what it saved")
    return 0


def main(argv: list[str] | None = None) -> int:
    # Modal's progress output draws characters the Windows console's default code page lacks.
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = p.add_subparsers(dest="command", required=True)
    s = sub.add_parser("push")
    s.add_argument("names", nargs="*", help="the runs, each on a GPU container of its own")
    s.add_argument("--read", action="append", default=[], metavar="NAME=TOOL ARGS",
                   help=f"a reading of existing checkpoints instead of runs: one of {', '.join(kaggle.READING_TOOLS)} "
                        "with its own arguments, on a GPU container of its own, in runs/readings/NAME/ (repeat for more)")
    s.add_argument("--run-args", action="append", default=[], metavar="NAME=ARGS",
                   help="one run's own trainer arguments, after the shared ones (e.g. k2='--seed 1')")
    s.add_argument("--imitate", action="store_true",
                   help="the runs are imitations (`imitate train`'s arguments, in runs/imitate/), each read on its "
                        "held-out agreement and the panel once it is trained")
    s.add_argument("--gpu", default="A10", choices=GPUS, help="A10: the most training per dollar measured")
    s.add_argument("--hours", type=float, default=8.0, help="the container's whole time, its Modal timeout and cost")
    s.add_argument("--read-hours", type=float, default=None,
                   help=f"the container's last hours, kept for the stopped run's readings ({READ_HOURS:g})")
    s.add_argument("--sharp-games", type=int, default=None,
                   help=f"a PPO run's sharp readings' games a check ({SHARP_GAMES})")
    s.add_argument("--no-stop", action="store_true", help="let a PPO run spend its hours without a plateau stop")
    s.add_argument("--no-panel", action="store_true",
                   help="read a trained imitation on its held-out agreement alone, without the panel's games")
    s.add_argument("--uncommitted", action="store_true",
                   help="ship the GPU package's working tree, not HEAD: for testing the launcher itself")
    s.add_argument("--dry-run", action="store_true",
                   help="check the runs' arguments and show what the push would start, upload and cost, then stop")
    for sub_command in ("status", "fetch", "stop"):
        sub.add_parser(sub_command).add_argument("names", nargs="+")
    r = sub.add_parser("report")
    r.add_argument("names", nargs="+")
    r.add_argument("--key", default=None, help="a PPO run's panel reading to show (default: the run's --stop-key)")
    argv = sys.argv[1:] if argv is None else argv
    # The trainer's arguments follow `--`, kept apart so the launcher's own options never mix with them.
    split = argv.index("--") if "--" in argv else len(argv)
    args = p.parse_args(argv[:split])
    args.trainer = argv[split + 1:]
    if args.command == "push":
        return push(args)
    one = {"status": status, "fetch": fetch, "stop": stop, "report": report}[args.command]
    for name in args.names:
        one(argparse.Namespace(**{**vars(args), "name": name}))
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Training sessions on Kaggle's free GPUs, launched and read from here:

    python -m riskgpu.kaggle.launch push <name> [<name>] [--run-args <name>="<its own args>"] [--imitate]
                                    [--accelerator NvidiaTeslaT4] [--session-hours 11] -- <shared trainer args>
    python -m riskgpu.kaggle.launch push --read <name>="<tool> <its args>" [--read ...] [--session-hours 11]
    python -m riskgpu.kaggle.launch status <name>
    python -m riskgpu.kaggle.launch fetch <name>
    python -m riskgpu.kaggle.launch report <name> [--key "sample s2-2-150 one-in"]

run from `src/projects/risk/gpu/` (`docs/kaggle.md`). A run is trained by PPO (`selfplay/ppo.py`, its
folder `runs/selfplay/<name>/`) or, with `--imitate`, by imitation (`selfplay/imitate.py train`, its
folder `runs/imitate/<name>/`). The run's folder here stays the source of truth: `push` uploads what
the session needs (a PPO run's own folder, to resume it; an imitation's data; every checkpoint its
arguments name, the panel's anchors and the blitz tables, which git ignores) as a private dataset,
then pushes `kernel.py` as a private script that trains from the repo at this checkout's commit,
which must be on GitHub. A T4 session has two GPUs, and the quota counts the session, so a push names
its runs in order and each GPU takes the next as it frees; after a run stops, its readings (a PPO
run's sharp readings, the panel at a larger size on its last checkpoints; an imitation's held-out
agreement and panel, `kernel.py`) join the queue, so no GPU sits idle while the session runs. `fetch`
brings every run of the session back over its local folder, refusing if a local run moved since the
push. `report` reads a PPO run's panel readings with their intervals and the verdict
(`selfplay/verdict.py`), or an imitation's last log line and its readings.

A PPO session must stop on a plateau (`--stop-when` with `--stop-key`) unless `--no-stop` says it may
spend its hours regardless, so the week's quota isn't spent on a flat run. An imitation stops at its
budget of samples (`--max-samples`).

A push of readings (`--read`) trains nothing: its session's queue is one-off readings of existing
checkpoints by a reading tool (`search`, `calibrate` or `panel`), each checked by the tool's own
parser before anything is uploaded and written to `runs/readings/<name>/`.
"""

import argparse
import hashlib
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import time
import uuid

from ..board import DATA
from ..selfplay.verdict import panel_readings, verdict
from .kernel import READING_TOOLS, READINGS, TRAINERS, reading_folder, run_folder, trainer_of

GPU = os.path.dirname(DATA)
STAGING = os.path.join(GPU, "runs", "kaggle")
KERNEL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kernel.py")
# Kaggle's identifiers for its accelerators; T4s and P100s are older than Ampere, with no native bfloat16.
PRE_AMPERE = {"NvidiaTeslaT4", "NvidiaTeslaP100"}
# This checkout's own bookkeeping, never sent.
LOCAL_ONLY = {"kaggle-push.json", "modal-push.json", "stopped.txt"}
CHECKPOINT = re.compile(r"runs/[^,=\s]+\.pt")
READING_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*")
# The file a session writes that holds a run's work: a fetch that would overwrite a local one changed
# since the push refuses.
GUARDED = {"ppo": "latest.pt", "imitate": "best.pt"}


def local_dir(run: dict) -> str:
    return os.path.join(GPU, *run_folder(run).split("/"))


def reading_dir(reading: dict) -> str:
    return os.path.join(GPU, *reading_folder(reading).split("/"))


def reading_spec(spec: str) -> dict:
    """`<name>=<tool> <its arguments>` as a reading, the arguments kept verbatim."""
    name, sep, rest = spec.partition("=")
    words = shlex.split(rest)
    assert sep and words, f"a reading is <name>=<tool> <its arguments>: {spec!r}"
    assert READING_NAME.fullmatch(name), f"{name!r}: a reading's name is letters, digits, '.', '_' and '-'"
    assert words[0] in READING_TOOLS, f"{name}: {words[0]} isn't a reading tool ({', '.join(READING_TOOLS)})"
    return {"name": name, "tool": words[0], "args": words[1:]}


class _Parsed(Exception):
    def __init__(self, namespace: argparse.Namespace):
        self.namespace = namespace


def tool_namespace(tool: str, args: list[str]) -> argparse.Namespace:
    """`args` as the tool's own parser reads them, exiting loudly on any it would refuse. The tools
    build their parser inside `main`, before anything else, so `main` is run up to its parse and
    stopped there, before it touches a device."""
    import importlib
    from unittest import mock
    module = importlib.import_module(f"..selfplay.{tool}", __package__)
    parse = argparse.ArgumentParser.parse_args

    def parse_then_stop(parser, argv=None, namespace=None):
        raise _Parsed(parse(parser, argv, namespace))
    with mock.patch.object(argparse.ArgumentParser, "parse_args", parse_then_stop):
        try:
            module.main(args)
        except _Parsed as parsed:
            return parsed.namespace
    raise AssertionError(f"{tool}'s main returned without parsing its arguments")


def check_reading(reading: dict, full_precision: bool) -> None:
    """A reading's arguments, refused here, before any upload, if its tool would refuse them or they
    would idle or fail a GPU that is already paid for."""
    ns = tool_namespace(reading["tool"], reading["args"])
    name = reading["name"]
    assert not ns.out, f"{name}: a reading's output is the launcher's ({reading['tool']}.json in its folder): drop --out"
    assert getattr(ns, "device", "cuda") == "cuda", f"{name}: a reading runs on its GPU: drop --device {ns.device}"
    # search's default (None) is bf16 on CUDA, as the others' True is.
    bf16 = ns.bf16 is not False
    if full_precision:
        assert not bf16, f"{name}: this GPU has no native bfloat16: give the reading --no-bf16"


def reading_files(reading: dict) -> list[str]:
    """Every file a reading reads that the repo doesn't carry: the blitz tables, every checkpoint its
    arguments name and, for the panel, its anchors, as paths relative to the GPU folder."""
    files = ["data/blitz-256.bin", "data/blitz-256.json"]
    for arg in reading["args"]:
        for word in re.split(r"[,=]", arg):
            if word.endswith(".pt"):
                assert CHECKPOINT.fullmatch(word), \
                    f"{reading['name']}: give {word} as a path under runs/, relative to the GPU folder, with '/'"
                files.append(word)
    if reading["tool"] == "panel":
        from ..selfplay.panel import ANCHORS
        files += [os.path.relpath(path, GPU).replace("\\", "/") for _, path in ANCHORS]
    unique = list(dict.fromkeys(files))
    missing = [f for f in unique if not os.path.exists(os.path.join(GPU, f))]
    assert not missing, f"{reading['name']} would read files this checkout lacks: {missing}"
    return unique


def check_new_reading(reading: dict) -> None:
    folder = reading_dir(reading)
    assert not (os.path.isdir(folder) and os.listdir(folder)), \
        f"{reading_folder(reading)} already holds a reading: name a new one"


def check_reading_unmoved(reading: dict, marker: str) -> None:
    """Refuses, before anything is fetched, if the reading's folder here holds more than its push."""
    here = sorted(os.listdir(reading_dir(reading)))
    assert here == [marker], f"{reading_folder(reading)} holds {here} besides its push: fetching would overwrite it"


def needed_files(run: dict) -> list[str]:
    """Every file a session of `run` (its name, trainer and trainer arguments) reads that the repo
    doesn't carry, as paths relative to the GPU folder."""
    files = ["data/blitz-256.bin", "data/blitz-256.json"]
    args, own = run["args"], local_dir(run)
    imitation = trainer_of(run) == "imitate"
    if imitation:
        # An imitation starts afresh, so its own folder is never sent; its data and its reading's
        # panel are.
        data = last_value(args, "--data").replace("\\", "/")
        files += [f"{data}/{f}" for f in sorted(os.listdir(os.path.join(GPU, data)))
                  if os.path.isfile(os.path.join(GPU, data, f))]
    elif os.path.isdir(own):
        files += [f"{run_folder(run)}/{f}" for f in sorted(os.listdir(own))
                  if os.path.isfile(os.path.join(own, f)) and f not in LOCAL_ONLY]
    latest = os.path.join(own, "latest.pt")
    if not imitation and os.path.exists(latest):
        # A resumed run's league seats its past snapshots, which may live in the run it was copied from.
        import torch
        files += [p.replace("\\", "/") for p in torch.load(latest, map_location="cpu", weights_only=False)["league"]]
    for arg in args:
        files += CHECKPOINT.findall(arg.replace("\\", "/"))
    if imitation or last_value(args, "--panel") not in (None, "0"):
        from ..selfplay.panel import ANCHORS
        files += [os.path.relpath(path, GPU).replace("\\", "/") for _, path in ANCHORS]
    unique = list(dict.fromkeys(files))
    missing = [f for f in unique if not os.path.exists(os.path.join(GPU, f))]
    assert not missing, f"the session would need files this checkout lacks: {missing}"
    return unique


def flat_name(rel: str) -> str:
    """A dataset keeps files only at its top level, so a path is folded into the file's name."""
    return rel.replace("/", "__")


def stage(files: list[str], bundle_dir: str) -> None:
    """The bundle's files, flat, in `bundle_dir`: hard links, so an imitation's gigabytes of data
    aren't copied (the staging folder is on the runs' own volume); the upload only reads them."""
    shutil.rmtree(bundle_dir, ignore_errors=True)
    os.makedirs(bundle_dir)
    for rel in files:
        os.link(os.path.join(GPU, rel), os.path.join(bundle_dir, flat_name(rel)))


def command(cmd: list[str], check: bool = True) -> subprocess.CompletedProcess:
    done = subprocess.run(cmd, capture_output=True, text=True)
    if check and done.returncode != 0:
        raise SystemExit(f"{' '.join(cmd)} failed:\n{done.stdout}{done.stderr}")
    return done


def kaggle(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return command([sys.executable, "-m", "kaggle", *args], check)


def username() -> str:
    import kaggle as api_module
    user = api_module.api.get_config_value("username")
    if not user:
        raise SystemExit("the Kaggle CLI isn't signed in: run `python -m kaggle auth login`, or save an API token "
                         "from kaggle.com/settings/api to ~/.kaggle/access_token")
    return user


def slugs(user: str, name: str) -> tuple[str, str]:
    slug = re.sub(r"[^a-z0-9-]", "-", name.lower())
    return f"{user}/risk-bundle-{slug}", f"{user}/risk-train-{slug}"


def git(*args: str) -> str:
    return command(["git", "-C", GPU, *args]).stdout.strip()


def checkout_commit() -> str:
    """This checkout's commit, which the session clones: it must be on GitHub, with the GPU package
    unchanged since, or the session would train other code than this checkout's."""
    dirty = git("status", "--porcelain", "--", ".")
    assert not dirty, f"the GPU package has changes not committed, which the session wouldn't have:\n{dirty}"
    commit = git("rev-parse", "HEAD")
    git("fetch", "-q", "origin")
    assert git("branch", "-r", "--contains", commit), f"{commit[:8]} isn't on GitHub yet: push it first"
    return commit


def sha256(path: str) -> str | None:
    if not os.path.exists(path):
        return None
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def wait_ready(dataset: str) -> None:
    # Kaggle processes an upload before a session can mount it, and offers no event for that, so its
    # status is asked; a session started early would mount the previous version (`kernel.py` checks).
    # A dataset just created answers 403 until it has been processed, so a refusal is waited through too.
    for _ in range(120):
        asked = kaggle("datasets", "status", dataset, check=False)
        status = asked.stdout.strip().lower()
        if asked.returncode == 0 and "ready" in status:
            return
        if asked.returncode == 0 and "error" in status:
            raise SystemExit(f"{dataset}'s upload failed: {status}")
        time.sleep(15)
    raise SystemExit(f"{dataset} still isn't ready after 30 minutes; it last said:\n{asked.stdout}{asked.stderr}")


def last_value(args: list[str], flag: str) -> str | None:
    """A flag's value as argparse reads it: the last time it is given."""
    if flag not in args:
        return None
    return args[len(args) - 1 - args[::-1].index(flag) + 1]


def run_args(shared: list[str], extra: str, accelerator: str, no_stop: bool, trainer: str = "ppo") -> list[str]:
    """One run's trainer arguments for a Kaggle session: `trainer_args`, and full precision on a GPU
    without native bfloat16."""
    args = shared + shlex.split(extra)
    if accelerator in PRE_AMPERE:
        assert "--no-bf16" in args, f"{accelerator} has no native bfloat16: give the trainer --no-bf16"
    return trainer_args(args, no_stop, trainer)


def trainer_args(args: list[str], no_stop: bool, trainer: str) -> list[str]:
    """One run's trainer arguments (the shared ones, then its own, which win, as argparse takes the
    last), refused here, before any upload, if a session would refuse them. Every host's launcher
    checks them so; the session adds the hours it has left when the run starts."""
    assert "--name" not in args, "the run's name is the launcher's"
    if trainer == "imitate":
        assert "--hours" not in args, "the session's cap is the launcher's"
        data = last_value(args, "--data")
        assert data and not os.path.isabs(data) and data.replace("\\", "/").startswith("runs/"), \
            "give the imitation --data as a folder under runs/, relative to the GPU folder, so the bundle carries it"
        from ..selfplay.imitate import parser
        # The trainer's own parser, so arguments it would refuse cost no session: it exits loudly here.
        parser().parse_args(["train", "--name", "check", *args])
        return args
    stops = last_value(args, "--stop-when") not in (None, "never")
    assert stops or no_stop, "give the trainer --stop-when and --stop-key, or say --no-stop to spend the hours regardless"
    if stops:
        assert last_value(args, "--stop-key") and last_value(args, "--panel") not in (None, "0"), \
            "the stop reads --stop-key on the panel: give the trainer both"
    assert "--session-hours" not in args, "the session's cap is the launcher's"
    from ..selfplay.ppo import parser
    # The trainer's own parser, as above.
    parser().parse_args(["--name", "check", *args])
    return args


def push(args: argparse.Namespace) -> int:
    if args.read:
        return push_readings(args)
    names = args.names
    assert names, "name the runs to train, or give --read for readings"
    assert len(set(names)) == len(names), "a run can't share a session with itself"
    assert 0 <= args.read_hours < args.session_hours, "the readings' hours are the end of the session's, not more"
    extras = dict(x.split("=", 1) for x in args.run_args)
    assert set(extras) <= set(names), f"--run-args names a run not pushed: {sorted(set(extras) - set(names))}"
    trainer = "imitate" if args.imitate else "ppo"
    runs = [{"name": n, "trainer": trainer,
             "args": run_args(list(args.trainer), extras.get(n, ""), args.accelerator, args.no_stop, trainer)}
            for n in names]
    for r in runs:
        assert trainer != "imitate" or not os.path.exists(os.path.join(local_dir(r), "best.pt")), \
            f"{run_folder(r)} already holds a trained imitation, which the session would replace: name a new run"
    commit = checkout_commit()
    files = list(dict.fromkeys(f for r in runs for f in needed_files(r)))
    job = {"commit": commit, "runs": runs, "session_hours": args.session_hours, "read_hours": args.read_hours}
    guards = {r["name"]: sha256(os.path.join(local_dir(r), GUARDED[r["trainer"]])) for r in runs}
    record = start_session(args, "-".join(names), files, job)
    for r in runs:
        os.makedirs(local_dir(r), exist_ok=True)
        with open(os.path.join(local_dir(r), "kaggle-push.json"), "w") as f:
            json.dump({**record, "guard_sha256": guards}, f, indent=1)
    print(f"pushed {record['kernel']} at {commit[:8]}: `status {names[0]}` while it runs, `fetch {names[0]}` once it ends")
    return 0


def push_readings(args: argparse.Namespace) -> int:
    """A session whose queue is readings of existing checkpoints, each GPU taking the next as it frees."""
    assert not (args.names or args.run_args or args.imitate or args.no_stop or args.trainer), \
        "a push of readings names no runs and takes no trainer arguments: each --read carries its own"
    readings = [reading_spec(spec) for spec in args.read]
    names = [r["name"] for r in readings]
    assert len(set(names)) == len(names), "two readings share a name"
    for r in readings:
        check_reading(r, full_precision=args.accelerator in PRE_AMPERE)
        check_new_reading(r)
    commit = checkout_commit()
    files = list(dict.fromkeys(f for r in readings for f in reading_files(r)))
    job = {"commit": commit, "runs": [], "readings": readings, "session_hours": args.session_hours, "read_hours": 0}
    record = start_session(args, "-".join(names), files, job)
    for r in readings:
        os.makedirs(reading_dir(r), exist_ok=True)
        with open(os.path.join(reading_dir(r), "kaggle-push.json"), "w") as f:
            json.dump({**record, "guard_sha256": {}}, f, indent=1)
    print(f"pushed {record['kernel']} at {commit[:8]}: `status {names[0]}` while it runs, `fetch {names[0]}` once it ends")
    return 0


def start_session(args: argparse.Namespace, job_name: str, files: list[str], job: dict) -> dict:
    """Uploads the bundle of `files` and starts the session that runs `job`; returns the push's record."""
    user = username()
    dataset, kernel = slugs(user, job_name)

    bundle_id = uuid.uuid4().hex
    bundle_dir = os.path.join(STAGING, job_name, "bundle")
    stage(files, bundle_dir)
    with open(os.path.join(bundle_dir, "MANIFEST.json"), "w") as f:
        json.dump({"id": bundle_id, "files": {flat_name(rel): rel for rel in files}}, f, indent=1)
    with open(os.path.join(bundle_dir, "dataset-metadata.json"), "w") as f:
        json.dump({"title": dataset.split("/")[1], "id": dataset, "licenses": [{"name": "CC0-1.0"}]}, f)
    size = sum(os.path.getsize(os.path.join(GPU, rel)) for rel in files)
    print(f"uploading {len(files)} files, {size / 1e6:.0f} MB, as {dataset}", flush=True)
    existing = kaggle("datasets", "status", dataset, check=False)
    if existing.returncode == 0 and "ready" in existing.stdout.lower():
        kaggle("datasets", "version", "-p", bundle_dir, "-m", f"bundle {bundle_id}", "-t", "-q")
    else:
        kaggle("datasets", "create", "-p", bundle_dir, "-t", "-q")
    wait_ready(dataset)

    kernel_dir = os.path.join(STAGING, job_name, "kernel")
    shutil.rmtree(kernel_dir, ignore_errors=True)
    os.makedirs(kernel_dir)
    job = {**job, "bundle": bundle_id}
    with open(KERNEL) as f:
        source = f.read()
    with open(os.path.join(kernel_dir, "run.py"), "w") as f:
        f.write(f"JOB = {json.dumps(job)}\n\n{source}")
    with open(os.path.join(kernel_dir, "kernel-metadata.json"), "w") as f:
        json.dump({"id": kernel, "title": kernel.split("/")[1], "code_file": "run.py", "language": "python",
                   "kernel_type": "script", "is_private": True, "enable_gpu": True, "enable_internet": True,
                   "machine_shape": args.accelerator, "dataset_sources": [dataset], "competition_sources": [],
                   "kernel_sources": [], "model_sources": []}, f, indent=1)
    print(kaggle("kernels", "push", "-p", kernel_dir, "--accelerator", args.accelerator,
                 "-t", str(int((args.session_hours + 0.75) * 3600))).stdout.strip())
    return {**job, "kernel": kernel, "dataset": dataset, "accelerator": args.accelerator, "pushed": time.time()}


def pushed(name: str) -> dict:
    found = [path for folder in [*TRAINERS.values(), READINGS]
             if os.path.exists(path := os.path.join(GPU, *folder.split("/"), name, "kaggle-push.json"))]
    assert found, f"{name} was never pushed from this checkout"
    assert len(found) == 1, f"{name} has a push waiting in more than one folder: {found}"
    with open(found[0]) as f:
        return json.load(f)


def status(args: argparse.Namespace) -> int:
    print(kaggle("kernels", "status", pushed(args.name)["kernel"]).stdout.strip())
    return 0


def check_guards(job: dict) -> None:
    """Refuses, before anything is fetched, if a run's guarded file here changed since the push."""
    # A push from before imitation runs kept PPO's guard under its own name.
    guards = job["guard_sha256"] if "guard_sha256" in job else job["latest_sha256"]
    for r in job["runs"]:
        guarded = GUARDED[trainer_of(r)]
        assert sha256(os.path.join(local_dir(r), guarded)) == guards[r["name"]], \
            f"{r['name']}'s {guarded} changed here since the push: fetching would overwrite that work"


def copy_back(job: dict, output: str, marker: str = "kaggle-sessions.jsonl") -> None:
    """Each run's and reading's folder in the session's output (the folder of its name holding the
    host's `marker`), over its local folder."""
    folders = [(r["name"], local_dir(r)) for r in job["runs"]] + [(r["name"], reading_dir(r))
                                                                   for r in job.get("readings", [])]
    for name, dest in folders:
        found = [root for root, _, files in os.walk(output)
                 if os.path.basename(root) == name and marker in files]
        assert len(found) == 1, f"the session's output holds no folder for {name}; its log is in {output}"
        os.makedirs(dest, exist_ok=True)
        for f in os.listdir(found[0]):
            shutil.copyfile(os.path.join(found[0], f), os.path.join(dest, f))


def fetch(args: argparse.Namespace) -> int:
    """Every run of the session `name` was pushed in, each back over its local folder."""
    job = pushed(args.name)
    state = kaggle("kernels", "status", job["kernel"]).stdout.strip()
    print(state)
    assert "running" not in state.lower() and "queued" not in state.lower(), "the session hasn't ended yet"
    check_guards(job)
    readings = job.get("readings", [])
    for r in readings:
        check_reading_unmoved(r, "kaggle-push.json")
    os.makedirs(STAGING, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=STAGING) as tmp:
        kaggle("kernels", "output", job["kernel"], "-p", tmp, "-o", "-q")
        copy_back(job, tmp)
    for r in job["runs"]:
        os.remove(os.path.join(local_dir(r), "kaggle-push.json"))
        print(f"fetched into {run_folder(r)}")
        report_run(r, None)
    for r in readings:
        os.remove(os.path.join(reading_dir(r), "kaggle-push.json"))
        print(f"fetched into {reading_folder(r)}")
        report_reading(r["name"])
    return 0


def report(args: argparse.Namespace) -> int:
    trainers = [t for t in TRAINERS
                if os.path.exists(os.path.join(local_dir({"name": args.name, "trainer": t}), "args.json"))]
    reading = os.path.isdir(reading_dir({"name": args.name}))
    assert len(trainers) + reading == 1, \
        f"{args.name}: no single run or reading of that name in {', '.join([*TRAINERS.values(), READINGS])}"
    if reading:
        report_reading(args.name)
    else:
        report_run({"name": args.name, "trainer": trainers[0]}, args.key)
    return 0


def report_reading(name: str) -> None:
    """A fetched reading's output, in its tool's own table."""
    folder = reading_dir({"name": name})
    outputs = [t for t in READING_TOOLS if os.path.exists(os.path.join(folder, f"{t}.json"))]
    assert len(outputs) == 1, (f"{reading_folder({'name': name})} holds no reading's output: it didn't finish, "
                               "or isn't fetched yet; its out.txt and err.txt say why")
    tool = outputs[0]
    with open(os.path.join(folder, f"{tool}.json")) as f:
        out = json.load(f)
    print(f"{name}: {tool} on {out['ckpt']}")
    if tool == "search":
        from ..selfplay.search import print_table
        print_table(out)
    elif tool == "calibrate":
        from ..selfplay.calibrate import table
        for which in ("mirror", "mixed"):
            if which in out:
                print(table(which, out[which]))
    else:
        print_panel(out)


def report_run(run: dict, key: str | None) -> None:
    if trainer_of(run) == "imitate":
        report_imitation(run)
    else:
        report_ppo(run["name"], local_dir(run), key)


def report_imitation(run: dict) -> None:
    run_dir, name = local_dir(run), run["name"]
    with open(os.path.join(run_dir, "log.jsonl")) as f:
        rows = [json.loads(line) for line in f]
    if rows:
        last = rows[-1]
        stopped = f", stopped on the {last['stopped']}" if "stopped" in last else ""
        print(f"{name}: {last['samples'] / 1e6:.0f}M samples in {last['seconds']:,.0f}s, held-out main agreement "
              f"{last['held_main']:.4f} (best {last['best']:.4f}){stopped}")
    path = os.path.join(run_dir, "read.json")
    if os.path.exists(path):
        with open(path) as f:
            read = json.load(f)
        for what in ("main", "move"):
            r = read[what]["all"]
            print(f"  held-out {what} agreement {r['share']:.4f} [{r['lo']:.4f}, {r['hi']:.4f}] "
                  f"over {read['held_out_games']} games")
    path = os.path.join(run_dir, "panel.json")
    if os.path.exists(path):
        with open(path) as f:
            print_panel(json.load(f))


def print_panel(panel: dict) -> None:
    print(f"  panel at {panel['games']} games:")
    for k, r in panel.items():
        if isinstance(r, dict) and "win" in r:
            low, high = r["interval"]
            print(f"    {k:<28} {r['win']:.3f} [{low:.3f}, {high:.3f}]  par {r['par']}")
        elif isinstance(r, dict) and "share" in r:
            print(f"    {k:<28} {r['share']:.3f}")


def report_ppo(name: str, run_dir: str, key: str | None) -> None:
    with open(os.path.join(run_dir, "args.json")) as f:
        key = key or json.load(f).get("stop_key")
    rows = []
    with open(os.path.join(run_dir, "log.jsonl")) as f:
        for line in f:
            rows.append(json.loads(line))
    if rows:
        last = rows[-1]
        print(f"{name}: iteration {last['iter']}, {last['steps'] / 1e6:.0f}M decisions, "
              f"{last['steps_per_s']:,.0f} decisions/s at the end")
    if key:
        readings = panel_readings(os.path.join(run_dir, "log.jsonl"), key)
        print(f"{key}:")
        for k in range(len(readings)):
            r = readings[k]
            low, high = r["interval"]
            print(f"  iter {r['iter']:>5}  {r['steps'] / 1e6:>7.0f}M  {r['win']:.3f} [{low:.3f}, {high:.3f}]  "
                  f"{verdict(readings[:k + 1])}")
    sharp = sorted((int(m.group(1)), m.group(0)) for m in
                   (re.fullmatch(r"panel-(\d+)-g(\d+)\.json", f) for f in os.listdir(run_dir)) if m)
    if key and sharp:
        print(f"{key}, sharp readings:")
        for it, file in sharp:
            with open(os.path.join(run_dir, file)) as f:
                r = json.load(f)[key]
            low, high = r["interval"]
            print(f"  iter {it:>5}  {r['win']:.3f} [{low:.3f}, {high:.3f}]  ({r['decisive']} decisive games)")
    stopped = os.path.join(run_dir, "stopped.txt")
    if os.path.exists(stopped):
        with open(stopped) as f:
            print(f"stopped: {f.read().strip()}")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = p.add_subparsers(dest="command", required=True)
    s = sub.add_parser("push")
    s.add_argument("names", nargs="*", help="the runs, in order: each of the session's GPUs (a T4 session has two) takes the next when it is free")
    s.add_argument("--read", action="append", default=[], metavar="NAME=TOOL ARGS",
                   help=f"a reading of existing checkpoints instead of runs: one of {', '.join(READING_TOOLS)} "
                        "with its own arguments, in runs/readings/NAME/ (repeat for more, in order)")
    s.add_argument("--run-args", action="append", default=[], metavar="NAME=ARGS",
                   help="one run's own trainer arguments, after the shared ones (e.g. k2='--seed 1')")
    s.add_argument("--imitate", action="store_true",
                   help="the runs are imitations (`imitate train`'s arguments, in runs/imitate/), each read on its "
                        "held-out agreement and the panel once it is trained")
    s.add_argument("--accelerator", default="NvidiaTeslaT4")
    s.add_argument("--session-hours", type=float, default=11.0, help="under Kaggle's 12-hour session, with room to set up")
    s.add_argument("--read-hours", type=float, default=3.0,
                   help="the session's last hours, kept for the stopped runs' readings (a T4 takes 2 to 3 a sharp reading, two at once)")
    s.add_argument("--no-stop", action="store_true", help="let a PPO session run its hours without a plateau stop")
    for sub_command in ("status", "fetch"):
        sub.add_parser(sub_command).add_argument("name")
    r = sub.add_parser("report")
    r.add_argument("name")
    r.add_argument("--key", default=None, help="a PPO run's panel reading to show (default: the run's --stop-key)")
    argv = sys.argv[1:] if argv is None else argv
    # The trainer's arguments follow `--`, kept apart so the launcher's own options never mix with them.
    split = argv.index("--") if "--" in argv else len(argv)
    args = p.parse_args(argv[:split])
    args.trainer = argv[split + 1:]
    return {"push": push, "status": status, "fetch": fetch, "report": report}[args.command](args)


if __name__ == "__main__":
    sys.exit(main())

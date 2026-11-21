"""Kaggle TPU sessions, pushed and read from here: the accelerator probe (`bench.py`), and training
the network on recorded choices (`train.py`):

    python -m riskgpu.tpu.launch push <name> [--accelerator TpuV5E8] [--session-hours 3] [--dry-run] [-- <bench args>]
    python -m riskgpu.tpu.launch train <name> --task imitate|distil --source <runs/... folder> [--clock]
        [--data-dataset owner/slug] [--session-hours 8.5] [--dry-run] -- <train.py args>
    python -m riskgpu.tpu.launch status <name>
    python -m riskgpu.tpu.launch fetch <name>

run from `src/projects/risk/gpu/` (`ideas/tpu.md`).

**A training session** (`train`) uploads the compact set (an imitation's extraction, or a recording:
a search's or a net's own play, a fraction of the prepared set's size), `--init` and the run's own
folder as a private dataset, and pushes `session.py`, which clones the GPU package at this checkout's
commit (on GitHub, the package committed, as `kaggle/launch.py` requires), prepares the set on the TPU
VM's CPUs and trains on its chips (`session.py`). A distillation with `--clock` prepares its set with
the clock, and its net, `--init`'s or a fresh one of the trainer's `--width` and `--layers`, reads
it. A set already on Kaggle in an earlier bundle is read from there instead (`--data-dataset`, each
file checked by name and size first), so the slow upload happens once. The run lives in `runs/tpu/<name>/`; a session that stops on its hours saves its state there,
and pushing the same name again carries on. `fetch` brings the folder back, refusing if `best.pt` or
the saved state changed here since the push. Every argument is checked by the tools' own parsers,
and the quota asked, before anything is uploaded; `--dry-run` stops there.

**The probe** (`push`) sends `bench.py` alone as a private script,
with no dataset and no repo checkout: the probe needs nothing but JAX, which the TPU image ships. A
T4 session (`--accelerator NvidiaTeslaT4`, for the same script's ratio on a T4) installs JAX's CUDA
build first, from the internet. Before pushing it prints the accelerator's line of `kaggle quota` and
refuses a session longer than the hours left or than Kaggle's session limit. `fetch` brings the
session's output into `runs/tpu/<name>/` and prints the rates.
"""

import argparse
import json
import os
import re
import shlex
import shutil
import sys
import tempfile
import time

from ..board import DATA
from ..kaggle.launch import kaggle, username
from .bench import settings

GPU = os.path.dirname(DATA)
RUNS = os.path.join(GPU, "runs", "tpu")
STAGING = os.path.join(GPU, "runs", "kaggle")
BENCH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bench.py")
SESSION = os.path.join(os.path.dirname(os.path.abspath(__file__)), "session.py")
# A training session's chips, which its minibatch splits over.
CHIPS = {"TpuV5E8": 8, "TpuV6E8": 8}
# Kaggle's identifiers, the quota each draws on, and its session limit in hours. Kaggle accepts a TPU
# push and may still run it on a plain CPU machine in its standard image (`ideas/tpu.md`), which is
# why the probe fails without its device and `fetch` says so.
ACCELERATORS = {"TpuV5E8": ("TPU", 9.0), "TpuV6E8": ("TPU", 9.0), "NvidiaTeslaT4": ("GPU", 12.0)}
# JAX's own words when the device it is pinned to isn't there, and `bench.py`'s when it finds another.
NO_DEVICE = re.compile(r"Unable to initialize backend '(\w+)'[^\n]*|--require (\w+), but JAX found (\w+)[^\n]*")
REQUIRE = {"TPU": "tpu", "GPU": "gpu"}
OUTPUT = "tpu-bench.json"
WORKING = "/kaggle/working"


def quota_row(text: str, resource: str) -> dict:
    """`kaggle quota --format json`'s row for `resource` (GPU or TPU)."""
    rows = [r for r in json.loads(text) if r.get("resource") == resource]
    assert len(rows) == 1, f"`kaggle quota` has no single {resource} row: {text}"
    return rows[0]


def check_session(accelerator: str, hours: float, row: dict) -> None:
    """Refuses a session the quota or Kaggle's limit can't hold."""
    resource, limit = ACCELERATORS[accelerator]
    assert 0 < hours <= limit, f"a {resource} session is at most {limit} hours on Kaggle: --session-hours {hours}"
    left = float(row["remaining"].rstrip("h"))
    assert hours <= left, f"the session's {hours} hours exceed the {left} {resource} hours left this week"


def prelude(accelerator: str, argv: list[str]) -> str:
    """What `run.py` runs before `bench.py`'s own source: the probe's arguments, JAX pinned to the
    device it must find (so a machine without it fails to start JAX rather than measuring the CPU),
    and on a GPU, JAX's CUDA build."""
    resource = ACCELERATORS[accelerator][0]
    lines = ["import os", "import subprocess", "import sys",
             f"os.environ['JAX_PLATFORMS'] = {('tpu' if resource == 'TPU' else 'cuda')!r}",
             f"PUSHED_ARGV = {argv!r}"]
    if resource == "GPU":
        # Only the parent installs; the phases it starts run this file again with arguments.
        lines += ["if not sys.argv[1:]:",
                  "    subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', 'jax[cuda12]'])"]
    return "\n".join(lines) + "\n\n"


def bench_argv(accelerator: str, hours: float, extra: list[str]) -> list[str]:
    """The probe's arguments: its device, its output, and a quarter hour less than the session, so it
    stops starting measurements and writes its document before Kaggle stops it."""
    for flag in ("--require", "--out", "--hours", "--phase", "--deadline"):
        assert flag not in extra, f"{flag} is the launcher's"
    resource = ACCELERATORS[accelerator][0]
    return ["--require", REQUIRE[resource], "--out", f"{WORKING}/{OUTPUT}", "--hours", str(round(hours - 0.25, 2)), *extra]


def push(args: argparse.Namespace) -> int:
    assert re.fullmatch(r"[a-z0-9][a-z0-9-]*", args.name), f"{args.name!r}: a probe's name is lower-case letters, digits and '-'"
    folder = os.path.join(RUNS, args.name)
    assert not (os.path.isdir(folder) and os.listdir(folder)), f"runs/tpu/{args.name} already holds a probe: name a new one"
    resource = ACCELERATORS[args.accelerator][0]
    argv = bench_argv(args.accelerator, args.session_hours, args.bench)
    # The probe's own parser, so arguments it would refuse cost no session.
    settings(argv)

    row = quota_row(kaggle("quota", "--format", "json").stdout, resource)
    print(f"kaggle quota, {resource}: used {row['used']}, remaining {row['remaining']} of {row['total']}, "
          f"refreshes {row['refreshAt']}")
    check_session(args.accelerator, args.session_hours, row)

    user = username()
    kernel = f"{user}/risk-tpu-bench-{args.name.lower()}"
    kernel_dir = os.path.join(STAGING, f"tpu-{args.name}")
    shutil.rmtree(kernel_dir, ignore_errors=True)
    os.makedirs(kernel_dir)
    with open(BENCH) as f:
        source = f.read()
    with open(os.path.join(kernel_dir, "run.py"), "w") as f:
        f.write(prelude(args.accelerator, argv) + source)
    meta = {"id": kernel, "title": kernel.split("/")[1], "code_file": "run.py", "language": "python",
            "kernel_type": "script", "is_private": True, "enable_gpu": resource == "GPU",
            "enable_tpu": resource == "TPU", "enable_internet": resource == "GPU",
            "machine_shape": args.accelerator, "dataset_sources": [], "competition_sources": [],
            "kernel_sources": [], "model_sources": []}
    if resource == "TPU":
        # Without it Kaggle pins a new kernel to its CPU/GPU image, which a TPU VM doesn't run
        # (Kaggle/kaggle-cli#1197); with it the kernel is left unpinned.
        meta["docker_image_pinning_type"] = "latest"
    with open(os.path.join(kernel_dir, "kernel-metadata.json"), "w") as f:
        json.dump(meta, f, indent=1)
    cmd = ["kernels", "push", "-p", kernel_dir, "--accelerator", args.accelerator,
           "-t", str(int(args.session_hours * 3600))]
    if args.dry_run:
        print(f"dry run: staged {kernel_dir}")
        print(json.dumps(meta, indent=1))
        print(prelude(args.accelerator, argv).rstrip())
        print("would run: python -m kaggle " + " ".join(shlex.quote(c) for c in cmd))
        return 0
    print(kaggle(*cmd).stdout.strip())
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, "kaggle-push.json"), "w") as f:
        json.dump({"kernel": kernel, "accelerator": args.accelerator, "argv": argv,
                   "session_hours": args.session_hours, "pushed": time.time()}, f, indent=1)
    print(f"pushed {kernel} on {args.accelerator}: `status {args.name}` while it runs, `fetch {args.name}` once it ends")
    return 0


def pushed(name: str) -> dict:
    path = os.path.join(RUNS, name, "kaggle-push.json")
    assert os.path.exists(path), f"{name} was never pushed from this checkout"
    with open(path) as f:
        return json.load(f)


def status(args: argparse.Namespace) -> int:
    print(kaggle("kernels", "status", pushed(args.name)["kernel"]).stdout.strip())
    return 0


# --- training sessions -------------------------------------------------------------------------

TASK_SOURCES = {"imitate": "runs/imitate/", "distil": "runs/"}
# A run's files that say where its work stands: a fetch that would overwrite one changed here since
# the push refuses.
GUARDED = ("best.pt", "resume.json")
LAUNCHERS = ("--data", "--dir", "--hours", "--require", "--out", "--chips")


def train_files(source: str, init: str | None, name: str) -> list[str]:
    """Every file a training session reads that the repo doesn't carry, relative to the GPU folder:
    the compact set (each folder of `source`, comma-separated), `--init`, and the run's own folder
    (an earlier session's state, which the session resumes)."""
    from ..kaggle.launch import CHECKPOINT, LOCAL_ONLY
    files = []
    for folder in [f for f in source.split(",") if f]:
        here = os.path.join(GPU, *folder.split("/"))
        assert os.path.isdir(here), f"{folder}: no such folder in this checkout"
        files += [f"{folder.rstrip('/')}/{f}" for f in sorted(os.listdir(here)) if os.path.isfile(os.path.join(here, f))
                  and f not in LOCAL_ONLY]
    if init:
        assert CHECKPOINT.fullmatch(init), f"give --init {init} as a path under runs/, relative to the GPU folder, with '/'"
        files.append(init)
    own = os.path.join(RUNS, name)
    if os.path.isdir(own):
        files += [f"runs/tpu/{name}/{f}" for f in sorted(os.listdir(own))
                  if os.path.isfile(os.path.join(own, f)) and f not in LOCAL_ONLY]
    missing = [f for f in files if not os.path.exists(os.path.join(GPU, f))]
    assert not missing, f"the session would need files this checkout lacks: {missing}"
    return list(dict.fromkeys(files))


def check_train(args: argparse.Namespace) -> tuple[list[str], list[str]]:
    """`(prepare arguments, trainer arguments)`, refused here, before any upload, wherever the
    session would refuse them or waste its chips."""
    from .prepare import parser as prepare_parser
    from .train import parser as train_parser
    for flag in LAUNCHERS:
        assert flag not in args.trainer, f"{flag} is the launcher's"
    source = args.source.replace("\\", "/")
    assert source and not os.path.isabs(source) and all(f.startswith(TASK_SOURCES[args.task]) for f in source.split(",")), \
        f"give --source as folders under {TASK_SOURCES[args.task]}, relative to the GPU folder"
    ns = train_parser().parse_args(["--data", "x", "--dir", "y", *args.trainer])
    assert args.task == "distil" or not args.clock, "an imitation's extraction keeps no turn cap: --clock is a distillation's"
    chips = CHIPS[args.accelerator]
    assert ns.minibatch % chips == 0, f"--minibatch {ns.minibatch} doesn't split over the session's {chips} chips"
    prepare_args = ((["--actions", ns.actions] if ns.actions else []) + (["--fraction", str(args.fraction)] if args.task == "imitate" else [])
                    + (["--clock"] if args.clock else []))
    prepare_parser().parse_args([args.task, "--data", source, "--out", "x", *prepare_args])
    own = os.path.join(RUNS, args.name)
    assert not os.path.exists(os.path.join(own, "last.pt")), f"runs/tpu/{args.name} holds a finished run: name a new one"
    assert not os.path.exists(os.path.join(own, "kaggle-push.json")), \
        f"runs/tpu/{args.name} has a push not fetched yet: fetch it first"
    return prepare_args, list(args.trainer)


def external_files(dataset: str, files: list[str]) -> None:
    """Refuses unless Kaggle's dataset `dataset` holds each of `files` (by its flat name), at the size
    this checkout's copy has."""
    from ..kaggle.launch import flat_name
    listed = json.loads(kaggle("datasets", "files", dataset, "--format", "json", "--page-size", "200").stdout)
    rows = listed["datasetFiles"] if isinstance(listed, dict) else listed
    sizes = {}
    for row in rows:
        size = next((row[k] for k in ("totalBytes", "total_bytes", "size") if k in row), None)
        sizes[row["name"]] = size
    for rel in files:
        flat = flat_name(rel)
        assert flat in sizes, f"{dataset} has no {flat}"
        assert str(sizes[flat]) == str(os.path.getsize(os.path.join(GPU, rel))), \
            f"{dataset}'s {flat} is {sizes[flat]} bytes, this checkout's {os.path.getsize(os.path.join(GPU, rel))}"


def push_train(args: argparse.Namespace) -> int:
    from ..kaggle.launch import checkout_commit, flat_name, sha256, slugs, stage, wait_ready
    assert re.fullmatch(r"[a-z0-9][a-z0-9-]*", args.name), f"{args.name!r}: a run's name is lower-case letters, digits and '-'"
    prepare_args, train_args = check_train(args)
    source = args.source.replace("\\", "/")
    init = train_args[len(train_args) - 1 - train_args[::-1].index("--init") + 1] if "--init" in train_args else None
    files = train_files(source, init, args.name)
    data = [f for f in files if any(f.startswith(folder.rstrip("/") + "/") for folder in source.split(","))]
    upload = [f for f in files if not (args.data_dataset and f in data)]
    size = sum(os.path.getsize(os.path.join(GPU, f)) for f in upload)
    print(f"{args.task} of {source} ({sum(os.path.getsize(os.path.join(GPU, f)) for f in data) / 1e9:.2f} GB"
          + (f", read from {args.data_dataset}" if args.data_dataset else "") + f"): upload {len(upload)} files, {size / 1e6:,.0f} MB")
    resuming = os.path.exists(os.path.join(RUNS, args.name, "resume.json"))
    print(f"runs/tpu/{args.name}: {'resumes its run' if resuming else 'a new run'}; prepare {shlex.join(prepare_args)}; "
          f"train {shlex.join(train_args)}")

    row = quota_row(kaggle("quota", "--format", "json").stdout, "TPU")
    print(f"kaggle quota, TPU: used {row['used']}, remaining {row['remaining']} of {row['total']}, refreshes {row['refreshAt']}")
    check_session(args.accelerator, args.session_hours, row)
    if args.data_dataset:
        external_files(args.data_dataset, data)
    if args.dry_run:
        print("dry run: nothing uploaded or pushed")
        return 0

    commit = checkout_commit()
    user = username()
    dataset, _ = slugs(user, f"tpu-{args.name}")
    kernel = f"{user}/risk-tpu-train-{args.name}"
    import uuid
    bundle_id = uuid.uuid4().hex
    job_dir = os.path.join(STAGING, f"tpu-{args.name}")
    bundle = os.path.join(job_dir, "bundle")
    stage(upload, bundle)
    external = {flat_name(f): f for f in files if f not in upload}
    with open(os.path.join(bundle, "MANIFEST.json"), "w") as f:
        json.dump({"id": bundle_id, "files": {flat_name(rel): rel for rel in upload}, "external": external}, f, indent=1)
    with open(os.path.join(bundle, "dataset-metadata.json"), "w") as f:
        json.dump({"title": dataset.split("/")[1], "id": dataset, "licenses": [{"name": "CC0-1.0"}]}, f)
    existing = kaggle("datasets", "status", dataset, check=False)
    if existing.returncode == 0 and "ready" in existing.stdout.lower():
        kaggle("datasets", "version", "-p", bundle, "-m", f"bundle {bundle_id}", "-t", "-q")
    else:
        kaggle("datasets", "create", "-p", bundle, "-t", "-q")
    wait_ready(dataset)

    job = {"kind": "train", "name": args.name, "task": args.task, "source": source, "prepare_args": prepare_args,
           "train_args": train_args, "commit": commit, "bundle": bundle_id, "session_hours": args.session_hours}
    kernel_dir = os.path.join(job_dir, "kernel")
    shutil.rmtree(kernel_dir, ignore_errors=True)
    os.makedirs(kernel_dir)
    with open(SESSION) as f:
        source_text = f.read()
    with open(os.path.join(kernel_dir, "run.py"), "w") as f:
        f.write(f"JOB = {json.dumps(job)}\n\n{source_text}")
    meta = {"id": kernel, "title": kernel.split("/")[1], "code_file": "run.py", "language": "python",
            "kernel_type": "script", "is_private": True, "enable_gpu": False, "enable_tpu": True,
            "enable_internet": True, "machine_shape": args.accelerator,
            "dataset_sources": [dataset] + ([args.data_dataset] if args.data_dataset else []),
            "competition_sources": [], "kernel_sources": [], "model_sources": [],
            # Without it Kaggle pins a new kernel to its CPU/GPU image (Kaggle/kaggle-cli#1197).
            "docker_image_pinning_type": "latest"}
    with open(os.path.join(kernel_dir, "kernel-metadata.json"), "w") as f:
        json.dump(meta, f, indent=1)
    print(kaggle("kernels", "push", "-p", kernel_dir, "--accelerator", args.accelerator,
                 "-t", str(int(args.session_hours * 3600))).stdout.strip())
    folder = os.path.join(RUNS, args.name)
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, "kaggle-push.json"), "w") as f:
        json.dump({**job, "kernel": kernel, "dataset": dataset, "accelerator": args.accelerator, "pushed": time.time(),
                   "guard_sha256": {g: sha256(os.path.join(folder, g)) for g in GUARDED}}, f, indent=1)
    print(f"pushed {kernel} at {commit[:8]}: `status {args.name}` while it runs, `fetch {args.name}` once it ends")
    return 0


def fetch_train(job: dict, folder: str) -> int:
    """The session's run folder back over this checkout's, refusing if the run moved here since the push."""
    from ..kaggle.launch import sha256
    for g in GUARDED:
        assert sha256(os.path.join(folder, g)) == job["guard_sha256"][g], \
            f"runs/tpu/{job['name']}'s {g} changed here since the push: fetching would overwrite that work"
    os.makedirs(STAGING, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=STAGING) as tmp:
        kaggle("kernels", "output", job["kernel"], "-p", tmp, "-o", "-q")
        found = [root for root, _, files in os.walk(tmp)
                 if os.path.basename(root) == job["name"] and "kaggle-sessions.jsonl" in files]
        log = [os.path.join(root, f) for root, _, files in os.walk(tmp) for f in files if f.endswith(".log")]
        for path in log:
            shutil.copyfile(path, os.path.join(folder, os.path.basename(path)))
        assert len(found) == 1, f"the session's output holds no run folder for {job['name']}; its log is in runs/tpu/{job['name']}"
        shutil.copytree(found[0], folder, dirs_exist_ok=True)
    os.remove(os.path.join(folder, "kaggle-push.json"))
    summarize_train(folder)
    return 0


def summarize_train(folder: str) -> None:
    path = os.path.join(folder, "log.jsonl")
    if os.path.exists(path):
        with open(path) as f:
            last = json.loads(f.readlines()[-1])
        stopped = ", stopped on the hours: push it again to carry on" if last.get("stopped") else ""
        print(f"step {last['step']}, {last['samples'] / 1e6:.0f}M samples, {last['samples_per_s']:,} samples/s; "
              f"best {last['best']:.4f}{stopped}")
    path = os.path.join(folder, "read.json")
    if os.path.exists(path):
        with open(path) as f:
            read = json.load(f)["held_out"]
        for what in ("main", "move"):
            r = read[what].get("all") or read[what].get("searched")
            print(f"  held-out {what} agreement {r['share']:.4f} [{r['lo']:.4f}, {r['hi']:.4f}] of {r['n']}")


def fetch(args: argparse.Namespace) -> int:
    job = pushed(args.name)
    state = kaggle("kernels", "status", job["kernel"]).stdout.strip()
    print(state)
    assert "running" not in state.lower() and "queued" not in state.lower(), "the session hasn't ended yet"
    folder = os.path.join(RUNS, args.name)
    if job.get("kind") == "train":
        return fetch_train(job, folder)
    os.makedirs(STAGING, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=STAGING) as tmp:
        kaggle("kernels", "output", job["kernel"], "-p", tmp, "-o", "-q")
        for root, _, files in os.walk(tmp):
            for f in files:
                shutil.copyfile(os.path.join(root, f), os.path.join(folder, f))
    log = os.path.join(folder, f"{job['kernel'].split('/')[1]}.log")
    if os.path.exists(log):
        with open(log, encoding="utf-8") as f:
            missing = missing_device(f.read())
        assert missing is None, (
            f"Kaggle ran {job['kernel']} on a machine without the {job['accelerator']} it was pushed for, so the "
            f"probe measured nothing: {missing}. Such a session doesn't draw on the accelerator's quota "
            f"(`kaggle quota`); see ideas/tpu.md. Its log is in runs/tpu/{args.name}")
    path = os.path.join(folder, OUTPUT)
    assert os.path.exists(path), f"the session wrote no {OUTPUT}; its log and partial phases are in runs/tpu/{args.name}"
    with open(path) as f:
        summarize(json.load(f))
    return 0


def missing_device(log: str) -> str | None:
    """What a Kaggle session's log (its JSON list of output lines) says when the probe found no device
    of the kind it required, with the machine's Python; None when it says nothing of the kind."""
    text = "".join(line["data"] for line in json.loads(log))
    found = NO_DEVICE.search(text)
    if found is None:
        return None
    python = re.search(r"/python(3\.\d+)/", text)
    return found.group(0).strip() + (f" (the machine's Python is {python.group(1)})" if python else "")


def summarize(doc: dict) -> None:
    hw = doc["hardware"]
    print(f"{hw['device_count']} x {hw['device_kind']} ({hw['platform']}), "
          f"{(hw['memory_bytes_per_device'] or 0) / 2 ** 30:.0f} GiB each; {doc['wall_seconds']:.0f} s")
    for r in doc["net"]:
        rate = "out of memory" if r.get("oom") else f"{r['per_chip_per_s']:>12,.0f}/s a chip  (compile {r['compile_s']} s)"
        print(f"  net {r['kind']:<5} {r['size']:<7} {r['precision']:<4} {r['chips']:<3} batch {r['batch_per_chip']:>6}  {rate}")
    for r in doc["engine"]:
        rate = "out of memory" if r.get("oom") else f"{r['per_chip_per_s']:>12,.0f} game-steps/s a chip"
        print(f"  engine {r['variant']:<7} {r['chips']:<3} games {r['games_per_chip']:>6}  {rate}")
    if doc["skipped"]:
        print(f"  {len(doc['skipped'])} measurements skipped")
    if doc.get("failed_phase"):
        print(f"  phase {doc['failed_phase']} failed: its log says why")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = p.add_subparsers(dest="command", required=True)
    s = sub.add_parser("push")
    s.add_argument("name")
    s.add_argument("--accelerator", choices=sorted(ACCELERATORS), default="TpuV5E8")
    s.add_argument("--session-hours", type=float, default=3.0)
    s.add_argument("--dry-run", action="store_true", help="stage the kernel and check the quota, push nothing")
    t = sub.add_parser("train", help="a training session: prepare the set on the host, train on the TPU (`train.py`)")
    t.add_argument("name", help="the run, in runs/tpu/<name>/; pushed again, it carries on from its saved state")
    t.add_argument("--task", choices=sorted(TASK_SOURCES), required=True)
    t.add_argument("--source", required=True,
                   help="the compact set: an imitation's extraction folder, or a recording's (several, comma-separated)")
    t.add_argument("--fraction", type=float, default=1.0, help="an imitation's share of the training games")
    t.add_argument("--clock", action="store_true", help="a distillation's set prepared with the clock, which its net reads")
    t.add_argument("--data-dataset", default=None, metavar="OWNER/SLUG",
                   help="a Kaggle dataset already holding the source's files (an earlier bundle), read instead of uploading them")
    t.add_argument("--accelerator", choices=sorted(CHIPS), default="TpuV5E8")
    t.add_argument("--session-hours", type=float, default=8.5)
    t.add_argument("--dry-run", action="store_true", help="check everything and print the upload, push nothing")
    for name in ("status", "fetch"):
        sub.add_parser(name).add_argument("name")
    argv = sys.argv[1:] if argv is None else argv
    # The probe's or the trainer's own arguments follow `--`.
    split = argv.index("--") if "--" in argv else len(argv)
    args = p.parse_args(argv[:split])
    args.bench = args.trainer = argv[split + 1:]
    return {"push": push, "train": push_train, "status": status, "fetch": fetch}[args.command](args)


if __name__ == "__main__":
    sys.exit(main())

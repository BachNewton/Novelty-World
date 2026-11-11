"""PPO sessions on Kaggle's free GPUs, launched and read from here:

    python -m riskgpu.kaggle.launch push <name> [--accelerator NvidiaTeslaT4] [--session-hours 11] -- <trainer args>
    python -m riskgpu.kaggle.launch status <name>
    python -m riskgpu.kaggle.launch fetch <name>
    python -m riskgpu.kaggle.launch report <name> [--key "sample s2-2-150 one-in"]

run from `src/projects/risk/gpu/` (`docs/kaggle.md`). The run's folder here,
`runs/selfplay/<name>/`, stays the source of truth: `push` uploads what the session needs (the run's
own folder, to resume it, every checkpoint its arguments name, the panel's anchors and the blitz
tables, which git ignores) as a private dataset, then pushes `kernel.py` as a private script that
trains from the repo at this checkout's commit, which must be on GitHub. `fetch` brings the session's
run folder back over the local one, refusing if the local run moved since the push. `report` reads
the run's panel readings with their intervals and the verdict (`selfplay/verdict.py`).

A session must stop on a plateau (`--stop-when` with `--stop-key`) unless `--no-stop` says it may
spend its hours regardless, so the week's quota isn't spent on a flat run.
"""

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import uuid

from ..board import DATA
from ..selfplay.verdict import panel_readings, verdict

GPU = os.path.dirname(DATA)
RUNS = os.path.join(GPU, "runs", "selfplay")
STAGING = os.path.join(GPU, "runs", "kaggle")
KERNEL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kernel.py")
# Kaggle's identifiers for its accelerators; T4s and P100s are older than Ampere, with no native bfloat16.
PRE_AMPERE = {"NvidiaTeslaT4", "NvidiaTeslaP100"}
# This checkout's own bookkeeping, never sent.
LOCAL_ONLY = {"kaggle-push.json", "stopped.txt"}
CHECKPOINT = re.compile(r"runs/[^,=\s]+\.pt")


def needed_files(name: str, trainer_args: list[str]) -> list[str]:
    """Every file a session of run `name` with these trainer arguments reads that the repo doesn't
    carry, as paths relative to the GPU folder."""
    files = ["data/blitz-256.bin", "data/blitz-256.json"]
    own = os.path.join(RUNS, name)
    if os.path.isdir(own):
        files += [f"runs/selfplay/{name}/{f}" for f in sorted(os.listdir(own))
                  if os.path.isfile(os.path.join(own, f)) and f not in LOCAL_ONLY]
    latest = os.path.join(own, "latest.pt")
    if os.path.exists(latest):
        # A resumed run's league seats its past snapshots, which may live in the run it was copied from.
        import torch
        files += [p.replace("\\", "/") for p in torch.load(latest, map_location="cpu", weights_only=False)["league"]]
    for arg in trainer_args:
        files += CHECKPOINT.findall(arg.replace("\\", "/"))
    if "--panel" in trainer_args and trainer_args[trainer_args.index("--panel") + 1] != "0":
        from ..selfplay.panel import ANCHORS
        files += [os.path.relpath(path, GPU).replace("\\", "/") for _, path in ANCHORS]
    unique = list(dict.fromkeys(files))
    missing = [f for f in unique if not os.path.exists(os.path.join(GPU, f))]
    assert not missing, f"the session would need files this checkout lacks: {missing}"
    return unique


def flat_name(rel: str) -> str:
    """A dataset keeps files only at its top level, so a path is folded into the file's name."""
    return rel.replace("/", "__")


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


def push(args: argparse.Namespace) -> int:
    trainer = list(args.trainer)
    if args.accelerator in PRE_AMPERE:
        assert "--no-bf16" in trainer, f"{args.accelerator} has no native bfloat16: give the trainer --no-bf16"
    stops = "--stop-when" in trainer and trainer[trainer.index("--stop-when") + 1] != "never"
    assert stops or args.no_stop, "give the trainer --stop-when and --stop-key, or say --no-stop to spend the hours regardless"
    if stops:
        assert "--stop-key" in trainer and "--panel" in trainer and trainer[trainer.index("--panel") + 1] != "0", \
            "the stop reads --stop-key on the panel: give the trainer both"
    assert "--session-hours" not in trainer, "the session's cap is the launcher's --session-hours"
    trainer += ["--session-hours", str(args.session_hours)]
    commit = checkout_commit()
    user = username()
    dataset, kernel = slugs(user, args.name)
    files = needed_files(args.name, trainer)

    bundle_id = uuid.uuid4().hex
    bundle_dir = os.path.join(STAGING, args.name, "bundle")
    shutil.rmtree(bundle_dir, ignore_errors=True)
    os.makedirs(bundle_dir)
    for rel in files:
        shutil.copyfile(os.path.join(GPU, rel), os.path.join(bundle_dir, flat_name(rel)))
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

    kernel_dir = os.path.join(STAGING, args.name, "kernel")
    shutil.rmtree(kernel_dir, ignore_errors=True)
    os.makedirs(kernel_dir)
    job = {"name": args.name, "commit": commit, "bundle": bundle_id, "args": trainer}
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
    os.makedirs(os.path.join(RUNS, args.name), exist_ok=True)
    with open(os.path.join(RUNS, args.name, "kaggle-push.json"), "w") as f:
        json.dump({**job, "kernel": kernel, "dataset": dataset, "accelerator": args.accelerator,
                   "latest_sha256": sha256(os.path.join(RUNS, args.name, "latest.pt")), "pushed": time.time()}, f, indent=1)
    print(f"pushed {kernel} at {commit[:8]}: `status {args.name}` while it runs, `fetch {args.name}` once it ends")
    return 0


def pushed(name: str) -> dict:
    path = os.path.join(RUNS, name, "kaggle-push.json")
    assert os.path.exists(path), f"{name} was never pushed from this checkout"
    with open(path) as f:
        return json.load(f)


def status(args: argparse.Namespace) -> int:
    print(kaggle("kernels", "status", pushed(args.name)["kernel"]).stdout.strip())
    return 0


def fetch(args: argparse.Namespace) -> int:
    job = pushed(args.name)
    state = kaggle("kernels", "status", job["kernel"]).stdout.strip()
    print(state)
    assert "running" not in state.lower() and "queued" not in state.lower(), "the session hasn't ended yet"
    local = os.path.join(RUNS, args.name)
    assert sha256(os.path.join(local, "latest.pt")) == job["latest_sha256"], \
        f"{args.name}'s latest.pt changed here since the push: fetching would overwrite that work"
    os.makedirs(STAGING, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=STAGING) as tmp:
        kaggle("kernels", "output", job["kernel"], "-p", tmp, "-o", "-q")
        found = [root for root, _, files in os.walk(tmp) if "kaggle-sessions.jsonl" in files]
        assert len(found) == 1, f"the session's output holds no run folder for {args.name}; its log is in {tmp}"
        for f in os.listdir(found[0]):
            shutil.copyfile(os.path.join(found[0], f), os.path.join(local, f))
    os.remove(os.path.join(local, "kaggle-push.json"))
    print(f"fetched into {os.path.relpath(local, GPU)}")
    return report(argparse.Namespace(name=args.name, key=None))


def report(args: argparse.Namespace) -> int:
    run_dir = os.path.join(RUNS, args.name)
    with open(os.path.join(run_dir, "args.json")) as f:
        key = args.key or json.load(f).get("stop_key")
    rows = []
    with open(os.path.join(run_dir, "log.jsonl")) as f:
        for line in f:
            rows.append(json.loads(line))
    if rows:
        last = rows[-1]
        print(f"{args.name}: iteration {last['iter']}, {last['steps'] / 1e6:.0f}M decisions, "
              f"{last['steps_per_s']:,.0f} decisions/s at the end")
    if key:
        readings = panel_readings(os.path.join(run_dir, "log.jsonl"), key)
        print(f"{key}:")
        for k in range(len(readings)):
            r = readings[k]
            low, high = r["interval"]
            print(f"  iter {r['iter']:>5}  {r['steps'] / 1e6:>7.0f}M  {r['win']:.3f} [{low:.3f}, {high:.3f}]  "
                  f"{verdict(readings[:k + 1])}")
    stopped = os.path.join(run_dir, "stopped.txt")
    if os.path.exists(stopped):
        with open(stopped) as f:
            print(f"stopped: {f.read().strip()}")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = p.add_subparsers(dest="command", required=True)
    s = sub.add_parser("push")
    s.add_argument("name")
    s.add_argument("--accelerator", default="NvidiaTeslaT4")
    s.add_argument("--session-hours", type=float, default=11.0, help="under Kaggle's 12-hour session, with room to set up")
    s.add_argument("--no-stop", action="store_true", help="let the session run its hours without a plateau stop")
    for command in ("status", "fetch"):
        sub.add_parser(command).add_argument("name")
    r = sub.add_parser("report")
    r.add_argument("name")
    r.add_argument("--key", default=None, help="the panel reading to show (default: the run's --stop-key)")
    argv = sys.argv[1:] if argv is None else argv
    # The trainer's arguments follow `--`, kept apart so the launcher's own options never mix with them.
    split = argv.index("--") if "--" in argv else len(argv)
    args = p.parse_args(argv[:split])
    args.trainer = argv[split + 1:]
    return {"push": push, "status": status, "fetch": fetch, "report": report}[args.command](args)


if __name__ == "__main__":
    sys.exit(main())

"""The script a Kaggle TPU session runs to train (`launch.py train` pushes it with its job prepended
as `JOB`): standard library only, since it starts before the repo is there.

It fetches the repo's GPU package at the job's commit and puts the bundle's files at their paths: the
compact training set (an imitation's extraction, or a recording of a search or of a net's own play)
and each run's `--init` checkpoint, read where Kaggle mounted them, and each run's own folder (an
earlier session's state, to resume it) copied into `/kaggle/working/<name>`, which is what the
session keeps. A set too large to upload again may come from another dataset already on Kaggle
(`external` files, found by name under `/kaggle/input`). Then the steps, each its own process:

1. **Prepare** (`prepare.py`), once, on every host CPU: the set's observations and targets made by
   the PyTorch code, into a folder on the VM's disk (never kept: the next session makes it again).
   The VM's image may have no PyTorch; its CPU build is installed then. Its log is kept in every
   run's folder.
2. **Train** (`train.py`) each run in turn on every TPU chip, from the one prepared set, with its own
   arguments, folder, checkpoints, read and log, and `--require tpu`, so a session Kaggle ran
   without its TPU fails at once rather than training on the CPU. A run is given its share of the
   hours left when it starts, after `FINISH_H` for its own last read and saves and for each run
   after it (`run_hours`), so a run that ends early leaves its time to the ones after it and the
   last always has its share. A run that fails is reported and the next one starts; the session
   fails at the end if any did.

The host's CPUs, memory and disk are printed first: what the prepare step has to work with.
"""

import json
import os
import shutil
import subprocess
import sys
import time

REPO = "https://github.com/BachNewton/Novelty-World"
GPU_PATH = "src/projects/risk/gpu"
INPUT = "/kaggle/input"
WORKING = "/kaggle/working"
CLONE = "/tmp/novelty-world"
PREPARED = "/tmp/prepared"
FINISH_H = 0.25  # a run's last read over every held-out sample, and its saves
TORCH_CPU = ["torch", "--index-url", "https://download.pytorch.org/whl/cpu"]


def run(cmd: list[str], **kw) -> None:
    print("$", " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True, **kw)


def host() -> dict:
    mem = {}
    if os.path.exists("/proc/meminfo"):
        with open("/proc/meminfo") as f:
            for line in f:
                key, _, value = line.partition(":")
                if key in ("MemTotal", "MemAvailable"):
                    mem[key] = round(int(value.split()[0]) / 2 ** 20, 1)
    os.makedirs(PREPARED, exist_ok=True)
    return {"cpus": os.cpu_count(), "memory_gib": mem, "prepared_disk_free_gib": round(shutil.disk_usage(PREPARED).free / 2 ** 30, 1),
            "working_disk_free_gib": round(shutil.disk_usage(WORKING).free / 2 ** 30, 1) if os.path.isdir(WORKING) else None}


def find(input_dir: str, flat: str) -> str:
    """The one file of that name in any dataset Kaggle mounted."""
    found = [os.path.join(root, flat) for root, _, files in os.walk(input_dir) if flat in files]
    assert len(found) == 1, f"{flat}: {len(found)} copies under {input_dir}: {found}"
    return found[0]


def bundle_dir(input_dir: str, bundle_id: str) -> str:
    found = []
    for root, _, files in os.walk(input_dir):
        if "MANIFEST.json" in files:
            with open(os.path.join(root, "MANIFEST.json")) as f:
                if json.load(f)["id"] == bundle_id:
                    found.append(root)
    if not found:
        raise SystemExit(f"the bundle mounted is not this job's ({bundle_id}): push again once the dataset is ready")
    return found[0]


def restore(job: dict, input_dir: str, gpu_dir: str, working: str) -> int:
    """Every file at its path under the GPU folder: each run's own folder's copied into `working`
    (written to as it trains), the rest linked where Kaggle mounted it (only read)."""
    root = bundle_dir(input_dir, job["bundle"])
    with open(os.path.join(root, "MANIFEST.json")) as f:
        manifest = json.load(f)
    owns = {f"runs/tpu/{r['name']}/": r["name"] for r in job["runs"]}
    placed = 0
    for flat, rel in {**manifest["files"], **manifest.get("external", {})}.items():
        source = os.path.join(root, flat) if flat in manifest["files"] else find(input_dir, flat)
        own = next((o for o in owns if rel.startswith(o)), None)
        if own:
            dest = os.path.join(working, owns[own], rel[len(own):])
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            shutil.copyfile(source, dest)
        else:
            dest = os.path.join(gpu_dir, rel)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            os.symlink(source, dest)
        placed += 1
    return placed


def step(name: str, cmd: list[str], cwd: str, log: str, env: dict) -> None:
    """A step's process, its output to the session's log (Kaggle's page shows it live) and to `log`."""
    print(f"$ [{name}]", " ".join(cmd), flush=True)
    with open(log, "a") as out:
        proc = subprocess.Popen(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)
        for line in proc.stdout:
            out.write(line)
            out.flush()
            print(f"[{name}] {line}", end="", flush=True)
        code = proc.wait()
    if code != 0:
        raise SystemExit(f"{name} failed ({code}); its output is in {log}")


def run_hours(left: float, shares: list[float]) -> float:
    """The training hours of the first of the runs still to go (`shares`, its own first): its share
    of the `left` hours, once `FINISH_H` is kept back for each of them."""
    return (left - FINISH_H * len(shares)) * shares[0] / sum(shares)


def train_runs(job: dict, gpu_dir: str, prepared: str, deadline: float, step_=None) -> list[str]:
    """Trains each run in turn on the prepared set; returns the names of those that failed."""
    step_ = step_ or step
    failed = []
    runs = job["runs"]
    for i, r in enumerate(runs):
        name = r["name"]
        hours = run_hours((deadline - time.time()) / 3600, [x["share"] for x in runs[i:]])
        if hours <= 0:
            print(f"[{name}] no time left to train ({hours:.2f} hours)", flush=True)
            failed.append(name)
            continue
        try:
            step_(name, [sys.executable, "-u", "-m", "riskgpu.tpu.train", "--data", prepared, "--dir", f"runs/tpu/{name}",
                         *r["train_args"], "--hours", f"{hours:.3f}", "--require", "tpu"],
                  gpu_dir, os.path.join(WORKING, name, "out.txt"), {**os.environ, "JAX_PLATFORMS": "tpu"})
        except SystemExit as e:
            print(f"[{name}] {e}", flush=True)
            failed.append(name)
    return failed


def main(job: dict) -> int:
    started = time.time()
    deadline = started + job["session_hours"] * 3600
    print(json.dumps({"host": host()}), flush=True)
    if subprocess.run([sys.executable, "-c", "import torch"]).returncode != 0:
        run([sys.executable, "-m", "pip", "install", "-q", *TORCH_CPU])
    run([sys.executable, "-c", "import jax, torch, numpy; print('jax', jax.__version__, 'torch', torch.__version__, "
                               "'numpy', numpy.__version__)"])

    os.makedirs(CLONE, exist_ok=True)
    run(["git", "init", "-q"], cwd=CLONE)
    run(["git", "remote", "add", "origin", REPO], cwd=CLONE)
    run(["git", "sparse-checkout", "set", "--cone", GPU_PATH], cwd=CLONE)
    run(["git", "fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", job["commit"]], cwd=CLONE)
    run(["git", "checkout", "-q", "FETCH_HEAD"], cwd=CLONE)
    gpu_dir = os.path.join(CLONE, GPU_PATH)

    names = [r["name"] for r in job["runs"]]
    for name in names:
        os.makedirs(os.path.join(WORKING, name), exist_ok=True)
    print(f"restored {restore(job, INPUT, gpu_dir, WORKING)} files", flush=True)
    for name in names:
        out = os.path.join(WORKING, name)
        link = os.path.join(gpu_dir, "runs", "tpu", name)
        os.makedirs(os.path.dirname(link), exist_ok=True)
        os.symlink(out, link)
        with open(os.path.join(out, "kaggle-sessions.jsonl"), "a") as f:
            f.write(json.dumps({"commit": job["commit"], "bundle": job["bundle"], "job": job, "host": host()}) + "\n")

    prepared = os.path.join(PREPARED, job["session"])
    log = os.path.join(WORKING, names[0], "prepare.txt")
    step("prepare", [sys.executable, "-u", "-m", "riskgpu.tpu.prepare", job["task"], "--data", job["source"], "--out", prepared,
                     "--workers", str(os.cpu_count()), *job["prepare_args"]], gpu_dir, log, {**os.environ, "JAX_PLATFORMS": "cpu"})
    for name in names[1:]:
        shutil.copyfile(log, os.path.join(WORKING, name, "prepare.txt"))
    failed = train_runs(job, gpu_dir, prepared, deadline)
    if failed:
        raise SystemExit(f"runs that failed: {failed}; each one's output is in its out.txt")
    return 0


if __name__ == "__main__" and "JOB" in globals():
    sys.exit(main(globals()["JOB"]))

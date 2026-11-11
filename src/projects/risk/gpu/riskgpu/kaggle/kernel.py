"""The script a Kaggle session runs (`launch.py` pushes it with its job prepended as `JOB`): standard
library only, since it starts before the repo is there.

It checks the GPUs, fetches the repo's GPU package at the job's commit, puts the bundle's files back
at their paths (each run's own folder in `/kaggle/working`, which is what the session keeps), and
runs each of the job's runs at once, one trainer on each GPU (a T4 session has two), each with its
own arguments and its output appended to its run's `out.txt` and `err.txt`.
"""

import json
import os
import shutil
import subprocess
import sys
import threading

REPO = "https://github.com/BachNewton/Novelty-World"
GPU_PATH = "src/projects/risk/gpu"
INPUT = "/kaggle/input"
WORKING = "/kaggle/working"
CLONE = "/tmp/novelty-world"


def find_bundle(input_dir: str, bundle_id: str) -> str:
    """The folder holding the bundle's MANIFEST.json, wherever Kaggle mounted the dataset."""
    found = []
    for root, _, files in os.walk(input_dir):
        if "MANIFEST.json" in files:
            found.append(root)
    assert found, f"no MANIFEST.json under {input_dir}: was the bundle's dataset attached?"
    for root in found:
        with open(os.path.join(root, "MANIFEST.json")) as f:
            if json.load(f)["id"] == bundle_id:
                return root
    # The dataset's newest version wasn't mounted (still processing when the session started).
    raise SystemExit(f"the bundle mounted is not this job's ({bundle_id}): push again once the dataset is ready")


def restore(bundle_dir: str, gpu_dir: str, working: str, names: list[str]) -> list[str]:
    """Copy every bundled file to its path under the GPU folder, each run's own files into its folder
    in `working`."""
    with open(os.path.join(bundle_dir, "MANIFEST.json")) as f:
        files = json.load(f)["files"]
    placed = []
    for flat, rel in files.items():
        dest = os.path.join(gpu_dir, rel)
        for name in names:
            own = f"runs/selfplay/{name}/"
            if rel.startswith(own):
                dest = os.path.join(working, name, rel[len(own):])
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.copyfile(os.path.join(bundle_dir, flat), dest)
        placed.append(dest)
    return placed


def run(cmd: list[str], **kw) -> None:
    print("$", " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True, **kw)


def train(name: str, args: list[str], device: int, gpu_dir: str, run_dir: str) -> tuple[subprocess.Popen, threading.Thread]:
    """One run's trainer on one GPU, each line of its output to the run's out.txt and to the session's
    log (which Kaggle's page shows live), prefixed with the run's name."""
    cmd = [sys.executable, "-u", "-m", "riskgpu.selfplay.ppo", "--name", name, "--resume", *args]
    print(f"$ [GPU {device}]", " ".join(cmd), flush=True)
    err = open(os.path.join(run_dir, "err.txt"), "a")
    trainer = subprocess.Popen(cmd, cwd=gpu_dir, stdout=subprocess.PIPE, stderr=err, text=True,
                               env={**os.environ, "CUDA_VISIBLE_DEVICES": str(device)})

    def pump() -> None:
        with open(os.path.join(run_dir, "out.txt"), "a") as out:
            for line in trainer.stdout:
                out.write(line)
                out.flush()
                print(f"[{name}] {line}", end="", flush=True)
        err.close()

    pumping = threading.Thread(target=pump)
    pumping.start()
    return trainer, pumping


def main(job: dict) -> int:
    run(["nvidia-smi"])
    import torch
    assert torch.cuda.is_available(), "no CUDA device in this session: was it pushed with a GPU?"
    print(f"torch {torch.__version__}, {torch.cuda.device_count()} x {torch.cuda.get_device_name(0)}, "
          f"capability {torch.cuda.get_device_capability(0)}", flush=True)
    runs = job["runs"]
    assert len(runs) <= torch.cuda.device_count(), f"{len(runs)} runs need a GPU each; the session has {torch.cuda.device_count()}"

    os.makedirs(CLONE, exist_ok=True)
    run(["git", "init", "-q"], cwd=CLONE)
    run(["git", "remote", "add", "origin", REPO], cwd=CLONE)
    run(["git", "sparse-checkout", "set", "--cone", GPU_PATH], cwd=CLONE)
    run(["git", "fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", job["commit"]], cwd=CLONE)
    run(["git", "checkout", "-q", "FETCH_HEAD"], cwd=CLONE)
    gpu_dir = os.path.join(CLONE, GPU_PATH)

    names = [r["name"] for r in runs]
    for name in names:
        os.makedirs(os.path.join(WORKING, name), exist_ok=True)
    placed = restore(find_bundle(INPUT, job["bundle"]), gpu_dir, WORKING, names)
    print(f"restored {len(placed)} files", flush=True)

    trainers = []
    for device, r in enumerate(runs):
        run_dir = os.path.join(WORKING, r["name"])
        link = os.path.join(gpu_dir, "runs", "selfplay", r["name"])
        os.makedirs(os.path.dirname(link), exist_ok=True)
        os.symlink(run_dir, link)
        with open(os.path.join(run_dir, "kaggle-sessions.jsonl"), "a") as f:
            f.write(json.dumps({"commit": job["commit"], "bundle": job["bundle"],
                                "device": torch.cuda.get_device_name(device), "torch": torch.__version__,
                                "args": r["args"], "beside": [n for n in names if n != r["name"]]}) + "\n")
        trainers.append((r["name"], train(r["name"], r["args"], device, gpu_dir, run_dir)))

    failed = []
    for name, (trainer, pumping) in trainers:
        code = trainer.wait()
        pumping.join()
        if code != 0:
            with open(os.path.join(WORKING, name, "err.txt")) as f:
                print(f"[{name}] " + f.read()[-4000:], file=sys.stderr, flush=True)
            failed.append(f"{name} ({code})")
    if failed:
        raise SystemExit(f"trainers failed: {', '.join(failed)}; see each run's err.txt")
    return 0


if __name__ == "__main__" and "JOB" in globals():
    sys.exit(main(globals()["JOB"]))

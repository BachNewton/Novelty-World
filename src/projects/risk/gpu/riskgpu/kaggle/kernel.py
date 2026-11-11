"""The script a Kaggle session runs (`launch.py` pushes it with its job prepended as `JOB`): standard
library only, since it starts before the repo is there.

It checks the GPU, fetches the repo's GPU package at the job's commit, puts the bundle's files back
at their paths (the run's own folder in `/kaggle/working`, which is what the session keeps), and runs
the trainer with the job's arguments, its output appended to the run's `out.txt` and `err.txt`.
"""

import json
import os
import shutil
import subprocess
import sys

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


def restore(bundle_dir: str, gpu_dir: str, run_dir: str, name: str) -> list[str]:
    """Copy every bundled file to its path under the GPU folder, the run's own files into `run_dir`."""
    with open(os.path.join(bundle_dir, "MANIFEST.json")) as f:
        files = json.load(f)["files"]
    own = f"runs/selfplay/{name}/"
    placed = []
    for flat, rel in files.items():
        dest = os.path.join(run_dir, rel[len(own):]) if rel.startswith(own) else os.path.join(gpu_dir, rel)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.copyfile(os.path.join(bundle_dir, flat), dest)
        placed.append(dest)
    return placed


def run(cmd: list[str], **kw) -> None:
    print("$", " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True, **kw)


def main(job: dict) -> int:
    run(["nvidia-smi"])
    import torch
    assert torch.cuda.is_available(), "no CUDA device in this session: was it pushed with a GPU?"
    print(f"torch {torch.__version__}, {torch.cuda.get_device_name(0)}, capability {torch.cuda.get_device_capability(0)}",
          flush=True)

    os.makedirs(CLONE, exist_ok=True)
    run(["git", "init", "-q"], cwd=CLONE)
    run(["git", "remote", "add", "origin", REPO], cwd=CLONE)
    run(["git", "sparse-checkout", "set", "--cone", GPU_PATH], cwd=CLONE)
    run(["git", "fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", job["commit"]], cwd=CLONE)
    run(["git", "checkout", "-q", "FETCH_HEAD"], cwd=CLONE)
    gpu_dir = os.path.join(CLONE, GPU_PATH)

    name = job["name"]
    run_dir = os.path.join(WORKING, name)
    os.makedirs(run_dir, exist_ok=True)
    placed = restore(find_bundle(INPUT, job["bundle"]), gpu_dir, run_dir, name)
    print(f"restored {len(placed)} files", flush=True)
    link = os.path.join(gpu_dir, "runs", "selfplay", name)
    os.makedirs(os.path.dirname(link), exist_ok=True)
    os.symlink(run_dir, link)

    with open(os.path.join(run_dir, "kaggle-sessions.jsonl"), "a") as f:
        f.write(json.dumps({"commit": job["commit"], "bundle": job["bundle"], "device": torch.cuda.get_device_name(0),
                            "torch": torch.__version__, "args": job["args"]}) + "\n")
    cmd = [sys.executable, "-u", "-m", "riskgpu.selfplay.ppo", "--name", name, "--resume", *job["args"]]
    print("$", " ".join(cmd), flush=True)
    # Each line goes to the run's out.txt and to the session's log, which Kaggle's page shows live.
    with open(os.path.join(run_dir, "out.txt"), "a") as out, open(os.path.join(run_dir, "err.txt"), "a") as err:
        trainer = subprocess.Popen(cmd, cwd=gpu_dir, stdout=subprocess.PIPE, stderr=err, text=True)
        for line in trainer.stdout:
            out.write(line)
            out.flush()
            print(line, end="", flush=True)
        code = trainer.wait()
    if code != 0:
        with open(os.path.join(run_dir, "err.txt")) as f:
            print(f.read()[-4000:], file=sys.stderr, flush=True)
        raise SystemExit(f"the trainer failed ({code}); see {name}/err.txt")
    return 0


if __name__ == "__main__" and "JOB" in globals():
    sys.exit(main(globals()["JOB"]))

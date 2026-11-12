"""The script a Kaggle session runs (`launch.py` pushes it with its job prepended as `JOB`): standard
library only, since it starts before the repo is there.

It checks the GPUs, fetches the repo's GPU package at the job's commit, and puts the bundle's files
back at their paths (each run's own folder in `/kaggle/working`, which is what the session keeps).
Then every GPU (a T4 session has two) works through one shared queue, so none sits idle while the
session's quota runs: first the job's training runs, in order, and after each run stops (its plateau,
its iterations or the session's hours) a sharp reading of it, the panel at `SHARP_GAMES` a check on
the checkpoints of its last three headline readings, which tells a flat run from one climbing too
slowly for the training panel's intervals to resolve. A task's output goes to its run's `out.txt` and
`err.txt` and to the session's log, which Kaggle's page shows live, each line prefixed with its task.

The session's last hours (the job's `read_hours`, sized from a reading's measured cost) are kept for
the readings: a training run is given the hours up to them, and the readings are taken newest first
across every run, so what the hours can't fit is the oldest checkpoints' readings. No task starts
after the session's hours are up, and a reading still going half an hour past them is stopped, so the
session ends inside Kaggle's own limit with its output kept. A reading stopped there is a reading the
plan didn't fit, not a failure: it is reported with the tasks left, and the session ends cleanly.
"""

import json
import os
import shutil
import subprocess
import sys
import threading
import time

REPO = "https://github.com/BachNewton/Novelty-World"
GPU_PATH = "src/projects/risk/gpu"
INPUT = "/kaggle/input"
WORKING = "/kaggle/working"
CLONE = "/tmp/novelty-world"
SHARP_GAMES = 4096  # a reading's 95% interval about ±1.5 points, against ±5 at the training panel's 512
GRACE_S = 1800  # how long past the session's hours a reading may run before it is stopped


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


def last_value(args: list[str], flag: str) -> str | None:
    if flag not in args:
        return None
    return args[len(args) - 1 - args[::-1].index(flag) + 1]


def sharp_readings(name: str, args: list[str], run_dir: str) -> list[dict]:
    """The reading tasks for a stopped run: the checkpoints of its last three headline readings, the
    window its verdict is read on, newest first, each read once."""
    key = last_value(args, "--stop-key")
    if not key or not os.path.exists(os.path.join(run_dir, "log.jsonl")):
        return []
    iters = []
    with open(os.path.join(run_dir, "log.jsonl")) as f:
        for line in f:
            record = json.loads(line)
            if key in record.get("panel", {}):
                iters.append(record["iter"])
    tasks = []
    for rank, it in enumerate(reversed(list(dict.fromkeys(iters))[-3:])):
        out = os.path.join(run_dir, f"panel-{it}-g{SHARP_GAMES}.json")
        if os.path.exists(os.path.join(run_dir, f"snap-{it}.pt")) and not os.path.exists(out):
            tasks.append({"kind": "read", "name": name, "iter": it, "rank": rank, "bf16": "--no-bf16" not in args})
    return tasks


def run(cmd: list[str], **kw) -> None:
    print("$", " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True, **kw)


class Session:
    def __init__(self, job: dict, gpu_dir: str, gpus: int, deadline: float):
        self.job, self.gpu_dir, self.gpus, self.deadline = job, gpu_dir, gpus, deadline
        self.train_deadline = deadline - job["read_hours"] * 3600
        self.queue = [{"kind": "train", **r} for r in job["runs"]]
        self.lock = threading.Lock()
        self.failed: list[str] = []
        self.cut: list[str] = []

    def next_task(self) -> dict | None:
        with self.lock:
            now = time.time()
            # A run that couldn't start before the readings' hours waits for the next session.
            self.queue = [t for t in self.queue if t["kind"] == "read" or now < self.train_deadline]
            if not self.queue or now > self.deadline:
                return None
            return self.queue.pop(0)

    def command(self, task: dict) -> list[str]:
        name = task["name"]
        if task["kind"] == "train":
            # The hours left before the readings' share when the run starts, which the trainer stops itself at.
            hours = max(0.0, (self.train_deadline - time.time()) / 3600)
            return [sys.executable, "-u", "-m", "riskgpu.selfplay.ppo", "--name", name, "--resume", *task["args"],
                    "--session-hours", f"{hours:.3f}"]
        it = task["iter"]
        return [sys.executable, "-u", "-m", "riskgpu.selfplay.panel", "--ckpt", f"runs/selfplay/{name}/snap-{it}.pt",
                "--games", str(SHARP_GAMES), "--out", f"runs/selfplay/{name}/panel-{it}-g{SHARP_GAMES}.json",
                "--bf16" if task["bf16"] else "--no-bf16"]

    def perform(self, task: dict, device: int) -> None:
        name = task["name"]
        run_dir = os.path.join(WORKING, name)
        label = f"{name}" if task["kind"] == "train" else f"{name} read {task['iter']}"
        cmd = self.command(task)
        print(f"$ [GPU {device}] [{label}]", " ".join(cmd), flush=True)
        with open(os.path.join(run_dir, "out.txt"), "a") as out, open(os.path.join(run_dir, "err.txt"), "a") as err:
            proc = subprocess.Popen(cmd, cwd=self.gpu_dir, stdout=subprocess.PIPE, stderr=err, text=True,
                                    env={**os.environ, "CUDA_VISIBLE_DEVICES": str(device)})
            if task["kind"] == "read":
                # The trainer stops itself at the session's hours; a reading is stopped from here.
                stopper = threading.Timer(max(0.0, self.deadline + GRACE_S - time.time()), proc.kill)
                stopper.start()
            for line in proc.stdout:
                out.write(line)
                out.flush()
                print(f"[{label}] {line}", end="", flush=True)
            code = proc.wait()
            if task["kind"] == "read":
                stopper.cancel()
        if task["kind"] == "read" and code != 0 and time.time() > self.deadline + GRACE_S:
            with self.lock:
                self.cut.append(label)
        elif code != 0:
            with open(os.path.join(run_dir, "err.txt")) as f:
                print(f"[{label}] failed ({code}):\n" + f.read()[-4000:], file=sys.stderr, flush=True)
            with self.lock:
                self.failed.append(f"{label} ({code})")
        if task["kind"] == "train" and code == 0:
            with self.lock:
                # Newest checkpoints first across every run; sorted() keeps runs in order within a rank.
                self.queue = sorted(self.queue + sharp_readings(name, task["args"], run_dir),
                                    key=lambda t: t.get("rank", -1))

    def worker(self, device: int) -> None:
        while (task := self.next_task()) is not None:
            self.perform(task, device)

    def run(self) -> None:
        workers = [threading.Thread(target=self.worker, args=(d,)) for d in range(self.gpus)]
        for w in workers:
            w.start()
        for w in workers:
            w.join()
        with self.lock:
            left = self.cut + [f"{t['name']} {t['kind']}" + (f" {t['iter']}" if "iter" in t else "") for t in self.queue]
        if left:
            print(f"the session's hours ran out with tasks left: {left}", flush=True)
        if self.failed:
            raise SystemExit(f"tasks failed: {', '.join(self.failed)}; see each run's err.txt")


def main(job: dict) -> int:
    started = time.time()
    run(["nvidia-smi"])
    import torch
    assert torch.cuda.is_available(), "no CUDA device in this session: was it pushed with a GPU?"
    gpus = torch.cuda.device_count()
    print(f"torch {torch.__version__}, {gpus} x {torch.cuda.get_device_name(0)}, "
          f"capability {torch.cuda.get_device_capability(0)}", flush=True)

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
    placed = restore(find_bundle(INPUT, job["bundle"]), gpu_dir, WORKING, names)
    print(f"restored {len(placed)} files", flush=True)
    for name in names:
        link = os.path.join(gpu_dir, "runs", "selfplay", name)
        os.makedirs(os.path.dirname(link), exist_ok=True)
        os.symlink(os.path.join(WORKING, name), link)
        with open(os.path.join(WORKING, name, "kaggle-sessions.jsonl"), "a") as f:
            f.write(json.dumps({"commit": job["commit"], "bundle": job["bundle"], "device": torch.cuda.get_device_name(0),
                                "gpus": gpus, "torch": torch.__version__, "runs": job["runs"]}) + "\n")

    Session(job, gpu_dir, gpus, started + job["session_hours"] * 3600).run()
    return 0


if __name__ == "__main__" and "JOB" in globals():
    sys.exit(main(globals()["JOB"]))

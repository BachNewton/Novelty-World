"""A run's container on Modal (`launch.py` pushes it, with the job it is given).

The image holds the GPU package as `launch.py` staged it (HEAD's code and committed data), with the
runs Volume and the data Volume mounted beside it. The container links the job's inputs into the
package's folder from the data Volume and the run's own folder to its folder on the runs Volume, so
the trainers read and write the paths they always do, and everything the run writes is on the Volume
whether the container ends, fails or is stopped. Then the run trains and is read as a Kaggle
session's runs are (`kaggle/kernel.py`'s `Session`, on one GPU): training given the hours up to the
readings' share, the readings after, any still going at the deadline stopped. Each start is recorded
in the run folder's `modal-sessions.jsonl`; a container Modal restarts (a preempted one) keeps its first
start's deadline, a PPO run resuming from its last checkpoint and an imitation, which can't resume,
failing.

This module is registered at import, as Modal requires: the container imports it by its name from
the staged package, so it must never be pushed from a module the container can't import.
"""

import json
import os
import subprocess
import time

import modal

from ..kaggle.kernel import Session, run_folder, trainer_of
from .launch import CORES, DATA_VOLUME, MAX_HOURS, MEMORY_GIB, RUNS_VOLUME, SESSIONS, deadline, first_start

LOCAL_GPU = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CODE = os.path.join(LOCAL_GPU, "runs", "modal", "code")
GPU_DIR = "/root/gpu"
RUNS_MOUNT, DATA_MOUNT = "/runs-volume", "/data-volume"

runs_volume = modal.Volume.from_name(RUNS_VOLUME, create_if_missing=True)
data_volume = modal.Volume.from_name(DATA_VOLUME, create_if_missing=True)
image = (modal.Image.debian_slim(python_version="3.12").pip_install("torch==2.11.0", "numpy")
         .env({"PYTHONPATH": GPU_DIR})
         .add_local_dir(CODE, GPU_DIR))
app = modal.App("risk-train", image=image, include_source=False)


@app.function(gpu="A10", cpu=(CORES, CORES), memory=MEMORY_GIB["ppo"] * 1024, timeout=int(MAX_HOURS * 3600),
              retries=0, volumes={RUNS_MOUNT: runs_volume, DATA_MOUNT: data_volume})
def train(job: dict) -> dict:
    started = time.time()
    run = job["run"]
    folder = run_folder(run)
    own = os.path.join(RUNS_MOUNT, *folder.split("/"))
    os.makedirs(own, exist_ok=True)
    sessions = os.path.join(own, SESSIONS)
    first = first_start(sessions, job["push"])
    if first is not None and trainer_of(run) == "imitate":
        raise RuntimeError(f"{run['name']}'s container was restarted, and an imitation can't resume: push it again")

    subprocess.run(["nvidia-smi"], check=True)
    import torch
    assert torch.cuda.is_available(), "no CUDA device in this container"
    print(f"torch {torch.__version__}, {torch.cuda.get_device_name(0)}, commit {job['commit']}", flush=True)
    for rel in job["inputs"]:
        link = os.path.join(GPU_DIR, *rel.split("/"))
        os.makedirs(os.path.dirname(link), exist_ok=True)
        os.symlink(os.path.join(DATA_MOUNT, *rel.split("/")), link)
    link = os.path.join(GPU_DIR, *folder.split("/"))
    os.makedirs(os.path.dirname(link), exist_ok=True)
    os.symlink(own, link)
    with open(sessions, "a") as f:
        f.write(json.dumps({"push": job["push"], "commit": job["commit"], "started": started, "gpu": job["gpu"],
                            "device": torch.cuda.get_device_name(0), "torch": torch.__version__,
                            "restart": first is not None, "run": run}) + "\n")
    runs_volume.commit()

    session = Session({"runs": [run], "read_hours": job["read_hours"], "sharp_games": job["sharp_games"]},
                      GPU_DIR, gpus=1, deadline=deadline(first or started, job["hours"]),
                      working=os.path.dirname(own), grace=0)
    try:
        session.run()
    except SystemExit as e:
        # The session's own loud failure, raised as an error so Modal records the call as failed.
        raise RuntimeError(str(e)) from None
    finally:
        runs_volume.commit()
    return {"cut": session.cut, "left": [t["name"] for t in session.queue]}

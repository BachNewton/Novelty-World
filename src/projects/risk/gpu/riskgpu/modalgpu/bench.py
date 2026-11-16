"""Times the PPO trainer on Modal's GPUs (`docs/modal.md`), to choose which gives the most training per
dollar of the free monthly credit:

    modal run riskgpu/modalgpu/bench.py [--gpus T4,L4,A10,A100-40GB,H100] [--iters 4]

run from `src/projects/risk/gpu/`. Every GPU runs the same few iterations of stage 2's recipe at
once, each in its own container, from s2-2-150 with the anchors and GD's personas in the league,
in bf16 where the GPU has it (full precision on a T4, as on Kaggle), with no evaluation. The first
iteration captures the step as a CUDA graph, so the rates are read from the iterations after it.
A fresh run's update trains on fewer of the learner's decisions than a running one's (its games
haven't finished yet), and its time grows with them, so the update is read per decision and
scaled to a running iteration's `STEADY_SAMPLES`. Each reports its rollout's decisions a second,
the update's seconds per 100,000 decisions, the projected seconds of a running iteration, and its
cost at Modal's rates for the GPU and the cores and memory it held.
"""

import json
import os
import subprocess

import modal

GPU_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REMOTE = "/root/gpu"
CORES = 4.0
MEMORY_MIB = 16384
# Modal's published rates, dollars a second: each GPU, and a physical core and a GiB of memory.
GPU_RATE = {"T4": 0.000164, "L4": 0.000222, "A10": 0.000306, "A100-40GB": 0.000583, "A100-80GB": 0.000694,
            "H100": 0.001097}
CORE_RATE = 0.0000131
GIB_RATE = 0.00000222
FULL_PRECISION = {"T4"}
# The learner's decisions a running iteration of this recipe trains on (k1, iterations 260 to 275).
STEADY_SAMPLES = 523_592  # no native bfloat16
TRAINER_ARGS = ["--width", "128", "--layers", "4", "--batch", "16384", "--lr", "1e-4", "--minibatch", "32768",
                "--chunk", "1024", "--epochs", "2", "--lam", "0.95", "--gd-share", "0.35", "--self-share", "0.15",
                "--snapshot-share", "0.35", "--snapshots", "6", "--snapshot-every", "25", "--league-pick", "results",
                "--league-fixed", "runs/imitate/imit-1/best.pt,runs/selfplay/sw128b/snap-450.pt",
                "--eval", "greedy@3", "--eval-games", "256", "--ladder-games", "0", "--panel", "0",
                "--eval-every", "1000", "--ckpt-every", "1000", "--init", "runs/selfplay/s2-2/snap-150.pt", "--seed", "2"]
# What the trainer reads that git doesn't carry: the blitz tables and the checkpoints the arguments name.
DATA_FILES = ["data/blitz-256.bin", "data/blitz-256.json", "runs/imitate/imit-1/best.pt",
              "runs/selfplay/sw128b/snap-450.pt", "runs/selfplay/s2-2/snap-150.pt"]

image = modal.Image.debian_slim(python_version="3.12").pip_install("torch==2.11.0", "numpy")
image = image.add_local_dir(os.path.join(GPU_DIR, "riskgpu"), f"{REMOTE}/riskgpu", ignore=["**/__pycache__"])
image = image.add_local_dir(os.path.join(GPU_DIR, "data"), f"{REMOTE}/data", ignore=["**/__pycache__"])
for rel in DATA_FILES[2:]:
    image = image.add_local_file(os.path.join(GPU_DIR, rel), f"{REMOTE}/{rel}")

app = modal.App("risk-gpu-bench", image=image)


@app.function(gpu="T4", cpu=CORES, memory=MEMORY_MIB, timeout=3600, max_containers=1)
def bench(gpu: str, iters: int) -> dict:
    precision = ["--no-bf16"] if gpu in FULL_PRECISION else []
    cmd = ["python", "-u", "-m", "riskgpu.selfplay.ppo", "--name", "bench", "--iters", str(iters), *TRAINER_ARGS, *precision]
    subprocess.run(cmd, cwd=REMOTE, check=True)
    with open(f"{REMOTE}/runs/selfplay/bench/log.jsonl") as f:
        rows = [json.loads(line) for line in f][1:]  # the first iteration captures the graph
    rollout = sum(r["steps_per_s"] for r in rows) / len(rows)
    rollout_s = sum(r["rollout_s"] for r in rows) / len(rows)
    per_sample = sum(r["update_s"] / r["samples"] for r in rows) / len(rows)
    iteration = rollout_s + per_sample * STEADY_SAMPLES
    import torch
    rate = GPU_RATE[gpu] + CORES * CORE_RATE + MEMORY_MIB / 1024 * GIB_RATE
    return {"gpu": gpu, "device": torch.cuda.get_device_name(0), "bf16": not precision, "iterations": len(rows),
            "rollout_per_s": round(rollout), "update_s_per_100k": round(per_sample * 1e5, 1),
            "iteration_s": round(iteration, 1),
            "dollars_per_iteration": round(iteration * rate, 4), "iterations_per_30": round(30 / (iteration * rate))}


@app.local_entrypoint()
def main(gpus: str = "T4,L4,A10,A100-40GB,H100", iters: int = 4):
    names = gpus.split(",")
    unknown = [g for g in names if g not in GPU_RATE]
    assert not unknown, f"no rate for {unknown}: known {sorted(GPU_RATE)}"
    # One function, each call on its own GPU.
    calls = [bench.with_options(gpu=g).spawn(g, iters) for g in names]
    for call in calls:
        print(json.dumps(call.get()))

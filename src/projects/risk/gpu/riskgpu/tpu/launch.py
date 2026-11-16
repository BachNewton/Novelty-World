"""The accelerator probe (`bench.py`) as a Kaggle session, pushed and read from here:

    python -m riskgpu.tpu.launch push <name> [--accelerator TpuV5E8] [--session-hours 3] [--dry-run] [-- <bench args>]
    python -m riskgpu.tpu.launch status <name>
    python -m riskgpu.tpu.launch fetch <name>

run from `src/projects/risk/gpu/` (`ideas/tpu.md`). `push` sends `bench.py` alone as a private script,
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
# Kaggle's identifiers, the quota each draws on, and its session limit in hours. TpuV5E8 is Kaggle's
# default TPU; TpuV6E8 is listed by the CLI but documented as possibly limited to some competitions,
# and a public probe pushed on it got a CPU machine, which is why the probe fails without its device.
ACCELERATORS = {"TpuV5E8": ("TPU", 9.0), "TpuV6E8": ("TPU", 9.0), "NvidiaTeslaT4": ("GPU", 12.0)}
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


def fetch(args: argparse.Namespace) -> int:
    job = pushed(args.name)
    state = kaggle("kernels", "status", job["kernel"]).stdout.strip()
    print(state)
    assert "running" not in state.lower() and "queued" not in state.lower(), "the session hasn't ended yet"
    folder = os.path.join(RUNS, args.name)
    os.makedirs(STAGING, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=STAGING) as tmp:
        kaggle("kernels", "output", job["kernel"], "-p", tmp, "-o", "-q")
        for root, _, files in os.walk(tmp):
            for f in files:
                shutil.copyfile(os.path.join(root, f), os.path.join(folder, f))
    path = os.path.join(folder, OUTPUT)
    assert os.path.exists(path), f"the session wrote no {OUTPUT}; its log and partial phases are in runs/tpu/{args.name}"
    with open(path) as f:
        summarize(json.load(f))
    return 0


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
    for name in ("status", "fetch"):
        sub.add_parser(name).add_argument("name")
    argv = sys.argv[1:] if argv is None else argv
    # The probe's own arguments follow `--`.
    split = argv.index("--") if "--" in argv else len(argv)
    args = p.parse_args(argv[:split])
    args.bench = argv[split + 1:]
    return {"push": push, "status": status, "fetch": fetch}[args.command](args)


if __name__ == "__main__":
    sys.exit(main())

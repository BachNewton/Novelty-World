#!/usr/bin/env bash
# The spot machine: a friend's GPU computer we may use while it is free (infra/spot/README.md).
# Run from the repo root: npm run spot -- <command> [args]
#
#   probe                       what the machine is (read-only)
#   push [<runs path>...]       the Risk GPU code at HEAD, the blitz table and checkpoints
#   setup                       Python, PyTorch and the test tools, in a folder of their own
#   test                        the GPU package's tests, on the machine's GPU
#   train <name> [ppo args...]  start a training run that outlives the connection
#   resume <name>               start a run again from its last checkpoint
#   status [<name>]             the GPU, and a run's process and latest iteration
#   stop <name>                 stop a run (it resumes from its last checkpoint)
#   pull <name>                 copy a run's folder home, into gpu/runs/selfplay/<name>
#   shell                       an interactive shell there
#
# SPOT_TARGET=wsl runs every command against the Ubuntu-24.04 WSL distro instead: the rehearsal,
# with no GPU, where setup and test take --cpu. Nothing ever falls back to the CPU on its own.
set -euo pipefail

REPO="$(git rev-parse --show-toplevel)"
GPU_LOCAL="src/projects/risk/gpu"
ROOT='$HOME/novelty'            # expanded on the remote side
GPU_REMOTE="$ROOT/risk-gpu"
VENV="$ROOT/venv"
TORCH="torch==2.5.1"            # the laptop's versions: the engine is held bit-exact across machines
PINS="numpy==1.26.4 pytest==9.0.2"
DEFAULT_CKPTS="runs/imitate/imit-1/best.pt runs/selfplay/sw128b/snap-450.pt runs/selfplay/s2-2/snap-150.pt"

# Runs a bash script on the machine. The script travels base64-encoded: wsl.exe drops the double
# quotes inside its arguments and SSH hands them to whatever login shell the machine has, so no
# quoting is trusted to survive the trip. It runs from a process substitution rather than stdin,
# which stays free for a tar stream.
remote() {
  local encoded; encoded="$(printf '%s' "$1" | base64 -w0)"
  local run="source <(echo $encoded | base64 -d)"
  if [[ "${SPOT_TARGET:-}" == "wsl" ]]; then
    wsl.exe -d Ubuntu-24.04 -- bash -c "$run"
  else
    ssh -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 spot "bash -c '$run'"
  fi
}

die() { echo "spot: $*" >&2; exit 1; }

need_cpu_flag() {
  # --cpu only exists for the rehearsal on a machine with no NVIDIA GPU.
  [[ "${1:-}" == "--cpu" ]] && { [[ "${SPOT_TARGET:-}" == "wsl" ]] || die "--cpu is for the WSL rehearsal only"; echo cpu; return; }
  echo cuda
}

cmd_probe() {
  remote '
    section() { printf "\n== %s\n" "$1"; }
    section who;     echo "user $(id -un) (uid $(id -u)), home $HOME"; command -v sudo >/dev/null && echo "sudo present" || echo "no sudo"
    section system;  uname -srm; [ -r /etc/os-release ] && . /etc/os-release && echo "$PRETTY_NAME"
    section container
    if [ -f /.dockerenv ] || grep -qaE "docker|containerd|kubepods|lxc" /proc/1/cgroup 2>/dev/null; then echo "inside a container"; else echo "no container marks found"; fi
    echo "pid 1: $(tr "\0" " " < /proc/1/cmdline 2>/dev/null | cut -c1-80)"
    section cpu;     nproc; grep -m1 "model name" /proc/cpuinfo | cut -d: -f2- | sed "s/^ //"
    section memory;  free -g | sed -n 1,2p
    section disk;    df -h "$HOME" /tmp 2>/dev/null
    section gpu
    if command -v nvidia-smi >/dev/null; then
      nvidia-smi --query-gpu=name,memory.total,memory.used,utilization.gpu,driver_version --format=csv
      nvidia-smi | grep -m1 "CUDA Version" | sed "s/.*\(CUDA Version: [0-9.]*\).*/\1/"
      echo "processes on the GPU:"; nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader || true
    else echo "no nvidia-smi"; fi
    section tools;   for t in python3 pip3 curl wget tar tmux screen git uv; do printf "%-8s %s\n" "$t" "$(command -v $t || echo -)"; done
    python3 --version 2>/dev/null || true
    section ours;    ls -d '"$ROOT"'/* 2>/dev/null || echo "nothing of ours yet"
  '
}

cmd_push() {
  local ckpts=("$@")
  [[ ${#ckpts[@]} -eq 0 ]] && read -r -a ckpts <<< "$DEFAULT_CKPTS"
  cd "$REPO/$GPU_LOCAL"
  for f in data/blitz-256.bin data/blitz-256.json "${ckpts[@]}"; do [[ -f "$f" ]] || die "missing locally: $GPU_LOCAL/$f"; done
  [[ -z "$(git status --porcelain -- .)" ]] || echo "spot: note: $GPU_LOCAL has uncommitted changes; the push sends HEAD's code" >&2
  echo "code at $(git rev-parse --short HEAD), the blitz table, and: ${ckpts[*]}"
  # The code is replaced whole, so a file deleted here is deleted there; runs/ and data/ are kept.
  git -C "$REPO" archive --format=tar HEAD:"$GPU_LOCAL" \
    | remote "set -e; mkdir -p $GPU_REMOTE && cd $GPU_REMOTE && rm -rf riskgpu tests && tar -x && test -f riskgpu/selfplay/ppo.py"
  tar -c data/blitz-256.bin data/blitz-256.json "${ckpts[@]}" | remote "cd $GPU_REMOTE && tar -x"
  git rev-parse HEAD | remote "cat > $GPU_REMOTE/COMMIT"
  echo "pushed"
}

cmd_setup() {
  local device; device="$(need_cpu_flag "${1:-}")"
  local index=""
  [[ "$device" == "cpu" ]] && index="--index-url https://download.pytorch.org/whl/cpu"
  remote "
    set -e
    mkdir -p $ROOT
    # uv goes into our own folder, and its installer is told not to edit the shell's startup files.
    export UV_INSTALL_DIR=$ROOT/bin UV_NO_MODIFY_PATH=1 UV_CACHE_DIR=$ROOT/cache
    if [ ! -x $ROOT/bin/uv ]; then
      if command -v curl >/dev/null; then curl -LsSf https://astral.sh/uv/install.sh | sh
      else wget -qO- https://astral.sh/uv/install.sh | sh; fi
    fi
    export PATH=$ROOT/bin:\$PATH
    [ -d $VENV ] || uv venv --python 3.12 $VENV
    uv pip install --python $VENV/bin/python $index $TORCH
    uv pip install --python $VENV/bin/python $PINS
    $VENV/bin/python -c 'import sys,torch,numpy; print(\"python\", sys.version.split()[0], \"torch\", torch.__version__, \"cuda\", torch.version.cuda, \"numpy\", numpy.__version__)' | tee $ROOT/versions.txt
  "
  if [[ "$device" == "cuda" ]]; then check_cuda; fi
}

check_cuda() {
  remote "$VENV/bin/python -c 'import torch; assert torch.cuda.is_available(), \"PyTorch sees no CUDA device\"; print(\"cuda device:\", torch.cuda.get_device_name(0), round(torch.cuda.get_device_properties(0).total_memory/2**30, 1), \"GiB\")'"
}

cmd_test() {
  local device; device="$(need_cpu_flag "${1:-}")"
  [[ "$device" == "cuda" ]] && check_cuda
  remote "cd $GPU_REMOTE && $VENV/bin/python -m pytest tests -q -p no:cacheprovider"
}

# A run is one detached process group, its command kept in its folder so `resume` can repeat it.
launch() {
  local name="$1"; shift
  local dir="$GPU_REMOTE/runs/selfplay/$name"
  local line; line="$(printf '%q ' "$@")"
  remote "
    set -e
    mkdir -p $dir
    if [ -f $dir/pid ] && kill -0 \$(cat $dir/pid) 2>/dev/null; then echo 'spot: $name is already running (pid '\$(cat $dir/pid)')' >&2; exit 1; fi
    echo $(printf '%q' "$line") > $dir/cmd.txt
    cd $GPU_REMOTE
    echo \"== \$(date -Is) start: \$(cat $dir/cmd.txt)\" >> $dir/spot.log
    setsid nohup $VENV/bin/python -m riskgpu.selfplay.ppo $line >> $dir/out.txt 2>> $dir/err.txt < /dev/null &
    echo \$! > $dir/pid
    echo \"started $name, pid \$(cat $dir/pid)\"
  "
}

cmd_train() {
  local name="${1:-}"; [[ -n "$name" ]] || die "train needs a run name"; shift
  check_cuda
  launch "$name" --name "$name" "$@"
}

cmd_resume() {
  local name="${1:-}"; [[ -n "$name" ]] || die "resume needs a run name"
  check_cuda
  local saved
  saved="$(remote "cat $GPU_REMOTE/runs/selfplay/$name/cmd.txt")" || die "no saved command for $name"
  local args; eval "args=($saved)"
  [[ " ${args[*]} " == *" --resume "* ]] || args+=(--resume)
  launch "$name" "${args[@]}"
}

cmd_status() {
  local name="${1:-}"
  remote "
    nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total --format=csv,noheader 2>/dev/null || echo 'GPU: nvidia-smi reads none'
    for d in $GPU_REMOTE/runs/selfplay/${name:-*}/; do
      [ -f \$d/cmd.txt ] || continue
      n=\$(basename \$d)
      if [ -f \$d/pid ] && kill -0 \$(cat \$d/pid) 2>/dev/null; then state=running; else state=stopped; fi
      echo \"\$n: \$state\"
      [ -f \$d/log.jsonl ] && tail -n 1 \$d/log.jsonl | cut -c1-200
      [ -s \$d/err.txt ] && { echo '  stderr, last lines:'; tail -n 3 \$d/err.txt | sed 's/^/    /'; }
    done
  "
}

cmd_stop() {
  local name="${1:-}"; [[ -n "$name" ]] || die "stop needs a run name"
  remote "
    d=$GPU_REMOTE/runs/selfplay/$name
    if [ -f \$d/pid ] && kill -0 \$(cat \$d/pid) 2>/dev/null; then kill -TERM -\$(cat \$d/pid) && echo stopped $name
    else echo '$name is not running'; fi
  "
}

cmd_pull() {
  local name="${1:-}"; [[ -n "$name" ]] || die "pull needs a run name"
  local dest="$REPO/$GPU_LOCAL"
  remote "cd $GPU_REMOTE && tar -c runs/selfplay/$name" | tar -x -C "$dest"
  echo "pulled into $GPU_LOCAL/runs/selfplay/$name:"
  ls "$dest/runs/selfplay/$name"
}

cmd_shell() {
  [[ "${SPOT_TARGET:-}" == "wsl" ]] && exec wsl.exe -d Ubuntu-24.04
  exec ssh spot
}

command="${1:-}"; shift || true
case "$command" in
  probe|push|setup|test|train|resume|status|stop|pull|shell) "cmd_$command" "$@" ;;
  *) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac

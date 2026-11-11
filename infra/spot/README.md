# The spot machine

A friend's GPU computer that Novelty World may use while he isn't. It is for GPU training, the Risk learned bot's above all: the laptop's own eGPU is away at times, and this machine may be bigger. The **Spot Access** tool (`src/projects/spot-access/`, in Tools) records when it takes connections, from a check every minute.

## What is known, and what isn't

- **Access:** SSH as `root`, with the key `~/.ssh/id_ed25519_landon`, through the alias `spot` in the owner's dotfiles (`~/.ssh/config`, kept with chezmoi). The alias is the reference, so the machine's address stays out of this public repo; Spot Access reads the same address from its `SPOT_HOST` and `SPOT_PORT` settings.
- **What we get:** most likely a Linux container with full rights inside it. Its disk persists between windows.
- **When its owner wants it back,** the connection closes and everything running is killed, with no warning. Nothing needs doing on our side; whatever was on disk stays.
- **Not yet known:** the GPU, its memory, the CPU, the disk's size, and whether a run started detached survives our own SSH session ending. `npm run spot -- probe` answers the first four on the first connection. A run's status in a later session answers the last one.

## How it is used

Everything goes through `npm run spot -- <command>` (`spot.sh`), from the main checkout: one SSH command at a time, with files streamed as tar archives over the same connection, so the machine needs nothing but bash and tar to start with. Its own folder is `~/novelty`: `risk-gpu/` is the Risk GPU package laid out as in the repo (so its paths to `data/` and `runs/` work unchanged), and `venv/` its Python.

The first window, in order:

1. `probe`: what the machine is, changing nothing.
2. `push`: the GPU package's code as committed at `HEAD` (uncommitted changes aren't sent, and the push says so), the gitignored blitz table `blitz-256`, and the checkpoints the panel reads against (imit-1, sw128b-450, s2-2-150). More checkpoints are named as arguments, as paths under the package (`runs/selfplay/<run>/snap-<n>.pt`).
3. `setup`: `uv`, then Python 3.12 and the laptop's own versions of PyTorch, numpy and pytest in `~/novelty/venv`. It ends by asserting PyTorch sees a CUDA device and naming it.
4. `test`: the package's tests, on the GPU. These hold the engine bit-exact to the reference engine, and a new GPU is where a last-bit difference in floating point could appear (`ideas/gpu-engine.md`, "What was found"), so a run starts only once they pass.
5. `train <name> [ppo args]`: starts `riskgpu.selfplay.ppo` detached, so it outlives the connection. Its folder is `runs/selfplay/<name>/` as on the laptop, with its command (`cmd.txt`), process id, console output and a log of its starts beside the trainer's own files.

Then, in this window or a later one:

- `status [<name>]`: the GPU's load, each run running or stopped, its latest iteration and the tail of its errors.
- `resume <name>`: starts a stopped run again from its last checkpoint, with the command it was started with. This is how a run continues in each new window.
- `pull <name>`: copies a run's folder home, into the laptop's `runs/selfplay/<name>`, where the panel, the export and the harness read it. Pull at least once a window: the disk persists, but home is where a run is read and kept.
- `stop <name>`, `shell`.

## A run on this machine

- **Checkpoint often.** A window can end at any moment, and a run loses what it trained since its last full checkpoint (`latest.pt`, written whole and then renamed into place, so a kill never leaves it half written). The trainer's default writes it every 25 iterations; here `--ckpt-every 5` costs a few seconds and loses minutes rather than half an hour.
- **Size the batch to the card.** The recipes are sized for the laptop's 12 GB RTX 4070. A card with more memory can take a bigger `--batch`, but a bigger batch is a change of recipe, so a run that continues a recipe keeps its batch, and a bigger one is its own run, planned and predicted as the `machine-learning` skill asks.
- **The machine's numbers are its own.** A run's speed here says nothing about the laptop's, and the reverse, so `budget.md`'s rates are measured again here before a run is planned on them.
- **No fallback to the CPU.** `setup`, `test`, `train` and `resume` fail loudly when PyTorch sees no CUDA device. The trainer itself is CUDA-only.

## The rehearsal

`SPOT_TARGET=wsl npm run spot -- <command>` runs any command against the laptop's WSL distro instead, with `--cpu` on `setup` and `test`, since it has no NVIDIA GPU. It checks everything but the GPU: the transfers, the Python setup and the tests. `train` there fails at once, as it should without CUDA.

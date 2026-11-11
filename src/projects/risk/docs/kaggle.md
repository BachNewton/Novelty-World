# Training on Kaggle's free GPUs

The GPU trainer (`gpu/riskgpu/selfplay/ppo.py`) can run its sessions on Kaggle Notebooks instead of the laptop's eGPU. Kaggle's free tier gives about 30 GPU-hours a week (the figure floats; the account's settings show the current quota), in sessions of at most 12 hours, on a T4. A session runs on Kaggle's machine once pushed, with no browser open and nothing of the laptop's in use, so it serves the days and the weeks the eGPU is away. `gpu/riskgpu/kaggle/launch.py` drives it from here, run from `src/projects/risk/gpu/`.

## The one-time setup (the owner's)

1. A Kaggle account, with the phone number verified: a session gets the internet, which it needs to fetch the repo, only once it is.
2. The CLI signed in on this machine: `python -m kaggle auth login`, or an API token from kaggle.com/settings/api saved to `~/.kaggle/access_token`. The CLI is installed with `pip install --user kaggle`.

## A session

```bash
python -m riskgpu.kaggle.launch push <name> -- <trainer arguments>
python -m riskgpu.kaggle.launch status <name>
python -m riskgpu.kaggle.launch fetch <name>
python -m riskgpu.kaggle.launch report <name>
```

- **`push`** uploads what the session needs that git doesn't carry (the run's own folder, so it resumes; every checkpoint its arguments name; the panel's anchors; the blitz tables) as a private dataset, then starts a private script that clones the repo's GPU package at this checkout's commit and trains. The commit must be on GitHub and the GPU package committed, or the session would train other code than the one here; the launcher refuses otherwise. Every session resumes the run from its `latest.pt` when there is one.
- **`fetch`** brings the session's run folder back over the local one, once the session has ended. The local run folder stays the source of truth: the fetch refuses if the local `latest.pt` changed since the push, since it would overwrite that work.
- **`report`** prints the run's panel readings, every one with its interval, the samples it was read at and the verdict at that point.

## What a session costs and when it stops

- **Its precision is its own recipe.** A T4 has no native bfloat16, so its sessions train with `--no-bf16`, in full precision (the launcher refuses a T4 push without it, and the trainer refuses to emulate bf16 on any GPU without it). A run in full precision is not comparable with the eGPU's bf16 runs until a measurement shows the precision makes no difference, so a Kaggle line gets its own base run and seed spread.
- **A session stops at the launcher's `--session-hours`** (11 by default, under Kaggle's 12 with room to set up), saving `latest.pt`; the next push resumes it. `--hours` remains the run's total.
- **A session stops on a plateau.** The launcher refuses a push without `--stop-when` and `--stop-key`, unless `--no-stop` says to spend the hours regardless. The trainer reads the named panel reading at every evaluation and gives the daily contract's verdict (the machine-learning skill's `references/ruler.md`, implemented in `selfplay/verdict.py`): climbing, flat (the last three readings within one interval of each other) or falling (below the best by more than an interval, twice). `--stop-when flat` stops on flat or falling and `--stop-when falling` on falling alone, writing why to `stopped.txt`. The key is the plan's headline reading, chosen before the run: a reading at its floor or ceiling reads flat whatever the run does, so a run starting far below its anchor names an anchor it can move against.
- A stop is the start of a diagnosis (the skill's `references/diagnosis.md`), never a cue to push the same recipe for more hours.

## The rates

Nothing is planned on a Kaggle GPU's rate until a session has measured it: the trainer logs decisions per second every iteration, and `report` prints the last. The skill's `references/budget.md` gets the measured row.

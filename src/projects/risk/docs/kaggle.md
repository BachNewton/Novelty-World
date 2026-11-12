# Training on Kaggle's free GPUs

The GPU trainers (`gpu/riskgpu/selfplay/ppo.py`, and `imitate.py`'s imitation) can run their sessions on Kaggle Notebooks instead of the laptop's eGPU. Kaggle's free tier gives about 30 GPU-hours a week (the figure floats; the account's settings show the current quota), in sessions of at most 12 hours, on a T4. A session runs on Kaggle's machine once pushed, with no browser open and nothing of the laptop's in use, so it serves the days and the weeks the eGPU is away. `gpu/riskgpu/kaggle/launch.py` drives it from here, run from `src/projects/risk/gpu/`.

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

- **`push`** uploads what the session needs that git doesn't carry (each run's own folder, so it resumes; every checkpoint its arguments name; the panel's anchors; the blitz tables) as a private dataset, then starts a private script that clones the repo's GPU package at this checkout's commit and trains. The commit must be on GitHub and the GPU package committed, or the session would train other code than the one here; the launcher refuses otherwise. Every session resumes the run from its `latest.pt` when there is one.
- **No GPU idles while the session runs.** A T4 session has two GPUs and its quota counts the session, not the GPUs, so the session works through one queue: the runs a push names, in order, each GPU taking the next as it frees (`push k2 k3 --run-args k2="--seed 1" --run-args k3="--seed 2" -- <shared trainer arguments>`; each run's own arguments follow the shared ones and win where they repeat one). A seed pair (the spread the skill asks for before any change is judged) or a base beside its one change costs what a single run would. A run named past the GPUs waits for the first to free, so it must be planned before the session, without the earlier runs' results.
- **A stopped run is read sharply.** When a run stops, its checkpoints at its last three headline readings (the window its verdict was read on) join the queue, each to be read on the panel at 4,096 games a check, about ±1.8 points against the training panel's ±5. The readings are taken newest first across every run (every run's stopped checkpoint, then every run's one before), so hours that can't fit them all lose the oldest. That tells a run that is flat from one climbing too slowly for its training readings to resolve, which the stop alone can't. Each reading is saved beside the run (`panel-<iteration>-g4096.json`) and `report` prints them; one already read isn't read again.
- **`fetch`** brings every run of the session back over its local folder, once the session has ended. The local run folder stays the source of truth: the fetch refuses if the local `latest.pt` changed since the push, since it would overwrite that work.
- **`report`** prints the run's panel readings, every one with its interval, the samples it was read at and the verdict at that point.

## An imitation session

`push --imitate` makes the session's runs imitations (`gpu/riskgpu/selfplay/imitate.py`'s `train`, its arguments after `--`) instead of PPO runs, each in its own folder, `runs/imitate/<name>/`. Everything else is the same session: one queue, its runs in order, the readings' hours at its end.

- **The bundle carries what the imitation reads**: the data folder its `--data` names (gigabytes: the bundle is staged as hard links to the files, never copies, and the CLI streams them up), every checkpoint its arguments name (its `--init`), the panel's anchors and the blitz tables. An imitation never resumes, so its own folder is not sent, and the launcher refuses a name whose folder already holds a trained net.
- **Its training is capped by the session**: it is given `--hours`, the hours left before the readings' share when it starts, and stops there as it would at its budget of samples, its best and last nets saved and its log's last line marked. The cosine schedule stays over `--max-samples`, so a capped run ends with its rate still above zero: a budget sized to the hours is the plan, the cap its guard.
- **Once trained, it is read twice**: its held-out agreement with the teacher (`imitate read`, saved as `read.json`) and the panel at 1,024 games a check (`panel.json`), both on its best net, one on each GPU.
- **`fetch`** guards the run's `best.pt` as a PPO fetch guards `latest.pt`, and `report` prints the imitation's last log line (its samples, held-out main agreement and seconds) and the headline numbers of its two readings.

## What a session costs and when it stops

- **Its precision is its own recipe.** A T4 has no native bfloat16, so its sessions train with `--no-bf16`, in full precision (the launcher refuses a T4 push without it, and the trainer refuses to emulate bf16 on any GPU without it). A run in full precision is not comparable with the eGPU's bf16 runs until a measurement shows the precision makes no difference, so a Kaggle line gets its own base run and seed spread.
- **A session stops at the launcher's `--session-hours`** (11 by default, under Kaggle's 12 with room to set up), and its last `--read-hours` (3 by default) are the readings'. A run is given the hours left before them when it starts and saves `latest.pt` there; no run starts inside them and no task after the session's hours; a reading still going half an hour past them is stopped and reported as left, which ends the session cleanly, since it is the plan's miss, not a fault. A sharp reading takes 2 to 3 hours on a T4 beside another and about 4 beside a training run (the skill's `references/budget.md`), so two runs get one reading each in the default hours; a plan that needs more readings gives them more hours, or ends its runs at matched iterations early enough (`--iters`). The next push resumes each run. `--hours` remains a run's total.
- **A session stops on a plateau.** The launcher refuses a push without `--stop-when` and `--stop-key`, unless `--no-stop` says to spend the hours regardless. The trainer reads the named panel reading at every evaluation and gives the daily contract's verdict (the machine-learning skill's `references/ruler.md`, implemented in `selfplay/verdict.py`): climbing, flat (the last three readings within one interval of each other) or falling (below the best by more than an interval, twice). `--stop-when flat` stops on flat or falling and `--stop-when falling` on falling alone, writing why to `stopped.txt`. The key is the plan's headline reading, chosen before the run: a reading at its floor or ceiling reads flat whatever the run does, so a run starting far below its anchor names an anchor it can move against.
- A stop is the start of a diagnosis (the skill's `references/diagnosis.md`), never a cue to push the same recipe for more hours.

## The rates

Nothing is planned on a Kaggle GPU's rate until a session has measured it: the trainer logs decisions per second every iteration, and `report` prints the last. The skill's `references/budget.md` gets the measured row.

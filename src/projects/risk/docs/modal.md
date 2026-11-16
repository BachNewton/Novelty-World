# Training on Modal's GPUs

The GPU trainers (`gpu/riskgpu/selfplay/ppo.py`, and `imitate.py`'s imitation) can run on Modal (modal.com) as well as on the laptop's eGPU and Kaggle (`kaggle.md`). Modal bills by the second for the GPU, the cores and the memory a container holds; the free plan gives $30 of credit a month, and the owner's workspace caps its usage at $30, so a month's credit is the budget. On the Risk trainer an A10 gives the most training per dollar (the machine-learning skill's `references/budget.md`, from `gpu/riskgpu/modalgpu/bench.py`), at about the eGPU's speed; an H100 the most per hour. `gpu/riskgpu/modalgpu/launch.py` drives it from here, run from `src/projects/risk/gpu/`, with the Kaggle launcher's jobs in the Kaggle launcher's terms, so a session can use either.

## The one-time setup (the owner's)

A Modal account with a card on file (no GPU runs without one), and the client installed and signed in on this machine: `pip install modal`, then `modal setup`. `modal billing summary` shows the month's spend.

## A run

```bash
python -m riskgpu.modalgpu.launch push <name> [<name>] [--imitate] [--gpu A10] [--hours 8] [--read-hours 2] [--dry-run] -- <trainer arguments>
python -m riskgpu.modalgpu.launch status <name> [<name>]
python -m riskgpu.modalgpu.launch stop <name> [<name>]
python -m riskgpu.modalgpu.launch fetch <name> [<name>]
python -m riskgpu.modalgpu.launch report <name> [<name>]
```

- **`push`** starts each run it names on a GPU container of its own (`--gpu`: T4, L4, A10, A100-40GB, A100-80GB or H100; A10 by default), all in one app, and returns. Its trainer arguments are checked first by the trainers' own parsers, and the plateau stop is required as on Kaggle (`--stop-when` and `--stop-key`, or `--no-stop`). Each run's own arguments follow the shared ones (`--run-args <name>="<args>"`), so a seed pair, or the same recipe at several sizes of net, is one push. All of a push's runs share its `--hours`, so runs whose lengths differ by much go in separate pushes.
- **`--dry-run`** checks the arguments as a push would and prints each run's arguments, the inputs it would upload and its worst case in dollars, then stops without asking Modal anything: the way to see a sweep's exact cost before spending.
- **`status`, `stop`, `fetch` and `report`** take several names, one run after another, so a sweep is followed with one command.
- **Detached.** The push starts an ephemeral app in detached mode (the Python form of `modal run --detach`) and spawns the runs in it, so nothing of the laptop's is needed once the command returns: the app lives while its runs do and stops by itself when the last ends. One app per push, rather than a deployed app the pushes share, keeps each push's code in its own image and leaves nothing to tidy up.
- **The code** is this checkout's GPU package at HEAD (its code and committed data), put in the image as it stands there; the push refuses a GPU package with changes not committed, and the run records the commit it trained on. Nothing has to reach GitHub first, unlike a Kaggle session. `--uncommitted` ships the working tree instead, for testing the launcher itself, and the run records its commit as uncommitted.
- **Two Volumes.** A run's folder lives on the `risk-runs` Volume at its local path (`runs/selfplay/<name>` or `runs/imitate/<name>`), where the trainer writes its checkpoints as it always does, so whatever ends the container, the run's work up to its last checkpoint is kept. The push replaces that folder with the local one, which stays the run's source of truth, so a run resumes on Modal from wherever it was trained last. Everything else the run reads that git doesn't carry (the blitz tables, every checkpoint its arguments name, the panel's anchors, an imitation's data) goes to the `risk-data` Volume, which keeps a manifest of each file's hash: a push uploads only what is missing there or changed, so an imitation's gigabytes of data go up once.
- **`status`** asks Modal for the run's container: running, finished, or failed with the error it raised, and the last line of the run's log (`log.jsonl`, which reaches the Volume as the run goes), with the last line of its output and the end of its errors when it failed, read from the Volume.
- **`stop`** kills the run's container. Its folder keeps what it saved, and `fetch` brings it back.
- **`fetch`** copies the run's folder from the Volume over its local folder once the container has ended, with Kaggle's guard: it refuses if the run's `latest.pt` (an imitation's `best.pt`) changed here since the push, since it would overwrite that work. It then prints the report.
- **`report`** is Kaggle's: a PPO run's panel readings with their verdicts and its sharp readings, or an imitation's last log line and its two readings.

## After training, the readings

The container reads its run once it stops, as a Kaggle session does (`kaggle.md`), with the session's own code: a PPO run's sharp readings (its checkpoints at its last three headline readings, newest first, on the panel at `--sharp-games` a check, 4,096 by default), an imitation's held-out agreement and its panel. One GPU does both, in turn.

## An imitation

`push --imitate` runs `imitate.py train` with its arguments after `--`, each run in `runs/imitate/<name>/`, as Kaggle's imitation sessions do: a fresh run every time (a name whose folder already holds a trained net is refused), its data on the data Volume, its training capped by the container's hours. Its network's size is the trainer's own `--width`, `--layers` and `--heads`; a width the heads don't divide and a `--device` other than the GPU are refused before anything is uploaded, since either would fail or idle a container that is already paid for.

- **A comparison of sizes reads the fit.** Beside the held-out read that keeps `best.pt`, the trainer reads a fixed sample of the run's own training decisions at every checkpoint, the same decisions for any size of net at the same `--fraction`, and logs its agreement (`fit_main`, `fit_move`). That is the capacity reading: a net that can't fit what it trains on is short of size or of steps. `train_agree` is kept, the mean over the minibatches since the last read while the weights moved, which is what runs from before the fixed read have. `report` and `fetch` print the net's size, its epochs, the fit and `train_agree` after Kaggle's report.
- **`--no-panel`** reads a trained imitation on its held-out agreement alone. The panel's games cost GPU time that a comparison of fits doesn't need, and the panel can be read later, on the laptop or in another push, from the fetched `best.pt`.
- **The readings' hours are the push's `--read-hours`**: the agreement read alone is one pass over the held-out decisions without training, so a push without the panel needs far less than the default two.

## What a run costs and when it stops

- **`--hours` bounds the container and so the money.** It is the container's Modal timeout. The training is given the hours less `--read-hours` and the last five minutes, and saves `latest.pt` there; no reading starts after the hours, and one still going is stopped, leaving the five minutes for the last write to the Volume. A container is at most 24 hours, Modal's longest.
- **The push shows its worst case and refuses what the month can't pay.** The worst case is each run's hours at its GPU's rate and the rates of the cores and memory it holds (four cores; 16 GiB for PPO, 32 for an imitation, which holds its data in memory), all at Modal's published rates. To it are added the month's spend (`modal billing summary`) and, for every run pushed and not yet fetched, the hours its container may still hold. A push whose total would pass $28 is refused: the credit and the cap are $30, and the billing summary lags.
- **A run fails once, loudly.** Modal retries nothing (`retries=0`) and the launcher has no restart loop: a run that fails stays failed, `status` says why, and the next push resumes it. Modal may still restart a preempted container. A restarted container keeps its first start's deadline, so a restart never buys hours the push didn't pay for: a PPO run resumes from its last checkpoint, and an imitation, which can't resume, fails instead.
- **Precision is bf16 on every GPU but the T4**, which has none and trains with `--no-bf16`. The launcher refuses `--no-bf16` on any other GPU: bf16 is this host's recipe, so a Modal run is comparable with the eGPU's runs, not with Kaggle's full-precision ones.
- **A run stops on a plateau**, as on Kaggle: the trainer reads its `--stop-key` at every evaluation and stops on the verdict `--stop-when` names. A stop is the start of a diagnosis (the skill's `references/diagnosis.md`), never a cue to push the same recipe for more hours.

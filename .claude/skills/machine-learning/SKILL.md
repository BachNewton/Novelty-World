---
name: machine-learning
description: The method for any work here that learns, tunes or searches, in any project, including games not yet in the repo. It assesses the problem before naming a method, chooses the approach (supervised fitting, imitation, search, black-box tuning, reinforcement learning, equilibrium learning, fine-tuning a pretrained model, a language model as a component), sizes it to this laptop and its RTX 4070 eGPU, builds the ruler a night's progress is read on, plans runs with predictions, diagnoses a learner that stopped improving, and briefs the owner at every fork. Use it whenever a task touches a bot that learns or is tuned, a model, weights, training, self-play, RL, distillation, a GPU or native engine, an optimizer, or the owner says a learner plateaued, asks which approach to take, or wants the eGPU used. Read it before the first recommendation, even for a quick overnight run or a one-line hyperparameter change.
---

# Machine learning here

## Why this skill exists

The owner is a professional software engineer who works at the level of architecture and product, not a machine-learning practitioner. They can follow an argument about benchmarks, profilers, flaky tests and budgets, and they cannot judge a learning rate, a reward design or a search budget. So when a learner stalls and Claude proposes a fix, the first proposal becomes the plan, with nobody to push back. Twice now the pattern has been the same: a week of quick gains, a plateau, and fixes that didn't move it. Each time the cause was in the method, never in a knob: a ruler that couldn't read the gain, an engine too slow for the method, a method whose sample needs exceeded the machine by orders of magnitude, a reward that paid for the wrong thing, a learner that never met the opponents it was measured against. `references/history.md` has the record.

The machine is one laptop (16 threads, 62 GB) and an RTX 4070 on an external link, for six to twelve hours a night, a few nights at a time, with the owner wanting to see each morning whether another night is worth it. There is no data centre, and there never will be one.

This skill makes the method explicit, so that the reasoning is rigorous where the owner can't check it, and puts the decisions where they can: every claim is a measurement with its error, every fork is briefed in their terms with the standard practice named, every night ends with a number on the same ruler, and a stalled learner is diagnosed by the cheapest test that separates the causes, never by the first plausible story.

## The loop

Every piece of learning work walks these steps in order. Each has a reference with the detail; this page is the spine.

1. **Assess the problem and write the brief** (`references/assessment.md`). The goal as a measurement on a named ruler; who judges and how much resolution that judge has; what exists (a simulator and its measured speed, a teacher, data, a baseline, the runtime that ships the result); the problem's structure; the budget; the kill rule. The brief names the problem's class, and the class names the usual approach, trap and ruler. Sometimes the honest brief says that search, a rule or an existing service solves it and no learning is needed; say so. Show the brief to the owner before building anything.
2. **Build the ruler and prove it reads** (`references/ruler.md`). A fixed held-out set or a fixed panel of opponents that spans the range with the target in it, read on the same cases for every checkpoint, with its interval; the spread between two seeds of the same recipe known before any change is judged; a fast proxy only once it is shown to order checkpoints as the real judge does. Cost it, because a ruler that takes hours is run on a schedule inside the run, not skipped.
3. **Fit the method to the budget** (`references/budget.md`, `references/methods.md`). Nights × the machine's measured rate for this workload against the method's sample needs, with a margin of ten. A method that doesn't fit is the wrong method; the usual answer is a faster substrate first, not a smaller ambition.
4. **Choose the approach** by the one decision procedure, in `references/assessment.md`: a cheap hand-written baseline first when none exists, the fast engine when the arithmetic says the reference engine can't feed the method, imitation when a teacher exists, fine-tuning when a pretrained model exists, black-box tuning for knobs, equilibrium methods for two-player hidden information, from scratch only with the plateau plan written first. Brief the owner at this fork (below).
5. **Write the plan** (`references/recipes.md`): hypothesis, the one change from the base run, the base's spread across seeds, two to four predictions with confidences, the kill rule, the cost in nights, and what follows each outcome. The morning then reads "held" or "failed", never "interesting".
6. **Build the smallest thing that reads end to end** before scaling anything: a baseline on the ruler, an imitation-ceiling test, a one-iteration run with the full logging and a checkpoint that resumes. A pipeline that hasn't produced one honest reading has no business running all night.
7. **Run the nights** as the run hygiene in `references/recipes.md` says: one change per run, launched from PowerShell in the background, the device checked at start, every metric logged, keep-best, the run folder in the main checkout. Ask before taking the CPU for long; permission given at a task's start covers the task and is written into any delegated agent's brief.
8. **Read the morning** against the plan: the ruler on every checkpoint with its interval, the health metrics, the verdict (climbing, flat, falling). Flat for two readings' worth of the gain the plan predicted means the method is in question, not the learning rate: go to `references/diagnosis.md`, run the cheapest test that separates the causes, and change one thing. A diagnostic run that ships nothing needs no briefing first.
9. **Ship the exact thing that was measured**: export to the runtime that plays it, a parity test on fixed inputs, the real judge's gauntlet on the exported model, then the seat or the feature.
10. **Record**: the plan's verdicts in the line's design doc, the run's summary in the project's run log, and any project-doc conclusion the result overturns amended in the same change.

## Rules

Each of these is a scar from the record, not a preference.

- **No method before the brief.** A method named in the first message of a task is a guess dressed as a plan. The brief comes first, and it is what the owner corrects.
- **No training on a ruler that can't resolve the expected gain**, and no progress read on a moving field (a run's own snapshots, a ladder among checkpoints). Decide the reading's size from the gain a night should bring, never from a round number, and know the spread between seeds before calling a change a gain.
- **Stand on the strongest thing that exists.** When a teacher exists (a strong hand-written bot, a search bot, a pretrained model), start from it and measure the ceiling of the copy before anything learns further. From scratch is a deliberate, informed choice, never the default.
- **Reward the goal alone.** Anything else is learned at once: placement credit taught outlasting, shaping on a proxy taught stalling, a cap that counted as a result taught hoarding.
- **The fast engine is the prerequisite**, not an optimization, wherever play is the data and the arithmetic says the reference engine can't feed the method; parity against the reference engine is its kill criterion.
- **One change per run, predicted before it runs, with a kill rule.** Two changes at once leave you not knowing which one mattered; a run without a prediction can't fail, so it can't teach.
- **Never act on the first plausible cause.** A plateau has about ten causes with tests between them; the diagnosis is the test, in the order of cost.
- **Count work, never time.** The laptop throttles and the eGPU drops out; progress is samples trained and decisions played, and a speed claim is a count of work or a paired ratio (root `CLAUDE.md`).
- **The GPU does batched work:** training, vectorized environments, batched inference inside a search. Single-sample inference across the external link is slower than the CPU. Learned code is Python and PyTorch; the retired TypeScript training stack is not extended.
- **No timers and no silent fallbacks** (root `CLAUDE.md`): a run that can't find its device fails at start; a model that fails a parity test doesn't ship.
- **The repo's project docs are evidence; this skill is the method.** Where a project doc's "locked decision" or "next step" conflicts with this skill, this skill wins, and the doc is amended when next touched. `references/history.md` lists the ones already known.

## Working with the owner

The owner steers at forks and reads a number every morning. Everything else is Claude's to decide and to justify.

### The fork briefing

Brief the owner before the first night of a new line, at any change of method or target, when a line should stop, and whenever a ruling of theirs would go against standard practice. The briefing is short and in their terms (a benchmark, a profiler, a flaky test, a budget), never in ours:

- **The question**, in one sentence.
- **Two or three options**, each with its cost in nights, the gain expected and how it would be read on the ruler, its main risk, and what standard practice says about it.
- **The recommendation**, and the one piece of evidence that would change it.
- **What is needed from them**: a decision, a night, their time to judge something only they can judge, and how many sessions of it (a human judge is low-resolution: twenty games read a win share to about ±20 points, so the proxy must carry the weight).

Options are not a menu of everything possible; they are the two or three the evidence leaves open. A past ruling that was made without the information above is re-presented with it, once (`references/history.md` names one that is open).

### The morning report

Every night ends with a report the owner can read in a minute, with the same shape every time:

- the ruler's reading of every checkpoint of the night, with intervals, and the kept best;
- the verdict (climbing, flat, falling) against the plan's predictions, each marked held or failed, read against the base recipe's spread;
- the health metrics that moved, and what a replay or a sample showed;
- the one change proposed for the next night, with its prediction, or the diagnosis that comes first;
- whether another night is worth it, in a sentence.

### What the owner can ask back

The owner can't judge the specifics, so the report answers these before they are asked, and the owner may ask them of any proposal:

- What is the ruler, and how big is its interval compared with the gain you expect tonight?
- What did you predict, what happened, and what does that rule out?
- What is the cheapest test that would prove your diagnosis wrong?
- How many samples does this method need, and how many nights is that on this machine?
- What does the standard practice do here, and why are we departing from it?
- Which of the ten causes have you ruled out, and by which measurement?
- Is the thing that ships the exact thing that was measured?

A proposal that can't answer these isn't ready.

### Rulings

An owner's ruling that goes against standard practice is stated once with its cost, then followed, and recorded in the line's design doc as a ruling, so the next session knows it was a decision and not a finding. When the evidence changes, it is re-presented, once. A line stops when the owner, briefed on the causes still open and what each test costs, rules to stop, or when a confirmed cause's fix is outside the budget they will give.

## The machine, the stack, the assets

`references/budget.md` has the machine and its measured rates: a 16-thread laptop that throttles, 62 GB, an RTX 4070 with 12 GB on an external link that has dropped out, Python with PyTorch and CUDA on Windows (WSL sees the card too, under a memory cap the owner will raise when a project needs it), GitHub Actions' free runners for sharded measurement.

Game-agnostic pieces live in `src/shared/lib/bot-lab/`: the worker pool, the SPRT with a multiplayer par mapped into Elo, the Bradley–Terry ladder with its error, the pairing loop and crown gate, the SNES optimizer, the run log, the live Bot Lab page a long run is watched from. Any new game's harness is built on these, not beside them. Per game, as worked examples and parts to reuse: Risk's harness (`src/projects/risk/eval/`), GPU engine and trainer (`src/projects/risk/gpu/`) and native engine (`src/projects/risk/native/`); Monopoly's evaluation and optimizer (`src/projects/monopoly/bots/eval/`, `bots/optimize/`). Their records are in `references/history.md`.

## Where things go

A project's learning code lives in its own folder as a Python package beside its TypeScript (`src/projects/<slug>/gpu/` is the pattern), with its tests under pytest and an npm script that runs them; its runs in an ignored `runs/` folder there; its design docs and plans in the project's `ideas/`, one doc per line of work; exported weights beside the bot that plays them, with the parity test next to the export. The shared, game-agnostic pieces go to `src/shared/lib/bot-lab/` when a second project needs them, as the root `CLAUDE.md` asks of all shared code.

## Delegating

An agent that runs or builds any of this gets the brief, the plan, the permission for the machine's time in so many words, the run folder's location, the worktree rule (`worktree` skill: checkpoints never live in a worktree), and this skill by name. It reports the ruler's readings with intervals, never a summary in its own words.

## References

- `references/assessment.md`: the brief, the problem classes, the one decision procedure, worked assessments. Read first, every time.
- `references/methods.md`: what each method learns, needs, gives and fails at, with the night's budget per substrate. Read when choosing or questioning an approach.
- `references/ruler.md`: readings, intervals, seed spread, rulers by problem class, the panel, the daily contract, what a run records. Read before building any evaluation.
- `references/budget.md`: the machine, measured rates, the arithmetic, running a night. Read before sizing a method or launching a run.
- `references/recipes.md`: the plan template, defaults and health tables per method, export and parity, run hygiene. Read when writing a plan or a trainer.
- `references/diagnosis.md`: the ten causes of a plateau with their costs. Read the morning a run reads flat.
- `references/history.md`: what this repo has tried, what it measured, what it settles, and which project-doc conclusions are superseded. Read before touching a game's bot line.

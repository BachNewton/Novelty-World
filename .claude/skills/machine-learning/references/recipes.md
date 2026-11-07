# Recipes: defaults, checks and run hygiene

Starting points that are known to work at this scale, the numbers to watch, and what every run folder holds. Defaults are where a run starts, not where it ends; every change to one is a run with a prediction.

## The plan before a run

Every run has a plan written before it launches, in the project's design doc for the line (`ideas/<line>.md`), in this shape:

- **Hypothesis:** the one thing this run tests, in a sentence.
- **Change:** the one thing that differs from its base run, and the base run's name.
- **The base's spread:** what two seeds of the base recipe differ by on the ruler. A one-change run is judged against that spread, not against one run of the base; without it, "held" and "failed" read seed luck as findings. A pair of base seeds is the first run of any new recipe.
- **Predictions:** two to four numbered, measurable outcomes, each with a confidence, so the morning reads "held" or "failed" and not "interesting". Risk's self-play doc did this for thirty-three predictions and it is the best record in the repo: the predictions that failed taught more than the ones that held.
- **Kill rule:** what reading stops the run early (a capped rate above a line, a fall below the best by more than the interval twice, held-out loss rising for N evaluations).
- **Cost:** nights, and what else the machine can't do meanwhile.
- **Next:** what follows each outcome, so the morning decision is already made.

## Supervised fitting

- **Baseline first:** a logistic regression or gradient-boosted trees on the same split, in the first hour. The net's number is read beside it.
- **Split by the unit that leaks:** games, speakers, days, sessions; never by row. Hold out a final set untouched until the end.
- **Overfit one batch** before training on all of it: a model that can't drive one batch's loss to near zero has a broken pipeline (shuffled labels, a wrong mask, a transform applied once), not a weak model.
- **Watch:** training and held-out loss per epoch; the task metric on held-out; calibration (log loss or Brier against the prior's); a reliability plot; an error analysis by hand on a hundred held-out misses, which finds missing features faster than any sweep.
- **Stop:** when held-out stops improving for a fixed patience; keep the best by held-out, never the last.
- **Report:** the interval on the held-out number (bootstrap over the leaking unit), the baseline's number, and the calibration.

## Fine-tuning a pretrained model

- **Fit the card:** the 12 GB card holds a model of a few hundred million weights whole, or one of several billion weights under 4-bit quantization with low-rank adapters; gradient checkpointing and a small batch with accumulation make up the rest. An out-of-memory error at step one is a configuration, not a limit.
- **Learning rate:** an order of magnitude below the model's pre-training rate for a full fine-tune; adapters tolerate more. Warm up briefly, decay to the end.
- **Data:** hundreds to tens of thousands of examples, cleaned by hand (one bad example in a hundred shows in the output); a held-out slice; the base model's behaviour on a fixed probe set recorded before training, so forgetting is measured, not suspected.
- **Watch:** held-out loss per evaluation; the probe set's outputs at every checkpoint, read by eye or by the proxy judge; the base model's number beside each.
- **Stop:** early, by held-out; the training loss always falls and says nothing.
- **Judge:** blind pairs against the base model and the current production model, by the people it is for; the proxy screens candidates first (`ruler.md`).

## Imitation and distillation

- **Data:** at least 10⁵ decisions; held out by game; recorded at a teacher budget whose self-agreement is high enough to be worth copying, and with the teacher's scores for every candidate when it has them (a listwise loss over the ranking carries far more than the one choice).
- **Loss:** cross-entropy over the masked legal moves for a choice; a listwise loss (the teacher's scores as a distribution over its candidates) for a ranking.
- **The ceiling:** report the student's agreement with the teacher beside the teacher's agreement with itself at that budget. A student at the ceiling is done; one far below it is the representation (`diagnosis.md`, cause 4) or needs data.
- **The kill test:** how often the teacher overrules the cheap policy it improves on, and how much of the teacher's edge in its own scores the student keeps.
- **The real test:** the student in games, on the ruler. Agreement is a proxy; a student that agrees 80% and loses has copied the wrong 80%.
- **Beyond the teacher:** record the teacher's answers on the student's own states once the student plays (DAgger), so it is trained where it actually goes.

## Policy gradient on a vectorized environment (PPO)

Defaults, from the repo's runs and the usual practice at large batch:

| Knob | Start | Why |
|---|---|---|
| Rollout (the samples one update sees) | as many episodes as memory allows, a horizon of tens of decisions; compare it with the measured noise scale | this is the batch the noise averages over |
| Minibatch | thousands of samples per optimizer step, the learning rate scaled with it | batch and step size are one knob; a step too large for its batch wanders |
| Epochs | 3 to 10 over each rollout, fewer when KL jumps | more passes reuse the data; too many re-walk its noise |
| Learning rate | 1e-4 to 3e-4 at a minibatch of thousands, decaying to a quarter by the run's end | the decay is the cold phase |
| GAE | γ = 1 when the only reward is terminal and episodes are capped; λ = 0.95 | λ trades the outcome's variance for the value head's bias |
| Clip | 0.2 | the standard trust region |
| Entropy bonus | 0.01, lowered if entropy won't fall | exploration without a separate schedule |
| Value loss weight | 0.5 | the value head is the baseline; its quality is cause 5 |
| Gradient clip | 0.5 to 1.0 by global norm | a rare bad batch can't throw the policy |
| Advantage normalization | per rollout | keeps the step size meaningful across the run |
| Reward | the goal alone; in a multi-player game, an episode cut off by its cap is a loss for everyone still in it | anything else is gamed |
| League | fixed strong anchors kept for good, past snapshots, the target class, weighted toward the opponents the learner loses to | self-only play cycles; a weak league ceilings |
| Warm start | from an imitation of the strongest policy when one exists | the run then spends its nights above it, not reaching it |
| Seeds | two of the base recipe before any one-change run | the spread is what a change is judged against |
| Snapshots and keep-best | every N iterations; the best by the fixed panel kept apart from the latest | RL is not monotone; the latest is often not the best |

The health table, logged every iteration and read every morning:

| Metric | Healthy | Worry |
|---|---|---|
| Approximate KL per update | 0.005 to 0.03 at clip 0.2 | jumps, or above 0.05: steps too large |
| Clip fraction | 0.05 to 0.3 | above 0.4: the trust region is doing all the work |
| Entropy | falling slowly through the run | collapsing early (no exploration), or rising late (cause 2) |
| Value explained variance | above 0.3 and rising | near 0 or falling: the baseline isn't one (cause 5) |
| Advantage std before normalization | stable or shrinking | growing: the targets got noisier |
| Capped or stalled rate | under a few percent | rising: cause 2 |
| In-training win share per opponent kind | moving | saturated: cause 3 |
| Noise scale, measured at checkpoints | within an order of magnitude of an update's samples | far above: cause 6 |
| Samples per second | steady | a fall: thermal throttling, a dropped GPU, host syncs crept in |

Self-play with search (expert iteration) also needs exploration noise at the root and temperature sampling for the opening moves; without them a self-play run only reinforces what the net already prefers.

## Regret and equilibrium learning (two players, hidden information)

For a two-player zero-sum game with hidden information the target is an equilibrium strategy, which mixes, not a best pure move.

- **Small games:** tabular counterfactual regret minimization on an abstraction of the game (bucketed hands, bucketed bets), sampled (Monte Carlo CFR) once the tree is large; the strategy that plays is the **average** of the iterates, never the last one.
- **Large games:** a net in place of the table (Deep CFR), or neural fictitious self-play, or a population method that trains best responses against a mixture of past policies and re-solves the mixture (PSRO). All of them keep an average or a mixture; a single latest policy is exploitable.
- **Ruler:** exploitability: the value a best response gains against the strategy, exact on a small abstraction, approximate (a best response trained by reinforcement learning against the frozen strategy) on a large one; win share against fixed bots is secondary. The shipped policy samples from its mixture; read the sampled policy.
- **Search at play time:** sampled worlds with belief tracking make a strong player cheaply, with the known weakness that a search which sees each sampled world whole can fuse plans that should differ by what it can't see; a best-response check catches it.
- **Beating one person:** a model of that person's play (imitation on their logged games) and a best response to it, measured by exploitability of the model, is the standard route when the real judge is one human who will play twenty games.

## Value fitting for a search

- **Targets:** the outcome, and derived targets with shorter horizons, since the raw outcome of a long episode is a weak label for its first half.
- **Check:** calibration on held-out games, explained variance, a plot of predicted against realized.
- **Use:** as the leaf evaluation of a search, judged by the search's strength on the ruler, never by the fit alone.

## Black-box optimization (SNES, CMA-ES)

- **Common random numbers:** every candidate of a generation is scored on the same cases; without this the ranking inside a generation is dice.
- **Objective:** the candidate's worst case over the conditions it will meet (for a bot, as Elo per seat against a baseline on the same seeds at every table), so an edge in one place can't hide a loss in another.
- **Population:** SNES's default (4 + 3 ln d) is the floor; the fitness noise decides how many cases per candidate.
- **Pins:** any knob that guards a behaviour the objective is blind to stays pinned; the search proposes, the ruler measures, and a line-search between the parent and the winner often beats the raw winner.

## Export and parity

A model that ships is the exact thing that was measured.

- Export the weights to the language that plays them (TypeScript for a seat, Rust for the native line), with a forward pass written in a fixed order of the operations the training net used.
- A parity test on fixed inputs: the exported pass against the trainer's, to a tolerance, on real recorded decisions, and the move it picks the same. Sampling draws from the bot's own seed, one stream per decision, so the same seed and position give the same move.
- A float that decides a comparison is never divided by a Python scalar in PyTorch on CUDA: the scalar path multiplies by a reciprocal and is off by a bit often enough to flip a near-tie (Risk's `ideas/gpu-engine.md` has the case); divide by a tensor, and run the parity test on the GPU where there is one.
- The judge's gauntlet on the exported model is the judgement; the in-training reading was the proxy.

## Run hygiene

A run lives in its own folder under the project's ignored runs directory, in the main checkout, never in a worktree that may be removed. It holds the exact arguments with the commit and the code hash, a log with one object per iteration and every metric, stdout and stderr, numbered snapshots, `latest` and `best`. A run resumes from `latest` with its optimizer state and schedule position, and the first iteration after a resume is compared with the last before the stop.

A night's queue is one script that runs its jobs in order, each to its own folder, launched in the background from PowerShell so that stopping it stops the whole process tree (a Git Bash task leaves the run playing with nobody reading). Each job checks at its start that the device it expects is there (`torch.cuda.is_available()` and the device name for the eGPU) and fails loudly if not; a job that falls back to the CPU silently wastes the night. An update that doesn't fit beside the environment on the card is taken in chunks, the gradient summed before the step, so the minibatch is a choice and not a memory limit.

At the end of a run, its summary goes to the project's run log (or one in the bot-lab run log's shape, where the project has none yet) and its findings to the line's design doc: what was predicted, what was read, the verdict, and the next step. The owner reads the doc, not the folder.

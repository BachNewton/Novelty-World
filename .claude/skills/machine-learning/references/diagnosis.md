# When it stops improving

"Learned fast, then flat" is the normal shape of every learner, so the shape alone says nothing. There are about ten causes, each with a test that tells it from the others, and the whole point of this file is that the first plausible cause is never acted on. Write the candidates down, run the cheapest test that separates them, and act on what it says. A diagnosis is a measurement; a fix is a prediction tested on the next run; one change per run.

Each cause carries its cost: **minutes** (reading what the run already wrote), **an evening** (a test that needs some compute), **a night** (a run). Walk them in that order, not in the numbering below, and stop at the first cause a test confirms: fix it and read the ruler again before looking further, because fixing two things at once leaves you not knowing which one mattered. A diagnostic run that ships nothing needs no fork briefing; launch it on the night already given and brief the owner with its result. Each cause gives its signs, its test and its fix for a policy learner and, where it differs, for a supervised or fine-tuned model.

## 0. The ruler itself (minutes)

Before anything about the learner, ask whether the plateau is in the reading.

- **Resolution.** Recompute the interval of each reading (`ruler.md`). If the hoped-for gain per reading is inside it, the curve can't show progress and nothing is known yet. Test: evaluate the last three checkpoints on the same cases at four times the size. Fix: more cases per reading, common cases, or read every second checkpoint.
- **Run-to-run spread.** Two runs of the same recipe with different seeds differ, in reinforcement learning often by more than a night's expected gain. If the base recipe's spread across seeds isn't known, a one-change run's "held" or "failed" may be reading that spread. Test: a second seed of the base recipe. Fix: judge changes against the spread, not against one run.
- **Ceiling or floor.** A panel the model beats at 90%, or a benchmark it aces, has stopped reading; one it scores 0% on hasn't started. Test: add cases near the model's current level and read again. Monopoly's trainer read 0% against the weakest bot at every one of its evaluations over 400 iterations while its loss fell: whether it was learning, the ruler could not say.
- **A moving field.** A ladder among a run's own checkpoints is field-dependent (it moved a net by about 70 Elo between two fields). Test: read the same checkpoints against the fixed panel.
- **The wrong policy.** The reading plays argmax while training samples, or another budget or temperature; a fine-tune evaluated with different decoding than it will ship with. Test: compare both on the panel. Fix: read what will ship.
- **Hours instead of samples.** Throttling and GPU dropouts make a night's work vary. Plot against samples trained.

## 1. The infrastructure (minutes)

The commonest cause, and the cheapest to check, so it comes right after the ruler.

- **Signs:** a run whose batch silently halved after an out-of-memory retry; a resumed run that didn't restore the optimizer or the schedule; a fast engine that drifted from the reference; a device that fell back to the CPU; a tokenizer or preprocessing that differs between training and serving; a parity test skipped.
- **Test:** the run's recorded arguments and stderr; a resumed run's first iteration against the last before the stop; the engine's lockstep and parity tests; the exported model against the trainer on fixed inputs.
- **Fix:** whatever it is, with a test that would have caught it.

## 2. The objective is being gamed (an hour)

The learner is improving at something other than the goal. This shows in the health metrics before it shows in strength.

- **Signs, policy:** the capped or stalled rate rising; mean place improving while win share doesn't; entropy rising late; a replay that looks like farming, hoarding or hiding. **Signs, supervised:** held-out numbers too good to be true (a leak: a feature computed from the label, a split by row that puts a game's positions on both sides); a proxy metric improving while the task's metric doesn't.
- **Test:** the health metrics over the run and a replay or sample of its outputs; for a leak, delete the suspect feature and refit, or split by the leaking unit.
- **Fix:** reward the goal alone (`recipes.md`); no shaping term that pays for holding back (a potential on army share charged every attack at once and refunded only a capture that held, so the net learned not to attack); no placement credit unless placing is the goal; for a predictor, the split and the features that would have been available at prediction time.

## 3. The data distribution (an evening)

The learner never meets what it is measured against. In a game this is the league; in a predictor, the training set.

- **Signs, policy:** the in-training win share saturated against every league opponent; strength against the fixed panel flat while strength among the run's own snapshots keeps changing (cycling); the target class absent from the league. **Signs, supervised:** held-out performance fine, deployed performance poor; a judge fitted on one population failing on another.
- **Test:** the fixed panel at several strengths; the candidate alone among the target class and the target alone among candidates; a held-out set drawn from the deployment distribution.
- **Fix:** put the target class in the league (a port to the fast engine, or a stand-in distilled from it); start from an imitation of it so the whole run trains above its level; keep strong past nets in the league for good; weight opponents by how often they beat the learner; train exploiters against the main policy; for a predictor, data from where it will be used, or features that don't carry the population in.

## 4. The representation (an evening)

The model can't see what matters or can't express the answer.

- **Signs:** an imitation of the strongest policy plateaus at an agreement well below the teacher's self-agreement; a feature ablation that removes something the strong policy reads changes nothing (it wasn't being used), or the training loss floors early; an action factoring that can't express a move the teacher makes; a predictor whose errors cluster on cases that share a missing feature.
- **Test:** the imitation ceiling: train the model to copy the strongest policy and compare its agreement with the teacher's self-agreement. This is the cheapest test of the observation and the architecture together, and it needs no reinforcement learning. For a predictor, an error analysis by hand on a hundred held-out misses.
- **Fix:** features the strong policy reads; an action space that names every move the engine accepts; capacity where the imitation underfits.

## 5. The targets are too noisy (an evening)

What a decision is credited with is the episode's outcome, hundreds of stochastic steps later, shared with other seats; what a label says is one annotator's guess. A learner whose targets are mostly noise fits noise.

- **Signs, policy:** the value head's explained variance (1 − var(return − V)/var(return)) low or falling; advantages that barely change when the value head is swapped for a constant. **Signs, supervised:** a loss floor well above zero that no model size lowers; two labellings of the same cases disagreeing as much as model and label do.
- **Test:** explained variance per iteration; a value fit on the recorded data alone, its held-out calibration; for labels, the labeller's agreement with itself (a teacher's self-agreement at its budget).
- **Fix:** more capacity and data for the value head (every seat's outcome, not just the learner's; auxiliary targets with a shorter horizon); derived targets; a lower λ or n-step returns, accepting the bias and measuring it on the ruler; cleaner labels (the teacher at a higher budget, several labellers averaged).

## 6. The gradient is mostly noise (an evening to measure, a night to test)

A policy-gradient step averages the gradient over a batch; once the easy gains are spent the true gradient shrinks while its per-sample variance doesn't. The noise scale (after McCandlish et al.) is the batch at which a step's signal matches its noise; `riskgpu.selfplay.noise` measures it from how the gradient's squared norm shrinks with the batch. Risk measured 1.8 million decisions against updates of hundreds of thousands.

- **What noise does and doesn't do.** Noise averages out over steps: below the noise scale, a smaller batch with a learning rate scaled down to match makes nearly the same progress per sample, in more steps. So a step that is "mostly noise" is not by itself why a run doesn't climb; it is why a run needs its learning rate scaled to its batch, and why a step too large for its batch wanders far from the best it has found (the checkpoints scatter, every continuation's best is its first). A run that is held cold (small steps, scaled to the batch) and read at matched samples, and still doesn't climb, is evidence that the expected gradient isn't pointing up the ruler: a bias (cause 2's objective, cause 5's baseline, a league whose objective isn't the ruler's, cause 3) or a ceiling (cause 3). That is the reading Risk's own self-play doc reached, and it stands.
- **Signs:** checkpoints scatter without trend; the KL per update and the clip fraction jumping; a colder run that holds its ground.
- **Test:** the noise scale at a checkpoint, compared with the samples one optimizer step sees; the spread across seeds (cause 0).
- **Fix:** the learning rate scaled to the batch and decayed; larger steps per sample by accumulating several rollouts per step when the batch is far below the noise scale (this buys fewer, cleaner steps, not more signal per sample); fewer epochs over the same data when KL jumps; and the variance per sample reduced through the baseline (cause 5). Measure the noise scale again after either; it moves during training.
- **A blind spot:** the noise measure can't tell signal from a coherent bias. Anything that adds a consistent term to every gradient (a lower λ, a shaping reward) looks like more signal; whether it is comes only from the ruler.
- **Supervised:** the equivalent is a learning rate too high for the late phase, or a dataset too small for the step count; the test is a held-out curve, the fix a schedule.

## 7. The improvement operator is too weak (an evening)

In search-based learning the search must produce better decisions than the net, or the net has nothing better to learn. In distillation the teacher must be better than the student at the student's cost.

- **Signs:** search-with-net no better than net-alone on the panel; the policy targets agreeing with the net's own prior almost always; a student at the teacher's self-agreement with no edge in games.
- **Test:** play search-with-net, net-alone and search-alone against each other on the panel; the margins are the operator's strength.
- **Fix:** deeper or wider search (batched leaf evaluation to afford it), caching across chance nodes, a better prior to order moves, a stronger leaf evaluation, a teacher at a higher budget. If the engine can't afford a search that beats the net, the method doesn't fit the budget.

## 8. Capacity and optimization (nights)

- **Signs:** training and held-out loss both high (underfitting) or far apart (overfitting); a larger model learning more per sample at the end of a matched run (Risk's sweep: it didn't, so size wasn't the lever); entropy collapsing early; a fine-tune whose training loss falls while held-out rises after the first epochs.
- **Test:** a size sweep at matched samples, not matched hours; the health table in `recipes.md`; for a supervised fit, overfit one batch first (if it can't, the pipeline is broken, not the model); for a fine-tune, the base model's own numbers beside it.
- **Fix:** the schedule, the batch (cause 6), early stopping, the size (only when the sweep says so).

## 9. The problem (a finding)

Some plateaus are the problem's. A multi-player game has kingmaking and coalitions a single policy can't resolve; a stalling equilibrium can be the best reply to itself; a turn cap turns a slow win into a draw; a label may not be a function of the inputs at all (the owner's taste on features that don't carry it); a hidden-information game has no best pure strategy, so a policy that stops mixing is exploitable however strong it reads against a fixed bot.

- **Signs:** mirror tables that cap; the two mixtures disagreeing strongly; a predictor whose best model is the baseline, whatever its size; a judge that no proxy agrees with; a bot that beats the panel and loses to a best response trained against it.
- **Test:** cap rates on mirror tables; both mixtures; a replay; a best-response check; for a predictor, the label's agreement with itself across time.
- **Fix:** rulings on the cap (a cap is never a result), mixtures in the ruler, a league rather than pure self-play, an averaged or regularized strategy for hidden information, more informative inputs; and sometimes the finding is that the goal is a property of a population or a person and not a number, which the owner should hear.

## When a line stops

A line stops when a confirmed cause's fix is outside the budget the owner will give, or when the owner, briefed on the causes still open and what each test costs, rules to stop. Not before a brief, and not after ruling out all ten at any price: several nights on a line that may be dead is its own waste. "It didn't improve" is never the reason; "cause 3 confirmed, the fix needs a port we won't build before the search line is tried" is. A stopped line's checkpoints, data and findings stay where the next attempt can find them.

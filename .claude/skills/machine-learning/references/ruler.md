# The ruler: reading a night's gain

A learner is steered by its evaluation. An evaluation that can't resolve one night's gain turns every decision after it into a coin flip, and a "plateau" read on such a ruler says nothing: it may be a ceiling, a floor, noise, or real, and each needs a different response. Both of this repo's learned-bot efforts spent nights reading the wrong ruler before anything else was wrong: one judged itself on six games against the weakest opponent (0% at every reading, a floor), the other on opponents far below its target (70 to 90% wins, a ceiling) and on ladders among its own checkpoints that moved by 70 Elo when the field changed. Build the ruler first, cost it, and prove it reads before training on it.

## What one reading is

- **A number with its error.** Every reading carries an interval, and a gain is visible in one reading only when it is about twice the interval; smaller gains need several readings in the same direction. Decide the size of a reading from the gain a night is expected to bring, never from a round number. For a win share the standard error is √(p(1−p)/N):

  | Games per reading | 95% interval at p = 0.5 | at p = 0.2 |
  |---|---|---|
  | 256 | ± 6 points | ± 5 |
  | 1,024 | ± 3 | ± 2.5 |
  | 4,096 | ± 1.5 | ± 1.25 |

  For a held-out loss or accuracy, the interval comes from the held-out set's size the same way, and from bootstrapping over the unit that leaks (games, speakers).
- **The same cases for every checkpoint.** Evaluate every checkpoint of a run on the same held-out set, the same deals and seat rotations. Two policies that differ a little behave the same on most cases, so their difference on common cases has far less variance than two independent samples would, and a run's curve stops jumping with the dice. Within one run this is the difference between a readable curve and a scatter.
- **The metric is the goal, not a proxy of it.** Win share, not finishing order (outlasting isn't winning, and a placement reward produced a bot that outlasted and almost never won); the task's error, not the training loss; the listener's preference, not the recognizer's score. Proxies screen; the goal's metric decides.

## Rulers by problem class

- **A game policy:** the candidate's win share against par (k of n seats), decisive games only, the capped rate beside it; Elo per seat through the Luce model so tables of different sizes share a scale (a 30% share alone at a five-player table is about +93 Elo a seat; the shared bot-lab does this conversion). At three or more seats, both mixtures (one candidate among copies of the opponent, and one opponent among copies of the candidate), since they measure different things and disagree; at two, seat swap on common deals. The policy that is read is the policy that will play: a net that samples and the same net playing its most likely move are two bots; a search bot at two budgets is two bots.
- **A two-player hidden-information policy:** exploitability, the value a best response gains against the frozen strategy (exact on a small abstraction, a trained best response on a large game), with win share against fixed bots secondary. The shipped policy is the averaged or mixed strategy and it samples; read it sampling, never its argmax, which is exploitable however well it scores against a fixed bot.
- **A predictor:** held-out loss and the task's own metric, split by the unit that leaks; calibration (log loss or Brier against the prior's; a reliability plot), because a confident wrong predictor is worse than a vague one; the baseline model's number beside it on the same split.
- **A judge or evaluator:** agreement with the real judge on held-out cases, and a check that it transfers: an evaluator fitted on one population is tested on another before it is trusted.
- **Generated content:** blind pairwise preference by the people it is for, on a fixed set of prompts, enough pairs that the preference's interval excludes a coin flip; proxies (a recognizer's error, a similarity score) only once their agreement with the human verdicts is known. The owner's time is the scarce resource: the proxy screens, the owner decides.
- **A language-model component:** a scenario suite with pass-or-fail error scenarios and judgement scenarios whose answers are read as distributions, repeated runs per verdict, the model named with every decision; then real use, with people's flags.
- **A tuned system:** the objective on common random numbers, and then the real ruler of the thing tuned, since an optimizer's objective is a proxy that it will find the gaps in.

## The panel

For anything judged by opponents or by a benchmark set, the panel is what makes the reading meaningful.

- **Spanning the range, with the target in it.** A panel the candidate beats at 90% reads a ceiling: the share stops moving long before the bot stops improving, because almost any decision wins against such opponents. A panel of only the target reads a floor: 0% whether the gap is 50 Elo or 500. So the panel needs something the candidate beats, something near its level, and the target. When the candidate climbs past an opponent, add a stronger one and keep the old reading going so the curve stays comparable. A benchmark set for a predictor is the same: easy, medium and hard cases, because a set the model aces has stopped reading.
- **Fixed means fixed.** A panel of the run's own snapshots moves as the run does, and a ladder among checkpoints measures the field it was fitted on, not progress. Progress is read on the fixed panel only; ladders among checkpoints are read within one ladder.
- **The panel must predict the judge.** The fast reading used during training is a proxy for the judge that ships the result (the harness's gauntlet, the blind listening test, real use). Before trusting the proxy, evaluate several checkpoints both ways and check that the proxy orders them as the judge does. In Risk, strength among networks, strength against the yardstick bots and strength against the target all parted ways; the proxy that predicts the judge is the one to keep.

## Reading, deciding, ranking

Three questions, three instruments:

- **Reading a run** (is this checkpoint better than the last?): the fixed panel at fixed size on common cases, every checkpoint, interval reported, plotted against samples trained, not hours. Keep-best by this reading. A change to the recipe is read against the spread between two seeds of the base recipe, not against one run of it: in reinforcement learning that spread is often larger than a night's expected gain, and a single-seed comparison reads it as a finding.
- **Deciding** (ship it, seat it, kill the line?): a sequential test at a stated margin (the harness's SPRT, a pair of one-sided tests) on training seeds and confirmed on holdout seeds; for a predictor, a held-out set never touched during development. A sequential test spends cases until the evidence decides, which is right for a yes or no and wrong for watching a curve.
- **Ranking a field** (where does it stand among all of them?): the Bradley–Terry ladder played to a precision. Its numbers hold within the field they were fitted on; non-transitivity is real (Monopoly's archive had a rock-paper-scissors cycle at its top), so a win against the previous best is never a crown. The crown gate is "better than the base and worse than no member of the panel".

## Health beside strength

A learner that games its objective shows it in these before the strength reading moves: the capped and stalled rate (a shaped run went from 0% to 68% capped in 25 iterations), mean episode length, mean place against win share, policy entropy (spreading out rather than sharpening), the training-versus-held-out gap, and what a replay or a sample of its outputs shows. Log all of them every iteration, read them every morning, and treat a jump as a finding.

## The daily contract

Every night ends with the panel reading of every checkpoint, the best checkpoint kept, and one of three verdicts:

- **climbing**: the latest readings are above the earlier ones by more than their intervals;
- **flat**: the last three readings are within one interval of each other;
- **falling**: the latest is below the best by more than one interval, twice.

Flat for two readings' worth of the gain the plan predicted (two nights for a self-play run, an hour for a fine-tune) means the method is in question, not the learning rate: go to the diagnosis (`diagnosis.md`) before the next launch. Count progress in samples trained, never in hours: the laptop throttles and the eGPU drops out, so a night's work varies and a clock-based curve lies.

## What a run records

The run's folder keeps everything needed to read it cold: the exact arguments, the commit and a hash of the code it ran on, the machine, throughput per iteration, every training metric per iteration, every panel reading with its interval, the checkpoints and the kept best, stdout and stderr. The project's committed run log gets the summary when the run ends. A number that can't be traced to a run folder and a commit isn't evidence.

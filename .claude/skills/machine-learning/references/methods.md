# Methods at laptop scale

The method is chosen from the problem (`assessment.md`) and the budget (`budget.md`), never from ambition. Each method needs a known order of magnitude of samples and a known kind of substrate; the machine delivers a known amount per night. A method whose needs exceed the budget by ten times is not slow, it is wrong, and no hyperparameter brings it back. Each entry says what the method learns, what it needs, what it gives, when it fails, and what the repo's record says where there is one (`history.md`).

## What a night buys

Orders of magnitude from this machine's measurements, each on one of this repo's games; a new engine's first run replaces the row with its own number (`budget.md` has the table and its sources):

| Substrate | In 8 hours |
|---|---|
| A reference game engine in TypeScript on 14 workers (Risk's, Monopoly's) | about a million cheap games; thousands with a searching bot |
| A native engine (Rust) on 16 threads (Risk's) | a hundred times that per game |
| A vectorized engine on the RTX 4070 with a small net in the loop (Risk's) | about a billion decisions |
| Supervised training of a small net on the GPU | tens of millions of examples seen; a dataset of 10⁶ rows fitted many times over |
| Fine-tuning a pretrained model under 12 GB | thousands of optimizer steps: a full fine-tune of a small corpus, several times |

## A. Supervised learning

Fit a function from labelled examples: a class, a number, a ranking.

- **Needs:** 10³ examples for a linear or tree model to say something, 10⁵ and up for a net to beat them; labels whose noise is known; a split by the unit that leaks (game, speaker, day), never by row; a baseline that takes an hour.
- **Gives:** the most reliable learning there is, when the deployed inputs look like the training ones.
- **Fails when:** the label leaks into the input (a feature computed after the outcome); the training distribution isn't the deployed one (an evaluation fit on one population's games); the metric is accuracy on an unbalanced set; calibration is never checked.
- **Here:** Risk's learned evaluation beat the hand-written one on held-out log loss and then played worse, because it had learned what wins among the bots that produced the data.

## B. Imitation and distillation

Copy a stronger, slower or more expensive policy into a cheap one from its decisions, or its scores for every candidate.

- **Needs:** 10⁵ to 10⁶ labelled decisions; a teacher whose self-agreement is high enough to be worth copying (labels from a noisy teacher cap the student at the teacher's noise); features that contain what the teacher reads; a listwise loss when the teacher ranks.
- **Gives:** a fast approximation keeping a fraction of the teacher's edge that grows with data; the starting point for anything that wants to go beyond the teacher. A policy that starts at the teacher's level plays full games from its first self-play iteration.
- **Fails when:** the student can only choose among the teacher's candidates; the observation or the net can't represent the teacher's play (an agreement ceiling well below the teacher's self-agreement is the test); labels are split by position rather than game.
- **Here:** Risk's student kept about a fifth of its teacher's edge at 10⁵ labels and was still gaining about five points per doubling; Monopoly's learner, started from a uniform policy, recorded six samples a game until an imitation start made it play whole games.

## C. Search

Not learning, but the improvement operator for perfect-information games and for games where sampled worlds stand in for hidden ones, and the thing learned parts exist to make stronger there: lookahead, rollouts, sampled replies, tree search with a budget in work (nodes, replies, rollouts), never in wall-clock.

- **Needs:** a fast engine, since the bot's planning multiplies the cost of every game it is measured in; a measured budget curve (the same bot at several budgets), because more thinking is earned, not assumed.
- **Gives:** the largest gains the repo has seen in its multi-player games (Risk's reply search, +115 to +130 Elo over its planner; the native search beating that at every table), and a teacher for imitation.
- **Fails when:** the candidates it chooses among are all near-copies (more replies then sharpen a choice between alike moves and can't add a better one, which is where a learned policy prior comes in); the leaf evaluation is myopic (Monopoly's rollout search flipped buys into declines at short horizons); the search doesn't close games out; the game's hidden information makes a plan that is right in every sampled world wrong in the real one (section F).

## D. Black-box optimization

Tune a parameter vector by evaluating candidates: separable natural evolution strategies (`bot-lab/snes.ts`), CMA-ES, Bayesian optimization for a dozen expensive knobs.

- **Needs:** thousands of candidate evaluations, each on enough cases to order it against its siblings; common random numbers across a generation; an objective that can't be gamed (a worst case, pinned knobs for behaviours the objective is blind to).
- **Gives:** tens of Elo on a bot with slack, a synthesizer's or solver's constants in a night; the cheapest learning there is.
- **Fails when:** fitness is read on too few cases (Risk's cells of 240 games were "too few to trust"); the field it tunes against isn't the field it will meet (overfitting a counter); the objective is blind to a degenerate behaviour that is net-zero on it (Monopoly's optimizer found a lever that produced an infinite trade loop costing nothing in self-play); a line-search between parent and child is skipped (the raw winner was often a counter to everything but its own base).

## E. Reinforcement learning

Learn a policy from its own experience. The family, and when each member fits:

- **Policy gradient with a vectorized environment (PPO):** the default for a from-scratch policy on a fast simulator, 10⁸ to 10⁹ decisions a run, the GPU stepping thousands of games in lockstep. Needs a league with the target's strength class in it, a reward that is the goal and nothing else, a fixed panel to read on, two seeds of the base recipe, and a plan for the plateau written first: the league ceilings, the value baseline decides the variance, the learning rate must be scaled to the batch as the easy gains are spent, and any shaping that pays for holding back is learned at once (`diagnosis.md`). Here it took a Risk net from random weights to the hand-written planner's class in two nights, then wandered.
- **Value-based (DQN and kin):** small discrete action spaces, single-agent, off-policy data worth reusing (a replay buffer). Rarely the right tool for a multi-player game; fine for a puzzle or an arcade game.
- **Actor-critic for continuous control (SAC, TD3):** continuous actions, single agent, sample-efficient on a slow simulator.
- **Search-based (expert iteration, AlphaZero, MuZero):** search with the net as prior and evaluation produces decisions better than the net; the net imitates them; repeat. The well-understood route to superhuman play in perfect-information games on a fast engine, and the one that uses this repo's assets (a search, a native engine, a distillation pipeline). Its one requirement is the improvement operator: search-with-net must beat net-alone and search-alone on the panel at every iteration, or more iterations teach nothing. Monopoly built the whole loop in TypeScript with tens of simulations per move and read 0% at every evaluation: too slow an engine, too shallow a search for a stochastic four-player game.
- **Multi-agent: self-play, leagues, exploiters:** pure self-play cycles and forgets; a league of fixed strong anchors, past snapshots and the target class, weighted toward the opponents the learner loses to, is the standard fix; exploiters trained against the main policy find what it can't see. Strength is population-relative, so the ruler plays mixtures.
- **Offline RL:** learning from logged play without a simulator. Fragile; only when there is no simulator and a lot of logs.

## F. Regret and equilibrium learning

For two-player zero-sum games with hidden information (most card games, bluffing games), where the target is a mixed equilibrium strategy and a single best pure policy doesn't exist.

- **Needs:** an abstraction of the game small enough to iterate over (bucketed hands and bets), or a net in place of the table for a large one; the average of the iterates kept, never the last; a ruler of exploitability (exact on the abstraction, a trained best response on the full game).
- **Gives:** a strategy that can't be exploited by a human who plays it twice, which win share against fixed bots never certifies; the only principled target in this class.
- **Fails when:** the shipped policy is the last iterate or its argmax (both exploitable); the abstraction loses what the opponent can read; the ruler is win share against one fixed bot, which a non-equilibrium best response wins without being safe.
- **Recipe:** `recipes.md`, regret and equilibrium learning.

## G. Fine-tuning pretrained models

Adapt a model someone trained at data-centre scale: a language model with low-rank adapters, a speech or voice model, a vision backbone, an embedding model.

- **Needs:** a model that fits the card; hundreds to tens of thousands of examples; a held-out set and an early-stopping rule; the base model's own evaluation beside the fine-tune's, so regression on what it already did is seen.
- **Gives:** the only way to a competitive generative model here; a classifier from little data via an embedding model.
- **Fails when:** the fine-tune is judged by its training loss (it always falls); the data is the owner's small sample with no held-out; catastrophic forgetting of the base model's behaviour goes unmeasured; the learning rate is a full-training one.

## H. Probabilistic and classical models

Logistic regression and Bradley–Terry (the ladder itself is one), bandits for choosing among a few options online, Gaussian processes for a dozen expensive knobs, hidden-state inference for hidden-information games, Monte Carlo estimates of odds (the blitz tables).

- **Gives:** the baseline every net must beat, an answer in minutes, interpretable terms.
- **Fails when:** skipped. A net that never had to beat a logistic regression often hasn't.

## I. A language model as a component

The model is the policy or the judge, reached by an API or a local server; the work is the prompt, the view, the schema and the evaluation.

- **Needs:** a scenario suite with pass-or-fail errors and judgement distributions, repeated runs per verdict, then real use; the model recorded with every decision; no fallback that hides a failure.
- **Gives:** behaviour no small net learns here (reading a negotiation, explaining itself), at seconds and cents a decision.
- **Fails when:** judged against bots (its strength is against people); more thinking budget assumed to help (measured worse once here, and no better the other time); a prompt's facts wrong, which produced most errors.

## Choosing

The decision procedure lives in `assessment.md` and nowhere else. The one rule this file adds: the GPU does the batched work (A, B, G, E's training and vectorized environment, batched evaluation inside C), the native engine does search, labels and fast gauntlets, and the shipping runtime plays the exported result with a parity test. Never the other way round.

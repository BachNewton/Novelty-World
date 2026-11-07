# Assessing the problem

No method is named until the problem is written down. The one-page brief below is the first deliverable of any learning work: it decides the approach, it is what the owner reads and corrects before anything is built, and it is what the next session picks up. Most of the repo's wasted nights trace to a brief that was never written: a learner built before anyone asked how many samples it needed, a reward that paid for something other than the goal, a judge that couldn't see the thing being judged.

## The brief

1. **The goal, as a measurement.** What will be true when this works, as a number on a named ruler with a threshold: "better than the strongest seated bot by the harness's margin at every table size, both mixtures, on holdout seeds"; "a voice that listeners prefer to the current one in 35 of 50 blind pairs"; "held-out error under a tenth with calibrated probabilities". A goal that can't be written this way isn't ready for learning; write the ruler first (`ruler.md`).
2. **Who judges, and with what resolution.** Bots, people, the owner's ear or eye, a downstream task. The fast judge used during training is never the real one, and the gap between them is the first risk to name: bots that beat every bot and lost every game to one person; a reward that paid for placing second; a proxy metric that saturated. Say how the fast judge will be shown to predict the real one. A human judge is low-resolution: ask how many sessions they will give, state the interval that buys (ten pairs read a preference to about ±30 points, fifty to about ±14), and make the proxy carry the weight.
3. **What exists.** A simulator (exact to what? how fast, measured?); a teacher (a strong existing policy, a pretrained model, people's play); data (how much, labelled how, drawn from what distribution, with what leakage); the baseline to beat; the runtime that ships the result (a TypeScript server function, a phone, a Rust process, a Python service) and its budget per decision.
4. **The structure.** For a decision problem: how many players; perfect or hidden information; deterministic or stochastic; the action space (a few moves, thousands, structured things like trades, continuous); the horizon in decisions; the reward (a terminal win, a score, something dense); turn-based or real-time; whether players negotiate. For a prediction problem: input modality, output type, where labels come from, how the deployed inputs differ from the training ones, class balance, the cost of each kind of error. For a generative or perceptual problem: what quality means, who can tell, and whether a pretrained model exists for the modality.
5. **The budget.** Nights available; the machine's rate for this workload (`budget.md`); the owner's attention (they want to see progress each day); what else the machine must do meanwhile.
6. **Done, and not done.** The reading that ends the line as a success, and the kill rule that ends it as a finding.

## Problem classes

The class names the usual approach, the usual trap and the usual ruler. Most work here is the first class; the others come up and will keep coming up.

### Playing a game well

A policy for a sequential decision problem, judged by strength. The structure (item 4) picks the sub-class:

- **Two players, perfect information, deterministic** (chess, Go, abstract strategy): the well-understood case. Search with a learned evaluation and policy prior, trained by expert iteration, on a fast engine. A fast engine is the prerequisite, not an optimization. The ruler is win share against fixed opponents at fixed budgets, and the search's budget curve.
- **Two players, hidden information** (most card games): counterfactual regret methods for small games; for large ones, search over sampled worlds with belief tracking (knowing that a search which sees each sampled world whole can fuse plans that should differ by what it can't see), or self-play RL with care. A policy learned against one opponent is exploitable by a best response, so the ruler is exploitability (a best response trained against the frozen strategy), not just win share against a fixed bot, and the shipped policy keeps mixing (`methods.md`, section F; `recipes.md`, regret and equilibrium learning). When the real judge is one person who will play twenty games, the route is a model of their play from their logged games and a best response to that model, read by the model's exploitability; twenty games read a win share to about ±20 points and decide nothing on their own.
- **Three or more players, stochastic, long horizon** (Risk, Monopoly, Catan): no equilibrium a single policy can converge to; strength is a property of the population it is measured in, so the ruler plays mixtures (one candidate among copies of the opponent and the reverse) and a stalling equilibrium (everyone holds back) is a real attractor. What has worked here: a hand-written planner, then search over sampled replies on top of it, then learned parts that make that search stronger. From-scratch self-play reached the planner's class in two nights and stalled below the search bot. The record is in `history.md`.
- **Negotiation and trading** (Monopoly's trades, Diplomacy): a structured action space where the other side's valuation matters; opponent modelling and human data decide it; bot-only self-play is blind to the human-facing surface. The hardest class, and the one where probes with human-like players earned the most.
- **Real-time or continuous control** (an arcade game, a driving game): policy gradient or actor-critic on a vectorized environment, frame stacking or state features, shaped rewards as standard practice, behaviour cloning from the owner's play as a start. Beware the goal: an opponent that is fun to play is not the strongest one, and "fun" is a human ruler.
- **Single-player puzzles and optimization** (a solitaire, a scheduling, a layout): search (beam, tree, local search) usually beats learning outright; learning earns its place as a heuristic inside the search, trained on the search's own results.

### Predicting something

Classification, regression or ranking from data. Questions: how much data, how it was labelled, what leaks from label to input, how deployment inputs differ from training ones. Start with a baseline that takes an hour (a logistic regression, gradient-boosted trees); a net only when the baseline is beaten by it on held-out data. The ruler is held-out performance split by the unit that leaks (by game, by speaker, by day), plus calibration.

### Judging quality

A learned judge or evaluator (a value function, a quality score, a preference model). Its ruler is agreement with the real judge on held-out cases, and the warning is that a judge fitted on one population carries that population in: an evaluation fit on games among one bot learned that holding back wins among that bot.

### Generating content

Voices, music, images, text. Fine-tune a pretrained model for the modality; never train one from scratch here. The owner judges, which makes their time the scarce resource: screen with a proxy (a recognizer's error rate, a classifier, an embedding distance) calibrated against their verdicts, and bring them only the candidates that pass. The ruler is blind pairwise preference.

### Tuning a hand-written system

A bot's weights, a synthesizer's parameters, a solver's constants. Black-box optimization with common random numbers (every candidate scored on the same cases) and an objective that can't be gamed (a worst case, a constrained set). The cheapest learning there is, and bounded by what the hand-written structure can express.

### A language model as a component

Prompting, tool use and evaluation, not training, unless the brief names why a local fine-tune is needed (cost, latency, privacy, a behaviour prompting can't reach). The ruler is a scenario suite with pass-or-fail errors and judgement distributions, then real use. Monopoly's AI seats are this class.

### No learning at all

Say so when it is so: a rule, a search, a closed form or an existing service solves the problem, and a learner would add a training loop, a ruler and a night of noise to reach the same place. The owner would rather hear this than watch a model learn what a rule knew.

## Choosing the approach

This is the one decision procedure; the other files point here. Walk it in order; the first that applies is the plan, and `methods.md` has what each method needs and gives.

1. **No baseline and no teacher** (a new game, a new task): write the cheap hand-written one first, in a day. It is the ruler's floor, the first opponent, the imitation start, and the thing that shows whether the game's engine and harness work at all. Nothing learned is read against nothing.
2. **Measure the reference engine**, then do the arithmetic (`budget.md`): nights × its rate against the chosen method's sample needs with a margin of ten. When play is the data and the arithmetic fails, the next project is the fast engine, in Rust or vectorized on the GPU, with parity against the reference engine as its kill criterion; when the arithmetic passes, the reference engine is the substrate and a port is not built.
3. **A strong teacher exists** (a hand-written or search bot, people's logged play, a pretrained model): imitate it first, measure the student's ceiling against the teacher's self-agreement, then improve from there with search or reinforcement learning. A policy that starts at the teacher's level spends its nights above it; one that starts from noise spends them reaching it.
4. **A pretrained model exists for the modality**: fine-tune it. Training from scratch is a research project with a data centre's budget.
5. **The problem is tuning**: black-box optimization, with the objective and the pins written before the run.
6. **Two players and hidden information**: regret or equilibrium learning (`methods.md`, section F), with exploitability as the ruler, whatever else is layered on it.
7. **Otherwise**, the from-scratch method for the class, with the plateau plan written before the first run (`methods.md`, the policy-gradient entry), and the owner told what that method reached before and what it took.

Then, always: the ruler before the learner, including the spread between two seeds of the base recipe; the plan with predictions and a kill rule (`recipes.md`); and the fork briefing to the owner before the first night of a new line (`SKILL.md`).

## Worked assessments

Short, to show the shape; each would be a page in practice.

- **A new two-player abstract strategy game.** Perfect information, deterministic, a few hundred moves a game. Teacher: none. Plan: the engine in Rust with parity tests; a plain MCTS bot as the baseline and the first ruler; expert iteration (search with a small net as prior and evaluation, retrained on the search's choices) on the native engine, the GPU training the net; the budget curve of the search as the second ruler. Nights: two for the engine and baseline, then one a night of iteration, each read on the same opponents. Done when the net-guided search beats the plain one at equal budget by the margin.
- **A four-player card game with hidden hands and bidding.** Hidden information, stochastic, negotiation in the bidding. Teacher: a hand-written bidder, if one is written first. Plan: the hand-written bot, because it is the ruler's floor and the imitation start; search over sampled hands for the play; a learned bidder from the search bot's own games; the ruler in mixtures with a best-response check for exploitability. Not: self-play RL from scratch, which has no floor to read on until a hand-written bot exists and converges to a policy a best response exploits.
- **An arcade game where the goal is a good opponent, not the strongest.** Real-time, continuous input, the judge is the owner playing it. Plan: behaviour cloning from the owner's recorded play for a human-like baseline; a policy-gradient run on the vectorized game for strength; difficulty as a mixture of the two, chosen by the owner playing. The ruler is partly human from day one, so plan the owner's sessions.
- **A voice for the audiobook.** Generative, the owner's ear judges. Plan: fine-tune a pretrained speech model on a few minutes of the target voice; a recognizer's error rate and a speaker-similarity score as the screen; the owner hears only the candidates that pass; blind pairs against the current voice. Not: a model from scratch, or the owner auditioning every checkpoint.
- **Predicting which catalogue entries the owner will pick.** Tiny data, a human label. Plan: a logistic regression on a handful of features, held out by week, calibration checked; and the honest question whether the owner wants a predictor or a sort order, which is a rule.

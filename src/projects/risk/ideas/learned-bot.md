# The learned Risk bot: the plan

The design doc for the one line of Risk bots that learn. It is written to the `machine-learning` skill (`.claude/skills/machine-learning/`): the brief first, then the ruler, then the approach, then the plan of the next run with its predictions. It consolidates what the self-play, distillation and learned-evaluation lines found and says what they add up to. Those docs (`gpu-engine.md`, `self-play-league.md`, `distilled-v7.md`, `student-v1.md`, `rule-bot-v8.md`) stay as the record of their measurements; where their next-step sections differ from this doc, this doc is the plan. The direction is decided; the first night's predictions are written and wait on the owner's go-ahead and a night of the machine.

## The brief

1. **The goal, as a measurement.** A learned bot that passes M4 (`gpu-engine.md`, "Milestones"): better than rule-v7.1, the seated best, on the harness's SPRT at ±30 Elo a seat, at 3, 4, 5 and 6 players, one-in and one-out, on train seeds and then holdout; at most 1 capped game in 100 on the 5- and 6-player mirror tables; nine turns in ten under 5 seconds on one laptop core in the runtime that plays it. Beyond M4, the person who beats every bot: the bot's win share alone among vulture-v1s is reported beside the bar, and becomes a bar only once vulture-v1 is shown to play like him (`vulture-v1.md`).
2. **Who judges.** The harness (`risk:gauntlet`, on GitHub Actions for anything at v7.1's cost) is the judge; nothing read on the GPU decides anything about a seat. Every reading on the GPU is a proxy, and which proxy orders checkpoints as the harness does is itself measured before it is trusted (stage 0). The real judge after that is people, who have beaten every version: bot-only play is blind to what they do (`rule-bot-v9.md`, `vulture-v1.md`).
3. **What exists.** More than any learner here has used:
   - **Engines.** The reference engine (TypeScript, the one real games play on; 300, 210 and 150 greedy games a second at 3, 4 and 6 players on the pool). The native engine (Rust, exact against the reference, about a hundred times the games per game; `native-port.md`). The GPU engine (PyTorch, bit-exact against the reference on every fixture, 45,000 to 127,000 decisions a second on the RTX 4070 with the training step captured as one CUDA graph; `gpu-engine.md`).
   - **Teachers.** rule-v7.1, seated, the one to beat: v6.1's planner with a search over its opponents' sampled replies, about 2.5 seconds a turn, stall-free. native-v2 with `execute`, stronger than v7.1 at every table on train seeds at a tenth of the turn time, and not yet a teacher: it stalls in mirrors because it doesn't close games out, the native line's open bug (`roadmap.md`).
   - **Learners and pipelines.** net-v1 (`bots/net-v1/`): a transformer over the board's tokens, 128 wide, 4 layers, trained by PPO on the GPU engine from random weights; its best checkpoint, sw128b-450, is better than rule-v6 one-in and one-out and worse than rule-v7.1 (−64 win Elo, outlasting it without finishing). The trainer (`gpu/riskgpu/selfplay/`), its league, its export to TypeScript with a parity test, its mixed-table ladder and its noise-scale tool. student-v1 and its distillation pipeline (`eval/distill.ts`, `bots/rule-v8/train/distill.py`): v7's placement search copied into a small net over v6's candidates, keeping about a fifth of the teacher's edge at 10⁵ labels and gaining about five points a doubling. The position recorder and a game-record recorder (`risk:gpu-fixtures`) that keeps any TypeScript bot's games as seed and moves, which the GPU engine replays move for move.
   - **The ruler.** The harness: a game a pure function of seed and seating, both mixtures at every table, the Luce par, an SPRT as a pair of one-sided tests, a ladder played to a precision, a cache, and Actions' runners sharding a run into the same report a local run prints (`docs/actions.md`).
4. **The structure.** Three to six players; stochastic (dice, the deal); mild hidden information (other hands' cards, counts public); about 1,200 decisions in a 5-player game; a factored action (1,978 main choices and an amount bucket; `gpu/riskgpu/selfplay/actions.py`); a terminal reward, the win; no negotiation. The class is the skill's "three or more players, stochastic, long horizon": no equilibrium a single policy converges to, strength relative to the population it is read in, and a stalling equilibrium a real attractor.
5. **The budget.** Nights of 6 to 12 hours, a few at a time; the RTX 4070 for training; the laptop's 14 workers for recording and cheap screens; Actions for every gauntlet at v7.1's cost. The owner wants a number every morning.
6. **Done, and not done.** Done is M4 passed and the bot seated, which needs the runtime ruling below. Each stage names its own kill reading; the line stops when a confirmed cause's fix is outside the budget the owner will give, never on "it didn't improve".

## What the record settles for this line

The measurements are in `self-play-league.md`, `gpu-engine.md`, `distilled-v7.md`, `rule-bot-v8.md` and `bot-log.md`. What they add up to, in the skill's terms:

- **The ruler read a ceiling and a moving field.** Training was read against GD's personas (500 to 700 Elo below the target, won at 70 to 90%) and on ladders among the run's own checkpoints (which moved a net by about 70 Elo between fields). Progress toward the target was read only in rare harness runs of hours each. Every "held" and "failed" in the self-play record was read against one run, never against the spread between two seeds of the same recipe, which is unknown.
- **The learner never met the target's class.** The league held greedy, GD's personas and the run's own nets; the rule bots can't be batched onto the GPU, so nothing of v6's or v7's play was ever in a training game. That is a bias between the training objective and the ruler's, the cheapest explanation of "stronger among nets, weaker against the target" and untested.
- **From scratch reached the planner's class in two nights, then wandered.** sw128b went from random weights to three times par against GD by iteration 225 and to better-than-v6 at 450; after that the checkpoints scatter (375 at −3, 450 at +95, 575 at −139, 825 at −45 on one ladder). Colder updates slowed the drift without stopping it, a longer cold run wandered, the gradient's noise scale was 1.8 million decisions against steps of a few thousand, and a shaping reward on army share taught stalling within 25 iterations. A cold run read at matched samples that doesn't climb says the expected gradient isn't pointing up the ruler, and the two causes above are exactly that.
- **The value head was never read.** Its explained variance was not logged, so whether the baseline was one is unknown.
- **Imitation was named and never run.** The design's arm 2, a warm start from the strongest bot, was set aside for "from scratch first, as the owner asked". The record doesn't show the owner was told that starting from the strongest existing policy is the standard practice in every comparable system (`risk-bot-ai.md` collects the Risk record: every from-scratch self-play attempt at this game failed or plateaued, at any compute). The fork is re-presented below.
- **Distillation carries edge and climbs with data.** student-v1 beat rule-v6 at 3 to 5 players on holdout seeds (+20 Elo) and was even at 6; its full-board students were still gaining about five points of the teacher's edge per doubling at 10⁵ labels, and the breakdown-feature students had flattened at 16%. So the raw board holds more of v7's judgement than v6's terms, given data.
- **An evaluation fit on one population carries it in.** rule-v8's net beat v6's hand evaluation on held-out log loss and played worse in numbers: among copies of the recording's bots, holding back wins.
- **Search is the improvement operator here.** v7's reply search is the largest gain the project has measured (+115 to +130 Elo over its planner), native-v2's is larger again, and both are capped by their candidates: v6.1's best four placements are near-copies, so more replies sharpen a choice between alike moves and can't add a better one.

## The direction

By the skill's decision procedure (`references/assessment.md`, "Choosing the approach"): a baseline exists, the engines exist and are fast enough, and **a strong teacher exists**, so the learner starts from an imitation of it, measures the student's ceiling against the teacher's own consistency, and improves from there. The improvement operator this game has rewarded is search, and the search's ceiling is its candidates, which is what a learned policy exists to lift. So the line is **expert iteration anchored on the strongest bot**: imitate it, improve on it, put the improvement inside the search, repeat. From-scratch policy gradient stops being the main line; the same trainer is stage 2's improvement step from the warm start, judged on the ruler like any other.

### Stage 0: the ruler

Before any training is read, the reading is fixed:

- **A fixed panel on the GPU**, read on every checkpoint with the same deals, sampling as the bot plays, 1,024 games each (about ±3 points), both mixtures: GD Defensive at 5 players (the floor), net-v1 sw128b-450 (the planner's class), and the imitation net from stage 1 (the target's class), through the trainer's `--pair` checks. Progress is read on this panel only; ladders among a run's own checkpoints are read within one ladder and decide nothing.
- **The harness, on a schedule.** The exported best checkpoint against rule-v6.1 and rule-v7.1 at 5 players, both mixtures, on Actions, every few hundred iterations rather than every checkpoint: hours each, so they are planned, not skipped. Once three checkpoints have both readings, the panel is kept only if it orders them as the harness does.
- **The spread between seeds.** The first run of any new recipe is a pair of seeds; a one-change run is judged against their difference, not against one run.
- **Health, every iteration**: the value head's explained variance (added to the trainer's log), KL, clip fraction, entropy, capped and stalled rates, mean turns, per-opponent in-training win share, samples per second. The recipe's health table is in the skill's `references/recipes.md`.

### Stage 1: imitation of rule-v7.1

The first night. It answers the cheapest open question with the biggest consequence: **can this observation, this network and this action space copy v7.1-class play at all?** Its product is three things at once: the imitation ceiling (the skill's cause 4 test), a warm start that plays at the target's class from its first self-play iteration, and a stand-in for the target's class the GPU league can seat, since the real v7.1 can't be batched. The plan is in "The first night" below.

### Stage 2: improve from the warm start

PPO from the imitation net, with the imitation net pinned in the league beside sw128b-450 and GD's personas, the stage-0 panel, the win reward alone, and the cold recipe pf4 settled on (minibatch 32,768 in chunks, 2 epochs, learning rate 1e-4 falling). Two seeds first, read at matched samples. Its predictions are written when it starts; its kill reading is the pair against the imitation net falling below the start by more than the interval twice, which says the update is destroying what imitation gave (the learning rate, or the league), and sends the run to the diagnosis before another night. Each night's best checkpoint is exported and read in the harness against rule-v7.1 on Actions.

### Stage 3: the net inside the search

The real goal. Two routes, decided after stage 2's first harness read, with a fork briefing then:

- **The net as the search's candidate proposer and leaf.** native-v2's search with its candidates drawn from the policy head's most likely placements instead of v6.1's top four, and its leaf valued by the value head. This lifts the one ceiling every search here has hit, runs where the native search runs, and needs a forward pass in Rust (a small transformer, straightforward) plus a seat for a Rust bot.
- **A batched reply search on the GPU engine.** Every candidate played out over sampled replies with the net in every seat, thousands of games at once, the candidate of the best mean value chosen; the search's choices then distilled back into the policy (expert iteration on the GPU). The loop the assets were built for, and the larger build.

Whichever route, the improvement operator is measured before it is trusted: search-with-net must beat net-alone and the search-alone on the panel, or more iterations teach nothing (the skill's cause 7).

### Seating

A learned bot that passes M4 is seated as any bot is, after a ruling on its runtime: the TypeScript export of net-v1 fits a real turn (about 119 milliseconds a decision on one loaded core), and a bot that needs the native search needs the Rust seat the native line hasn't decided (`native-v2.md`, "Seating is a separate step").

## The first night

The plan of the stage-1 run, in the skill's shape (`references/recipes.md`, "The plan before a run").

- **Hypothesis.** net-v1's observation and network, trained to copy rule-v7.1's decisions, reach an agreement with it that is a large fraction of the teacher's own consistency, and the copy plays at the planner's class.
- **Change.** There is no base run: this is the first imitation. What it is judged against is the teacher's agreement with itself across search budgets on the same positions, which is read beside it.

### What it builds

- **The recording.** rule-v7.1's games as game records, by `risk:gpu-fixtures` (`eval/gpu-fixtures-cli.ts`): seed, every move, and the hashes the GPU replays against. The recorder plays one game at a time in one process and writes its file only when its games are done, so the night's queue runs about fourteen processes side by side, each in a loop of small batches (ten games or so to a file, under a prefix of its own), so a file lands every half hour or so and a killed process loses one batch. Seatings: 5-player tables for most games, the teacher in every seat for about half of them and in two seats among rule-v6.1, GD Defensive and GD Stacker for the rest, so its decisions cover both the positions its own class reaches and the ones the league's bots produce; a share at 3, 4 and 6 players so the net has seen every table. The arithmetic: about 1,200 decisions a 5-player game, a mirror game about five minutes on one core at v7.1's 2.5 seconds a turn, fourteen processes, so roughly a thousand games and 10⁶ teacher decisions in a night, less as the laptop throttles. The records go to `gpu/runs/records/rule-v7.1/` in the main checkout (ignored by git, never in a worktree).
- **The trainer**, `riskgpu.selfplay.imitate`, a new module beside `ppo.py`. It replays the records on the GPU engine as `lockstep.py` does, a batch of games at a time, and at every decision of a teacher's seat builds the observation (`obs.py`'s `observe`, with the turn-log tensors the runner keeps during play derived from the moves being replayed) and the target: the main choice from the move (a territory, the trade, an edge, end-attack, a move-in bucket, a pair, end-turn) and the amount bucket. A teacher amount that no bucket expresses exactly (v6.1 places the plan's own allocation and blitzes keeping the fewest armies that are as sure as all, neither of which is "all", "half" or "one") is mapped to the nearest bucket and flagged, and the flagged share is reported by kind: it is a measurement of the action space, not noise. The loss is cross-entropy over the legal main choices, cross-entropy over the amount where the group has buckets, and the value head fitted to the seat's score in the recorded game (the win reward's), so the warm start carries a baseline too. Held out by game, every fifth game. Trained to the held-out plateau with the best kept by held-out main agreement; the observations kept on the host or rebuilt by replay each epoch, whichever the memory allows. Tested first on the committed fixtures (`gpu/fixtures/rule-4p.jsonl.gz` holds rule bots' games), so the pipeline reads end to end before the night's data lands.
- **The reads.**
  - Held-out agreement with the teacher by decision kind (place, trade, attack, end-attack, move-in, fortify, end-turn) and overall, with intervals by bootstrap over games; the turn-start placement apart, since that is the search's own decision and every other is v6.1's.
  - The data curve: the same at a quarter, a half and all of the games.
  - The teacher's own consistency on the placement, read on the same positions by `risk:agreement`: rule-v7.1 as the base and `rule-v7.1~{"replies":32}` as the candidate on the base's own games. That is the ceiling the placement agreement is read against; on every other kind the ceiling is 100%.
  - The stage-0 panel on the GPU: the imitation checkpoint, sampling, against GD Defensive and against sw128b-450, one-in and one-out at 5 players, 1,024 games each (the trainer's evaluation classes, with a small entry point if it has none that reads a checkpoint without training).
  - The export (`riskgpu.selfplay.export`) as `net-v1~{"weights":"imit-1"}`, the parity test, and the harness one-in screen among four rule-v6.1 at 5 players on the laptop (about a thousand games in under an hour on the pool at the net's cost); one-out, and the 5-player read against rule-v7.1, on Actions the next day.

### The night's queue

One PowerShell script, launched in the background from PowerShell (never Git Bash), that starts the recording loops with their output redirected into the records folder, and leaves the GPU free. The imitation trainer is built and tested on the fixtures while the first batches land, then trained once on what has landed by the small hours and again in the morning on all of it, which gives two points of the data curve for free. Every job that expects the eGPU asserts the device at its start and fails loudly otherwise; the laptop stays on its charger. Permission for the CPU is the owner's "overnight run"; it is written into the brief of any agent that runs this.

### Predictions

| # | Prediction | Confidence |
|---|---|---|
| 1 | Held-out main-choice agreement with rule-v7.1 over all its decisions reaches 60% or more at the full recording. | 55% |
| 2 | The curve is still climbing: agreement on all the games is above agreement on half of them by more than its interval. | 70% |
| 3 | On turn-start placements, the net agrees with the teacher at least half as often as the teacher at 32 replies agrees with itself at 8. | 50% |
| 4 | The buckets express fewer than 70% of the teacher's placement amounts and fewer than 40% of its attack amounts exactly. | 60% |
| 5 | On the GPU panel, the imitation net alone among four GD Defensive at 5 players wins 40% or more of decisive games (par 20%). | 55% |
| 6 | In the harness, `net-v1~{"weights":"imit-1"}` alone among four rule-v6.1 at 5 players is not worse (even or better at ±30 Elo a seat). | 35% |

### Kill rule, cost, and what follows

- **Kill rule.** None for the recording, which is data whatever it shows, and none for the training, whose reading is the answer. The line's own reading: if the overall agreement at the full recording is under 40% and the curve has bent (under two points from half to all), the raw-board observation or the net can't copy the teacher, and that is fixed before any night of PPO (features the planner reads as extra tokens, or capacity), read by the same tool at an evening's cost.
- **Cost.** One night of the laptop's CPU for the recording; an hour or two of the GPU; the pool for an hour in the morning; Actions the next day for the one-out and v7.1 reads.
- **1 and 2 hold.** Stage 2 starts from `imit-1`. If the curve's slope is three points a doubling or more, a second night's recording doubles the data in the background and the imitation is read again before stage 2's first seed pair.
- **4 holds.** The amount head is extended to a count head (a masked categorical over the armies a move may carry) before stage 2, since a warm start that can't place or blitz as its teacher does starts below it; a day's work on `actions.py`, `net.py` and the TypeScript bot, then the same reads again.
- **6 fails while 1 holds.** The student agrees and loses: it has copied the wrong decisions, the ones that matter being rare. One round of the teacher asked at the student's own positions (the agreement tool's machinery, which asks a base bot a candidate's positions), added to the data, before stage 2.
- **1 fails and the curve has bent.** Cause 4, as above.
- **3 fails alone.** The search's own decision is what the net copies worst, which is expected: the warm start still carries every other decision, and the placement is what stage 2 and stage 3 exist to improve.

### The morning report

The skill's shape: every reading above with its interval; the six predictions each marked held or failed; the flagged-amount share by kind; what a replayed game of the imitation net looks like; the one change proposed for the next night with its prediction, or the diagnosis that comes first; and whether another night is worth it, in a sentence.

## Forks for the owner

Briefed in the skill's form: the question, the options with their cost and what standard practice says, the recommendation and the one piece of evidence that would change it, and what is needed.

### Now: start the learned bot from an imitation of rule-v7.1, or keep training from scratch?

- **Imitation first (recommended).** Cost: a night of the laptop's CPU and a day's build, then an hour of the GPU. Gain: the representation question answered before another night of policy gradient; a start at the target's class rather than below the planner's; a league anchor of the target's class, which the from-scratch runs never had. Risk: the action space's buckets can't express the teacher's amounts, which the test will show and a count head fixes. Standard practice: every system that reached strong play in a game of this kind started from imitation of the strongest play available (AlphaGo's supervised start, AlphaStar's, Cicero's and Diplodocus's human-anchored policies), and `risk-bot-ai.md` found no from-scratch self-play attempt at Risk that didn't fail or plateau.
- **Continue the from-scratch diagnosis.** Cost: two nights for the seed pair, then the bias tests `self-play-league.md` names. Gain: whether sw128b's recipe can climb at all. Risk: the ruler can't read progress toward v7.1 without the harness, the league still lacks v7.1's class, and the record already shows the net outlasting v7.1 without finishing. Standard practice does not favour it.
- **The evidence that would change the recommendation:** the imitation ceiling failing for a representation reason, in which case the fix comes before either.
- **Needed from the owner:** the go-ahead, and a night of the laptop.

A ruling the record holds: "from scratch first" was the owner's ask, made without the information above, and is re-presented here once. If the owner rules for it again, the line continues from scratch with the stage-0 ruler and a seed pair, and this doc records the ruling.

### Later: where the net is improved, and where it plays

Two forks that wait on stage 2's first harness read: the route for stage 3 (the net inside the native search, or a batched search on the GPU), and the runtime a learned bot is seated in (the TypeScript export fits a turn; a bot that needs the native search needs the Rust seat). Each is briefed when its evidence is in.

## What each earlier doc is now

- `gpu-engine.md`: the GPU engine's design and verification, and phase 3's measurements. Its "from scratch first" is superseded by the fork above.
- `self-play-league.md`: the record of the from-scratch line's plateau, the best-kept experiment log in the repo. Its "What comes next" is superseded: the bias diagnosis it names comes after the cheaper tests this doc runs first.
- `distilled-v7.md` and `student-v1.md`: the distillation pipeline and its findings, which stand. Its next doubling of data is not pursued as a line of its own: stage 1 asks the same question (does the raw board carry the teacher's judgement, given data) of every decision at ten times the labels, and stage 3 is where distilling a search's choices returns. student-v1 stays registered as a research bot.
- `rule-bot-v8.md`: closed; its population lesson is in stage 0's panel and stage 2's league.
- `roadmap.md`: the map across every bot line; its self-play and distillation sections point here.
- `risk-bot-ai.md`: the research survey, still the evidence for search as the core and for imitation over from-scratch self-play.

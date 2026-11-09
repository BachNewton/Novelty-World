# The learned Risk bot: the plan

The design doc for the one line of Risk bots that learn. It is written to the `machine-learning` skill (`.claude/skills/machine-learning/`): the brief first, then the ruler, then the approach, then the plan of the next run with its predictions. It consolidates what the self-play, distillation and learned-evaluation lines found and says what they add up to. Those docs (`gpu-engine.md`, `self-play-league.md`, `distilled-v7.md`, `student-v1.md`, `rule-bot-v8.md`) stay as the record of their measurements; where their next-step sections differ from this doc, this doc is the plan. The direction is decided, and stage 1 has run: its report is under the first night's predictions.

## The brief

1. **The goal.** The owner's ruling: a bot that masters the game, whose skill keeps rising as it is trained, until with enough training it beats any person. Not a bot better than rule-v7.1: v7.1 is the strongest hand-written bot, and the one expert who plays here beats it every time. As a measurement that goal is two curves and a judge. The first curve is strength against a fixed panel as a function of training compute, and the claim it has to keep making is that no ceiling is in sight: each doubling of samples gains on the panel by more than the interval. The second is the budget curve at play time, the same bot at several search budgets, because a bot that has mastered a game gets stronger when it thinks longer, and one that doesn't has stopped learning the game and started learning its opponents. The judge is people, the expert first, in logged games; a person reads a win share to about ±20 points in twenty games, so the panel carries the daily reading and must span up to and past the strongest things that exist here (rule-v7.1, native-v2, vulture-v1 as the model of the expert's play) and be shown to order bots as the expert's results do. The milestones (`gpu-engine.md`, and "Beyond M4" below) are rungs on that ladder; M4, better than v7.1 at every table in both mixtures, is one of them and not the goal.
2. **Who judges.** The harness (`risk:gauntlet`, on GitHub Actions for anything at v7.1's cost) is the judge; nothing read on the GPU decides anything about a seat. Every reading on the GPU is a proxy, and which proxy orders checkpoints as the harness does is itself measured before it is trusted (stage 0). The real judge after that is people, who have beaten every version: bot-only play is blind to what they do (`rule-bot-v9.md`, `vulture-v1.md`).
3. **What exists.** More than any learner here has used:
   - **Engines.** The reference engine (TypeScript, the one real games play on; 300, 210 and 150 greedy games a second at 3, 4 and 6 players on the pool). The native engine (Rust, exact against the reference, about a hundred times the games per game; `native-port.md`). The GPU engine (PyTorch, bit-exact against the reference on every fixture, 45,000 to 127,000 decisions a second on the RTX 4070 with the training step captured as one CUDA graph; `gpu-engine.md`).
   - **Teachers.** rule-v7.1, seated, the one to beat: v6.1's planner with a search over its opponents' sampled replies, about 2.5 seconds a turn, stall-free. native-v2 with `execute`, stronger than v7.1 at every table on train seeds at a tenth of the turn time, and not yet a teacher: it stalls in mirrors because it doesn't close games out, the native line's open bug (`roadmap.md`).
   - **Learners and pipelines.** net-v1 (`bots/net-v1/`): a transformer over the board's tokens, 128 wide, 4 layers, trained by PPO on the GPU engine from random weights; its best checkpoint, sw128b-450, is better than rule-v6 one-in and one-out and worse than rule-v7.1 (−64 win Elo, outlasting it without finishing). The trainer (`gpu/riskgpu/selfplay/`), its league, its export to TypeScript with a parity test, its mixed-table ladder and its noise-scale tool. student-v1 and its distillation pipeline (`eval/distill.ts`, `bots/rule-v8/train/distill.py`): v7's placement search copied into a small net over v6's candidates, keeping about a fifth of the teacher's edge at 10⁵ labels and gaining about five points a doubling. The position recorder and a game-record recorder (`risk:gpu-fixtures`) that keeps any TypeScript bot's games as seed and moves, which the GPU engine replays move for move.
   - **The ruler.** The harness: a game a pure function of seed and seating, both mixtures at every table, the Luce par, an SPRT as a pair of one-sided tests, a ladder played to a precision, a cache, and Actions' runners sharding a run into the same report a local run prints (`docs/actions.md`).
4. **The structure.** Three to six players; stochastic (dice, the deal); mild hidden information (other hands' cards, counts public); about 1,200 decisions in a 5-player game; a factored action (1,978 main choices and an amount bucket; `gpu/riskgpu/selfplay/actions.py`); a terminal reward, the win; no negotiation. The class is the skill's "three or more players, stochastic, long horizon": no equilibrium a single policy converges to, strength relative to the population it is read in, and a stalling equilibrium a real attractor.
5. **The budget.** Nights of 6 to 12 hours, a few at a time; the RTX 4070 for training; GitHub Actions' free runners (twenty 4-core machines at once, Linux, six hours a job) for every CPU job that splits into independent games: recordings, labels, gauntlets, ladders, native games; the laptop's 14 workers only for what the workflow can't carry or must answer in minutes. The CPU work runs on Actions while the GPU trains, so neither waits for the other. The owner wants a number every morning.
6. **Done, and not done.** There is no done: a line whose strength keeps rising with the compute it is given keeps earning nights, and is seated at each milestone it passes (which needs the runtime ruling below), so players feel every step. What ends it as a finding is a ceiling that holds: a curve that no change to the improvement operator, the league or the representation lifts, read on the panel over several nights. Each stage names its own kill reading; the line stops when a confirmed cause's fix is outside the budget the owner will give, never on "it didn't improve".

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

## Mastery, and what stands between it and the method

Said once, as the skill asks of any ruling that reaches past what standard practice can promise, and then built to. No Risk program has shown expert play against good people at any compute (`risk-bot-ai.md`); the systems whose strength rose with compute until it passed every human were two-player and perfect-information (AlphaZero's line), and in the multiplayer alliance game closest to Risk, pure self-play converged to play that people beat (DORA), while what reached the top of human ladders was search anchored to a model of human play learned from tens of thousands of human games (Diplodocus, Cicero). So three things decide whether this goal is reachable here, and the plan is shaped by them:

- **The improvement operator is search.** Strength as a function of compute comes from a loop in which search makes better decisions than the net and the net learns them (expert iteration); it does not come from policy gradient alone, which here reached the planner's class and wandered. The size of the net and the budget of the search are then the knobs that compute buys, and both are re-measured at every order of magnitude of data.
- **Strength is relative to the table.** A bot that masters play among bots can lose to a person who plays differently, as every version has. So the league and the panel carry human-style play (vulture-v1 and its successors, imitated into the GPU league once the bot is at the rule bots' class), the bot is checked against best responses trained against its frozen self (the multiplayer stand-in for exploitability), and every logged human game is data: the expert's games are the test set, and a learned model of human play is the anchor once there are enough of them (six exist; the systems above used tens of thousands).
- **The judge is slow.** People read a win share to ±20 points in twenty games, so mastery is claimed on the proxies and confirmed in logged games over months, never the other way round.

## The direction

By the skill's decision procedure (`references/assessment.md`, "Choosing the approach"): a baseline exists, the engines exist and are fast enough, and **a strong teacher exists**, so the learner starts from an imitation of it, measures the student's ceiling against the teacher's own consistency, and improves from there. The improvement operator this game has rewarded is search, and the search's ceiling is its candidates, which is what a learned policy exists to lift. So the line is **expert iteration anchored on the strongest bot**: imitate it, improve on it, put the improvement inside the search, repeat, each iteration spending more compute for more strength. The imitation is a floor and not a ceiling: the systems that passed every human started from an imitation of humans and left it behind by search and self-play. From-scratch policy gradient stops being the main line; the same trainer is stage 2's improvement step from the warm start, judged on the ruler like any other.

### Stage 0: the ruler

Before any training is read, the reading is fixed:

- **A fixed panel on the GPU**, read on every checkpoint with the same deals, sampling as the bot plays, 1,024 games each (about ±3 points), both mixtures: GD Defensive at 5 players (the floor), net-v1 sw128b-450 (the planner's class), and the imitation net from stage 1 (the target's class), through the trainer's `--pair` checks. Progress is read on this panel only; ladders among a run's own checkpoints are read within one ladder and decide nothing.
- **The harness, on a schedule.** The exported best checkpoint against rule-v6.1 and rule-v7.1 at 5 players, both mixtures, on Actions, every few hundred iterations rather than every checkpoint: hours each, so they are planned, not skipped; and once the bot is at v7.1's class, against vulture-v1 (a native bot, seated through the native seam) and native-v2, the strongest things here. Once three checkpoints have both readings, the panel is kept only if it orders them as the harness does; as the bot climbs past a panel member, a stronger one is added and the old reading kept going, so the curve stays comparable.
- **The spread between seeds.** The first run of any new recipe is a pair of seeds; a one-change run is judged against their difference, not against one run.
- **Health, every iteration**: the value head's explained variance (added to the trainer's log), KL, clip fraction, entropy, capped and stalled rates, mean turns, per-opponent in-training win share, samples per second. The recipe's health table is in the skill's `references/recipes.md`.

### Stage 1: imitation of rule-v7.1

The first night. It answers the cheapest open question with the biggest consequence: **can this observation, this network and this action space copy v7.1-class play at all?** Its product is three things at once: the imitation ceiling (the skill's cause 4 test), a warm start that plays at the target's class from its first self-play iteration, and a stand-in for the target's class the GPU league can seat, since the real v7.1 can't be batched. The plan is in "The first night" below.

### Stage 2: improve from the warm start

PPO from the imitation net, with the imitation net pinned in the league beside sw128b-450 and GD's personas, the stage-0 panel, the win reward alone, and the cold recipe pf4 settled on (minibatch 32,768 in chunks, 2 epochs, learning rate 1e-4 falling). Two seeds first, read at matched samples. Its predictions are written when it starts; its kill reading is the pair against the imitation net falling below the start by more than the interval twice, which says the update is destroying what imitation gave (the learning rate, or the league), and sends the run to the diagnosis before another night. Each night's best checkpoint is exported and read in the harness against rule-v7.1 on Actions.

### Stage 3: the net inside the search, the engine of the goal

The stage the goal lives in: the loop whose every iteration turns compute into strength, and whose two curves (strength against training compute, strength against search budget) are the goal's measurement. Two routes, decided after stage 2's first harness read, with a fork briefing then:

- **The net as the search's candidate proposer and leaf.** native-v2's search with its candidates drawn from the policy head's most likely placements instead of v6.1's top four, and its leaf valued by the value head. This lifts the one ceiling every search here has hit, runs where the native search runs, and needs a forward pass in Rust (a small transformer, straightforward) plus a seat for a Rust bot.
- **A batched reply search on the GPU engine.** Every candidate played out over sampled replies with the net in every seat, thousands of games at once, the candidate of the best mean value chosen; the search's choices then distilled back into the policy (expert iteration on the GPU). The loop the assets were built for, and the larger build.

Whichever route, the improvement operator is measured before it is trusted: search-with-net must beat net-alone and the search-alone on the panel, or more iterations teach nothing (the skill's cause 7). From here the net's size is re-swept at each order of magnitude of data, since the sweep that chose 128×4 was read at a data scale the loop will leave behind, and the search budget curve is read at every iteration, since a bot that stops gaining from more search has stopped learning the game.

### Stage 4: people

The anchor and the judge. The expert's logged games are the test set from the first stage on (`risk:export`, `risk:agreement`: how often the bot makes his moves, by decision kind, beside every bot's). vulture-v1 is the model of his play until a learned one exists; it joins the league as an imitation net once the bot is at the rule bots' class, so training meets his style, and the harness reads the bot alone among vulture-v1s and vulture-v1 alone among the bot. A best response trained against the frozen bot (one night of the trainer with the bot pinned in every other seat) reads how exploitable it is, which win share against fixed bots never certifies. Beating the expert is read in his games, many of them: at a true win share near par-plus-twenty, twenty games can't tell it from par, and the site's logged games accrue at the pace people play.

### Beyond M4

The rungs past `gpu-engine.md`'s milestones, each fixed before the run that reads it:

| | Pass |
|---|---|
| **M5** | the curve has no ceiling in sight: over three doublings of training compute on one recipe, each gains on the fixed panel by more than its interval; and the budget curve rises: the bot at four times its search budget is better than itself by the gauntlet's margin |
| **M6** | better than native-v2 at its chosen switches at every table, both mixtures, once native-v2 closes its games; better than vulture-v1 alone among four of it and in numbers against one; a best response trained against the frozen bot for a night gains under 50 Elo a seat |
| **M7** | better than the expert in his logged games: a win share above par at a size the interval excludes par from, counted as the games accrue |

### Seating

A learned bot that passes M4 is seated as any bot is, after a ruling on its runtime: the TypeScript export of net-v1 fits a real turn (about 119 milliseconds a decision on one loaded core), and a bot that needs the native search needs the Rust seat the native line hasn't decided (`native-v2.md`, "Seating is a separate step").

## The first night

The plan of the stage-1 run, in the skill's shape (`references/recipes.md`, "The plan before a run").

- **Hypothesis.** net-v1's observation and network, trained to copy rule-v7.1's decisions, reach an agreement with it that is a large fraction of the teacher's own consistency, and the copy plays at the planner's class.
- **Change.** There is no base run: this is the first imitation. What it is judged against is the teacher's agreement with itself across search budgets on the same positions, which is read beside it.

### What it builds

- **The teacher is native-v2 at its baseline**, v7.1's search on the native planner at v6.1's settings (`native-v2.md`): the same class as rule-v7.1 (it agrees with v7.1 on nine decisions in ten and matched v7's gain over v6.1 natively), at a tenth of the turn time, and stall-free where it is recorded (0.8% capped in 5-player mirrors; 1.8% at 6 players, where the recording is small). Not rule-v7.1, which the crate can't play and which costs eight times the runner time for the same class; not `execute`, which is stronger than v7.1 and stalls, so a copy of it would learn not to close games (it becomes the teacher once it does). rule-v7.1 stays the yardstick: the harness reads the imitation net against it whichever bot taught it.
- **The recording.** The teacher's games as game records, by the crate's `risk-native play` (`native/src/record.rs`: seed, every move, and the hashes the GPU replays against), on GitHub Actions' `native-play` tool (`docs/actions.md`, "Game records"): one recorder per core on twenty machines, each on its own run of seeds, the files gathered into one artifact and downloaded into `gpu/runs/records/native-v2/` in the main checkout (ignored by git, never in a worktree). Seatings, each a run of the workflow: the teacher in every seat at 5 players (seeds `imit-5m`, 3,200 games); two teachers among native v6.1 (`native-v2~{"replies":0}`), GD Defensive and GD Stacker at 5 players (`imit-5x`, 8,000), so its decisions cover both the positions its own class reaches and the ones the league's bots produce; mirrors at 6 and 3 players (`imit-6m`, 1,200; `imit-3m`, 3,200) and two teachers among GD at 4 (`imit-4x`, 4,000), so the net has seen every table. About 20,000 games and on the order of thirteen million teacher decisions, recorded in an evening with the laptop's CPU free; more is one more run away. A mirror game is dear where the search's replies seat more opponents: on the laptop a 3-player mirror takes 2 seconds and a 5-player mixed game 5, a 5-player mirror about a minute and a 6-player mirror two and a half, and a runner's core is slower again, so a machine's share is sized well inside the six-hour job limit, since a recorder writes its file only when its games are done. Every seating replays exactly on the GPU engine, checked before the runs were started. The GPU replays each record in lockstep; a record whose replay diverges (a blitz on one of the rare inputs where the runners' `pow` differs from the laptop's) is cut at the divergence, counted and reported.
- **The trainer**, `riskgpu.selfplay.imitate`, a new module beside `ppo.py`. It replays the records on the GPU engine as `lockstep.py` does, a batch of games at a time, and at every decision of a teacher's seat builds the observation (`obs.py`'s `observe`, with the turn-log tensors the runner keeps during play derived from the moves being replayed) and the target: the main choice from the move (a territory, the trade, an edge, end-attack, a move-in bucket, a pair, end-turn) and the amount bucket. A teacher amount that no bucket expresses exactly (v6.1 places the plan's own allocation and blitzes keeping the fewest armies that are as sure as all, neither of which is "all", "half" or "one") is mapped to the nearest bucket and flagged, and the flagged share is reported by kind: it is a measurement of the action space, not noise. The loss is cross-entropy over the legal main choices, cross-entropy over the amount where the group has buckets, and the value head fitted to the seat's score in the recorded game (the win reward's), so the warm start carries a baseline too. Held out by game: a recording's shard k is held out when k % 5 is 4, a fifth of the games, none split. Trained to the held-out plateau (the rate cut when a read on a fixed sample of held-out decisions stalls, training stopped when it stays stalled) with the best kept by held-out main agreement; the states are kept on the host (15.5 million decisions in about 6 GB) and the observations rebuilt from them on the GPU each minibatch, as PPO's update does. Tested first on the committed fixtures (`gpu/fixtures/rule-4p.jsonl.gz` holds rule bots' games), so the pipeline reads end to end before the night's data lands.
- **The reads.**
  - Held-out agreement with the teacher by decision kind (place, trade, attack, end-attack, move-in, fortify, end-turn) and overall, with intervals by bootstrap over games; the turn-start placement apart, since that is the search's own decision and every other is v6.1's.
  - The data curve: the same at a quarter, a half and all of the games.
  - The teacher's own consistency on the placement, read on the same positions by the crate's `agree`: native-v2 as the base and `native-v2~{"replies":32}` as the candidate on the base's own games. That is the ceiling the placement agreement is read against; on every other kind the ceiling is 100%, since every decision but the turn's first placement is the planner's.
  - The stage-0 panel on the GPU: the imitation checkpoint, sampling, against GD Defensive and against sw128b-450, one-in and one-out at 5 players, 1,024 games each (the trainer's evaluation classes, with a small entry point if it has none that reads a checkpoint without training).
  - The export (`riskgpu.selfplay.export`) as `net-v1~{"weights":"imit-1"}`, the parity test, and the harness one-in screen among four rule-v6.1 at 5 players on the laptop (about a thousand games in under an hour on the pool at the net's cost); one-out, and the 5-player read against rule-v7.1, on Actions the next day.

### The night's queue

The recording runs on Actions before the night (`gh` on the owner's own account), so its artifacts are ready when the night starts. The night's first job is reading them: each of the five runs checked for success (a lost machine only shrinks its recording; a failed run is read before anything is trained on it), each run's `risk-records` artifact downloaded into the records folder, and a sample of the records replayed in lockstep on the GPU engine. The imitation trainer is built and tested on the committed fixtures, then trained on the records by one PowerShell script, launched in the background from PowerShell (never Git Bash), its output redirected into the run's folder, with the data curve read at a sixteenth, a quarter, a half and all of the games. Every job that expects the eGPU asserts the device at its start and fails loudly otherwise, and the laptop stays on its charger. The laptop's CPU is taken only for the morning's reads (the agreement tool and the one-in screen, an hour or two on the pool); permission for that is the owner's "overnight run", written into the brief of any agent that runs this.

### Predictions

| # | Prediction | Confidence |
|---|---|---|
| 1 | Held-out main-choice agreement with the teacher over all its decisions reaches 60% or more at the full recording. | 65% |
| 2 | The curve is still climbing: agreement on all the games is above agreement on half of them by more than its interval. | 55% |
| 3 | On turn-start placements, the net agrees with the teacher at least half as often as the teacher at 32 replies agrees with itself at 8. | 50% |
| 4 | The buckets express fewer than 70% of the teacher's placement amounts and fewer than 40% of its attack amounts exactly. | 60% |
| 5 | On the GPU panel, the imitation net alone among four GD Defensive at 5 players wins 40% or more of decisive games (par 20%). | 55% |
| 6 | In the harness, `net-v1~{"weights":"imit-1"}` alone among four rule-v6.1 at 5 players is not worse (even or better at ±30 Elo a seat). | 35% |

### The first night's report

**In one paragraph.** The copy works, and the way it plays decides its strength. imit-1 makes the teacher's choice on 64.8% of held-out decisions. Played as net-v1 plays (sampling its moves), it is worse than rule-v6.1 alone among four of them: −136 win Elo. Played by its most likely move, it is better than rule-v6.1 by +110 win Elo, more than sw128b-450's +46 and about v7's own gain over its planner. But the same argmax copy stalls among its own copies, 4 of 10 five-player mirrors capped, where the teacher capped none of 160. Predictions 1 and 5 held; 3, 4 and 6 failed. 2 wasn't read that night: a second seed of the full run came out 2.1 points lower, more than the data curve's top gap, because of how the trainer's schedule cut its rate. Re-read the next night on a fixed schedule, it held, by half a point a doubling ("The day after", below). The argmax copy is better than rule-v6.1 one-out too. The next night is stage 2, from imit-1.

**What ran.** Five recordings on Actions, every machine of each succeeded: run 42405066556 (`imit-5m`, 3,200 games), 42400208888 (`imit-5x`, 8,000), 42405064040 (`imit-6m`, 1,200), 42400215077 (`imit-3m`, 3,200), 42400217997 (`imit-4x`, 4,000). Two earlier runs at the first sizes (5-player mirrors at `--count 150`, 6-player at 50) were cancelled and replaced by these. That makes 19,600 games, 18.96 million moves and 15.53 million teacher decisions. A sample of 245 games, one file per seating, replayed exactly in `lockstep.py`. The extraction then replayed every game on the GPU engine, comparing the state's hash every 32 decisions and at the end: **none diverged, none was cut**, in 20 minutes on the eGPU.

The trainer is `riskgpu.selfplay.imitate` (extract, train, read), with the stage-0 panel as `riskgpu.selfplay.panel`. 3,920 games (3.12 million decisions) are held out. The runs were imit-1 on all 15,680 training games and imit-1-f2, -f4 and -f16 on a half, a quarter and a sixteenth of them, each capped at 100 million samples. The full and the half both reached the cap still climbing, at 7.8 and 14.8 epochs; the quarter and the sixteenth stopped at their plateaus. In the morning, imit-1-s2 ran the full recipe again on seed 2. Every interval below is 95%: by bootstrap over games for agreement, Wilson for win shares.

**Held-out agreement with the teacher** (imit-1). "Main" is the choice of move and place; "move" is the whole move, its amount included.

| Teacher's move | Decisions | Main | Move |
|---|---|---|---|
| all | 3,119,327 | **64.8% [64.6, 65.0]** | 49.4% [49.2, 49.6] |
| turn-start placement (the search's own decision) | 305,750 | 41.5% [41.2, 41.8] | 28.0% [27.7, 28.3] |
| other placement | 100,510 | 70.4% [70.1, 70.7] | 65.0% [64.7, 65.4] |
| trade | 91,926 | 97.7% [97.6, 97.8] | 82.9% [82.7, 83.2] |
| attack | 1,259,710 | 65.2% [64.9, 65.5] | 33.8% [33.4, 34.2] |
| end the attack | 292,724 | 72.7% [72.4, 72.9] | the same |
| move in | 774,929 | 74.2% [74.0, 74.5] | 72.9% [72.6, 73.2] |
| fortify | 266,956 | 40.2% [40.0, 40.5] | 35.2% [35.0, 35.4] |
| end the turn | 26,822 | 59.5% [58.2, 61.0] | the same |

By seating, main agreement falls with the table: 72.4% at 3 players, 69.5% at 4 (two teachers among GD), 67.2% in the 5-player mixed games, 62.0% and 61.5% in the 5- and 6-player mirrors.

**The data curve**, main agreement on all held-out decisions:

| Training games | Main | Turn-start placement | Value head's explained variance |
|---|---|---|---|
| 980 (a sixteenth) | 56.5% [56.3, 56.8] | 35.4% [35.1, 35.6] | 40.5% |
| 3,920 (a quarter) | 61.5% [61.3, 61.7] | 39.5% [39.2, 39.7] | 41.3% |
| 7,840 (a half) | 63.1% [62.9, 63.3] | 40.6% [40.3, 40.8] | 41.9% |
| 15,680 (all) | 64.8% [64.6, 65.0] | 41.5% [41.2, 41.8] | 42.2% |

| 15,680 (all), seed 2 (`imit-1-s2`) | 62.7% [62.5, 62.9] | 40.2% [40.0, 40.5] | 41.9% |

At face value that is 2.5 points a doubling at the small end and 1.6 at the top. **The seed pair says the top of the curve isn't read yet.** `imit-1-s2` is the full recipe again on seed 2, allowed past the cap. It tracked imit-1 within 0.4 points at matched steps until the plateau rule cut its rate at step 9,500, on a read's noise. imit-1's first cut came at 19,500. Seed 2 then stopped at its plateau, at 90 million samples and 62.7%, 2.1 points under imit-1 and below the half-data run, whose first cut also came early (step 10,000). The spread between two seeds of this recipe is larger than the gap between half the data and all of it, and it comes from the trainer's schedule (a rate cut after two reads without a gain on a monitor sample whose own noise is about the late gains' size), not from the data. The fix is the standard one: a fixed schedule over a set sample budget, the held-out read only choosing the checkpoint. Then the half and the full are re-read on two seeds each. The value head explains 42% of the variance of a seat's final score on held-out games, so stage 2 starts with a baseline, which the from-scratch runs never measured.

**The teacher's own consistency**, read by the crate's `agree` on 40 held-out 5-player mirror games, the same 7,211 turn-start placements the net was read on. (`agree` gained the turn-start tally and the off-path rule `agree-log` already had: once the bot answers a reinforce phase's decision otherwise than recorded, the phase's later decisions aren't asked.)

| On the same positions | Turn-start placement, whole move |
|---|---|
| native-v2 at 32 replies, against its own choice at 8 | 65.0% [63.8, 66.2] |
| native-v2 at 0 replies (v6.1's planner) | 33.4% [32.5, 34.3] |
| imit-1 | 25.7% [24.3, 27.0] (the territory alone: 39.7% [38.3, 41.2]) |

Every attack, move-in and fortify the teacher makes is its planner's, deterministic: 100% at 32 replies as at 0. So the ceiling on every decision but the turn-start placement is 100%, and the net reaches about two thirds of it.

**The action space.** The buckets can't express 22.0% [21.9, 22.1] of the teacher's held-out moves: 11.7% [11.6, 11.8] of placements, 14.8% [14.6, 15.1] of trades (another set or bonus than the trade rule's), 45.8% [45.4, 46.2] of attacks, 4.2% of move-ins and 5.9% of fortifies. The attacks are all blitzes. Battles are always expressed: the teacher's fewer dice are always the most it may roll. In the 5-player mirrors, 57% of its blitzes keep back a count of armies that is neither one nor half the source, mostly seven or more. That is where the move agreement on attacks falls from 65% to 34%.

**The panel**, on the GPU at 5 players, 1,024 games each. It reads par on its own calibration: sw128b-450 against itself, one-in 20.7% [17.4, 24.4] (par 20%), one-out 82.0% [78.5, 85.1] (par 80%). sw128b-450 alone among GD Defensive wins 69.7% [66.8, 72.5].

| imit-1 | Sampling | Argmax |
|---|---|---|
| alone among four GD Defensive (par 20%) | 81.5% [79.0, 83.7] | 94.0% [92.4, 95.3], none capped |
| alone among four sw128b-450 (par 20%) | 13.7% [11.0, 16.9] | 29.3% [25.5, 33.4] |
| four against one sw128b-450 (par 80%) | 75.6% [71.7, 79.1] | 91.1% [88.3, 93.3], 5.5% capped |

**The harness.** imit-1 is exported as the net-v1 weight set `imit-1`. The parity test passed on a fixture of its own (4 games on the reference engine, all 736 network decisions within the test's tolerance, every move the same); the fixture isn't kept, since the committed fixtures already hold the network's code and the exporter. On train seeds, 5 players, alone among four rule-v6.1, by the gauntlet's SPRT (±30 Elo a seat):

- `net-v1~{"weights":"imit-1"}` (sampling): **worse**, 10.2% [6.8, 15.2] of 205 decisive games against par 20%, win Elo −136, finishing-order Elo −52, mean place 3.30, none capped.
- `net-v1~{"weights":"imit-1","pick":"argmax"}`: **better**, 32.0% [25.5, 39.2] of 175 decisive games, win Elo +110, finishing-order Elo +111, mean place 2.38, none capped.

**A replayed game.** Five argmax copies at one table (`risk:trace --mirror`). The traced game ended in 71 player-turns: a capture every turn, no idle turn, armies on the board kept to 50 or 60 and the cards cycling, the winner taking five continents. The survey of 10 such games tells the other half: 4 capped [Wilson 17%, 69%], the decided ones 279 turns on average, 409 armies on the board at turn 100. The teacher's 5-player mirrors capped 0 of 160, median 203 turns. Among rule-v6.1 the copy closes its games; among copies of itself it often doesn't, as net-v1's from-scratch checkpoints didn't when they played argmax.

**The predictions.**

| # | Reading | |
|---|---|---|
| 1 | 64.8% [64.6, 65.0] | **held** |
| 2 | on the plateau rule, all 64.8% [64.6, 65.0] against half 63.1% [62.9, 63.3], inside the seeds' 2.1-point spread; re-read on a fixed schedule, all 64.0% and 63.9% against half 63.4% and 63.3%, on two seeds each | **held**, on the re-read ("The day after", below): all is above half by 0.55 points on each seed, outside the reads' intervals and four times the seeds' spread, though at a sixth of the three points a doubling the plan set for another recording |
| 3 | 25.7% [24.3, 27.0] against half of 65.0%, 32.5% | **failed**: the net copies the search's own decision worse than v6.1's planner does (33.4%) |
| 4 | the buckets express 88.3% of placements and 54.2% of attacks | **failed**: they express more than predicted; the misses are blitz keeps, 57% of mirror blitzes |
| 5 | 81.5% [79.0, 83.7] (94.0% argmax) | **held** |
| 6 | sampling: worse, −136 win Elo | **failed** as written; the argmax copy is better, +110 |

**What it rules out.** Cause 4 (the representation can't copy the teacher) is ruled out: two thirds of the decisions, and a copy stronger than v6.1, from the raw board on net-v1 as it stands. The rule for "6 fails while 1 holds" (a DAgger round, on the reading that the copy learned the wrong decisions) doesn't apply. The argmax read shows its most likely moves win; what loses is sampling from a copy that is unsure on a third of its decisions, over hundreds of decisions a game. The next step is stage 2 from imit-1: 1 holds, and the copy is already past v6.1, which is what a warm start needs. Whether more data pays is still open, since prediction 2 isn't read. But even the face-value slope, 1.6 points a doubling, is under the plan's three, so no second recording round until the curve is re-read. Prediction 4's rule (a count head) is not triggered as written. The blitz keeps are still the action space's one large miss, and a candidate once stage 2 has read.

**Two rulings for the line, from these readings.** How a learned bot plays (sampling, argmax, or a temperature between) is a measured choice per checkpoint, never fixed by a past one's result: argmax stalled the from-scratch nets and makes this copy strong. So every panel read of stage 2 is taken both ways. And the stall is a health reading of every checkpoint: the argmax copy's mirror cap rate, beside its strength.

**The next night: stage 2's seed pair from imit-1.** PPO (`ppo.py --init` from imit-1's weights), with imit-1 pinned in the league beside sw128b-450 and GD's personas, the win reward alone and pf4's cold recipe, two seeds. PPO samples and is paid only for the win, and a capped game scores below placing behind the survivors, so it attacks both of the copy's faults at once: sampling's noise and argmax's stall. Predictions, read at matched samples on the panel each 25 iterations:

| # | Prediction | Confidence |
|---|---|---|
| 1 | By the night's end, the sampled learner alone among four sw128b-450 reaches par (20%) or more, from 13.7%. | 60% |
| 2 | The argmax learner alone among four GD Defensive stays at 90% or more throughout: PPO doesn't unlearn the copy. | 65% |
| 3 | The argmax learner's 5-player mirror cap rate falls below 20%, from 40%. | 45% |
| 4 | The two seeds' best checkpoints are within 30 win Elo of each other on the panel's pair read. | 55% |

The kill reading is the plan's: the pair against imit-1 falling below the start by more than its interval twice. Then the update is destroying what imitation gave, and the standard fix, a KL penalty toward the imitation policy (AlphaStar's), is the diagnosis's first test. Before it, two things that take the GPU or the runners for hours, not a night:
- the reads the plan leaves for Actions: the argmax copy one-out among rule-v6.1, and one-in and one-out against rule-v7.1, at 5 players;
- the imitation trainer on a fixed schedule, with the half and the full re-read on two seeds each. That gives prediction 2 its reading and gives stage 2 a known spread for the imitation it starts from.

**Is another night worth it?** Yes. One night took the learned line from below the planner's class to a copy that beats rule-v6.1 by more than any net here has, and stage 2 is the first time policy improvement starts from the target's class.

#### The day after: the Actions reads and the curve on a fixed schedule

**The argmax copy one-out among rule-v6.1** (Actions run 42461754595, train seeds, 5 players, brought in by `risk:import`). Four `net-v1~{"weights":"imit-1","pick":"argmax"}` against one rule-v6.1 read **better**. The copies won 92.0% [86.8, 95.3] of 162 decisive games against a par of 80% (149 to 13), at win Elo +183 and finishing-order Elo +92, with the lone v6.1's mean place 2.99. But 48 of the 210 games (22.9%) reached the cap. Four copies at one table stall nearly as often as five, while the copy alone among four v6.1 never capped. So the stall belongs to the copy's own play meeting itself, not to the table.

**Against rule-v7.1, one-in and one-out** (run 42461757380). It was still playing its seventh round when the curve finished. Rule-v7.1's search makes every round long, so it is read when it lands.

**The data curve on a fixed schedule.** `imitate.py` now trains on a fixed schedule over 100 million samples: 500 steps of warmup, then a cosine fall from 5e-4 to zero. The held-out read now only chooses which checkpoint is kept. Four runs used it: the half and the full recording, each on seeds 1 and 2 (`imit-2-f2`, `imit-2-f2-s2`, `imit-2`, `imit-2-s2`). Each was read on all 3.12 million held-out decisions:

| Training games | Main, seed 1 | Main, seed 2 | Turn-start placement, seeds 1 and 2 |
|---|---|---|---|
| 7,840 (a half) | 63.4% [63.2, 63.6] | 63.3% [63.1, 63.5] | 40.8%, 40.8% |
| 15,680 (all) | 64.0% [63.8, 64.2] | 63.9% [63.6, 64.1] | 41.1%, 41.0% |
| imit-1: all, on the plateau rule | 64.8% [64.6, 65.0] | | 41.5% |

- **The fixed schedule removed the spread between seeds.** Two seeds land 0.13 points apart on the full data and 0.10 on the half. Under the plateau rule they were 2.1 points apart.
- **More data still helps, but only a little.** The full data beats the half by 0.57 and 0.54 points on the two seeds, outside both reads' intervals and four times the spread between seeds. Prediction 2 holds. The slope is half a point a doubling, a third of what the plateau runs showed at face value and a sixth of the three points the plan set before another recording.
- **At full data, the trainer is short of steps more than of games.** On the same data, imit-1 beats both fixed-schedule runs by 0.8 points. It also fits its own training data better: 65.6% agreement on training decisions, against 64.7% for the full runs. The plateau rule happened to keep imit-1 at the full rate for 19,500 of its 24,415 steps, while the cosine spends half of them below half that rate. So the full runs are underfitted. The half-data runs are the opposite case: they agree 65.2% on training decisions against 63.4% held out, a 1.8-point gap, where the full runs' gap is 0.7. A longer schedule, not a new recording, is the cheaper next point of agreement. imit-1 stays the best copy and stage 2's start.
- **Throughput.** The four runs went in two pairs, each pair sharing the GPU while another session's builds shared the CPU. They trained 5,500 to 8,200 samples a second each, 11,000 to 16,300 a pair, against the 27,000 imit-1 managed alone. A timing on a shared machine can't say which contention cost the most, but the cost itself is clear: the curve took the whole night (23:20 to 07:51), and stage 2 didn't start. An imitation run takes the GPU on its own from now on.

### Kill rule, cost, and what follows

- **Kill rule.** None for the recording, which is data whatever it shows, and none for the training, whose reading is the answer. The line's own reading: if the overall agreement at the full recording is under 40% and the curve has bent (under two points from half to all), the raw-board observation or the net can't copy the teacher, and that is fixed before any night of PPO (features the planner reads as extra tokens, or capacity), read by the same tool at an evening's cost.
- **Cost.** An afternoon of Actions for the recording, the laptop's CPU free; an hour or two of the GPU; the pool for an hour or two in the morning; Actions the next day for the one-out and v7.1 reads.
- **1 and 2 hold.** Stage 2 starts from `imit-1`. If the curve's slope is three points a doubling or more, another Actions round doubles the data while stage 2's first seed pair trains, and the imitation is read again on it.
- **4 holds.** The amount head is extended to a count head (a masked categorical over the armies a move may carry) before stage 2, since a warm start that can't place or blitz as its teacher does starts below it; a day's work on `actions.py`, `net.py` and the TypeScript bot, then the same reads again.
- **6 fails while 1 holds.** The student agrees and loses: it has copied the wrong decisions, the ones that matter being rare. One round of the teacher asked at the student's own positions (the agreement tool's machinery, which asks a base bot a candidate's positions), added to the data, before stage 2.
- **1 fails and the curve has bent.** Cause 4, as above.
- **3 fails alone.** The search's own decision is what the net copies worst, which is expected: the warm start still carries every other decision, and the placement is what stage 2 and stage 3 exist to improve.

### The morning report

The skill's shape: every reading above with its interval; the six predictions each marked held or failed; the flagged-amount share by kind; what a replayed game of the imitation net looks like; the one change proposed for the next night with its prediction, or the diagnosis that comes first; and whether another night is worth it, in a sentence.

## Forks for the owner

Briefed in the skill's form: the question, the options with their cost and what standard practice says, the recommendation and the one piece of evidence that would change it, and what is needed.

### Ruled: start the learned bot from an imitation of rule-v7.1, or keep training from scratch?

The owner ruled for imitation first by running stage 1. The briefing stays below as the reasoning.

- **Imitation first (recommended).** Cost: a few hours of Actions' runners and a day's build, then an hour or two of the GPU, with the laptop's CPU left free. Gain: the representation question answered before another night of policy gradient; a start at the target's class rather than below the planner's; a league anchor of the target's class, which the from-scratch runs never had. Risk: the action space's buckets can't express the teacher's amounts, which the test will show and a count head fixes. Standard practice: every system that reached strong play in a game of this kind started from imitation of the strongest play available (AlphaGo's supervised start, AlphaStar's, Cicero's and Diplodocus's human-anchored policies), and `risk-bot-ai.md` found no from-scratch self-play attempt at Risk that didn't fail or plateau.
- **Continue the from-scratch diagnosis.** Cost: two nights for the seed pair, then the bias tests `self-play-league.md` names. Gain: whether sw128b's recipe can climb at all. Risk: the ruler can't read progress toward v7.1 without the harness, the league still lacks v7.1's class, and the record already shows the net outlasting v7.1 without finishing. Standard practice does not favour it.
- **The evidence that would change the recommendation:** the imitation ceiling failing for a representation reason, in which case the fix comes before either.
- **Needed from the owner:** the go-ahead, and a night of the laptop.

A ruling the record holds: "from scratch first" was the owner's ask, made without the information above, and is re-presented here once. If the owner rules for it again, the line continues from scratch with the stage-0 ruler and a seed pair, and this doc records the ruling. The goal itself is the owner's ruling, recorded in the brief with what the record says about it ("Mastery, and what stands between it and the method"), and the plan is built to it; the imitation start serves it as a floor, as it did for every system that went past people.

### Later: where the net is improved, and where it plays

Two forks that wait on stage 2's first harness read: the route for stage 3 (the net inside the native search, or a batched search on the GPU), and the runtime a learned bot is seated in (the TypeScript export fits a turn; a bot that needs the native search needs the Rust seat). Each is briefed when its evidence is in.

## What each earlier doc is now

- `gpu-engine.md`: the GPU engine's design and verification, and phase 3's measurements. Its "from scratch first" is superseded by the fork above.
- `self-play-league.md`: the record of the from-scratch line's plateau, the best-kept experiment log in the repo. Its "What comes next" is superseded: the bias diagnosis it names comes after the cheaper tests this doc runs first.
- `distilled-v7.md` and `student-v1.md`: the distillation pipeline and its findings, which stand. Its next doubling of data is not pursued as a line of its own: stage 1 asks the same question (does the raw board carry the teacher's judgement, given data) of every decision at ten times the labels, and stage 3 is where distilling a search's choices returns. student-v1 stays registered as a research bot.
- `rule-bot-v8.md`: closed; its population lesson is in stage 0's panel and stage 2's league.
- `roadmap.md`: the map across every bot line; its self-play and distillation sections point here.
- `risk-bot-ai.md`: the research survey, still the evidence for search as the core, for imitation over from-scratch self-play, and for what mastery against people needs that nothing here has yet: human games as data.

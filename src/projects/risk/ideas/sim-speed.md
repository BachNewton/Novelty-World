# Simulation speed: the next iteration bottleneck

The ways to make Risk's measuring runs faster, in order of payoff per effort, and which are done. Simulation time sets how many ideas a night can test, and it grows with two things at once: stronger bots think more per decision, and more seated bots mean more pairs to rate. Nothing here changes what a run measures; every lever keeps games bit-identical, which `bots/frozen.test.ts` holds for every seated bot.

## Where the time went (measured, 2026-10-17, before the levers below)

From `eval/runs.jsonl` and `bot-log.md`:

- **The bots, not the engine.** On one core at 4 players greedy plays about 31 games a second, a GD persona about 11, rule-v1 about 3.3 (1,500 decisions a second): roughly 90% of a rule-bot game is the bot's own planning. v2 and v3 cost more again: their threat model runs each opponent's sweep for every neighbour on every plan scored, and 6-player games among them last about 108 turns against 55 for v1's.
- **Idle workers**, fixed: batches waited on their slowest game, so the pool averaged 40 to 65% of the machine with peaks at 95%. The pool now takes many runs at once and every worker pulls from one queue.
- **Ratings grew with the square of the seated bots.** Every run played every pair afresh: 7 bots (21 pairs, 54,600 games) took 106 minutes on the old pool, 8 bots (72,800 games) 173 minutes.
- **Gauntlets** between rule bots ran 3.4 to 13 games a second, 20 to 90 minutes for a full field, and about 60% of a full gauntlet's games were the field's own ladder, replayed on every run.

## Done

1. **Each matchup's ratings games are cached** (`eval/ratings-cache.ts`, the project's `CLAUDE.md`, "Measuring bots"). A record answers while the code its games ran on is unchanged, by a hash of both bots' import closures and the game's code, so a new bot costs only its own matchups, and a gauntlet's field ladder is played once. The cache stores each matchup's comparisons summed, which give exactly the Elo its games do.
2. **rule-v2 and rule-v3 play about twice as fast, move for move the same.** Profiled on 6-player rule-v3 games: about 90% of the time was the evaluation, half of it the kill chances and a quarter the sweeps. One sweep and one look at the blows now serve both the aim and the border loss (it was three sweeps per opponent); the inner loops run on flags instead of building sets, closures and arrays; a cover order is worked out once per way in, not once per launch stack; an evaluation and a plan are remembered by the whole position (a third of evaluations repeated a board, and each move-in plans the board the next attack plans again); path runs are keyed by integers, small battle outcomes by array index. On one core:

   | Table | Before | After |
   |---|---|---|
   | rule-v3 ×4 | 1.46 games/s | 3.4 |
   | rule-v3 ×6 | 0.25 | 0.56 |
   | rule-v2 ×4 | 0.79 | 1.7 |
   | rule-v2 ×6 | 0.51 | 1.29 |
   | v3, GD Stacker, v2 mixed, 4p | 1.47 | 3.2 |
   | same, 6p | 0.67 | 1.47 |

   rule-v1 gained about 10% from the shared odds; its planner differs and isn't the bottleneck. The seatable ratings rerun on the faster bots played the same 41,146,551 decisions and wrote `ratings.json` byte for byte as before, in 156 minutes against 173, but the machine was shared and the run's own CPU averaged 44%, so that wall time understates the gain; why a ratings run fills the pool less than a single table does is open.

## The machine (measured, 2026-10-17)

The Ryzen 7 7840U has 8 cores and 16 threads, and the pool defaults to 14 workers. On 6-player v3-and-v2 tables:

| Workers | Games/s | Of 14 workers' |
|---|---|---|
| 1 | 0.70 | 21% |
| 4 | 1.78 | 54% |
| 8 | 2.90 | 88% |
| 14 | 3.29 | 100% |

Past one worker a core, each game costs about twice the CPU time it does alone: the second thread of a core shares its units, and every core busy runs at a lower clock. So `--workers 8` keeps 88% of the throughput and leaves half the threads free for other work on the machine.

## Measured and dropped

- **A paired SPRT statistic** (fishtest's pentanomial idea): it pays only if a rotation group's total varies less than its games would independently. Measured on four pairings (120 to 200 groups each, 3, 4 and 6 players, both mixtures), the group variance was 0.88 to 1.18 times the independent one: between different bots, games diverge too soon for the rotation to cancel much. It would save at most about a tenth of a gauntlet's games, so the plain per-game statistic stays. Only near-identical bots show the effect (two copies land every group on par).

- **Cache sizes have a sweet spot, and it is small.** On a fixed workload of 4- and 6-player v2-and-v3 games, all four caches (plans, evaluations, path runs, large battle outcomes) scaled together: 20 times the first limits was 3 to 7% slower in CPU time (heap 472 MiB against 95), 0.002 times 25 to 35% slower (answers forgotten before they repeat), and about 0.03 times the fastest, about 5% faster than the first limits on average and 10% on the best runs, with a 22 MiB heap. Repeats come within a few decisions, so a small cache catches nearly all of them, and anything bigger only costs the garbage collector. The limits are set there (30 plans, 300 evaluations, 3,000 path runs, 1,500 large outcomes); small battle outcomes keep their flat table, which never empties.

## The levers left, by payoff

1. **The kill chances, further.** Still about half of a v3 decision: each evaluation checks every opponent's kill on every other player, and the ones that pass the force check run the full capture planner over the victim's territories. Caching them by the region they read (the classes and armies within two steps of the victim) would answer only 17 to 30% of those calls (measured), and a bound that skips a kill which can't beat the one already found (a chance is at most 1) would skip only 6% (measured). So the next gain is making the capture planner's path runs cheaper: the misses among them, about 7% of calls but long paths with large stacks, are a fifth of a 6-player decision.
2. **An anchor panel for the ratings** (Monopoly's `RATING_PANEL`), now much less urgent: with the cache a new bot costs its own matchups, so the panel only matters once that column is itself too long (about 15 seated bots).
3. **Seat only versions worth a player's choice.** A version that is neither a new strongest nor a different kind of opponent stays in the measuring registry, its numbers in the bot log, and costs the ratings nothing.
4. **Start the gauntlet's field games behind its pairings** in the pool's queue. The cache makes this matter only on a field's first run.
5. **A hot kernel in Rust compiled to WebAssembly**, only once profiling shows one dominates. The project's speed spike measured Rust about 3.3 times TypeScript on a bot-style evaluation kernel (2.3 times as WebAssembly) and about 2 to 2.5 times on whole games; the JS-to-WebAssembly boundary was cheap (`speed-spike.md`, `language-decision.md`). A full rewrite in Rust would buy about 2.5 to 3 times overall for weeks of work and a second toolchain.

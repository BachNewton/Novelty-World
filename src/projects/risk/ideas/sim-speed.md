# Simulation speed: the next iteration bottleneck

An idea, not started: the ways to make Risk's measuring runs faster, in order of payoff per effort. Simulation time already sets how many ideas a night can test, and it grows with two things at once: stronger bots think more per decision, and more seated bots mean more pairs to rate. Nothing here changes what a run measures; every lever keeps games bit-identical to today's.

## Where the time goes (measured, 2026-10-17)

From `eval/runs.jsonl` and `bot-log.md`:

- **The bots, not the engine.** On one core at 4 players greedy plays about 31 games a second, a GD persona about 11, rule-v1 about 3.3 (1,500 decisions a second): roughly 90% of a rule-bot game is the bot's own planning. v2 and v3 cost more again: their threat model runs each opponent's sweep for every neighbour on every plan scored, and 6-player games among them last about 108 turns against 55 for v1's.
- **Idle workers**, fixed: batches waited on their slowest game, so the pool averaged 40 to 65% of the machine with peaks at 95%. The pool now takes many runs at once and every worker pulls from one queue.
- **Ratings grow with the square of the seated bots.** Every run plays every pair afresh: 7 bots (21 pairs, 54,600 games) took 106 minutes on the old pool; 12 bots would be 66 pairs, about 170,000 games; 20 bots 190 pairs.
- **Gauntlets** between rule bots ran 3.4 to 13 games a second tonight, 20 to 90 minutes for a full field.

## The levers, by payoff

1. **Cache each pair's ratings games.** A seated version is frozen and a game is a pure function of its seed and seating, so a pair's tally never changes: keep it (as Monopoly's `ratings-cache.json` does, keyed by the pair, the table, the seed stream, the group count and the turn cap) and play only pairs not seen. A new bot then costs its own pairs only: linear growth, not quadratic. The cache is valid only while the seated bots, the engine and the rules are unchanged, so each entry records the commit and the code it depends on, and a change there clears it for one full run. About an hour.
2. **Profile the rule bots' threat model and speed it up in TypeScript.** Within one decision the same opponent sweeps the same territories over and over across plans; cache sweeps by the board they read, compute the parts that don't depend on the plan once per decision, and stop re-deriving each opponent's neighbours per evaluation. Probably 2 to 5 times on v2 and v3 decisions, and it pays on every run and in real games.
3. **An anchor panel for the ratings** (Monopoly's `RATING_PANEL`, for when about 12 to 15 bots are seated): a fixed panel of about five bots spanning the ladder plays each other, and every other bot plays only the panel. Elo needs a connected graph of comparisons, not a complete one; Monopoly measured the panel reproducing the full round-robin within a few Elo. Each new bot then costs a fixed amount however many exist.
4. **Seat only versions worth a player's choice.** A version that is neither a new strongest nor a different kind of opponent stays in the measuring registry, its numbers in the bot log, and costs the ratings nothing.
5. **A paired SPRT statistic** (fishtest's pentanomial idea, already named in the project's `CLAUDE.md`): treating each rotation group's games as independent overstates their variance, so the gauntlet plays more games than it needs; a statistic on each group's total decides sooner at the same error rates.
6. **Start the gauntlet's field games behind its pairings** in the pool's queue, so they fill the time while the last pairing finishes (needs a priority in the shared queue).
7. **A hot kernel in Rust compiled to WebAssembly**, only once profiling shows one dominates. The project's speed spike measured Rust about 3.3 times TypeScript on a bot-style evaluation kernel (2.3 times as WebAssembly) and about 2 to 2.5 times on whole games; the JS-to-WebAssembly boundary was cheap (`speed-spike.md`, `language-decision.md`). A full rewrite in Rust would buy about 2.5 to 3 times overall for weeks of work and a second toolchain, less than levers 1 to 3 together.

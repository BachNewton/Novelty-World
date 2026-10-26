# Risk bots: where each line stands and what comes next

A map across the lines of bot work, for picking the next step. It holds no measurements of its own: each line's doc and `bot-log.md` have the numbers, and this says what they add up to. The goal throughout is a bot stronger than the seated rule-v6 that players can feel, and fast enough to simulate and train with.

## rule-v7.1: v7's search on v6.1

v7 at 8 replies is about 115 win Elo above v6 on the ladder and beat every bot at every table on train and holdout seeds, but tables of v7s cap about half their 6-player games, the stall it inherits from v6. v7.1 (`rule-bot-v7.1.md`) is the same search on v6.1, the stall-free planner: v6.1's plans, v6.1 in the replies, and the standing on v6.1's priced armies. Branch `claude/seat-rule-v7` keeps the seating work that carries over (the frozen test split for a searching bot).

**Next:** its suite against v6 and its stall mirrors (`rule-bot-v7.1.md`, "Measuring it"). If it clears its bar it is seated beside v6, a new version: the search's edge over v6 is far larger than v6.1's 6-player shortfall.

## Stalled games (v6.1): the stall is fixed, at a cost at 6 players

The stall is a bot problem, in the v4-to-v8 family's opponent model and its share-of-power term (`stalled-games.md`). v6.1's pick, found on the native map and screened in TS (`rule-bot-v6.1.md`), ends it: 0 and 1 capped games in 300 holdout mirrors at 5 and 6 players, against v6's 10% and 15%. It failed its bar all the same: better than v6 at 5 players, worse at 6 in both mixtures by about 15 Elo a seat (`bot-log.md`, "v6.1's holdout"), so v6 keeps its seat. A table of v6.1s still hands a lone v6, holding back, more than its share of wins at 6 players, and pricing a rival's hoard higher didn't change that enough.

**Next:** v4.1 and v5.1, the same fix on v4 and v5 (`rule-bot-v6.1.md`, "After v6.1"), are at their own bars; each replaces its old version if it passes. For v6 itself, the 6-player one-out table needs a new idea, not another setting.

## Distilling v7 (student-v1): the pipeline works; the student is a research bot

A small network ranks v7's candidate placements in v6's place (`distilled-v7.md`, `student-v1.md`). The best student kept about a fifth of v7's edge and beat v6 at 5 players on train seeds by about 30 win Elo: proof the pipeline carries strength into games, not a seat. A student is seated only when it comes close to the seated champion at a fraction of its cost.

**Next:** its holdout suite says whether the edge is real. The 16,000-game recording (`distill-v7-big2`) roughly triples the training data. A sweep over it says whether the student keeps gaining about 5 points of v7's edge per doubling. Label noise is the other limit: v7 agrees with itself 0.65 at 8 replies and 0.88 at 32. A faster v7 (native, below) affords cleaner labels, and a stall-free v7 wastes fewer recorded games.

## Native Rust (native-v1): the fast engine and bots

The Rust engine is exact against the reference engine and plays about a hundred times more games a second (`native-port.md`, `native-v1.md`). native-v1 is a planner in v6's class. With `smallTableSeats:4` it makes v6's decision on 99.9% of decisions, and it is the instrument that made the v6.1 map possible.

**Next:** native-v2, v7's search on native replies, so v7-strength play is cheap enough to record cleanly and to sweep.

## Self-play (net-v1): learning from scratch on the GPU

A transformer trained by PPO in a league on the GPU engine (`gpu-engine.md`, "Phase 3 so far"). It passed M1 (beats greedy), and M2 passes on the GPU (beats GD's personas at 5 players). The first read against rule-v6 was worse: a net trained on the placement reward placed and almost never won. Lessons so far:
- Reward the win alone.
- Keep strong past networks in the league for good.
- Strength among networks and strength against the fixed bots part ways, so neither predicts rule-v6: only the TS gauntlet does.
- The bot samples its moves, because argmax loops.

**Next.** Steps 1 and 2 are CPU gauntlets on the laptop and step 3 is GPU training, so they can run at the same time.

1. The M2 confirmation in the TS harness, on `net-v1~{"weights":"sw128b-125"}`: `npm run risk:gauntlet -- 'net-v1~{"weights":"sw128b-125"}' --base gd-defensive --field gd-defensive,gd-stacker --players 5 --formats one-in,one-out --prefix m2-train`. A first local run was stopped half way: both one-in pairings came out better (45 and 40 decisive games), and the two one-out pairings, four nets against one GD bot, never finished. It left no report, so it is run again whole; the same arguments play the same games.
2. A read of that net against rule-v6 at 5 players, one-in: `npm run risk:gauntlet -- 'net-v1~{"weights":"sw128b-125"}' --base rule-v6 --field rule-v6 --players 5 --formats one-in`.
3. Pick the network size from the size sweep (128×4, 256×6, 384×8 on one recipe). sw128b is done. sw256 is paused at its iteration-125 checkpoint, 5.2 of its 8 hours. sw384 hasn't started. A run's checkpoints and logs are in `gpu/runs/selfplay/<name>/`, git-ignored and on the laptop only: keep them in the main checkout, not a worktree that may be removed. `runs/selfplay/chain.ps1` resumes sw256 and then starts sw384, both through `runs/selfplay/sweep.ps1` (the sweep's one command, with `--resume`); sw256's arguments are also in its `args.json`. The time budget and the learning-rate schedule continue from the checkpoint. Judge by strength against decisions trained and by the slopes at the end, not by speed over a short window, and take the larger when it's close. A live turn may take up to a human's turn, so play-time cost doesn't limit the size.
4. Train the chosen size on toward M3 (`gpu-engine.md`, "Milestones"): resume its run with a larger `--hours`. Strength on the GPU doesn't predict rule-v6, so every 24 hours of training, export the latest snapshot (`riskgpu.selfplay.export`) and repeat step 2's read on it. When a read comes out even or better, run the full M3 suite (one-in and one-out, train then holdout seeds).
5. **When a pure network has fallen short of v6.** Not on one bad read, and not on a clock: a read that is worse says only that the net isn't there yet. Each cause it could be is ruled out in turn, cheapest first, and the line stops only when all are:
   - **Time.** Still climbing: its win share against v6 rose over the last three reads. Keep training.
   - **Size.** The sweep's larger size gained more per decision trained at the end. Train the larger size.
   - **Reward.** It outlasts v6 but doesn't win: its mean place at or above par, its win share below. The reward pays for something other than the win, as the placement reward did. Fix the reward.
   - **Opponents.** It never meets v6 in training: the GPU league has greedy, GD's personas and past networks, and the rule bots aren't ported. Strength against GD and its own past selves may not carry to v6's style. Port v6 to the GPU, or carry its play in by the next check.
   - **Wiring.** Train the same network to copy v6's moves (the imitation warm start, `gpu-engine.md`'s arm 2). If it can't come close to v6's agreement with itself, the observation or the network can't represent v6's play, and that is fixed first. If it can, PPO from that start is the next run, and it also carries v6's play into training.
6. **The hybrid doesn't wait for step 5.** v7's search with a learned evaluation from self-play across many opponents, the v8 idea done on the right data, needs only a value estimate, which every self-play run trains anyway. It is worth trying as soon as a network's value predicts outcomes better than v6's evaluation does, whether or not its policy ever beats v6.

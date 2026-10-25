# Risk bots: where each line stands and what comes next

A map across the lines of bot work, for picking the next step. It holds no measurements of its own: each line's doc and `bot-log.md` have the numbers, and this says what they add up to. The goal throughout is a bot stronger than the seated rule-v6 that players can feel, and fast enough to simulate and train with.

## rule-v7: the strongest bot, waiting on its last run

On the ladder over every seatable bot, v7 at 8 replies is about 115 win Elo above v6 (`bot-log.md`, "v7's ladder"), and its train-seed gauntlets beat every bot at every table size. Its holdout gauntlet is the last run of its suite.

**Next:** import the holdout; if it clears `rule-bot-v7.md`'s bar, seat v7 as v6 was (`online/seat-roster.ts`, its fingerprint in `frozen.test.ts`, and the seatable ratings run, from a checkout whose ratings cache matches). Tables of v7s cap often at 6 players: v7 inherits v6's stall, so a stall-free base would carry into it.

## Stalled games (v6.1): a stall-free bot exists, even at 5 players, short at 6

The stall is a bot problem, in the v4-to-v8 family's opponent model and its share-of-power term (`stalled-games.md`). On the native Rust engine, 201 settings of v6.1's knobs mapped the trade-off (`bot-log.md`, "v6.1's native map"; `rule-bot-v6.1.md`, "The native map"). Raising the border weight about 1.2× and gently discounting hoarded armies ends the stall and is even or better than v6 at 5 players, yet stays about 15 Elo a seat short at 6. The failing table is one v6 among five candidates: the active bots wear each other down and the lone v6, holding back, collects the win. No re-weighting of v6's terms changes that. v6's own border weight also proved too low against v6 (×1.15 is +32 Elo, but stalls more).

**Next:** make hoarding stop paying in the opponent model. A bot that sees an opponent's idle stockpile as a growing common threat, or values containing the table's biggest hoarder, takes away the lone v6's edge. Diagnose the 6-player one-out games first (`risk:trace`). An unfinished, untested start is on branch `wip/v6.1-hoarder`: named settings in native-v1 and in rule-v6.1, plus a diagnostic example. Design and sweep on native (the yardstick is native-v6, `native-v1~{"smallTableSeats":4}`), then confirm in the TS gauntlet. A fix that passes is seated as v6.1, back-ported as v4.1 and v5.1, and is the base for a stall-free v7.

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

**Next:**
1. The M2 confirmation in the TS harness, on `net-v1~{"weights":"sw128b-125"}`.
2. A read of that net against rule-v6 at 5 players.
3. Pick the network size from the size sweep (128×4, 256×6, 384×8 on one recipe). Judge by strength against decisions trained and by the slopes at the end, not by speed over a short window, and take the larger when it's close. A live turn may take up to a human's turn, so play-time cost doesn't limit the size.
4. If a pure network falls short of v6, the hybrid: v7's search with a learned evaluation from self-play across many opponents, which is the v8 idea done on the right data.

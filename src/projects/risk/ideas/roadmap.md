# Risk bots: where each line stands and what comes next

A map across the lines of bot work, for picking the next step. It holds no measurements of its own: each line's doc and `bot-log.md` have the numbers, and this says what they add up to. The goal throughout is a bot stronger than the strongest seated bot that players can feel, and fast enough to simulate and train with.

## rule-v7.1: v7's search on v6.1, seated

v7.1 (`rule-bot-v7.1.md`) is v7's search on v6.1, the stall-free planner. It is seated: better than v6, v6.1 and the weak bots at every table on train seeds, 1669 on the seatable ladder against v6's last 1560 and v6.1's 1536, and its own 5- and 6-player tables finish their games (`bot-log.md`, "v7.1's train gauntlet" and "v7.1 seated"). It is now the bot to beat.

## Stalled games: fixed and seated, at a cost at 6 players

The stall is a bot problem, in the v4-to-v8 family's opponent model and its share-of-power term (`stalled-games.md`). v6.1's pick, found on the native map and screened in TS (`rule-bot-v6.1.md`), ends it: 0 and 1 capped games in 300 holdout mirrors at 5 and 6 players, against v6's 10% and 15%. It failed its bar all the same: better than v6 at 5 players, worse at 6 in both mixtures by about 15 Elo a seat (`bot-log.md`, "v6.1's holdout"). A table of v6.1s still hands a lone v6, holding back, more than its share of wins at 6 players, and pricing a rival's hoard higher didn't change that enough. v4.1 and v5.1, the same fix on v4 and v5, fell short at 6 players the same way. The owner seated all three anyway, retiring v4, v5 and v6: ending the stall, which slowed every measuring run that seated them, was worth a few Elo at one table size.

**Next:** nothing on the rule bots' stall. Winning back the 6-player edge without the hoard needs a new idea, not another setting. native-v2's `execute` stalls in a different way, and that is the native line's next step (below).

## Distilling v7 (student-v1): the pipeline works; the student is a research bot

A small network ranks v7's candidate placements in v6's place (`distilled-v7.md`, `student-v1.md`). The best student kept about a fifth of v7's edge at 10⁵ labels, still gaining about five points a doubling, and is better than v6 at 3 to 5 players on holdout seeds and even at 6 (`bot-log.md`, "student-v1's holdout suite"): proof the pipeline carries strength into games, not a seat. A student is seated only when it comes close to the seated champion at a fraction of its cost.

**Next:** no doubling of this recording. The learned bot's plan (`learned-bot.md`, below) asks the same question (does the raw board carry the teacher's judgement, given data) of every decision at ten times the labels, and returns to distilling a search's choices in its third stage.

## Native Rust (native-v1, native-v2): the fast engine and bots

The Rust engine is exact against the reference engine and plays about a hundred times more games a second (`native-port.md`, `native-v1.md`). native-v1 is a planner in v6's class. With `smallTableSeats:4` it makes v6's decision on 99.9% of decisions, and it is the instrument that made the v6.1 map possible.

native-v2 is v7's search on native replies, with switches (`native-v2.md`). The factorial chose `execute` alone, and `native-v2~{"execute":1}` is better than rule-v7.1 at every table on train seeds: the first bot to beat the one to beat (`bot-log.md`, "native-v2's execute beats rule-v7.1 at every table"). But it stalls: its mirrors cap 7% of games at 5 players and 14% at 6, against the 1% bar, because it keeps attacking without ever closing a game out (`bot-log.md`, "native-v2: execute fails the stall bar").

**Next:** find why `execute` doesn't close games, and fix it. The fix changes the bot, so the train gauntlet is played again on the fixed version before its holdout gauntlet, the suite's field and the ladder. Seating it also needs a way for a Rust bot to play real games, decided before then.

## The learned bot (net-v1, student-v1): one plan, from the strongest bot down

Every line that learns is now one line with one design doc, `learned-bot.md`, written to the `machine-learning` skill: the brief, the ruler, the approach, and the next run's predictions. Where it stands:

- **net-v1**, a transformer trained from scratch by PPO on the GPU engine (`gpu-engine.md`, "Phase 3 so far"), passed M1, M2 and M3: `net-v1~{"weights":"sw128b-450"}` is better than rule-v6 one-in and one-out on train seeds, and worse than rule-v7.1 at 5 players (−64 win Elo: it outlasts v7.1 and doesn't finish). Trained on, it wandered: the league and the opponents' strength were ruled out as the cause, the gradient's noise scale measured at about 1.8 million decisions, colder updates slowed the drift without stopping it, and a shaping reward taught stalling (`self-play-league.md`). M4 stands open.
- **student-v1** (above) is a research bot below v7, and its pipeline is the template for distilling a search's choices.
- **rule-v8**, the planner on a learned evaluation, is closed (`rule-bot-v8.md`): an evaluation fit to one population's games carries that population in.

**Next:** stage 1 of `learned-bot.md`: an imitation of rule-v7.1 on net-v1's observation and network, from game records the harness keeps and the GPU engine replays. It reads whether the net can copy v7.1-class play at all (the imitation ceiling), gives self-play a start at the target's class, and puts a stand-in for that class in the GPU league, which never had one. Then PPO from that start, read on a fixed panel against a seed pair, then the net inside the search. The fork between this and more training from scratch is briefed to the owner in that doc.

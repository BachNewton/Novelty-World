# Risk bot v4: better beliefs about the other seats

v4 (`bots/rule-v4/`) is v3 (`rule-bot-v3.md`) with a different opponent model: the same planner, evaluation and preferences, and different beliefs about what each other seat does with its turn before mine. `bot-log.md` holds every measurement, including what was tried and dropped. v3 is frozen, so v4 keeps only the files it changes (its entry point, parameters, planner, small decisions and evaluation, which read its own model) and shares the rest from v3 (the capture planner) and v1 (the board, the odds, the hand model).

## Why the opponent model

v3's own changes had run out. Its kill timing was within a point or two of what rollouts find, and retuning, more sampled outcomes and new plan types all came out even. What the bot log kept pointing at was its beliefs: v2 and v3 price being the leader as if every opponent turns on it, yet two v2s gang up on a leader only mildly, and a lone seat flagged as the leader went on to win 68 to 78% of 3-player games. Better choices from the same beliefs were largely exhausted; better beliefs were not.

## Measuring a model before changing it

`risk:opponents` (`eval/opponent-model.ts`) scores an opponent model against the game. Bots play as they always do; at the end of every seat's turn, each model under test states what that seat believes each opponent's coming turn will do to it, and the turn is then played and set beside the belief:

- **The aim**: how likely the opponent's turn goes against me, scored against the share of its captures taken from me, and against v1's belief, an even split among its neighbouring seats.
- **The loss**: the aim times what the turn would cost me (its best blow or its sweep), against the armies and income the turn actually cost me.
- **The kills**: the chance each opponent takes the kill the model names, against whether it did; and my own kill exposure, against whether I was killed before my next turn.

Every model is scored on the same turns, so two models compare paired, and the tool takes any field, so a model can be scored against opponents it has never seen. To be measured at all, v3's model moved out of the evaluation into its own module (`opponents.ts`); with v3's beliefs, v4 plays v3's moves exactly, and a test holds it so.

## What was wrong with v3's beliefs

Over v3 among v3s, v3 among v2s, and a mixed field of the rule bots and GD's four personas, at 3, 4 and 6 players (`bot-log.md` has the tables):

- **Kills.** v3 believes an opponent takes a kill of 60% or better whether or not it pays. Opponents took a third of the kills v3 rated near certain at small tables, and a tenth at 6. So v3 wrote off weakened players as good as dead, priced a kill of mine as a race it would usually lose, and at 6 players feared its own elimination three times too much.
- **The leader.** As the common threat, v3 believes every opponent's turn goes against it. Opponents took 57 to 77% of their captures from the leader.
- **Whom an opponent hits.** v3's share of what an opponent's turn could do to each neighbour is a real signal but far too confident: what it rated a 10% target lost 20 to 30% of the captures, what it rated 85% lost under 60%. As a prediction it scored worse than v1's even split at 3 and 4 players.

## v4's beliefs

Each is one parameter of the opponent model (`Beliefs` in `params.ts`), fixed by measurement and out of any tuning, as the opponent model always has been:

1. **Kills at the rate they happen.** The chance an opponent takes its best kill is v3's chance times a measured rate, one for a third player's kill and one for mine.
2. **A milder gang-up.** As the common threat, an opponent's turn goes against me with the share it measured, not certainly; another seat's neighbours are hit a little more than v3 believed.
3. **The aim pulled toward an even split**, keeping half of v3's lean.
4. **This game's record.** Whom an opponent has been taking territory from is evidence of whom it takes it from next: the aim is a prior worth a few captures, updated by the opponent's captures this game from each seat beside it, its older turns fading. The bot keeps no state, so the record is read from the history at each decision; it changes only on the opponents' turns, so a turn of mine is planned on one set of beliefs.

## Status: paused, work in progress

v4 is registered in the harness (`RISK_BOTS`, `BOT_MODULES`, `TUNABLE_BOTS` in `bots/index.ts`) but **not seatable**: `online/seat-bots.ts`, `bots/ratings.json` and the ratings are untouched.

**Built and tested:** the opponent model as its own module (`opponents.ts`), bit-identical to v3 with v3's beliefs (`same-as-v3.test.ts`, on `AS_V3_PARAMS`); the beliefs (`Beliefs` in `params.ts`) and the game's record (`beliefs.ts`, `beliefs.test.ts`), threaded into the evaluation through the settings object, one per record so the memos hold through a turn of mine; `risk:opponents` (`eval/opponent-model.ts`, its CLI and worker, `opponent-model.test.ts`), scoring models `v3` and `v4`.

**Measured:** v3's model on three fields at 3, 4 and 6 players, and candidate beliefs on the mixed field (`bot-log.md`, "v3's opponent model, measured").

**Untested or unfinished:**
- v4's exact beliefs scored as a whole by `risk:opponents` (only near neighbours of them were).
- The first gauntlet was stopped with one pairing decided: a lone v4 among v3s at 3 players is **worse** (510 decisive games). The other five tables are unknown.
- Retuned preferences on the new beliefs. v3's small-table preferences were tuned to v3's beliefs and likely compensate for them; that is the leading explanation of the 3-player loss, not yet tested.
- Which belief costs or pays: no ablation has been played.
- The `rule-v4/scenarios.test.ts` and `bot.test.ts` that v1 to v3 carry (legality fuzz, input-only, the expert scenarios) have not been copied for v4.

**Next steps, in order** (start every long run in the background from PowerShell, after `npm run load`):

1. Score v4's beliefs as a whole: `npm run risk:opponents -- --field rule-v3,gd-stacker,rule-v2,gd-continental,rule-v1,gd-aggressive,gd-defensive --games 400 --models v3,v4`, and the same with `--field rule-v3` and `--field rule-v3,rule-v2,rule-v2,rule-v2,rule-v2,rule-v2`.
2. Ablate, at the decided table first (`--players 3 --formats one-in`): register one bot per single belief change (kills only, leader only, aim slope only, record only) as extra labels on `ruleBot` with `V4_PARAMS`'s beliefs partly reset to v3's (null-equivalent values: leaderAim 1, allyAim 0.25, aimSlope 1, historyPrior null, killRate 1, myKillRate 1), and gauntlet each against v3: `npm run risk:gauntlet -- <label> --base rule-v3 --field rule-v3 --players 3 --formats one-in`. That says which beliefs help on v3's preferences and which fight them.
3. Retune preferences on the new beliefs at 3 players, as v3's were: `npm run risk:tune -- --tunable rule-v4 --opponent rule-v3 --players 3 --gens 12 --pop 8 --groups 40` (and at 6 players for the large-table preferences), then gauntlet the tuned label against v3 with more games per candidate than the tuner gives.
4. The full gauntlet on train, then holdout: `npm run risk:gauntlet -- rule-v4 --base rule-v3 --field rule-v3,rule-v2,rule-v1,gd-defensive,gd-continental,gd-aggressive,gd-stacker` and the same with `--prefix holdout`.
5. Only if v4 is better than v3 somewhere and worse nowhere: copy v3's `bot.test.ts` and `scenarios.test.ts` for v4, seat it in `online/seat-bots.ts`, rerun `npm run risk:ratings -- --seatable --groups 100` (the frozen fingerprint and ratings tests must pass), and update the Risk `CLAUDE.md`.

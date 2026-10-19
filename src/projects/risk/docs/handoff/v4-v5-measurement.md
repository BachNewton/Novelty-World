# Handoff: measuring Risk's rule-v4 and rule-v5

This picks up the measuring runs for two new bots, rule-v4 and rule-v5. The runs were paused part way so the owner could use the laptop. The results so far are in `ideas/bot-log.md`, in the entries from "v4 rebuilt" onward. The bots' designs are `ideas/rule-bot-v4.md` and `ideas/rule-bot-v5.md`. Neither bot is seated: v3 is still the lobby default, and `bots/ratings.json` is untouched.

## Where it stands

- **rule-v4** is v3's planner on a measured opponent model, with the fixes from the human game G4FR. Its 3- and 4-player preferences were retuned against a mixed field. Above 4 players it plays v3's preferences.
- **rule-v5** is v4 plus one new kind of plan: the winner's sweep, every army onto one stack, chaining sure captures. It reads v4's settings, so v4's retune is also v5's.

Done and committed:
- the opponent-model check
- the mixed-field retune and the check of its result against untuned v4
- v4's gauntlets on train and holdout seeds
- v5's gauntlet on train seeds
- v5's gauntlet on holdout seeds, all but the two 6-player pairings against v4

Both bots beat v3 and every weak bot, with no table worse. v5 also beats v4 at 3 and 4 players and is even at 6.

## What is left, in order

The owner's go-ahead covers these runs. Start each one in the background from PowerShell, never Git Bash, so that stopping the task kills its workers. Before a long run, hold the machine awake from that same PowerShell process:

```powershell
Add-Type -Namespace W -Name P -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'
[void][W.P]::SetThreadExecutionState([uint32]2147483649)
```

The cast matters: a bare `0x80000001` is a negative Int32 in PowerShell, so the call fails and nothing is held.

1. **v5's last two holdout pairings**, the 6-player tables against v4 (one v5 among five v4s, and the reverse). The rest of v5's holdout gauntlet is done: 28 of 30 pairings, every one better, recorded in `bot-log.md` ("v5's holdout gauntlet, paused at 28 of 30 pairings"). These two are the slow ones. On train seeds they came out even and took most of a 3.4-hour run, so allow 1.5 to 3 hours.
   ```
   npm run risk:gauntlet -- rule-v5 --base rule-v3 --field rule-v4 --players 6 --prefix holdout --workers 15
   ```
   A run stopped part way keeps nothing. If this one has to stop too, its finished pairing's verdict is on the console.
2. **The ladder**, about 1 to 1.5 hours. It puts v4 and v5 on one Elo scale with every seatable bot, and shows whether either gives back to the weak bots, which is what sank the previous v4. It doesn't write `ratings.json`.
   ```
   npm run risk:ratings -- rule-v5 rule-v4 rule-v3 rule-v2 rule-v1 gd-stacker gd-continental greedy gd-aggressive gd-defensive --anchor greedy --groups 100 --workers 15
   ```
3. **Record the verdicts.** Add a `bot-log.md` entry for each run, and mark the "Measuring it" sections of both design docs. Then commit and push on main.

## The decision rule, fixed before the runs

- **The seating bar:** better than v3 at some table, worse at none, on train and holdout seeds, and no lower than v3 on the ladder's win Elo.
- **v5 must also beat v4**: no pairing worse than v4, and above v4 on the ladder. Otherwise v4 is the one worth keeping.
- The gauntlet prints its own gate (ACCEPT or REJECT), which asks for "better" at every table. That is stricter than the bar, and not the rule.

Seating is the owner's call, never taken on their behalf. Seating a bot means adding it to `online/seat-roster.ts` and running `npm run risk:ratings -- --seatable`.

## Open questions after these runs

- **The 5- and 6-player preferences.** They were never tuned on the new beliefs. At 6 players the model overprices hits and its own death by about 1.7 times and 3 times. The tuner can't tune them yet: only small-table tunables exist (`rule-v4-small`, `rule-v5-small`), so that needs a large-table tunable first. It is an overnight run.
- **Small-table preferences at a thinned table.** A game that starts with 6 seats keeps its 6-seat preferences down to 3 survivors. Switching once the field thins is untested: build it as a variant and gauntlet it at 6 players.
- **Tuning bounds.** Three tuned preferences ended on their bounds (`incomeHorizon`, `opportunityWeight`, `killCommitMargin`), so a wider range may tune further.
- **`risk:opponents` publishes nothing.** It writes no run-log record and nothing to the Bot Lab page, so its results live only in `bot-log.md`. Every other Risk tool does both.
- **Beliefs fit to bots, not people.** The kill rates and the leader aim were measured only on bots. Only one finished human game is recorded. Review each new human game the way G4FR was reviewed, and once there are a dozen or so, score the model on them.

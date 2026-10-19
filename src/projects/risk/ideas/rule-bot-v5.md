# Risk bot v5: v4 with the winner's sweep

v5 (`bots/rule-v5/`) is built and measured, and it clears its seating bar on every rule (below, under "Measuring it"). It is not seated: seating is the owner's call, so v3 stays the lobby's default and `ratings.json` is unchanged until then. `bot-log.md` has the build's entry and every measurement.

v5 is v4 (`rule-bot-v4.md`) whole: its beliefs, its fixes and its preferences, at both table sizes. It adds one kind of plan, the sweep, taken from how the person who won G4FR played. v4 asks whether correct beliefs help; v5 asks, on top of them, whether the winner's way of attacking helps. They are separate hypotheses, so v5 adds no setting of any kind: it reads v4's settings, and any retune of v4's preferences is v5's too.

v4 is the base, so v5 keeps only what it changes: the sweep (`sweep.ts`), a planner that adds sweeps to v4's plans, the move-in that weighs them, and its entry point. Everything else, the evaluation and the opponent model included, is v4's.

## What the winner did

In G4FR, a 5-player game (`bots/rule-v4/g4fr.json`), a person beat v3, another person, gd-stacker and gd-continental. Read from the record:

- **One stack.** Every army he placed and every set he traded went onto one stack, beside the thinnest enemy. It blitzed with everything, moved all but one army on, and chained: 8 captures at turn 58, 11 at turn 79 and 19 at turn 91, the turn that ended v3.
- **A home base.** After each sweep, what was left came home by fortify to a hub, India or the Middle East, to launch the next one (turns 25, 37, 49, 58 and 76).
- **A continent with one way in.** He held Australia, whose only entrance is Siam, from turn 10 to the end. No bot contested it.
- **The spread he beat.** v3 spread thin: at turn 89 it held 17 territories, its biggest stack on 4, and two turns later his stack took 13 of them.

## What v4 lacks

v4's plans take one territory, the rest of a continent (only when at most half of it is missing), or a player's last territories. None strings captures through several players and continents, which is how one stack took 19 territories in a turn. v4 does chain now and then, by re-planning after each capture, but only one capture's worth of plan at a time: a stack beside four thin territories of a continent it barely touches sees one of them, not the run.

## The sweep

A new kind of plan. Every army to place goes onto one stack, which takes the thinnest enemy territory beside it that it is sure of, moves all but one army in, and goes on from the territory it took, while the next capture is sure. Sure is the opponent model's bar for an opponent's sweep against me (a 90% capture, which Balanced Blitz makes of most fights a big stack picks), so v5 believes of its own stack what it believes of theirs. Between two equally thin territories it takes the one with more ways on. The sweep is a path, never a fork: the whole stack moves on, as the winner's did, and a path is a plan the turn can play move by move.

Sweeps are offered from the two stacks whose sweeps run longest, each whole and by its first half, and scored like any plan by v4's evaluation, over the sweep's success and its likeliest failure. The half lets the evaluation stop a sweep where the rest isn't worth it. A sweep obeys v4's rules for which captures a plan may make: under a common threat it goes only through the threat, and a card-less player left as a buffer at a big table is never finished.

Both offers earn their place. Of the sweeps v5 committed to while placing, in games alone among v3s, the second stack's were about a third, and the half sweeps were chosen nearly as often as the whole ones.

## Played on G4FR's positions

From the position v3 had at the start of each of its turns, v5 plays the whole turn on the dice the game's random source gives (`bots/rule-v5/g4fr.test.ts` holds turns 62 and 89). The winner's sweep is v4's belief of it, at the worse of the two people, before v3's next turn:

| Turn | v3, as played | v5 |
|---|---|---|
| 62 | its 8 armies onto Central America, 1 capture; ends on 11 territories, biggest stack 23 | all 8 onto Japan's stack; its two stacks sweep Siberia to India and South America into Africa, 15 captures; ends on 25 territories, biggest stack 3 |
| 71 | 2 captures; 12 territories, biggest stack 14 | 8 captures; 18 territories, biggest stack 12 |
| 89 | 17 territories, biggest stack 4; the winner's sweep takes 14 (he took 13) | 13 territories, biggest stack 8; the sweep takes 11 |
| 56 | 2 captures; 14 territories, biggest stack 7 | 8 captures; 20 territories, biggest stack 3; the sweep takes 12, against v3's 7 |

So v5 attacks as the winner did, one stack fed everything and chained. It doesn't end its turns as he did: a sweep leaves a trail of one-army territories, and v5 doesn't bring what is left home. At turn 89 it ends more concentrated than v3, but v4 ends there much the same (13 territories, biggest stack 9): that is v4's beliefs, not the sweep.

## Tried and dropped: a stack's next turn

The winner's home base and his stopping while the stack was still a stack both say one thing: a stack is worth what it can take next turn. v4 values next turn's best kill, at its opportunity weight; the first build of v5 valued next turn's best blow, the kill or a sweep, the sweep believed exactly as the opponent model believes an opponent's sweep against me. On G4FR's positions it did what was hoped: at turn 32 it ended on 12 territories with a stack of 18 brought home to Southern Europe, where v3 had 15 territories and a biggest stack of 4, and a unit test's stack came home to Siam over a thin Australia where v4's stayed put.

It lost badly. Screened alone among two v3s at 3 players (each decided by its SPRT in under 200 games):

| v5 built with | Win share vs par 33.3% | Win Elo a seat |
|---|---|---|
| the sweep and next turn's sweep, priced at what it costs its victim | 22.2% | −97 |
| next turn's sweep alone | 14.1% | −193 |
| next turn's sweep priced at what it gives me (my income over the horizon), with the sweep | 9.9% | −264 |
| the sweep alone (v5 as built) | 40.3% | +52 |

Two pricings, both principled, both far worse than v3. The likeliest reason: every capture spends some of the stack, so with next turn's threat counted, every capture plan scores lower against holding, and the bot sits on its threat where it should race; 3 players is a race to the first kill. The home base goes with it: v5's fortify is v4's.

## Left out, and why

- **A home base**: the belief above, measured and dropped.
- **A continent with one way in.** Australia's defensibility is already priced: the opponent model breaks a continent through each of its entrances, so one with a single way in costs less to hold, and a sweep takes a small continent whole in one chain. A term for the fewest entrances would be a new weight with nothing to set it by.
- **Attacking only with the main stack.** v5 still takes single territories with small stacks where v4 would, and those captures leave the one-army territories an opponent's sweep eats. How much a thin territory costs is the border weight, a preference, which v4's retune sets; a rule against side captures would overrule the evaluation instead of informing it.
- **A stopping rule.** Where to stop a sweep is left to the evaluation, offered the whole and the first half. A rule ("stop while the stack has n armies") would be a new weight.
- **Forks.** The winner's sweeps were paths; a path is also a plan the turn plays move by move. The opponent model's sweep, a belief about others, keeps forking.
- **Who is a person.** As in v4: nothing yet measures how people here play.

## Cost

A v5 decision costs 1.30 times a v4 decision at 3 players, 1.23 at 4 and 1.43 at 6, both asked the same decisions (v4 playing a seat among v3s, v5 asked each of its decisions too, the two taking turns going first). Walking the sweeps is almost free (0.2% of the time); the cost is in scoring them, since a sweep's success board, with many new territories and many of them thin, is dear for the opponent model to read. Offering one stack's sweeps instead of two saves under a tenth, and larger memos saved nothing. Measured this way, alone among v3s on the same seeds, v4 costs 1.4 to 2.6 times v3 a decision, more than the 1.2 its own doc gives.

## The seating bar, decided before the night

v5 is seated only if all of these hold:

1. **Against v3**, on train seeds and then holdout: better at one table or more, worse at none (each pairing's SPRT at ±30 Elo a seat).
2. **On the ladder**, with v4 and every seatable bot: v5's win Elo no lower than v3's.
3. **Against v4**, since v5 is v4 plus a hypothesis: no pairing against v4 worse, and v5 above v4 on the ladder. A v5 that passes 1 and 2 but not 3 has shown nothing the sweep adds; v4 is the candidate then, on its own measurement.

The weak bots are where the earlier v4 failed: it beat v3 head to head and gave far more back to gd-defensive and gd-stacker. The gauntlet's weak-bot pairings show that at once, and the ladder decides it: rule 2 fails a v5 that does it.

## Measuring it

After v4's night (its calibration, its small-table retune, its gauntlets and its ladder), probably on a second night. First, once v4's retune is in v4's settings, which v5 reads: `npx vitest run src/projects/risk/bots/rule-v5`. The G4FR tests play 5 players, on the large table's preferences, which the retune leaves alone; the unit tests read the small table's, and a retune that moves their result is worth reading before the night, not patching.

1. **The gauntlet, train seeds**: `npm run risk:gauntlet -- rule-v5 --base rule-v3 --field rule-v3,rule-v4,gd-defensive,gd-stacker,greedy`, in the background from PowerShell. 30 pairings, every table size, both mixtures. Roughly 2 to 3 hours on the whole machine: the 6-player pairings with v3 and v4 are the slow ones, and a near-even one can run long before its SPRT decides. It tells rule 1 against v3, rule 3's pairings against v4, and where v5 stands against the weak bots.
2. **The gauntlet, holdout seeds**, only if train passes rule 1 and no weak-bot pairing is worse: the same command with `--prefix holdout`. About as long. It confirms rule 1 on seeds nothing was read from.
3. **The ladder**: `npm run risk:ratings -- rule-v5 rule-v4 rule-v3 rule-v2 rule-v1 gd-stacker gd-continental greedy gd-aggressive gd-defensive --anchor greedy --groups 100`. Naming the bots rates v4 and v5 beside every seatable bot without writing `ratings.json`; the cache plays only the matchups it hasn't seen (v5's, and v4's if its own ladder left none). Roughly 30 to 60 minutes. It decides rules 2 and 3.

If v5 is seated, the seatable ratings run follows as for any seated bot, and v5's fingerprint joins `frozen.test.ts`.

**What it showed** (`bot-log.md`, the entries from "v4 and v5 gauntleted" to "v5's holdout gauntlet, finished"):

1. **Against v3: passes.** Better at all six tables on train seeds and on holdout, worse at none.
2. **On the ladder: passes.** Win Elo +538 against v3's +441 (greedy = 0).
3. **Against v4: passes.** Better at 3 and 4 players on both seed sets, better with one v5 among five v4s at 6 players on holdout and even with five v5s against one, worse nowhere; above v4 on the ladder by wins (+538 to +500), level by finishing order.

The weak bots win at most a few percent alone among v5s, less than among v3s, so the earlier v4's failure doesn't recur. The cost is speed: a 6-player game among v4s and v5s runs about 2,300 decisions, a third of them reach the 600-turn cap, and a v5 decision costs about three times a v4 one, so v5's 6-player measurements are the slowest we run.

## Open questions

- **Spreading by sweep.** At turn 56 of G4FR a sweep left v5 thinner than v3, its trail of one-army territories open to the winner's sweep. If the gauntlet shows v5 losing to sweeps it opened itself to, the border weight is the lever (a preference), not a rule.
- **Next turn's sweep at a big table.** The belief was screened at 3 players only, where the game is a race. The winner's game was 5 players, where holding a threat may pay. It would come back only as its own hypothesis, screened at 5 and 6 players, never folded into v5 on the hope.
- **What a sweep's trail costs.** The winner's sweeps left trails too, and he won. Whether the cost is the trail or what v5 does next turn (no stack at home to retake it) is a question for `risk:review` on v5's own losses.

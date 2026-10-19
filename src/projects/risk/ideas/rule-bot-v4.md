# Risk bot v4: v3 on beliefs that hold up, with the fixes a person's win showed

v4 (`bots/rule-v4/`) is built and measured, and it clears the seating bar (below, under "Measuring it"), so it is seated, beside v5, which beats it. Its small-table preferences are the mixed-field retune's; above 4 players they are v3's. `bot-log.md` has the build's entry, and the history of the version that held the name before, whose lessons are below.

v4 is v3 (`rule-bot-v3.md`): its planner, its evaluation, its capture planner and its preferences. What changes is what it believes the other seats do with their turns before its next one (`opponents.ts`, the opponent model), the kill chances that model and the planner read (`kills.ts`), and one piece of the planner's arithmetic (`planner.ts`). v3 is frozen, so v4 keeps only the files it changes and shares the rest from v3 and v1.

## What the earlier v4 taught

The name first belonged to v3's planner and evaluation on a new opponent model, with its small-table preferences retuned against v3 alone. Its code is in git history; it is never seated. Four lessons carry over:

- **The beliefs held up.** Measured against the turns they predict (`risk:opponents`), they forecast far better than v3's: a kill's chance, how often the leader is ganged up on, whom an opponent hits. This game's record of who has been capturing from whom helped most.
- **Preferences tuned against one opponent are tuned to it.** Retuned against v3 alone, the small-table preferences doubled the fear of elimination, tripled the weight on border losses and dropped the common-threat weight to nearly nothing. That bought caution that beat v3 head to head and gave back far more to the weak bots: gd-defensive won 8% of 3-player games alone among that v4, under 1% among v3s. Across the ladder it rated no higher than v3. The same beliefs on v3's preferences beat the weak bots as hard as v3 does, and tied v3.
- **The best-calibrated belief can be the worst for play.** Pulling the aim toward an even split, alone on v3's preferences, cost 26 Elo a seat at the 3-player lone seat. v3's overconfident aim had been putting its defence where the big blows land, doing the work of a hit priced too small: among the rule bots an opponent's turn costs 1.7 to 2 times what that model priced it at.
- **My own death was underpriced.** At 3-player tables of v3s, that model believed it was eliminated before its next turn 5.5% of the time, against 8.7% that happened.

So v4 takes the beliefs whole, prices the hit and the kill more honestly so the aim no longer has to make up for them, and keeps v3's preferences until a retune against more than one opponent sets them.

## The beliefs

Each is one parameter of the opponent model (`Beliefs` in `params.ts`), fixed by measurement and out of any tuning:

1. **Kills at the rate they happen.** The chance an opponent takes a kill open to it is the kill's chance times a measured rate, one for a third player's kill and one for mine. v3 believed every kill of 60% or better was taken, whether or not it paid.
2. **A milder gang-up.** As the common threat, an opponent's turn goes against me with the share it measured, not certainly; while another seat is the threat, its neighbours are hit a little more than v3 believed.
3. **The aim pulled toward an even split**, keeping half of v3's lean.
4. **This game's record.** Whom an opponent has been taking territory from is evidence of whom it takes it from next: the aim is a prior worth a few captures, updated by the opponent's captures this game from each seat beside it, its older turns fading. The bot keeps no state, so it reads the record from the history at each decision; the record changes only on the opponents' turns, so one turn of mine is planned on one set of beliefs.

## What G4FR showed

In G4FR, a 5-player game, a person beat v3, another person, gd-stacker and gd-continental. He fed one stack every reinforcement and trade, blitzed into the thinnest enemy and chained captures (19 in one turn), brought what was left back to a home base, held a continent with one way in all game, and broke the bots' continents by taking a single one-army territory. v3 lost in turns 89 to 91: it spread from 10 territories to 17, its biggest stack on 4, and two turns later one stack of his took 13 of them, leaving v3 one territory. The game's seed and move log are a fixture (`bots/rule-v4/g4fr.json`, replayed by `g4fr.test.ts` on the engine real games play on), and reading v3's decisions there found these faults.

### The sweep stopped short

v3's model of an opponent's sweep through thin territories stopped at 8 captures, and counted income over three turns as safe while it was spread thin. It also moved the whole stack along one path, so a dead end stopped it, and rounded each capture's survivors down, losing half an army a capture. v4's sweep goes on while any capture is sure, from any territory the stack has taken (the move-in can leave armies at a fork for the other branch), at an army and a fraction a capture. At the end of turn 89 v3 believed his sweep would take 8 of its 17 territories; v4 believes 14. He took 13 of the 14 v3 still held when his turn came.

### A kill's chance fell off a cliff

v3 called a kill impossible whenever the armies near the victim fell short of 0.8 of its defenders and an army each, and offered a kill plan only above 2%. In turn 26 a 34% kill on gd-stacker vanished once its first two territories fell: two one-army territories left, beside stacks of 2 and 3, rated 0. v4 rates that kill 37%. Its screen saves work only: a group of the victim's territories that the best launch stack beside it can't outnumber is no chance at all, since every capture leaves an army behind; otherwise the stack's run is walked forward, and the capture planner's own chance is used wherever that walk reaches 1%.

A kill plan that has started needs nothing more to stay alive: the bot plans afresh at every decision, and with the cliff gone a started kill stays on offer while its chance is above 2%, and drops out only when it really has gone badly.

### A kill moved only the cards

When an opponent was likely to kill a third player, v3 cut the victim's power by the chance and gave the killer only the victim's cards, so damage that helped the leader finish someone raised my share. v4 moves the cards and the victim's territories' income (the territory count's and every continent it completes) to the killer. The victim's armies are gone; the killer's losses, a favourite's under Balanced Blitz, are left out beside what the kill takes.

### Each opponent's one victim, and the rest

v3's opponent went for its one best-paying kill, and only that one: a seat that wasn't any opponent's best kill believed itself safe from all of them. v4 keeps one victim a turn, but each opponent weighs the kills open to it best first, going for each with its measured rate only if it passed over every better one. My own exposure rises where it had been set to nothing: one of the ways the earlier model's believed elimination fell short of what happened, by how much the measurement below will show.

### Failure did free damage

A plan's failure board halved the defender where its run stopped, even when the run's armies were spent before reaching it, so a plan with no chance scored damage it never does. In turn 89 a plan to take the rest of Europe, at no chance, ranked first. v4's failure board leaves a defender no attacker reaches as it was, and takes from one that is reached only what the attackers there are expected to kill.

## Left out, and why

- **Discounting captures that leave one-army territories beside a big stack.** The sweep now prices what such a capture leaves: the armies and the income it loses, over the horizon. Discounting the capture as well would count it twice. What v3 did at turn 89 is a preference: its border weight, 0.35 at small tables and 0.5 at large, counts an expected loss at a third to a half of what it is. Honest beliefs make that weight mean what it says, and the retune sets it. With v3's preferences, asked at each of v3's decisions of turn 89, v4 still makes most of the same captures.
- **Weighing a fortify's partial moves, and holding a stack still.** v3 weighs moving all or half of a stack. At turn 62, where v3 moved its stack of 22 from Central America to Alaska and stripped Central America to one army, v4's evaluation scores moving all 22 above every smaller move: the move is the evaluation's call, not the move grid's. A rule to hold a stack still would only hide an evaluation that flips from one turn to the next; nothing in the game makes moving cost.
- **Who is a person.** The beliefs are measured on bots, and nothing yet measures how people here play. A belief kept per kind of player needs that data; this game's record already adapts the aim to each opponent, people included, from what they do.
- **Attacking with one die from a two-army territory.** The planner prices it with exact odds, and a card can make it worth a single army.
- **Contesting a person's continent with one way in.** Breaking an opponent's continent is already valued by their income loss. Whether to build the stack for it is the plans' and preferences' call.
- **A measured scale on the hit.** Among the rule bots an opponent's turn cost 1.7 to 2 times what the earlier model priced it at. v4's sweep prices more of it, by an amount the measurement below will show. A scale set before that would be a guess.

## Which fixes belong in v3

v3 is frozen and seated, so none goes into it; any change to its play is a new version. All four are corrections of what the model believes, not new preferences. But v3's preferences were tuned on top of its beliefs, and the earlier v4 showed what moving the beliefs under tuned preferences does. The failure board is the clearest bug, and the one a v3 successor could take with the least retuning, since it only reorders plans that were wrongly scored. The sweep, the kill chance and the kill's credit all raise what the bot believes it can lose, and need preferences tuned on them.

## Cost

A v4 decision costs about 1.2 times a v3 decision, from the kills v3's screen called impossible. Remembering kill chances by the territories near the victim made it slower: few repeat, and building the key cost more than the kills it saved.

## Measuring it

In order, each step's result feeding the next:

1. **The beliefs, scored** (`risk:opponents`, v3's model against v4's on v3s, v3 among v2s, and the mixed field). It shows whether the sweep and the kill changes bring the priced hit toward what turns cost among the rule bots, and my believed exposure toward the 8.7% that happens at 3 players. If the kill rates now sit off the measured ones, they are set again before the retune.
2. **The small table retuned against a mixed field** (`risk:tune`, v3, gd-defensive, gd-stacker and greedy, at 3 and 4 players, each table read as the edge over what v3 scores there). Read against a baseline, beating a weak bot by less than v3 does is the loss, which a raw worst table can't see: it is always the strongest opponent's. The result becomes `V4_PARAMS.smallTable.prefs`.
3. **The gauntlet** against v3, with the weak bots in the field, on train seeds and then holdout.
4. **The ladder** with v4 beside every seatable bot. v4 is seated only if the ladder agrees.

Above 4 players v4 plays v3's preferences, untuned on its beliefs; tuning them is a night's work on its own, since the 6-player games are the slow ones.

**What it showed** (`bot-log.md`, the entries from "v4's beliefs checked" to "The ladder with v4 and v5"): the beliefs scored far better calibrated than v3's, so none were reset; the retune beat untuned v4 at 3 of 4 tables and lost at none; the gauntlet was better than v3 at 5 of 6 tables and even at the sixth on train seeds, better at all 6 on holdout; and on the ladder v4's win Elo is +500 against v3's +441 (greedy = 0). The weak bots win at most a few percent alone among v4s. It clears the bar and is seated. v5, v4 with the sweep, clears its own bar and beats v4 where the two differ (`rule-bot-v5.md`).

## Open questions

- **The 5- and 6-player preferences.** They were never tuned on v4's beliefs. At 6 players the model overprices hits about 1.7 times and its own death about 3 times. The tuner can't reach them yet: only small-table tunables exist (`rule-v4-small`, `rule-v5-small`), so a large-table tunable comes first. An overnight run.
- **Small-table preferences at a thinned table.** A game that starts with 6 seats keeps its 6-seat preferences down to 3 survivors. Switching once the field thins is untested: built as a variant, it would be gauntleted at 6 players.
- **Tuning bounds.** Three tuned preferences ended on their bounds (`incomeHorizon`, `opportunityWeight`, `killCommitMargin`), so a wider range may tune further.
- **`risk:opponents` publishes nothing.** It writes no run-log record and nothing to the Bot Lab page, so its results live only in `bot-log.md`. Every other Risk tool does both.
- **Beliefs fit to bots, not people.** The kill rates and the leader aim were measured on bots only; one finished human game is recorded. Each new human game is reviewed the way G4FR was, and once there are a dozen or so, the model is scored on them.
- **6-player games that never end.** A third of 6-player games among v4s and v5s reach the 600-turn cap, and in a tenth of all of them all six players are still alive there. The cap is not the waste it looks like: games end at a steady rate of about 8% every 50 turns from turn 150 to 600, so a lower cap gains almost nothing per decisive game (`bot-log.md`, "How 6-player games end"). What would help is bots that eliminate someone: whether v4's beliefs or its untuned 6-player preferences make each seat too cautious is the question.

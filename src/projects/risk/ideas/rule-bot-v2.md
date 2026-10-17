# Risk bot v2: what changes from v1, and why

v2 (`bots/rule-v2/`) is v1 (`rule-bot-v1.md`) with the changes below, each proposed by reasoning or by reading games, and kept only if the gauntlet crowns it (`bot-log.md` holds every measurement, including the changes tried and dropped). v1 is frozen, so v2 keeps only the files it changes (the evaluation, the planner, the capture planner, the small decisions, its entry point and parameters) and shares the rest from v1: the board, the attack odds and the hand model.

## How v2's changes are chosen

Monopoly's bot loop (`monopoly/bots/docs/EVOLUTION.md`) found its large gains in structural changes, found by reasoning or by watching games, and much smaller ones in tuning weights. Its optimiser paid only while its fitness matched the crown gate, and three times it corrupted a parameter whose second job the fitness could not see. So v2's changes are structural first, found by reading v1's lost games with `risk:review`; tuning is a separate, measured step, and moves only preferences, never the model of the opponents.

## What the games showed

Three readers went through eight of v1's games (`bot-log.md`): losses alone among five GD Continentals and among three GD Stackers, and v1 against itself. All three found the same arc. After a good kill or trade, v1 sweeps on through five to eight territories and leaves one army on each; it ends the turn the income leader with the longest thin border and a biggest stack of 2 to 4, and the next round its opponents each take back three to eight of those territories for nothing, a card apiece. In one game its biggest stack stayed at 2 or 3 for fifteen turns while its armies fell from 29 to 9; GD's bots aimed 44 to 70% of their blitzes at it, where an even share was 20 to 33%.

The cause is in the evaluation. v1 charges each opponent's single best blow against it: once one territory sits on one army, every further one-army territory adds nothing, so one more certain capture always scored better than stopping. And an opponent's neighbour on one army counted as no threat at all, though its income lands there.

## 1. An opponent's turn is a sweep, not one blow

v2 charges each opponent's turn against it as the larger of v1's best blow and its **sweep**: from its stacks beside me, its expected income on the biggest, it takes the cheapest of my territories it is sure of (90% or better, which Balanced Blitz makes of most favourites' fights), moves in, and goes on from there, up to eight captures. The cost is the armies I lose and my income lost over the income horizon, the territory count's and every continent of mine it breaks. Each opponent's cost is weighted by how likely it hits me, as in v1, and summed: each takes its own turn. An opponent beside me on one army threatens with its income.

The sweep is the opponent model, not a preference: it has no weight to tune. The 90% bar and the eight-capture limit are fixed by reasoning about Balanced Blitz and a turn's length.

## 2. Whom an opponent hits

v1 weighted each opponent's blow against me by `1 / its number of neighbouring players`, as if it chose a victim at random. v2 weighs it by my share of what its turn (the larger of blow and sweep) could do to each of its neighbours, each weighed as the opponent sees it, every continent at its plain bonus: an opponent hits whoever its turn hurts most, so being a worse target than the players beside me turns its attacks onto them. The common-threat overrides are v1's (everyone hits the common threat; a common threat's neighbours are hit a quarter as often). Alone, this measured better than v1 at 3 players only; with the sweep it is what took v2 past v1 at 4 players.

## 3. Kills reached through a third player

At 3 players the first elimination decides the game: in 60 games read, whoever made it won 55. v1's kill chance returned 0 for any kill whose way in crossed a third player's territory, though its capture routes take that way, so v1 neither planned those kills nor feared them: one reader found 9 kills of 60% or better hidden in 285 turns, one at 98.6% that another seat took a turn later and won by. v2 counts the stacks one third-party territory from the victim, less what breaking through costs. Since kill chance feeds kill exposure, the gift to whoever finishes a weakened player and next turn's opportunity, all three see these kills too. This took v2's lone seat at 3 players from even to better.

## 4. The board a plan ends on is one that can happen

Pricing exposure well made v1's sketch of a plan's end matter, and two faults in it showed:

- **A forked run.** When one launch stack takes two targets that aren't beside each other, v1 pictured one run marching from the first to the second, every army arriving on the last and the first left on one. v2 launches each branch from the stack beside it and shares the arriving armies among the branch ends.
- **Armies placed beyond what a route needed** vanished from v1's success board, so the same position scored lower while placing than once placed. v2 carries them with the run.
- **Launch stacks.** v1 counted a stack already launching one group at full strength for a second group, so two targets beside two different stacks were both launched from the first. v2 counts what the first route leaves it, so a free stack beside the second target leads it.

## Expert scenarios that changed

v1's scenarios (`rule-bot-v1.md` §5) are v2's regression tests too. Three now read v2's judgement, each looked at before v2 was crowned:

- **9, North America.** With two cheap territories missing, v1 took both. v2 takes a card from it but leaves the continent: completing it would make v2 the common threat, every neighbour's target, and the neighbour beside Greenland (3 armies and an income of 5) would surely break it back. Measured strength, not the scenario, settles whether that is right; v2 is far stronger, so the scenario follows it.
- **12, the move-in.** v1 moved everything on through a captured territory; v2 moves enough to finish the run for sure and may keep the rest at the gate.
- **15, covering the shell.** v1 moved its stack onto the thin territory beside it; v2 scores that and holding within a hair (the opponent reaches the kill either way, and armies on the shell are what its sweep takes), so either passes, and nothing else does.

## Tried and dropped

- **Target share alone**, aim by my share of each opponent's best blows, with v1's threat model: better than v1 alone at 3 players, even elsewhere. Kept in the combined form above.
- **The sweep alone**, aimed as v1 aims: better at 6 players, even at 3 and 4.

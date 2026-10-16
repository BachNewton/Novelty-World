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

## 2. The board a plan ends on is one that can happen

Pricing exposure well made v1's sketch of a plan's end matter, and two faults in it showed:

- **A forked run.** When one launch stack takes two targets that aren't beside each other, v1 pictured one run marching from the first to the second, every army arriving on the last and the first left on one. v2 launches each branch from the stack beside it and shares the arriving armies among the branch ends.
- **Armies placed beyond what a route needed** vanished from v1's success board, so the same position scored lower while placing than once placed. v2 carries them with the run.
- **Launch stacks.** v1 counted a stack already launching one group at full strength for a second group, so two targets beside two different stacks were both launched from the first. v2 counts what the first route leaves it, so a free stack beside the second target leads it.

## Expert scenarios that changed

- **12, the move-in.** v1 moved everything on through a captured territory; v2 moves enough to finish the run for sure and may keep the rest at the gate.
- **9, completing North America cheaply**, is failing for this candidate and is kept failing on purpose. Completing it makes v2 the common threat, so every neighbour aims at it, and with sweeps counted the exposure outweighs the bonus. Whether that judgement or the scenario is right is the gauntlet's to say; if v2 is crowned, the scenario is revisited before it ships.

## Tried and dropped

- **A worse target than the neighbours** (target share): each opponent's aim at me weighted by my share of the blows it could land on its neighbours. Better than v1 alone at 3 players, even elsewhere (`bot-log.md`).

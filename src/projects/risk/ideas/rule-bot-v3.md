# Risk bot v3: what changes from v2, and why

v3 measured +18 Elo a seat over v2 in the gauntlet, better at three of six tables and worse at none (`bot-log.md`), and is seated; the ladder gives its standing.

v3 (`bots/rule-v3/`) is v2 (`rule-bot-v2.md`) with the changes below. v2 is frozen, so v3 keeps only the files it changes (its planner, capture planner, evaluation, small decisions, entry point and parameters) and shares the rest from v1. `bot-log.md` holds every measurement, including the candidates tried and dropped.

## How v3's changes were found

As v2's were: by reading the champion's games with `risk:review`, then gating each change with the gauntlet. A reader went through v2's losses to v1 and its games against itself; a second studied the one table v3 couldn't win at first, a lone v3 among two v2s at 3 players, with rollouts from mid-game positions.

## 1. A direct way in wins a tie

The capture planner chose each target's way in by its chance of success, and Balanced Blitz makes many ways in certain, so a way through a third player's territory won a tie whenever it came first in the neighbour list: 15% of single-capture plans at 6 players took that detour, picturing an attack on a neighbour as a march through someone else's land that left two territories on one army. A way in through a third player now costs 30 points of the route score (1000 for certainty), so a direct one wins any near tie.

## 2. A victim's last territory is a kill

v2 offered a kill only when the victim held two or more territories; its last one could enter only as one of the eight best single captures, ranked against its armies, so a card-holder's last stack beside a much bigger one could go unconsidered. Every killable victim is now a kill plan.

## 3. Preferences keyed to the table

At 3 players the game is a race to the first kill (whoever makes it wins 86 to 90% of games), and a lone player flagged as the leader by two v2s goes on to win most of them: their gang-up is mild, and their ally rule leaves the leader the kill. v2's preferences, built for every table alike, fear leading more than that warrants. `risk:tune` at 3 players moved them, independently, the same way: a shorter income horizon, lighter border and common-threat weights, heavier continent and vulnerability weights. Those preferences beat v2 at 3 and 4 players but gave up v2's edge at 6, so v3 uses them at tables of 4 or fewer while three or more are alive, and v2's otherwise. A two-player endgame keeps v2's: the tuned weights declined a 66% fight there that expert play takes (scenario 8).

The opponent model is untouched; only preferences moved, so no parameter with a job the fitness couldn't see was tuned.

## Tried and dropped

- Striking enemy stacks beyond the eight best single captures; the forced-trade gift of a weakened card-holder; 8 sampled outcomes a plan; v2 with its border weight at 1. Each was even with v2 alone at 3 players, or worse (`bot-log.md`).

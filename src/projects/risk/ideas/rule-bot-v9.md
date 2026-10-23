# Risk bot v9: v6's rules with the fixes YUY4 showed (an idea, not built)

This is a plan, not a bot: nothing is built, and nothing here is decided until a screen measures it. It is written from a review of YUY4, a third game the bots lost to the same person, and says what a v9 would change and why it can't go into v7 or v8 instead.

## What YUY4 showed

YUY4 is a 5-player online game: Bot Killer (the person who won G4FR and 9VFL), Kyle, two rule-v6 seats and rule-v5. Its seed is `c1bb1406-d88d-4105-a801-cfc0e0dbe0fb` and its 775 moves are in `risk_moves`. Every bot decision replays exactly from them. Bot Killer won on turn 75, with Australia held from turn 16 and a 29-capture sweep on turn 73. The dice were neutral: he made 102 captures against 101.7 expected, and the bots were at their expectation too. The bots lost on judgement.

What v6 fixed for 9VFL held. The opponent model's beliefs about his sweeps were right all game: before turn 73, v5 believed his sweep would take 31 of its 32 territories, and he took 29. What lost the game is what v6 left out: responses that span turns, and one execution bug.

1. **New: a 96% kill dropped by the attack executor (turn 18).** v6 planned to kill Kyle (4 cards) at 96%. Its planner costs a fork the way v6's `fork` fix reasons: the cheap branch is taken by the detachment left at the fork. The move-by-move attack doesn't honour that. It took two dead ends, South Africa and then Madagascar, from the main stack. Each capture forces 3 armies in, so the stack stranded 6 armies where 2 would have done. The kill fell to 35%, then 14%, and v6 stopped. A replay with only that one attack's source changed completes the kill on the same board. Next turn v5 took the kill and the 4 cards, and swept on into v6's Africa.
2. **Repeated from G4FR: nobody contested his continent.** No bot attacked Australia or Siam in 60 turns, nor his Asian gates (20 or more armies each) for most of turns 49 to 70, while his income ran at twice theirs. From turn 38 v6 named him the common threat on every turn, and still about half the bots' attacks went into each other, one capture for a card. No single turn's plan can break a 20-army gate, so no single turn's evaluation prefers starting the build. The common-threat charge lowers every plan alike, so it never changes which plan wins.
3. **Repeated from G4FR and 9VFL: spreading in front of one stack (turns 70 to 73).** Heads-up, v5 held 31 territories, its biggest stack 8, and knew what his 46 armies would do. With 2 seats alive, the rule bots play the large table's preferences: there are none for heads-up.
4. **Repeated from 9VFL: a parked stack (turns 40 to 44).** A v6 seat on income 3 sat 21 to 23 armies on Iceland while believing it had a 52 to 56% chance of being eliminated before its next turn. Its plans scored nearly flat, and it chose the marginally best one each turn until v5 killed it.

## Why not in v7 or v8

All four are v6's: its attack executor, its plans, its preferences. v7 searches only the turn's placement and plays v6's attacks. v8 changes only the score. At YUY4's key decisions v7 and v8 both leaned toward one stack where v5 and v6 split placements, which is a step toward fix 2, but neither aimed the stack at his gate, and neither changes turn 18 or the endgame. v6 is seated and frozen, so a change to its play is a new version. Putting these into v7 or v8 would also void their measurements in flight, and confound v8's retraining with a planner change. So they are a v9, and v7 and v8 can later be built on v9's rules instead of v6's if v9 holds up.

## What v9 would change

v6 whole, with each change a switch, as v6's fixes were (`Fixes` in `rule-v6/params.ts`). Then a screen seats v6 with any one change on and pins its result on it. Ordered by cost and certainty:

1. **`detach`: take a fork's dead end from the detachment.** When the next capture of the plan being played can be made from a territory the plan has already taken, off the main line, attack from there rather than from the stack. This brings execution into line with the plan's own costing; it doesn't override the evaluation. Its test is YUY4's turn 18 (decision 132 onward), kept as a fixture like `9vfl.json`: the same position, and the kill completes. It is cheap, and should rarely fire.
2. **`heads-up`: preferences for two alive.** Either the small table's preferences at 2 alive, or a third set tuned heads-up. A cheap screen, played on games that reach two seats.
3. **`underdog`: under a common threat, a capture from a fellow underdog costs something.** Charge a plan for the power it takes from the seats that aren't the threat, the only ones able to hold the leader back. This makes the threat change which plan wins, not only each plan's score. It is a preference, so it is tuned and screened, not assumed.
4. **`dying`: a seat that believes it is probably being killed plays for that.** Above some believed chance of elimination (about half in YUY4), score plans by survival, or by the damage they do to the likely killer, not by a marginal share. Also a preference, also screened.
5. **A plan that spans turns: building to break the leader's bonus.** This is the largest gap, and G4FR showed it too. It is also the hardest. Either a "build" plan (place on the stack facing the leader's weakest gate, scored on next turn's chance to break it), or v7's reply search looking one more round ahead for that one plan. It is left until 1 to 4 are measured.

## For v7, separately

v7's reply mix (v6, gd-aggressive, greedy) has no player that sits on a hub, gathers 46 armies and then sweeps 29. The sweeper persona (`sweeper-v1`, now registered) is the reply bot that would let v7 see turn 73 coming, and v7's doc already plans to add it with one line. That is a change to v7's play, so it waits until v7's current measurements finish, and is then screened against plain v7.

## Measuring it

The bar and the commands would be fixed before any run, as for v6: each switch screened against v6 at 5 players, one-in and one-out, then the kept set's full suite on train and holdout seeds, and the seatable ladder.

# Risk bot v4: better beliefs about the other seats

v4 measured +10 to +11 Elo a seat over v3 in the gauntlet, on train and holdout seeds: better at both 4-player tables (and, on holdout, two v4s among one v3 at 3 players), worse at none (`bot-log.md`). It is seated, and the ladder gives its standing.

v4 (`bots/rule-v4/`) is v3 (`rule-bot-v3.md`) with a different opponent model, different beliefs about what each other seat does with its turn before mine, and its small-table preferences retuned on those beliefs; the planner and the evaluation are v3's. `bot-log.md` holds every measurement, including what was tried and dropped. v3 is frozen, so v4 keeps only the files it changes (its entry point, parameters, planner, small decisions and evaluation, which read its own model) and shares the rest from v3 (the capture planner) and v1 (the board, the odds, the hand model).

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

## Preferences retuned on the beliefs

v4's beliefs, on v3's preferences, lost the lone seat at 3 players (510 decisive games). Played one at a time against v3 there, three of the four beliefs were even and one lost alone: the aim pulled toward an even split, the best calibrated of them as a prediction. v3's preferences had been tuned on v3's beliefs, and the measurement shows what they had been making up for: among the rule bots an opponent's turn costs me 1.4 to 2 times what the model prices it at, and v3's too-confident aim (every opponent at the leader, a strong lean toward its likeliest target) was putting defence where the big blows land. Honest beliefs price my border and my survival lower, so preferences tuned on the old beliefs leave v4 too bold.

So the small-table preferences were retuned on v4's beliefs (`risk:tune` at 3 and 4 players together, against v3), with the aim's pull and without it. Both runs moved the same three weights from the first generation: fear of my own elimination about twice v3's, border losses about three times, and the common-threat weight to nearly nothing, since the believed gang-up and the game's record now say what it stood in for. The two came out indistinguishable in the gauntlet, so v4 keeps every belief, with no exception for the aim. Above 4 players v4 plays v3's preferences, untuned on its beliefs.

## Tried and dropped

- v4's beliefs on v3's preferences: worse at the 3-player lone seat.
- Each belief alone on v3's preferences: kills, leader and the game's record even; the aim's pull worse (−26 Elo a seat).
- Every belief but the aim's pull, on v3's preferences: better with five of it at 6 players, worse alone at 4 (−28), even elsewhere.
- Retuned preferences on the beliefs without the aim's pull: as good as v4, not better.

## What next

- **Tune the large-table preferences on the beliefs.** v4 is even with v3 at 6 players on v3's preferences; the same mismatch the small table showed (an underpriced hit, a common-threat weight with little left to do) is likely there too, and the 6-player games are the slow ones (110 to 180 turns), so that tune is the night's work on its own.
- **Price the hit, not only its aim.** What an opponent's turn would cost me is priced at 0.5 to 0.7 of what it does among rule bots, but about right against GD's softer personas; a measured hit belief, keyed to whom it is played against, would let the preferences mean what they say. The border weight is doing that job now.

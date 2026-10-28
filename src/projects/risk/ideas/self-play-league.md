# Self-play: a league that keeps its best

The roadmap's "opponents" cause (`roadmap.md`, Self-play, step 5), tested first because run sw128b
showed it. This doc fixes the experiment and its predictions before the run; the results are
added below them, never edited into them.

## What sw128b showed

sw128b (128×4, win reward) peaked at iteration 450: one-in against net-v1 (m2a-50) 23.8% against
par 20%, and in the TypeScript harness, against rule-v6 at 5 players one-in, **better**: 24.6%
[21.2, 28.3] of 553 decisive games, win Elo +46 (`bot-log.md`, "net-v1 sw128b-450 beats v6
one-in"). It then fell: by iteration 575 one-in against net-v1 was 2 to 5%, and against GD
Defensive (5 players) 52 to 62% where it had been 71 to 74%. Greedy (81 to 88%) and GD Stacker held.
Training itself stayed healthy throughout (entropy about 2.0, KL about 0.013, no capped games),
while the mean game shortened from about 93 player-turns to about 77.

The reading: the league let it drift. Of the non-learner seats, the current net took 15% and the
run's own snapshots about 23% (the two newest, two drawn at random from the rest, redrawn every 25
iterations), so most of its self-play pressure came from its last few selves, and nothing held it
to iteration 450's level. It learned a faster game that beats its recent selves and loses more to
outside styles. This is a hypothesis: no games were reviewed to confirm the style change.

## The change

Run **pf1**, everything else as sw128b:

- **Starts from sw128b's iteration 450** (`--init`), a fresh optimizer, the learning rate from
  where sw128b's schedule stood there (about 1.3e-4) down to 5e-5 over 12 hours.
- **Iteration 450 is pinned** in the league for good (`--league-fixed`), beside m2a-50 and m1a-75.
- **The run's own slots are chosen by results** (prioritized fictitious self-play, as AlphaStar's
  league): the newest snapshot always, and the others drawn from every earlier snapshot weighted by
  x², where x is how often that snapshot won its seats while it was in the league (a prior of par
  for one never seated). Snapshots the learner beats easily fade; ones that still beat it return.
- **Two head-to-head checks** every 25 iterations: against m2a-50 as before, and against
  sw128b-450, the net to beat.

A known blur in the results it picks by: a game lasts about 20 iterations and the slots are
refilled every 25, so a game in flight can change which snapshot holds a seat, and its result is
credited to the one there when it ends. sw128b's random refills had the same overlap. If pf1's
picks look like noise, crediting each game to the snapshot it was dealt is the first fix.

The seat shares are unchanged (self 15%, league snapshots 35%, GD's personas 35%, greedy 15%), so
the run tests which past nets fill the league, not how much of it there is.

## Predictions

Made before the run, from sw128b's curves. A baseline here is sw128b's iterations 450 to 775 (the
same span of training from the same net).

| # | Prediction | Confidence |
|---|---|---|
| 1 | The first 25 iterations dip (the fresh optimizer): one-in against sw128b-450 below 20%, then it recovers. | 55% |
| 2 | One-in against net-v1 never falls below 12% at any check over 12 hours (sw128b fell to 2% within 150 iterations). | 60% |
| 3 | Against GD Defensive it stays at 65% or more at every check (sw128b: 52 to 62%). | 55% |
| 4 | One-in against sw128b-450 reaches 25% or more at some check: a net clearly better than the one it started from, by the GPU's measure. | 35% |
| 5 | The mean game length stays above 85 player-turns (sw128b fell to about 77). | 50% |
| 6 | The best checkpoint by the head-to-head against sw128b-450, exported, is better than sw128b-450's 24.6% against rule-v6 in the harness (one-in, 5 players). | 30% |

If 2 and 3 hold but 4 and 6 don't, the league stops the drift but doesn't climb: the next cause is
the signal itself (more seats for the strong anchors, or a larger batch). If 2 and 3 fail too, the
drift isn't the league's doing and the reading above is wrong.

## Results

Pending.

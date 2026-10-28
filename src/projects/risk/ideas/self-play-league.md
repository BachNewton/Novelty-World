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

**pf1 was stopped at iteration 78 (1.7 hours): it fell as fast as sw128b did, faster at first.**

| Iteration | One-in vs net-v1 | One-out vs net-v1 | One-in vs sw128b-450 | GD Defensive | GD Stacker | Greedy |
|---|---|---|---|---|---|---|
| 25 | 24.7% | 75.2% | 17.4% | 65.1% | 68.4% | 89.1% |
| 50 | 13.3% | 58.0% | 12.7% | 55.2% | 66.6% | 85.9% |
| 75 | 7.6% | 54.9% | 10.0% | 57.6% | 66.1% | 86.8% |

sw128b over the same span from the same net (iterations 450 to 525): one-in vs net-v1 23.8%, 19.1%,
13.7%, 12.5%. Training's own figures (KL about 0.012, clipped share about 0.11, entropy about 2.1,
value loss about 0.02) matched sw128b's at the same stage, so nothing in the update misbehaved.

Against the predictions:

1. Dip below 20% against sw128b-450: **held**, but it never recovered, so the reason given (the
   fresh optimizer) is not the one.
2. One-in vs net-v1 never below 12%: **failed** (7.6% at iteration 75).
3. GD Defensive at 65% or more: **failed** (55.2% at iteration 50).
4. to 6. Not reached; with 2 and 3 failed, not worth running on for.

As fixed above, 2 and 3 failing means **the drift isn't the league's doing**: pinning iteration
450 and picking the past by results changed nothing in 75 iterations. Two readings are left, and
one thing sw128b's curve says about both: before iteration 450 its one-in vs net-v1 sat at 7 to
15%, so 450 was a high point of a wandering curve, not the top of a climb, and some of the fall
since is a return to that curve's usual level.

- **A. Step size.** Each 25 iterations moves the policy far, and the noisy win signal decides
  where: the net wanders, and a lucky high point isn't held. A smaller learning rate shrinks the
  wander.
- **B. Weak opponents set the gradient.** Half of every non-learner seat is greedy or a GD persona,
  which it beats 55 to 90% of the time, so most of its winning, and so most of what it learns,
  comes from beating weak bots. A style tuned for that holds against greedy and GD Stacker and
  loses to the strong nets, which is the pattern in both runs. More seats for strong nets shrinks
  that pull.

## pf2 and pf3: step size, then the opponents' strength

Both start from sw128b-450 with pf1's league (450 pinned, own slots by results) and run 100
iterations (about 2.3 hours), long enough that pf1's fall was plain. One change each:

- **pf2**: learning rate 3e-5, constant (pf1's was 1.3e-4 falling).
- **pf3**: pf1's learning rate; greedy and GD's personas cut from 50% of the seats to 20% (GD's
  personas 20%, greedy none), the
  league's snapshots raised from 35% to 65%, with the self share at 15%.

| # | Prediction | Confidence |
|---|---|---|
| 7 | pf2 holds one-in vs net-v1 at 15% or more through iteration 100. | 40% |
| 8 | pf2's one-in vs sw128b-450 stays between 16% and 24% through iteration 100: it moves too little to drift or to climb. | 55% |
| 9 | pf3 holds one-in vs net-v1 at 15% or more through iteration 100. | 40% |
| 10 | pf3's GD Defensive falls below pf1's (under 55% at some check): a net tuned against nets gives back some of its edge on GD. | 50% |
| 11 | Neither run reaches 25% one-in vs sw128b-450 by iteration 100. | 75% |

If only pf2 holds, the step size is the lever, and the next run is a long one at the small
learning rate. If only pf3 holds, the opponents' strength is, and the league is rebuilt around
strong nets. If both hold, both matter; if neither does, the wander is the win signal's own noise
in 5- and 6-player games, and the next step is the roadmap's "wiring" cause (an imitation warm
start), or a bigger batch.

## pf2's results: smaller steps slow the drift, they don't stop it

pf2 ran its 100 iterations (2.3 hours).

| Iteration | One-in vs net-v1 | One-out vs net-v1 | One-in vs sw128b-450 | One-out vs sw128b-450 | GD Defensive | GD Stacker | Greedy |
|---|---|---|---|---|---|---|---|
| 25 | 27.0% | 83.6% | 20.9% | 78.1% | 69.7% | 71.7% | 89.4% |
| 50 | 21.1% | 78.9% | 22.7% | 81.0% | 69.1% | 73.1% | 92.9% |
| 75 | 18.9% | 59.0% | 23.2% | 75.0% | 64.3% | 73.0% | 93.0% |
| 100 | 16.6% | 57.6% | 19.9% | 74.0% | 58.2% | 67.8% | 92.6% |

Against the predictions:

7. One-in vs net-v1 at 15% or more through iteration 100: **held**, at 16.6%, but on a steady fall
   (27, 21, 19, 17), so it held because the run was short, not because the fall stopped.
8. One-in vs sw128b-450 between 16% and 24%: **held** (20 to 23%).
11. No 25% against sw128b-450: holds for pf2.

The same pattern as pf1's, at roughly a third of the speed: against net-v1 the one-out fell 84 to
58% (pf1: 75 to 55% in 75 iterations), and GD Defensive 70 to 58%, while greedy rose. The step size
sets how fast it drifts, not where to: the direction is the same in all three runs, away from
net-v1 and GD Defensive and toward beating greedy. Its games also lengthened (100 to 129
player-turns) where sw128b's shortened, and its entropy fell from 2.0 to 1.7, so it isn't the same
style change, only the same losses. That leaves reading B, the opponents set the direction, as the
better candidate, and pf3 tests it.

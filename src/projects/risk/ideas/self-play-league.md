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

## pf3's results: stronger opponents don't stop it either

pf3 ran its 100 iterations (paused once at iteration 32, at a checkpoint, while another job had
the GPU; resuming re-dealt the games in flight).

| Iteration | One-in vs net-v1 | One-out vs net-v1 | One-in vs sw128b-450 | One-out vs sw128b-450 | GD Defensive | GD Stacker | Greedy |
|---|---|---|---|---|---|---|---|
| 25 | 25.4% | 89.5% | 20.1% | 81.5% | 65.4% | 66.0% | 84.6% |
| 50 | 12.3% | 84.2% | 17.8% | 80.1% | 68.5% | 71.4% | 89.4% |
| 75 | 15.4% | 73.0% | 14.4% | 78.3% | 56.2% | 65.1% | 87.6% |
| 100 | 8.8% | 55.9% | 13.9% | 69.9% | 55.7% | 63.6% | 89.2% |

Against the predictions:

9. pf3 holds one-in vs net-v1 at 15% or more: **failed** (12.3% at iteration 50, 8.8% at 100).
10. pf3's GD Defensive under 55% at some check: **failed**, narrowly (55.7% at its lowest), so a
    league of nets cost it no more on GD than pf1's mix did.
11. Neither run reaches 25% one-in vs sw128b-450: **held** (pf2's best 23.2%, pf3's 20.1%).

By the letter of the rule above, only pf2 held, which names the step size as the lever. That reading
is wrong, and the rule was too coarse: pf2 held prediction 7 only because it was short, its curve
falling at a third of pf1's speed. And pf3 refutes reading B outright: two thirds of its seats were
nets, with net-v1 and sw128b-450 pinned among them, and it lost ground to exactly those two as fast
as pf1 did. It trained against net-v1 and got worse against net-v1.

Two readings are left, and they differ on what the training is doing:

- **C. It improves, at something the checks don't measure.** Every check is a table of one net
  against copies of another (or of one bot). Training is always a mixed table. A net can get better
  at mixed tables while getting worse in those homogeneous ones: strength inside one population
  says nothing about another (DORA, `risk-bot-ai.md`), and m2a-50 already crushed a net that beat
  GD harder (`gpu-engine.md`).
- **D. It doesn't improve at all.** The win signal at 5 and 6 players is too noisy for these
  batches to find a real gradient; the policy wanders, and from a high point (450) any wander is
  down. The step size sets the wander's speed, as pf2 showed, and the opponents don't change it,
  as pf3 showed.

## The mixed-table ladder: C or D

No training. One ladder (`riskgpu.selfplay.ladder`) of eight nets seated together at 5-player
tables, five different nets at every table, every seat sampling as in training, 8192 games, win Elo
by a Luce fit, net-v1 at 0: net-v1 (m2a-50); sw128b at 375, 450, 575 and 825 (before the peak, the
peak, after its fall, and its last); pf1-75, pf2-100 and pf3-100. A mixed table of nets is the
closest a fixed test comes to the training tables.

| # | Prediction | Confidence |
|---|---|---|
| 12 | sw128b-450 rates first, or within 30 Elo of first. | 55% |
| 13 | pf3-100 rates at least 30 Elo below sw128b-450. | 55% |
| 14 | sw128b-825 rates below sw128b-450 (a whole run's drift shows in a mixed table too). | 65% |

If 12 to 14 hold, the drift is real in mixed tables as well: reading D, and the next lever is the
signal's noise (bigger batches, more games an update, or a warm start by imitation). If the later
nets (pf3-100, sw128b-825) rate above sw128b-450, reading C: training improves at its own tables,
and the question becomes which tables the rule bots' strength follows, since sw128b-450 beat v6
one-in.

## The ladder's results: the drift is real, reading D

8192 games, all decisive, win Elo with net-v1 at 0:

| Net | Win Elo |
|---|---|
| sw128b-450 | +95 |
| pf2-100 | +59 |
| pf3-100 | +18 |
| net-v1 (m2a-50) | 0 |
| sw128b-375 | −3 |
| sw128b-825 | −45 |
| pf1-75 | −67 |
| sw128b-575 | −139 |

12. sw128b-450 first or within 30 Elo of it: **held**, first by 36.
13. pf3-100 at least 30 Elo below sw128b-450: **held**, 78 below.
14. sw128b-825 below sw128b-450: **held**, 140 below.

So the later nets are worse at the mixed tables too, not only in the homogeneous checks: reading D.
The order fits a wander rather than a slope: sw128b went from −3 (375) up to +95 (450), down to −139
(575) and back up to −45 (825), and pf2, the smallest steps, stayed nearest to where it started.

## What the update does with the noise

Each iteration's PPO update takes 3 epochs over its about 480,000 learner decisions in minibatches of
2048: about 700 optimizer steps, each on 2048 decisions from the same few hundred games. The
batch size that matters for noise is the minibatch, not the rollout. The noise scale (McCandlish
et al., "An Empirical Model of Large-Batch Training") says how many decisions a gradient must
average before its signal matches its noise; `riskgpu.selfplay.noise` measures it at sw128b-450 in
pf1's league, from the gradient over each half of a rollout's games and over all of them, eight
rollouts after twenty played to spread the games over every phase.

| # | Prediction | Confidence |
|---|---|---|
| 15 | B_noise is above 20,000 decisions: a 2048-decision step is mostly noise. | 75% |
| 16 | B_noise is above one rollout's decisions (about 480,000): even a whole iteration's gradient is mostly noise. | 35% |
| 17 | The two halves' gradients have a mean cosine below 0.3. | 65% |

If B_noise is between about 20,000 and one rollout, the fix costs nothing: a minibatch near
B_noise, so fewer, cleaner steps from the same data. Above one rollout, an update needs more data
(a larger batch or horizon) or less variance. Below 20,000, noise isn't it, and the drift is a bias
(the value baseline, or the objective itself).

## The noise scale: about 1.8 million decisions

At sw128b-450 in pf1's league, eight rollouts of about 506,000 learner decisions each:
|G|² 8.3e-4, tr(Σ) 1,468 a decision, so **B_noise about 1,770,000 decisions**. The halves' gradients
had a cosine of 0.11 to 0.19 (mean 0.135), which is what those two figures predict for halves of
253,000 decisions (0.125), so the estimate is consistent with itself.

15. B_noise above 20,000: **held**, by a factor of about 90.
16. B_noise above one rollout: **held**, about 3.5 rollouts. I gave this 35%.
17. Mean cosine of the halves below 0.3: **held** (0.135).

What it means. A 2048-decision step's gradient has about 2048 / 1.77M of the signal's share it
would need to match its noise: each of an iteration's 700 steps is over 99% noise. Even a whole
rollout's gradient is only about a fifth signal. So the update follows the noise, and the curves
show it: the policy wanders, any high point is luck, and every continuation falls back toward the
level the training holds on average (net-v1's, about). pf2 wandered slower because each noisy step
was smaller, not because its steps were cleaner, which is why it slowed the fall without stopping
it. Reorganizing the same data into fewer, larger steps can't fix this on its own: in the small-step
limit a sum of minibatch steps is the rollout's gradient, a fifth signal at best. The win signal
itself has to carry more per decision, or each update has to see several rollouts' worth.

This is measured at one checkpoint in one league; the scale moves during training, and Adam's
per-weight scaling and PPO's three epochs over the same data change how the noise turns into steps.

## Less noise per decision: λ, not the reward

The obvious way to more signal per decision is a richer reward, but the win reward is already
graded below the win (second place 0, down to −1 for the first out), so every seat of every game
already says something. Placement would add little, and it would teach outlasting, which the net
already does well. Measuring its noise at a win-trained checkpoint would also be unfair to it: the
value head was fitted to the win reward, so its advantages would be skewed.

The cheaper lever is GAE's λ. At 0.95 an advantage is nearly the game's outcome less the value
head's guess, so every decision carries the dice of every turn left in its game. A lower λ leans on
the value head's estimate a few steps on instead, cutting the variance at the cost of the value
head's bias. The noise tool takes λ, so the same checkpoint and league give the answer.

| # | Prediction | Confidence |
|---|---|---|
| 18 | At λ = 0.8, B_noise is below half its 0.95 value (under about 880,000). | 50% |
| 19 | At λ = 0.6, B_noise is below a third of its 0.95 value (under about 590,000). | 45% |
| 20 | Lowering λ never raises B_noise. | 80% |

If λ = 0.8 halves B_noise, pf4 trains at 0.8; if not, at 0.95.

## λ's noise: lower λ helps, a little short of the predictions

The same checkpoint, league and eight rollouts, at two lower λ:

| λ | \|G\|² | tr(Σ) | B_noise | of λ = 0.95's | Halves' cosine |
|---|---|---|---|---|---|
| 0.95 | 8.3e-4 | 1,468 | 1,770,000 | 1 | 0.11–0.19 |
| 0.8 | 2.0e-3 | 1,811 | 926,000 | 0.52 | 0.21–0.30 |
| 0.6 | 3.3e-3 | 2,159 | 650,000 | 0.37 | 0.26–0.37 |

18. λ = 0.8 below half: **failed**, narrowly (0.52).
19. λ = 0.6 below a third: **failed** (0.37).
20. Lowering λ never raises B_noise: **held**.

The surprise is how. The noise per decision didn't fall: it rose a little, since the advantages'
normalization rescales them. What grew was the shared part of the gradient, 2.4 times at 0.8 and 4
times at 0.6. That is the measure's blind spot: a coherent bias looks like signal to it, and a lower
λ adds exactly that, the value head's errors, the same in every half. So the drop in B_noise is an
upper bound on what λ buys, and the part that is bias isn't separable here. By the rule set before
the measurement, pf4 keeps λ = 0.95, which also leaves it testing one change against pf2.

## pf4: a colder update

The noise alone doesn't decide where the training settles; the update's temperature does. With
small steps, the policy wanders about the best it can reach, with a spread set by the learning rate
over the minibatch: the larger that ratio, the further the wander takes it below the best. sw128b
trained at 2e-4 falling to 5e-5 over its 28 hours (about 1.3e-4 by iteration 450) over 2048, pf2
at 3e-5 over 2048, about four times colder than sw128b there, and pf2 fell slowest
(its iteration 100 is second on the ladder). Reorganizing the data can't make a step cleaner per
decision seen, but it can make the update colder without slowing it as much as a smaller learning
rate does: a larger minibatch averages the noise before Adam scales the step.

pf4 starts from sw128b-450 in pf1's league (as pf2 did), with a minibatch of 32,768, 2 epochs and a
learning rate of 1e-4. That's about 3e-9 per decision, five times colder than pf2, while its
progress along the true gradient per iteration should be about half pf2's (fewer steps, each about
four times better aimed). 100 iterations, with the same checks as pf2 and pf3, then the
mixed-table ladder with sw-450, pf2-100 and net-v1.

| # | Prediction | Confidence |
|---|---|---|
| 21 | pf4's one-out against sw128b-450 stays at or above 76% at every check (pf2 fell to 74%). | 55% |
| 22 | On the ladder, pf4-100 is within 30 Elo of sw-450, or above it. | 50% |
| 23 | pf4-100 rates above pf2-100 on the ladder. | 60% |
| 24 | pf4-100 rates more than 30 Elo above sw-450. | 15% |

If 22 holds and 24 fails, the training holds its ground but climbs too slowly to see in 100
iterations, and the next step is a longer cold run. If 22 fails, temperature isn't the lever, and
the noise reading needs revisiting.

## pf4's first check, then the GPU dropped out

At iteration 25, beside pf2 and pf3 at the same point (win %; about ±1.5 points of luck each):

| Run | v1 in | v1 out | 450 in | 450 out | GDdef | GDstk | Greedy |
|---|---|---|---|---|---|---|---|
| pf2 | 27.0 | 83.6 | 20.9 | 78.1 | 69.7 | 71.7 | 89.4 |
| pf3 | 25.4 | 89.5 | 20.1 | 81.5 | 65.4 | 66.0 | 84.6 |
| pf4 | 30.1 | 87.3 | 21.3 | 76.0 | 75.8 | 75.3 | 90.4 |

The best start of any continuation against the GD personas (4 to 6 points over pf2) and one-in
against net-v1, with the one-out against 450 exactly on prediction 21's line. pf2 and pf3 also
looked fine at 25 and fell later, so this says nothing yet about 22 to 24.

At iteration 34 the laptop came off its charger, the NVIDIA driver dropped the GPU, and the run
died in a backward pass ("CUDA error: unknown error"; afterwards no CUDA device at all). Its
checkpoint at iteration 32 is kept, and `pf4.ps1` resumes it. The first launch had also run out of
memory: an 8,192-row chunk of the update doesn't fit beside the environment on a 12 GB card, which
is why every run here uses 2,048-row minibatches. The update now takes a minibatch in chunks
(`--chunk`), summing their gradients before Adam's step, so the minibatch is no longer bounded by
memory; chunks of 2,048 fit.

## pf4's results: it holds its ground, and still slides

pf4 resumed from iteration 32 and ran to 100. Its checks (win %):

| Iteration | v1 in | v1 out | 450 in | 450 out | GDdef | GDstk | Greedy |
|---|---|---|---|---|---|---|---|
| 25 | 30.1 | 87.3 | 21.3 | 76.0 | 75.8 | 75.3 | 90.4 |
| 50 | 32.1 | 88.7 | 22.5 | 84.0 | 73.9 | 73.6 | 92.3 |
| 75 | 23.4 | 83.0 | 21.9 | 81.3 | 72.5 | 74.3 | 91.8 |
| 100 | 18.4 | 60.7 | 21.1 | 85.4 | 69.7 | 72.3 | 92.5 |

The mixed-table ladder, seven nets, 8192 games, all decisive, win Elo with sw-450 at 0:

| Net | Win Elo |
|---|---|
| pf4-50 | +35 |
| pf4-75 | +18 |
| pf4-100 | +14 |
| net-v1 (m2a-50) | +3 |
| sw-450 | 0 |
| pf2-100 | −74 |
| pf3-100 | −84 |

21. One-out against sw128b-450 at or above 76% at every check: **held** (76, 84, 81, 85).
22. pf4-100 within 30 Elo of sw-450, or above it: **held** (+14).
23. pf4-100 above pf2-100: **held**, by 88.
24. pf4-100 more than 30 Elo above sw-450: **failed**.

So the colder update stopped the fall the earlier continuations took on the same tables (pf2 and pf3
end 74 and 84 below sw-450), which makes the update's temperature a real cause of the drift. It
didn't stop all of it: pf4 is best at 50 and slides after (35, 18, 14, each about ±20 of luck), and
against net-v1 its one-out fell from 89% to 61%, the same direction as every run before it, at a
slower pace.

The ladder also moved under the nets it shares with the first one: there sw-450 was 95 above
net-v1, here they are level, and pf2-100 went from 36 below sw-450 to 74 below. A mixed table's
rating depends on who else sits at it, so ratings compare only within one ladder, and a net's
strength "at mixed tables" is a strength in that field.

By the rule above (22 held, 24 failed), the next step is the shaping's noise measurement.

## Did sw128b stop learning?

It learned, then flattened, then wandered. Its checks against the fixed bots (win %; par 33% for
greedy at 3 players, 20% for GD at 5):

| Iteration | 25 | 50 | 75 | 150 | 225 | 300 | 375 | 425 | 450 | 525 | 600 | 675 | 750 | 825 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Greedy@3 | 8 | 40 | 51 | 67 | 78 | 72 | 77 | 81 | 88 | 87 | 84 | 87 | 84 | 78 |
| GDdef@5 | 8 | 22 | 40 | 53 | 73 | 73 | 69 | 74 | 71 | 58 | 58 | 52 | 62 | 68 |
| GDstk@5 | 8 | 23 | 38 | 56 | 73 | 69 | 71 | 74 | 69 | 66 | 71 | 69 | 73 | 72 |

From random weights to beating the GD personas at more than three times par by iteration 225: the
gradient carried plenty of signal early, when the gains were large. Against GD it was flat from
about 225 to 450, and after 450 the checkpoints scatter without a trend (the ladder: 375 at −3, 450
at +95, 575 at −139, 825 at −45). 450 is genuinely the strongest net (the ladder measured it over
8,192 games); what was luck is that training stood there when it was saved. The noise scale at 450
still finds an uphill direction, so learning didn't stop: its step per iteration became smaller
than the wander's. That is what pf4 tests.

## What comes next, and why

1. **pf4 is done**: it held (22) and didn't climb (24 failed), so step 2 follows.
2. **If pf4 holds (22) but doesn't climb (24 fails)**, the training needs more signal per
   decision, not only less heat. A richer reward is the lever the owner raised: credit for taking
   territories and eliminating players, so a move is judged within a few turns rather than at a
   game's end. Raw bonuses change what the net is trained to want (each capture paid, a capture
   lost and retaken paid twice, a weak player finished off even when a rival gains), as the
   placement reward taught m2a to settle for second. **Potential-based shaping** gives the early
   credit without that: the reward for a step is the change in a position score Φ (the seat's
   share of territories and armies, an opponent eliminated counting through its lost share), so
   over a whole game the extra rewards cancel and the best policy is unchanged; only when credit
   arrives changes. Its value is bounded by how much better Φ is than the value head, which
   already estimates the same thing, so it is measured before it is trained: the noise tool, with
   the shaping added, at sw128b-450.

   | # | Prediction | Confidence |
   |---|---|---|
   | 25 | Shaping by territory and army share cuts B_noise below λ = 0.8's (926,000). | 40% |
   | 26 | It cuts B_noise below 600,000. | 20% |

   It is trained only if 25 holds, and judged on the ladder, which counts only wins, so a net that
   learns to farm territory instead of winning shows as a loss.
3. **If pf4 doesn't hold (22 fails)**, temperature isn't the lever, and the noise reading needs
   revisiting before any more training: the next suspect is a bias in the update (the value
   baseline, or PPO's clipping at this scale), measured, not guessed.
4. **Longer cold runs** come after: pf4's progress per iteration is about half pf2's by
   construction, so a real climb may need several hundred iterations to show.

Checkpoints and logs live in the main checkout's `gpu/runs/selfplay/` (git-ignored), with the
launch scripts beside them.

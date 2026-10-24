# Distilling v7: v7's judgement at v6's cost (an idea, not built)

This is the plan behind a bot. The kill test's tooling is built (below), and its first experiments on the pilot data are measured. The student bot is built, as `student-v1` (`student-v1.md`), with the pilot's best student as its first weights; it is not yet measured. The doc says why distilling should work where v8 didn't, and the cheap test that decides whether a student is worth playing.

## The problem it answers

v7 (`rule-bot-v7.md`) is the strongest bot measured: about +150 win Elo a seat over v6 at 5 players, better both alone and four against one. Its strength comes from search. At each turn's placement it plays v6's four best plans through about eight imagined rounds of the opponents' replies, with real bots in their seats. That costs about a hundred imagined v6 turns per v7 turn: about 2.5 s on the laptop, and about 6 machine-minutes for a game of four v7s on GitHub Actions. A player waiting 3 seconds is fine. Proving v7's strength is not: its seating suite is days of all twenty runners, and every idea built on v7 would pay the same again.

Distillation is the standard answer to a search that is too slow: run the expensive searcher offline once, and train a small, fast model to make the same choices. The student plays at about v6's cost and carries the searcher's judgement. AlphaZero's networks are the best-known case (search's choices distilled into a policy, then searched again from it); "expert iteration" is the general loop.

## What the student learns

v7 differs from v6 in one decision only: **which of v6's top plans to place for.** Everything else (trading, attacking, moving in, fortifying) is v6's. So the student only has to learn that one choice, and the labels for it are unusually rich:

- **The candidates** are v6's top 4 plans by value, one per distinct placement (`candidates` in `rule-v7/index.ts`). Each is a placement plus the plan v6 would play from it.
- **The labels** are v7's mean score for every candidate, not only its pick (`search` returns `scores`). A score says how good each plan turned out across the replies, so a decision teaches a ranking of four, not one winner.
- **The student** scores a candidate from the board as it would stand after the plan: v6's success and failure boards for that plan, with its success chance, read through rule-v8's feature function (`rule-v8/features.ts`), so no feature is invented twice. It's a small network, as v8's is, run on four candidates per turn.
- **Training** fits the scores within each decision with a ranking loss (what matters is which candidate comes first), held out by game, on the laptop's CPU, as v8 trains.

The student bot is v6 everywhere, with the turn's placement chosen as the best of v6's top 4 by the student's score: about v6's cost plus four network evaluations a turn.

## The teacher can be stronger than the live bot

The live v7 is capped at 8 replies by the server's turn time (rule 5 of its bar). The teacher isn't: its cost is paid once, offline. So the labels can come from v7 at 32 replies, or with more candidates, or a deeper look ahead, which no live game could afford. The student then plays at v6's cost what no live searcher could play at all. The budget curve says replies beyond 8 measured no stronger, so the first choice is v7 at 8; widening the candidates is the more promising way to a stronger teacher.

## Why this isn't v8 again

v8 learned *who wins* from games among bots, and learned what those bots let a seat get away with: among v6s, holding back wins, so a table of v8s stalled and lost to one v6. A distilled v7 learns *what v7 chose*, and v7 already passed the test v8 failed: four v7s beat one v6. Its scores come from imagined rounds against a mix of opponents, not from one population's outcomes. The student can still go wrong in two known ways:

- **Positions the teacher never saw.** A student that errs reaches boards v7 never reached, where its training says nothing. The standard fix is DAgger: play games with the student, have the teacher label the positions the student reached, add them, retrain. One or two rounds usually close the gap.
- **The teacher's own blind spots.** The student can only be as good as v7's choices. That's the ceiling, and it's a high one.

## The kill test, before any bot

Recording the teacher is cheap next to a gauntlet: a v7 decision costs about 2.5 s, so 100,000 labelled placement decisions are about 70 core-hours, an hour or two of Actions runners, with no tables full of v7s. On held-out games, measure:

1. **How often v7 disagrees with v6** (picks a candidate other than v6's own). If it rarely does, there's little to learn and v7's edge lives in a few decisions.
2. **The student's agreement with v7** on those decisions, against v6's (zero there by definition) and a trivial baseline.
3. **Regret:** v7's own score for the student's pick against v7's best, averaged. This is the number that matters: how much of v7's judgement the student keeps.

Only if the student keeps most of v7's edge in regret does it get built as a bot and screened (5 players, one-in and one-out against v6 and against v7, the same as every bot). Screening it is cheap, because it plays at v6's speed.

## Built: the kill test tooling

- **The recorder** is a mode of `risk:record` (`--teacher rule-v7`, `eval/distill.ts`), on the same worker pool and Actions shards. v7 plays through the recorder's own copy of its control flow on rule-v7's exported pieces, so each search runs once and v7's code is untouched (its ladder records stay valid); tests hold it to v7's moves and its search's candidates, scores and pick. Each record is one search over more than one candidate: every candidate's placement, success chance, v6 value, success and failure boards with v6's breakdown of each, v7's mean score, every reply's own score, and v7's pick.
- **The features step** is `risk:features -- --teacher`: a row per candidate, both boards through v8's feature function, grouped by decision.
- **The trainer** is `bots/rule-v8/train/distill.py`: a candidate scorer reading each candidate's inputs and their difference from the decision's mean, trained with a listwise loss against v7's scores, held out by game. It reports the three numbers above, plus a split-half reading: v7's replies are noisy, so regret in v7's own scores counts the noise v7 chose on as edge. With every reply's score kept, v7 chooses on half the replies and every pick is scored on the other half, which no pick has seen.

## The pilot: v7's choices carry signal, a small student can't learn it

500 games of v7 at 8 replies among the default field, 5,644 decisions (11.3 a game), per-reply scores kept; held out by game, 1,232 test decisions.

- **v7 overrules v6 in 67% of decisions**, near the 75% a random pick of four would give.
- **The split-half reading says that isn't noise.** v7 choosing on 4 replies picks the plan the other 4 rate best in 45% of decisions, and scored on those fresh replies its pick's regret is 0.023 against v6's 0.036: a real edge of 0.013, seen on replies no pick was chosen by.
- **No student keeps it.** Scored the same way, the best student (32 hidden units) keeps 6% of that edge; a linear student and a larger one (64, 16) keep none or less than none. Agreement with v7 where v7 overrules v6 is 20 to 25%, about a random pick among the other candidates.

Two causes are left, and the pilot can't tell them apart: **too little data** (3,900 training decisions against 588 inputs a candidate) or **features that don't hold the answer** (what the replies find, the opponents' answers, may not show on the two boards v6 values a plan by; the linear student failing too leans this way). The full recording of about 100,000 decisions settles the first: if a student trained on it still keeps little, the second holds, and the next try is a student that sees what the replies see (the board after the opponents' likeliest answers), or distilling the replies' outcomes rather than v7's pick.

## The pilot, measured properly

The pilot's student numbers were one fit each with no interval, so they ranked nothing. The same 500 games, read again with every result an interval (test games resampled, 95%) and every student fitted with five seeds. `distill_analyze.py` reads the labels and baselines; `distill.py` gained `--seeds`, `--train-fraction`, `--features`, `--inputs`, `--target`, `--device` (the sweeps run on the GPU), `--results` and `--export`.

- **v7's labels are good enough to learn from.** The reliability of an 8-reply ranking is 0.65 (0.48 at 4 replies, 0.79 at 16, 0.88 at 32); one reply's noise is 4.3 times the true spread between candidates. Per decision it varies widely: a quarter of decisions are near-ties no budget separates. So training data is recorded at 8 replies, and a test set at 32.
- **The split-half yardstick is about 85% of the live v7.** Simulated against the decisions' true contrasts, a 4-reply picker has 64% of a perfect picker's edge over v6, the 8-reply v7 75%, a 32-reply one 90%.
- **Eliminations don't drive the picks.** 5.7% of reply ends are a win or an elimination, and v7's pick changes on standings alone in 5.7% of decisions.
- **No simple rule keeps any of v7's edge.** v6's highest value keeps 2% [−6%, 12%], the zero-ply leaf (success chance times the success board's share, plus the failure's) −11%, the highest success chance −44%, a random candidate −47%.
- **The full board overfits; v6's breakdown alone keeps some edge.** With all 1,176 inputs every student keeps between −18% and +4%, at every size, and its within-decision R² is at or below zero: it learns nothing about the ranking that holds on new games. On v6's 11 breakdown terms of each board with the success chance and value (48 inputs), students keep 8 to 15%, and a linear one fitted to the scores 18% [2%, 33%], the first interval clear of zero. Its within-decision R² is 0.07, against a ceiling of about 0.65.
- **More data helps the full board only weakly here.** From a quarter of the training games to all of them, the full-input students rise from about −15% to about 0%, inside their intervals.
- **No pruner.** v7's pick is in the student's top two of four 56 to 59% of the time (a random two: 50%), far below the 80% that would let a student halve v7's search.

By the rules fixed before the run: the breakdown student is the default until the full recording shows the board helps, and its within-decision signal (about 11% of the ceiling) is below the 30% that says the features hold the answer. The 8,000-game recording (and the 500-game test set at 32 replies) decides that at twenty times the data. Either way the next step is to play the best student against v6, since regret isn't Elo. That student is `student-v1` with its `pilot` weights (`student-v1.md`); a trainer's export becomes a weight set it can play with `npm run risk:student-weights`.

## A wider teacher, and the precise test set

- **The test set** is 500 games of v7 at 32 replies (6,148 decisions, `distill-v7-test32`). On it the reliability model fitted to the pilot holds out of sample: 0.65 at 8 replies, 0.88 at 32, the same noise-to-spread ratio (4.2). A 32-reply ranking is reliable in most decisions (median 0.73 per decision), so a student's pick can be scored on 16 replies against 16.
- **Searching 8 candidates instead of 4** (300 games, `distill-v7-wide8`; most decisions have 8 distinct placements). v7 picks one of candidates 5 to 8 in a third of them, so v6's top four isn't a tight filter. But on fresh replies the 8-candidate search gains only 10% [−4%, +26%] more over v6 than the 4-candidate search on the same decisions. Choosing among more candidates on 4 noisy replies also picks more noise, so this undersells a wide search with more replies, but it gives no reason yet to widen the teacher: its gain, if any, is small next to the student's distance from v7.

## Three times the data, scored on the precise test set

Every recording so far trained together (pilot halves and the wide teacher: 13,474 training decisions, 1,500 games), every student scored on the 32-reply test set (16 replies chosen on, 16 scored), five seeds each, at a third, two thirds and all of the training games. On this yardstick v7's edge is larger and less noisy than on the pilot's 4-and-4 halves, and the pilot's best student keeps 4% [−3%, 11%] of it, not the 18% the pilot's own halves showed.

| Student | 4,329 decisions | 9,095 | 13,474 |
|---|---|---|---|
| Breakdown, listwise, 32,8 | 5.0% | 8.7% | **9.1% [3%, 15%]** |
| Breakdown, listwise, 16 | 6.3% | 7.1% | 8.4% [2%, 14%] |
| Breakdown, regression, 16 | 5.0% | 6.7% | 7.7% [1%, 13%] |
| Full board, listwise, 32 | −4.9% | 3.1% | 5.8% [−1%, 12%] |
| Full board, listwise, 128,32 | −8.6% | 0.0% | 1.5% [−6%, 8%] |
| Full board, regression, all sizes | −7% to −13% | −10% to −17% | −7% to −9% |

- **The small students learn a little, slowly.** On v6's breakdown terms the best keeps 9% with an interval clear of zero, rising a few points per doubling of the data.
- **The full board is data-starved but learning fastest.** Ranked listwise it climbs from about −5% to +6% over a tripling, the steepest curve in the sweep; regressed on the scores it still overfits. Bigger full-board networks do worse at every size of data here.
- **No pruner.** v7's pick is in the student's top two 56 to 62% of the time.

All of it is far below the 30% bar. The 8,000-game recording is the test of whether the full board's curve keeps climbing.

## If it works

- **Measuring v7-class strength costs hours, not days.** The student's seating suite costs what v6's did.
- **v7 itself gets cheaper.** The student can rank candidates before the search (search only the top two it picks), or score the replies' ends, so a search on top of the student costs less and sees more.
- **The loop can repeat:** search on the student, distil that, search again. That's expert iteration, and it is how search bots usually get much stronger than their first hand-written evaluation.

## What it needs

- A recorder mode that plays games with v7 (and later the student) seated in a mixed field and keeps, at each v7 placement, the candidates' boards, success chances and v7's scores. It's a sibling of `risk:record`, on the same worker pool and Actions sharding.
- A features step and a trainer: v8's, with a ranking loss over candidate groups instead of a win label.
- The student bot: v6 plus a candidate ranker, registered like any version, with its own design doc and seating bar fixed before its runs. Built: `student-v1` (`student-v1.md`), its bar v7's, applied at v6's cost.

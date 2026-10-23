# Distilling v7: v7's judgement at v6's cost (an idea, not built)

This is a plan, not a bot. Nothing is built or measured; it says what would be built, why it should work where v8 didn't, and the cheap test that decides whether it's worth building.

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

## If it works

- **Measuring v7-class strength costs hours, not days.** The student's seating suite costs what v6's did.
- **v7 itself gets cheaper.** The student can rank candidates before the search (search only the top two it picks), or score the replies' ends, so a search on top of the student costs less and sees more.
- **The loop can repeat:** search on the student, distil that, search again. That's expert iteration, and it is how search bots usually get much stronger than their first hand-written evaluation.

## What it needs

- A recorder mode that plays games with v7 (and later the student) seated in a mixed field and keeps, at each v7 placement, the candidates' boards, success chances and v7's scores. It's a sibling of `risk:record`, on the same worker pool and Actions sharding.
- A features step and a trainer: v8's, with a ranking loss over candidate groups instead of a win label.
- The student bot: v6 plus a candidate ranker, registered like any version, with its own design doc and seating bar fixed before its runs.

# Test audit: the cuts still open

What this is: the part of the audit of every test against the "Tests are for moving fast" and "A slow test earns its time" principles that hasn't been done. Nothing here is decided: each item is a candidate, to be read and measured before it is cut. The high-confidence cuts are already in, so this list is what's left.

Selection (`scripts/affected-tests.mjs`) took most of the pain away: a typical change no longer runs most of these tests. These cuts now mainly help the runs that do select them, so they are worth doing when a run feels slow, not for their own sake.

## Before cutting anything

- **Most of these trade coverage for time.** The cuts already made removed tests that couldn't fail. These reduce real checking, so each needs a reason the lost cases can't matter.
- **The audit's reviews were wrong often enough to check each one.** Three high-confidence claims failed on reading: a seed list that was only a ceiling and cost nothing (`events-a`), a coarser scan that failed the test's own guard (Hearthwood's rivers), and a test said to re-prove frozen code that also catches an engine change altering a frozen bot (`frozen.test.ts`).
- **Size a cut by measurement.** Find what the test's guard needs, as Frogmino's random play was (1,000 steps miss its guard, 1,500 clear it). The savings below are the reviews' estimates, not measurements.

## Worth doing

| Test | Idea | Estimated saving |
|---|---|---|
| Risk `bots/frozen.test.ts` | Keep the fingerprints; ask bots again only when their import closure changed, or move that to the slow suite. It must keep catching a shared engine change that alters a frozen bot | 35–40s |
| Risk `sim.test.ts` | Each "halves" test replays a whole game; play each game once and check every step | 8–10s |
| Frogmino `vehicles/vehicles.test.ts` | About 340 side-by-side pairs repeat one path; one pair per vehicle against the widest partner. It is the only test combining inset, rumble and the scan, so keep that | 12s |

## Fine but small

Low risk, 1–4s each unless noted:

- Frogmino: `online.test.ts` one seed per link, `medals.test.ts` one replay, `rollback.test.ts` one seed, and `courses.test.ts` dropping the reachability repeats the slow test covers.
- Risk: `rule-v7` and `rule-v7.1` parity down to one game (about 8s), `net-v1/parity.test.ts` sampling decisions (about 8s), and sizing `gd/legal.slow` and `engine/fuzz.slow` by the seeds that reach their rare paths.
- Betrayal: `exploration.test.ts` two games instead of five (about 10s), `ghost.test.ts` two seeds (about 5s), and one or two rooms in the `house-build` and `wall-markings` freeze loops.
- Elsewhere: `bot-lab/elo.test.ts`'s ladder test to the slow suite, `map-camera` steps, the `people` wardrobe, and `stream.test.ts`'s jump count.

## Be careful

**Betrayal's e2e flows per input method.** Many flows run once each for keyboard, touch and controller, and Betrayal is the costliest part of e2e. Input wiring is a fair e2e target, though, and the review didn't confirm the unit tests assert the same things. Compare them first; moving feature checks down to unit tests is the likely shape.

**Rule violations to fix rather than cut:** the bounded retry loop in `betrayal-controls.spec.ts`, which presses a key until the state matches, and the `setTimeout` used to let promises land in Åland's `stream.test.ts`.

## Leave for now

Betrayal `engine/view.test.ts`: its seeds are each chosen for a stated reason, so cutting them saves little and risks more.

## The owner's call

- **Monopoly's `bots/rl/` tests:** kept while that prototype lives. If the learned bot is dropped they all go, except what `search-v3` needs from `rl/candidates.ts`.
- **Shipwright's `lighting` and `materials` tests:** these depend on whether the TypeScript version stays now the Godot rewrite exists.

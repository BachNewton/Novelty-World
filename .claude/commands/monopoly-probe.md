---
description: Red-team the current best Monopoly bot with a fleet of pro-level player agents — find exploits, measure repeatability, and report where the bots should go next
argument-hint: "[fleet as NxM agents x games-each — default 3x3] [version to probe — default: the lobby default] [optional focus]"
allowed-tools: Bash, Read, Write, Grep, Glob, Agent
---

Run a **probe fleet**: N player agents, each playing M full Monopoly games
against three bot opponents through the stepped-game CLI
(`bots/played-cli.ts`), every agent playing **to win at the highest
professional level — anything legal goes, including reading the bot code to
solve its thresholds exactly**. The fleet reports back; you (the main agent)
synthesize a direction report for the bot evolution loop. User input:
**$ARGUMENTS**

Why this exists: single probe games (1–9, "the 4q3y6i night" in
`bots/EVOLUTION.md`) were the archive's discovery engine — they produced the
decisive evidence for five shipped versions including a strict crown. The
fleet generalizes it: real-time adversarial play finds what abstract
rule-reasoning misses, white-box play measures the exploitability CEILING
(the bot code is public — a motivated human can read it too), and
multi-game-per-agent play measures **repeatability**, which no single game
can. Run every command from the repo root.

**Its automated complement is `npm run sim:probe-gate`** (`bots/adversary.ts`):
the recurring hand-played exploits — the wallet-pegged ask, the
complete-into-illiquidity auction bid, the distress fire-sale — are each a pure
decision on a hand-built board, so it scores them without playing a game and
turns "field a probe" into a **regression number**. Hand-play discovers new
surfaces; the gate keeps the fixed ones fixed. A candidate must not raise its
total leakage above its base's (see `bots/METHOD.md` crown gate).

## Cost — state it before launching

One game ≈ 150–500k subagent tokens, ~30–45 min. Agents run in parallel;
each agent's M games run sequentially. So `3x3` ≈ 9 games ≈ 2–4M tokens,
~2h wall-clock; `10x10` ≈ 100 games ≈ 15–50M tokens, ~6h. Default to **3x3**
unless the user sized the fleet themselves; if the requested fleet implies
>10M tokens and the user didn't give explicit numbers, confirm before
launching.

## Steps

1. **Load the state.** `bots/champion.ts` (crown/substrate), the newest
   "As of" status block in `bots/EVOLUTION.md` (the CLOSED-exploit list +
   standing leads), `bots/CLAUDE.md` (the strategic model + the
   human-counterparty section). Target version: the user's choice, else the
   **derived lobby default** (top of `bots/ratings.ts`, i.e. what real humans
   face — resolve it, don't guess).

2. **Assign each agent a distinct ATTACK LENS** — the fleet's value is
   coverage, not repetition. Draw from (and extend as the target's known
   surfaces suggest): trade extraction & counter-negotiation · auction
   warfare · liquidity siege (rent-pressure timing) · denial & blocking ·
   endgame heads-up play · jail/tempo economics · rail & utility networks ·
   **white-box threshold-solving** (read the policy, compute exact accept
   boundaries, play them) · **black-box naturalistic** (exactly one agent
   plays WITHOUT reading bot code, so behaviorally-discoverable findings stay
   separable from white-box-only ones). Every lens plays full-strength to
   win; a lens is a search direction, not a persona.

3. **Launch the fleet in parallel** (background agents). Each agent gets the
   prompt template below with: its lens, the CLOSED list, M, and its own
   file paths. Each game is created fresh:

       npx tsx src/projects/monopoly/bots/played-cli.ts new <scratchpad>/probe-<agent>-<game>.json probe-<agent>-<game> <version> --human

   **Always `--human`** — the bots carry human-gated behavior
   (`botStrategy === null`); without the flag the fleet measures the wrong
   bot. (A human-marked seat's `bot-note`s are engine no-ops; reasoning goes
   in the findings file.) Keep the game JSONs — they are analysis material
   and L1 training data.

4. **Synthesize when the fleet reports.** This is the point:
   - **Dedupe and rank findings across agents** by repeatability (how many
     independent agents/games hit it) × impact (did it decide games?) ×
     tag (**white-box** — needed code knowledge — vs **behavioral** — the
     black-box agent or ladder-probing found it; behavioral findings are the
     more urgent fixes, white-box findings bound the worst case).
   - **Compute the fleet scoreboard FIRST, and calibrate every finding against it**:
     wins/losses per agent and overall fleet win rate vs the target. **The
     four-player baseline is 25% — a fleet at or below that has NOT beaten the
     bot, however many exploits it lists.** The 2026-07-21 fleet went 2–7 (22.2%)
     against jane-v20 with two of three agents reading the source, while
     documenting a wallet X-ray at slope 1.00, completers at 0.43–2.2× book, and a
     77% discount from a $100 throw-in. Both things are true: the leaks are real
     and repeatable, and they **did not convert**. Lead the report with that
     tension — a page of exploits above a losing record is a fair-pricing and
     legibility finding, not a win-rate claim, and writing it up as the latter is
     the single easiest way for this command to mislead the next session — the
     tracked benchmark future versions get
     measured against (record it with the target version's label).
   - **Verify any suspected engine bug against the saved game JSON before it
     enters the record** — agents read events, not internals, and have been
     confidently wrong (probe 8's `estateCash` false alarm; the engine was
     right).
   - **Check every proposal against the record** — `bots/CLAUDE.md`
     "Considered and rejected", the EVOLUTION version log (fable-v9/v10 were
     REJECTED because their probe-motivated fixes broke load-bearing
     self-play behavior), and the standing invariant: human-facing pricing
     fixes live behind the human gate, never in the shared evaluator.

5. **Write the direction report.** Fleet scoreboard first, then the ranked
   findings (each with turn-stamped evidence, repeatability count, and a
   one-line policy lever framed in `positionValue`/constants terms), the
   CLOSED-list re-verification results, over-caution observations, and
   finally: **where the bots should go next** — 1–3 proposed version
   hypotheses, each with a red/green fixture idea. **This command is
   play-and-report** — building versions afterwards goes through the full loop
   in `bots/METHOD.md`: **discover** (this probe / `game:review` / the
   `game:offers` corpus) → **hypothesis** → **self-contained snapshot** →
   **red/green `policy.test`** → **screen** (`sim:versus`) → **gauntlet gate**
   (SPRT `BETTER`-vs-base on **both** seed streams + no panel regression) **plus
   the `sim:probe-gate` human-leakage check** (the candidate must not increase
   total leakage vs base) → **promote**, minding the two-bests separation
   (strongest/Elo-default vs SPRT-crown vs substrate — `champion.ts`). Expect
   probe-found surfaces to screen EVEN — or WORSE — in self-play (that
   invisibility is itself the finding) and expect the gate to reject some
   proposals — it arbitrates, the fleet only proposes.

## Distilled lessons (bake these into the agent prompts and your synthesis)

1. **Probe the current best** — each probe of a freshly-shipped version found
   the next version's evidence; probing old versions re-finds fixed defects.
2. **Ladders, not single offers** — boundary measurement is the capability
   real human games never give: same asset at 1.0×/1.5×/2×/2.5×/3× book,
   record every rung (this pinned the rail floor, the wallet-drain boundary,
   and the $75 human margin).
3. **Carry the CLOSED list** — every game re-verifies prior fixes in live
   play and free-hunts beyond them.
4. **Over-caution is a defect class of its own** — stacked guards can
   compound into passivity (hoarding, undeveloped monopolies, refusing all
   commerce); "none observed" is a finding.
5. **Repeatability beats anecdote** — an agent must re-attempt its game-1
   exploits in games 2..M and report the hit rate; a 3/3 exploit outranks
   any single-game story.
6. **Mechanics:** repo root; `pass` at pre-roll rolls (jail-decision: rolls
   for doubles); a REJECTED intent does not advance — read the reason,
   retry; trades are arm (`set-queue`) → `update-trade-draft` →
   `propose-trade` with `cashDelta` netting to zero; batch trivial pauses,
   spend reasoning on trades/auctions/development; if a pause repeats
   unfixably, record it and stop that game.
7. **A probe-found "defect" is often LOAD-BEARING — screen honestly, expect
   washes.** Not every ugly behavior is a bug: the churn a probe flags may be
   doing real work in self-play. fable-v13's build-tail change screened at
   **−20 Elo** — the "defect" wasn't one. Screen every proposed fix on
   `sim:versus` before believing it, and report the wash as the finding when it
   comes.
8. **Human-facing fixes are INVISIBLE to self-play.** A change gated on a human
   seat (`botStrategy === null`) is provably identical to its base in every
   all-bot game, so the shared evaluator and SPRT can't see it. Route such fixes
   through the **human gate** (a live `played-cli --human` probe) and
   **`sim:probe-gate`**, never through the shared evaluator (two attempts to fix
   human-facing behavior there — fable-v9/v10 — were REJECTED for breaking
   load-bearing self-play behavior).
9. **The biggest surface against the lobby default is the human-model gap.** The
   bot's counterparty model is its own evaluator — near-perfect against bots,
   an order of magnitude miscalibrated against humans (the `game:offers` corpus:
   97.9% bot→bot vs 10.6% bot→human conversion). Probe THAT gap first; it's where
   a real human wins.

## Player-agent prompt template

> You are agent <k> of a probe fleet red-teaming <version>, the current best
> Monopoly bot. You will play <M> full games (files listed below), one after
> another, EACH to win at the highest professional level — anything legal
> goes. Your assigned attack lens: <lens>. <If white-box: you may read the
> bot's policy code under src/projects/monopoly/bots/versions/<version>/ and
> compute its exact thresholds; exploit them explicitly.> <If black-box lens:
> do NOT read any bot policy source; discover behavior from play only.>
> Re-verify the CLOSED exploit list each game: <list>. Run price LADDERS on
> completers/rails/blockers and record every rung. Carry your exploit
> notebook between games and RE-ATTEMPT each exploit — report per-exploit hit
> rates across your games. Watch for over-caution as its own defect class.
> Commands (from repo root): show / act '<intent JSON>' / pass on the game
> file. Append findings as you play to <findings file>: per-game outcome,
> offer log with exact terms, ladder results, exploit notebook with hit
> rates, each finding tagged WHITE-BOX or BEHAVIORAL with a one-line policy
> implication. Final reply: compact summary — W/L record, top 3 exploits
> with hit rates, over-caution verdict. Play each game to completion
> (game-over or ~turn 250). Do not modify any repo source files.

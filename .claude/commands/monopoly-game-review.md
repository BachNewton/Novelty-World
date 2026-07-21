---
description: Review a real (human + bot) Monopoly game from the DB and extract lessons to make the bots better
argument-hint: <how to find the game — player names, date, "latest", or a game id>
allowed-tools: Bash, Read, Grep, Glob
---

Review a **real** Monopoly game (humans + bots) pulled live from the Supabase row,
and turn it into actionable lessons for the bot policies. The user described the
game to find as: **$ARGUMENTS**

The compiling is a script; the **analysis is yours**. Run every command from the
repo root.

## Steps

1. **Find the game.** List every stored game and match it against the description
   ($ARGUMENTS — player names, status, recency, or a literal game id):

       npm run game:review -- --list

   Each row shows the id, status, last-touched time, and the full roster with each
   seat tagged `(human)` or `[bot: <strategy>]`. Pick the one that fits. If the
   description is ambiguous (several plausible matches), ask the user which id
   before going further. If it names a specific id, skip straight to step 2.

2. **Compile the game.** Render the full play-by-play, standings, holdings, and
   money-flow tally:

       npm run game:review -- <id>

   Add `--quiet` for a decisions-only view (drops the dice/rent noise — the same
   filter `npm run sim --log` uses) when the full stream is too long to reason over.
   Read **both** if it helps: the money-flow footer (rent paid/received, builds,
   buys per seat) usually pinpoints where the game turned faster than the log does.

3. **Mind the version caveat — this is critical.** A seat's `[bot: <strategy>]`
   label is whatever it was *when the game was played*. Legacy pointers like
   `claude` / `jane-latest` predate the `claude-vN` / `jane-vN` namespacing and are
   **not** the current code — they may be several versions behind `HEAD`. Before
   blaming (or crediting) a behavior, check whether the current archive
   (`bots/versions/index.ts`, the top of the Elo ladder in `bots/ratings.ts`) still
   does it. State plainly in your write-up which bot version actually played and how
   far it is from current.

4. **Analyze for bot improvement.** This is the point. Ground every claim in the
   actual log, and frame fixes in the policy's own terms:
   - Read `src/projects/monopoly/bots/CLAUDE.md` (the strategic model: `positionValue`,
     the tuning constants, per-phase policy, trades) before proposing changes, so a
     suggestion lands as a constant/heuristic change, not a vague wish. Check the
     **"Considered and rejected"** and **"Refinement targets"** sections — your idea
     may already be tried (and washed) or explicitly declined, which is itself worth
     reporting.
   - Look for: monopolies left under-developed (the 3-house breakpoint), capital
     diffused across non-completing singles, over-leverage that forced selling an
     income engine, trades that handed a rival a set / a railroad, bad
     liquidation order, jail/auction misjudgments. The money-flow tally makes most
     of these jump out (e.g. a seat with `builds 0` never completed a set).
   - Separate **bot mistakes** (fixable in policy) from **variance** (dice). One
     game is n=1 — say so.

5. **Report.** Lead with the outcome (who won, finish order, humans-vs-bots), then
   the 2–4 highest-leverage lessons, each tied to a concrete spot in the log and a
   concrete policy lever. End with a recommendation: which lesson (if any) is worth
   pursuing as a `claude-vN+1` evolution. A game review is the **discover** step of
   the loop (`bots/docs/METHOD.md`); a real refinement then runs hypothesis →
   self-contained snapshot → red/green `policy.test` → screen (`sim:versus`) →
   gauntlet gate (SPRT `BETTER`-vs-base on **both** streams + no panel regression)
   **plus the `sim:probe-gate` human-leakage check** → promote — never a hunch. **Two
   caveats that bite here specifically:** (a) this is a REAL game with humans, so the
   lesson is often a **human-facing** one — such fixes are gated on
   `botStrategy === null`, are **invisible to self-play/SPRT**, and must be validated
   through the human gate (`played-cli --human`) + `sim:probe-gate`, **never** the
   shared evaluator (see `bots/CLAUDE.md` "The human-counterparty model"); (b) an ugly
   bot behavior may be **load-bearing** in self-play and screen EVEN/WORSE when
   "fixed" — flag it, don't assume it's a bug. **Do not edit any bot code from this
   command** — it is read-and-analyze only; propose, don't implement.

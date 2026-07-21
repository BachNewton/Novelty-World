# METHOD — how a bot version is proposed, measured, and promoted

The **rules of the evolution loop**: how a candidate becomes a version, what bar
it must clear, and which of the three "bests" it earns. This is the normative
half — read it cold at the start of a session and follow it.

It is deliberately **separate from the record**. `EVOLUTION.md` is the
append-only log of what was actually tried and what it measured; this file is the
method that log was produced by. They were one document until 2026-07-17 and it
made both worse: a session had to read ~236KB of history to find the ~40KB of
rules it had to obey, and the rules were interleaved with the experiments that
justified them. Different lifecycles, different files —

| | this file (`METHOD.md`) | `EVOLUTION.md` | `champion.ts` |
|---|---|---|---|
| Holds | the rules | what was tried + what it measured | crown / substrate |
| Changes | rarely, and deliberately | append-only — rows are never edited | every version bump |
| You | read it, then obey it | search it before re-walking an idea | read the constant |

Read `bots/CLAUDE.md` first for the bot's charter and current strategy — that's
*what the bot is*. This file is *how we make it better*.

**A rule here is a scar, not a preference.** Nearly every line below is the
residue of a specific experiment that went wrong in a specific way, and the
experiment is in `EVOLUTION.md` under the version that ran it. When a rule looks
arbitrary, go read what it cost — then change it if you can beat the measurement.

## The core idea

A genetic algorithm, but the mutation operator is **Claude Code reasoning**, not
random perturbation. Claude studies how a game played out, forms a hypothesis
about why the winner won, and proposes a *targeted, structural* change to the
logic (not just a weight nudge). Nothing is off-limits as long as the result is
**game-legal** — the bot only ever emits `Intent`s the engine validates, so it
is structurally incapable of cheating.

Why this can beat a vanilla GA: random mutation famously stalls in **local
maxima**. Claude can deliberately accept a *short-term regression* to explore
toward a better global maximum, because it reasons about the shape of the
strategy space instead of hill-climbing blindly.

The discipline that keeps this honest: **exploration is driven by reasoning, but
selection is driven by measurement.** A hypothesis only becomes a locked-in
version when the simulator says so with statistical confidence — never because
the narrative was convincing.

**Change granularity:** prefer the *smallest coherent change* per version, so the
A/B attributes the result to one idea. But "smallest coherent" isn't always
"single line" — some improvements are synergistic (two mechanisms that are only
net-positive together; each regresses alone). When a hypothesis genuinely requires
coupled changes, that's one version — just **state the hypothesis explicitly** so
the test grades a claim, not a guess, and **bisect** the coupling if it later
regresses.

## The loop

### Near-term (manual, human-in-the-loop)

1. Claude refines the bot's logic toward a specific hypothesis.
2. Run `npm run sim` (the headless self-play harness — `simulate.ts` /
   `simulate-cli.ts`) to watch behavior and check the change does what was
   intended — including that the BOT reasoning notes (`--log`) still accurately
   describe the new behavior, not the old.
3. Review together; keep the change if it's clearly better, revert if not.
4. Repeat until the bot feels strong.

**First target:** better trading, including **N-way trades** (roadmap #1 in
`bots/CLAUDE.md`). See "Prerequisite" below — this is also what unblocks the
tournament.

### The session handoff (one session = one version: vN → vN+1)

The loop runs **one Claude Code session per version step**. A session's job is to
produce a `v(N+1)` that **beats `vN`, proven by measurement** — not by a
convincing story. The session structure that keeps this honest and resumable:

1. **Pick up cold from the repo, not from a pasted blob.** A new session reads
   this doc, the **version log** below, and `bots/CLAUDE.md`, then *watches games*
   (`npm run sim --log`, `npm run sim:versus -- vN v(N-1)`) to see how the current
   champion actually plays. The durable state lives in the repo; the handoff
   prompt is a **pointer into it, never a payload** (a fat blob goes stale against
   the code — a pointer can't).
2. **The incoming hypothesis is a lead, not an order.** The *previous* session,
   having watched real games, carries forward **one** suggested hypothesis **with
   its evidence** (e.g. "cap rate still ~17%, concentrated on boards where nobody
   is exactly one lot short → N-way trades"), so the new session can *judge* it.
   The new session may run with that lead **or override it** with a better idea it
   sees in the sim — but if it overrides, it **records why in a sentence**, so the
   dropped lead isn't silently lost (it may still be worth a later version).
3. **One coherent change per version** (the locked granularity rule above), stated
   as an explicit hypothesis so the A/B grades a claim.
4. **Acceptance is measurement.** `v(N+1)` becomes the new **loop champion** only
   if `sim:versus v(N+1) vN` clears the bar on **fresh held-out seeds** (and,
   eventually, the gauntlet/SPRT in "Measurement"). A hypothesis that **fails to
   beat `vN` is a result, not a waste**: log it as **rejected** in the version log
   (a negative result others shouldn't re-walk) and carry a *different* lead
   forward. Never ratchet in a regression because the narrative was good. Two
   distinct outcomes, never collapsed (see "Two bests"): running `npm run
   sim:ratings` re-ranks the Elo ladder and may make `v(N+1)` the lobby's
   **Strongest/default** automatically (ungated) — but it becomes the **crown** (and
   the **default substrate** the next version branches from) **only on a confident
   SPRT win** (gauntlet `BETTER` on both streams). A ladder-topper that's only EVEN
   under SPRT is recorded and may be the player default, yet is **not** crowned and
   **not** the default substrate.
5. **End by handing off via the clipboard.** The session closes by writing a
   short **handoff prompt** for the next one — "continue the loop, build
   `v(N+1)` from `vN`, suggested hypothesis = … because …" — **straight onto the
   clipboard** with `Set-Clipboard` (Windows), and also printing it. The human
   just opens a fresh session and pastes — no copy step, one less thing to keep
   the loop turning. (If the clipboard isn't writable, the printed block is the
   fallback copy source.)

This is the genetic loop with Claude as the mutation operator: **reasoning
proposes, measurement selects.** Bumping the loop champion needs **no human
greenlight** — see "Coexistence & promotion" for the separate, rare decision to
ship a chosen version to the live game bot.

### Long-term (automated A/B tournament)

Pit two logic versions against each other at scale:

- **4 bots per game: 2 on v1, 2 on the candidate v2.**
- **Randomized seats and seeds** every game, so seat order and dice luck can't
  hand either version an unfair edge.
- Run **enough games for statistical significance** (see "Measurement").
- Parallelize across **worker processes** — games are pure CPU and embarrassingly
  parallel — so a run finishes as fast as the machine allows.
- If v2 is genuinely better, **lock it in** as the new champion; then start the
  next cycle (v3 vs v2).

Keep a **versioned archive** of every bot. That lets us branch from any past
version, track progress over time, and — eventually — expose chosen versions to
human players as **difficulty levels**.

## Prerequisite: games must be decisive

The harness already surfaced the blocker: **four symmetric Claude bots never
terminate.** They buy out the board, then never trade or build (a no-trade
deadlock — see "Why the deadlock" below), so no monopolies form, no rent
escalates, and nobody goes bankrupt. A tournament can't measure a win rate if
games don't end.

So two things must hold before the automated loop is meaningful:

1. The bot must reliably *break the deadlock* — assemble monopolies and develop
   (the trading work).
2. Games should **end in a bankruptcy**, not time out — the turn cap is a safety
   net, and hitting it is a tracked failure, not a win. See "Winning is
   bankruptcy" below.

### Why the deadlock (for whoever fixes it)

Once the board is owned, `proposeBestTrade` (`trades.ts`) can't construct an
agreeable deal in 3+-handed play:

- it only considers a color where the proposer is *exactly one lot short*;
- its counterparty model correctly predicts the seller will **veto** any deal
  that hands a rival a monopoly while giving the seller none
  (`rivalMono > myMono · RIVAL_TOLERANCE`, with `myMono = 0`);
- clean *mutual-completion* 2-way swaps — the one shape that survives that veto —
  almost never exist across three opponents.

Heads-up (2 players) the mutual-completion shape is common enough that games
resolve cleanly, which is why 2-Claude and Claude-vs-dumb already produce
winners. The fix lives in trade construction: N-way deals, and/or pricing the
rival-monopoly threat (a big enough cash premium) instead of vetoing it.

### Winning is bankruptcy — the turn cap is only a timeout

A win means **bankrupting opponents until one player is left.** That is the only
outcome that counts as a win. We deliberately do **not** declare a winner by net
worth when a game runs long, even though official tournaments do (they cap at ~90
minutes and award the richest player). The tournament rule is wrong for *us*:

- **It would reward exactly the behavior we're trying to kill.** The trade deadlock
  that kicked off this whole initiative — bots buying out the board and sitting on
  cash — *is* a net-worth-at-the-clock strategy. If a net-worth tiebreak counted as
  a win, evolution would keep the deadlock and we'd never have pressure to fix
  trading. The metric would launder the bug into a "win".
- **Bankrupting is also what beats humans.** A bot that knows how to eliminate
  opponents crushes them; one that only stalls to a clock doesn't. The net-worth
  rule is a logistics concession to the fact that humans tire — not a statement of
  skill. Our bot should embody the skill.

So the **turn cap is a safety timeout, not a finish line.** A game that reaches it
is a **draw / no-result** — nobody wins. The cap rate is a **health metric**: a high
one means the bot is too passive (the deadlock signal), a problem to fix, not a way
to score. (If we ever expose a *timed* mode to human players, net-worth play becomes
an explicit, optional behavior for that mode — separate from the training
objective.)

## Measurement — making "v2 is better" trustworthy

This is a solved problem in a neighboring field: **computer-chess engine testing**
(e.g. Stockfish's "fishtest"), and we borrow it wholesale. Each version carries an
**Elo rating** earned against a **gauntlet** — the field of past champions, with
**v1 as the floor** — not just its immediate predecessor, which is what makes the
rating robust to non-transitivity. (**Never gauntlet against `dumb`:** it is a
null/reactive stub, not a strategy — it initiates nothing, so "beating dumb"
measures nothing about strategic strength. v1 is the real floor of the field.) To decide whether a candidate is actually
stronger, use a **sequential test (SPRT)**: keep playing until the evidence
crosses an accept-or-reject boundary at controlled error rates, instead of fixing
a game count up front. SPRT answers "how many games?" on its own — strong changes
resolve fast, marginal ones play longer or get rejected.

On top of that, the guardrails:

- **Define the metric precisely.** With 2 v2 seats out of 4, the null hypothesis
  is a **50% win share** for "any v2 seat wins". Test the observed share against
  50% with a binomial/proportion test; report the confidence interval, not just
  the point estimate.
- **Capped games are draws, and a high draw rate is a red flag** — not a neutral
  outcome. Until the bot reliably *closes out* games by bankruptcy, A/B results
  stay inconclusive — which is the methodology correctly refusing to crown a
  version that can't win decisively.
- **Hold out a validation seed set.** Tweak and explore on a training pool of
  seeds, but confirm an improvement on **fresh, unseen seeds** before locking it
  in — otherwise we overfit to the specific games we looked at.
- **Beware multiple comparisons.** Try enough tweaks and one will look good by
  chance. Require a real margin, and re-validate winners.
- **Evaluate against a field, not just the predecessor.** Strategy strength is
  **non-transitive** (v3 can beat v2, v2 beat v1, yet v3 lose to v1). Score a
  candidate against a *gauntlet* of past champions, **floored at v1** (not `dumb`,
  which is a null bot and measures nothing), so "champion" means generally strong,
  not just "exploits the last guy".
- **Mind the sample geometry.** Deterministic bots mean a given (seed, seating)
  is one fixed game; with 2+2 identical seats there are only 6 distinct seatings
  per seed, so variety comes mostly from **many seeds**.

### What's built (Session A, 2026-06-20)

The ruler above is now real, not a plan. The pieces, all under `bots/`:

- **`parallel.ts` / `worker.ts` — CPU parallelism via `worker_threads`.** A pool
  of `cpus−2` workers (14 on the 16-core box) runs the pure `simulateGame` and
  hands back compact outcomes; the main thread owns the game stream and the
  SPRT/Elo aggregation. **Verified bit-identical to single-threaded** play
  (`npm run sim:verify -- v3 v1` → 60/60 games match), so the fast path changes
  nothing about *which* games are played, only how fast. Games are chunked
  work-stealing across workers so a straggler (a capped game runs the full turn
  cap) doesn't idle the pool.
- **`sprt.ts` — SPRT in Elo terms.** **Crucial correction made here:** a single
  *symmetric* SPRT `[−E, +E]` is the WRONG tool — its boundary sits at ±E/2 net
  wins, so a true coin flip crosses one side by luck and it would "accept" a
  win-neutral change ~half the time (it did exactly this in a first cut, calling
  the v3≈v2 tie "BETTER"). The shipped test is the canonical **fishtest pair of
  one-sided tests** over the same stream, both `H0: Δ=0`: an *improvement* test
  vs `H1:Δ=+E` (accept-H1 ⇒ **better**) and a *regression* test vs `H1:Δ=−E`
  (accept-H1 ⇒ **worse**). A genuine tie pushes both toward their H0 → a
  confident **even**; running out of games at the cap → **inconclusive**. This is
  conservative by construction: a change is promoted only on a *confident*
  improvement, and a win-neutral one is rejected with probability ≥ 1−α. The walk
  stops at the first crossing in the deterministic stream, so the verdict is
  **batch-size / pool-size independent** (unit-tested).
- **`elo.ts` — Elo across the field.** Bradley–Terry MLE by the parameter-free
  Zermelo/MM iteration, anchored so **v1 = 0**; "champion" = highest Elo, robust
  to non-transitivity (unit-tested, incl. a non-transitive case the head-to-head
  would miss).
- **`gauntlet.ts` / `gauntlet-cli.ts` — the gauntlet.** A candidate plays the
  whole **field** (`npm run sim:gauntlet -- <cand> [--field …] [--base …]`); each
  candidate pairing is an SPRT, field-internal pairings are fixed-N just to anchor
  the Elo fit. Accept iff **improves vs base AND regresses against none**. **Floor
  is v1; `dumb` is hard-rejected from any field.**

**Validated by reproducing the known results** (all under the shipped dual test):

| Check | Result | Recorded | ✓ |
|---|---|---|---|
| parallel == single (`sim:verify v3 v1`, 60) | 60/60 bit-identical | — | ✓ |
| v2 vs v1 (`gauntlet v2 --field v1`) | **BETTER** 67.9% (106–50), accepted | ~69.8% | ✓ |
| v3 vs v2 (`gauntlet v3 --base v2`) | **INCONCLUSIVE** 50.1% (752–748/1500) → **REJECT** | win-neutral | ✓ |
| v3 vs v1 (same run) | **BETTER** 72.7% (88–33) | ~70.2% | ✓ |

Elo from the v3 run: **v3 +161.7, v2 +160.2, v1 0** — v3≈v2 (within noise), both
~160 above v1. The full v3 gauntlet took **~2.8 min on 14 workers**; the
v3-vs-v2 pairing (1500 decisive) ran almost cap-free (**5 draws / 1500, 0.3%**),
while v3-vs-v1 capped ~22% — see the draw decision below.

## Two bests: strongest vs crown vs substrate

There are **two audiences** asking two different questions, and conflating them is
the single biggest trap in this whole model. Keep them apart:

| | **Strongest / default** | **Champion / crown** | **Substrate** |
|---|---|---|---|
| Audience | the player clicking Play | us (the authoring loop) | us (the authoring loop) |
| Question | "which bot challenges me most?" | "which gain is REAL?" | "what do we evolve FROM next?" |
| Metric | **Elo rank** (best estimate) | **SPRT-confirmed** improvement | **judgment** — champion is the default prior |
| Gate | none — follows the ladder | confidence (both seed streams) | none hard — survey ALL families; default to the champion, free to branch elsewhere or start fresh |
| Lives in | the lobby UI (`roles.ts`) | EVOLUTION.md + dev tooling | EVOLUTION.md + dev tooling |

**Three INDEPENDENT decisions per version** — don't collapse them:

1. **Record** — archive the snapshot? **Legal ⇒ always** (it's cheap, and the
   archive is the source of truth). Registering it in `versions/index.ts` also makes
   it appear in the lobby and earn an Elo on the next `sim:ratings`.
2. **Crown** — is it the *measured best*? **Elo proposes, SPRT confirms.** A
   point-estimate lead inside the noise is not a crown. The candidate must be a
   confident SPRT win (`BETTER` on **both** seed streams) over its base **AND regress
   against no member of the anchor-panel field** (`npm run sim:gauntlet -- <v> --base
   <champion> --panel`). The no-regression half is **load-bearing**: beating the
   *current champion alone is not enough*, because strength is non-transitive — a bot
   can COUNTER the champion while losing to the rest of the field, so "beat the last
   guy" would just rotate the crown around a cycle (see "Non-transitivity & the
   crown"). The panel field is what stops such a counter from stealing the crown.
   **Plus a human-facing non-regression: `npm run sim:probe-gate`.** SPRT and the
   panel gauntlet only measure ALL-BOT games, so they are **structurally blind to
   human-facing changes** — a fix gated on `botStrategy === null` is provably
   identical to its base in every self-play game (that's why the human-model versions
   validate by live probe, not SPRT). The `probe-gate` scoreboard (`adversary.ts`)
   scores a version's exploitability by a human across the recurring probe scenarios
   (wallet X-ray, complete-into-illiquidity, distress fire-sale, set-handover); a
   candidate **must not raise its total leakage above its base's**. It's the automated
   regression complement to the hand-played `/monopoly-probe` fleet — cheap to run, and
   it catches the human-facing surface the shared evaluator can't see.

   **KNOWN WEAKNESS — read before trusting a probe-gate PASS.** The check is
   **relative to the base**, so it only preserves whatever the base happened to have.
   When the base is itself weak on an axis, the bar has already decayed and a PASS
   means nothing. This bit for real on 2026-07-21: jane-v20 was gated against crown
   `fable-v7`, scored an identical $530, and PASSED — while the archive's best was
   $130, because fable-v7 predates the human model. **A guard defined against a moving
   reference eventually measures nothing.** Until the gate is reworked to an ABSOLUTE
   ratchet (vs best-ever archive leakage, a standing lead in EVOLUTION.md), always run
   `probe-gate` with the archive's *best* version alongside the base — it accepts
   several labels — and read the spread, not just the delta.

   **And a PASS is only as wide as the scenario list.** Across five versions, two of
   the three original scenarios returned byte-identical scores — only `wallet-xray`
   discriminated. A near-empty instrument reads exactly like a clean bill of health.
   Widening `adversary.ts` from probe-fleet findings is ongoing work, not a finished
   job; the `set-handover` scenario added 2026-07-21 does **not** yet discriminate
   (see EVOLUTION.md).
3. **Substrate** — what do we EVOLVE the next bot FROM? **A judgment, not a rule.**
   Survey ALL versions across ALL families and pick the base you can most improve —
   usually the current champion, so that's the default prior, but nothing confines
   it. Lineages are just *provenance* (the machine a version was discovered on), and
   **borrowing/stealing across them is free** — winning is the only loyalty, and that
   applies to the code as much as to in-game play. If a line of attack stalls (a run
   of EVEN/rejected results = a local maximum), backing out to a different base — or
   starting from scratch for fresh ideas — is the smart move. The one guard: *default*
   to the confirmed champion, never an automatic jump to a within-noise ladder-topper
   (see the ratchet, below); deviating is fine when it's a deliberate call.

   **The substrate carries CODE, not just strength — so it can DELETE progress.**
   The next version inherits the substrate's whole codebase, including everything the
   crown gate never measured. So promoting on the well-measured all-bot axis can
   silently orphan unmeasured work out of the line of descent. Concretely, 2026-07-21:
   jane-v20 took the crown outright but forked from `fable-v8`, *before* the
   human-counterparty model — handing it the substrate would have dropped the entire
   fable-v11/v12 human effort from every future version, with nothing in the loop
   flagging it. The crown advanced; the substrate was deliberately held at fable-v12
   and the resolution recorded as a MERGE. **When a crown arrives from a lineage that
   forked before a body of work, check what its codebase is missing before you hand it
   the substrate** — and prefer merging the disjoint deltas over choosing a side.

### Why substrate (and crown) are SPRT-gated: the complexity ratchet

New bots branch FROM a prior bot. If the acceptance bar were "Elo not worse" (or a
merely-higher point estimate), every change that doesn't visibly hurt would get to
stay — **including a whole subsystem added for a within-noise wobble.** Over a
lineage this compounds: each generation inherits the last's complexity plus its
own, drifting toward a baroque bot barely better than a far simpler ancestor
(classic evolutionary **bloat / neutral drift**). The fix is to treat added
complexity as a **cost the gain must outweigh**: the *default* base is the
SPRT-confirmed champion, never the nominal ladder-topper, so you never *silently*
build on a within-noise gain. Choosing a different base is fine when it's a
*deliberate* call (a building block to cash in, escaping a local maximum) — what the
guard forbids is noise auto-promoting itself into the build line, not a considered
branch elsewhere.

**But flat-but-more-complex is still worth keeping as an ARCHIVED building block** —
scaffolding a *future* lever can exploit (claude-v3's N-way trades, claude-v4's
mortgage-tempo, jane-v4's trade-memory). The discipline: **park it in the archive,
don't ratchet it into the substrate** until a later lever cashes it in.
"**Recorded but not substrate**" is a real, valid, common state.

### Elo vs SPRT — same currency, different jobs

- **Bradley–Terry Elo** (the round-robin in `ratings.ts`) is the **effect size**: a
  magnitude, one scalar per bot, fit across the whole field (handles
  non-transitivity). It estimates "how good is each bot" but a point estimate alone
  can't say "is this gap real."
- **SPRT** (the gauntlet) is the **decision/significance test**: a `BETTER`/`EVEN`/
  `WORSE` verdict about a *specific Elo gap* (its hypotheses are written in Elo, e.g.
  H0 = −20, H1 = +20), with controlled false-accept/reject rates, spending games
  adaptively. It answers "is A confidently better than B" cheaply.

You want both: an effect size with no significance is "might be noise"; a verdict
with no magnitude is "real, but how much?" Don't try to buy confidence by cranking
ratings games — Elo SE shrinks only ~as 1/√N (≈17 Elo at 400 games/pairing), so
trusting a ~+14 Elo gap would cost ~6–8× the rating compute *every* regeneration.
SPRT with tight bands is the right tool for the crown/substrate question.

### Non-transitivity & the crown — the jane-v3 RPS cycle (2026-06-22)

`jane-v3` (PR #7) exposed a hole in the old crown rule and is why the gate now tests
against a **field**, not just the predecessor. It's a two-constant fork of `jane-v2`
(`DENY_FACTOR 0.3 → 0.0625`, `SURVIVAL_FACTOR 1.5 → 2.0`) — the "sweep DENY lower"
lead on `claude-v36`. Re-measured on current `main`, the top of the archive turned
out to be a **rock-paper-scissors cycle** (round-robin head-to-head, 400 games each):

> **jane-v3 beats claude-v36 (55.8%) beats jane-v2 (57.8%) beats jane-v3 (54.4%)**

The trap: the old crown gate ran `--field <champion>` (the *single* current champion).
By that rule jane-v3 is `BETTER` vs claude-v36 on **both** streams (train 54.2% / +29.2
Elo, holdout 59.3% / +65.2 Elo, no regressions in a one-bot field) → it would have been
**wrongly crowned**. But it's not the measured best — it's a *counter* to claude-v36 that
loses to jane-v2/jane-v4, sitting at **rank 4** on the Elo ladder (which fits across the
whole field and so already prices the cycle correctly). Crowning it would just rotate the
crown around the loop.

**The fix: crown against the anchor-panel FIELD (`sim:gauntlet --panel`), reject on any
regression.** Run against the panel, jane-v3 is `BETTER` vs claude-v2/v5/v17/v35 and the
base claude-v36 but **WORSE vs jane-v2** (train 39.9%, holdout 39.7%) → **REJECT on both
streams**; the panel's own champion is jane-v2, not jane-v3. The no-regression half of
`accepted = improvesVsBase && regressions.length === 0` is exactly the cycle guard — a
counter can clear the base but never clears the whole field.

Two lasting lessons: (1) **the denial knob has no global optimum** — below claude-v36's
0.15 it stops being a gradient and becomes matchup-dependent, so more win share must come
from a *different axis* or from a **mixed / opponent-adaptive** denial (the game-theoretic
answer to a cycle: a pure strategy is always counterable, a mixed one isn't) — or, a cheaper
sibling nobody has run, a **position-adaptive** denial that conditions on how the game is
going rather than on who you face (see EVOLUTION's "PR #9 / #10 closed unmeasured"); (2) **the
player-facing ladder was right all along** — Bradley–Terry handles non-transitivity, so
"rank 4" was the honest read; only the crown *rule* needed the field.

### trade-v1 (PR #8) — recorded, not crowned; the first paradigm-named lineage (2026-06-22)

`trade-v1` ("asymmetric valuation trade engine") forks jane-v3's non-trade logic and
replaces only the trade decision points with an **eval-based opponent-modeling** engine:
an `OpponentModel` (`opponent-model.ts`) calibrated from trade accept/reject history
(`calibration.ts`), feeding five exploit angles (buy-side completion, min-payment fix,
mutual swaps, denial buys, sell-side surplus) that all target the same gap — jane-v3
charges only 6.25% of the monopoly bonus as the threat cost of completing a rival's set,
so trade-v1 tries to extract that surplus. **The PR self-reported ~66–78% (4 SPRT passes)
vs a stale jane-v3.** Re-measured on current `main`, that evaporated: trade-v1 is the
**single weakest version in the 40-bot archive at −33.5 Elo**, *below the anchor floor
claude-v2 (0.0)*, and the `--panel` crown gauntlet **REJECTs on both streams** — WORSE
than base claude-v36 (train 39.0% / holdout 37.3%) and regressing against **every** panel
member (jane-v2 24–30%, claude-v35 27–29%). Forking jane-v3 (+108 Elo) and rewriting its
trades cost ~**140 Elo**: the asymmetric-extraction engine, as built, loses far more than
it gains against the real field — the classic head-to-head-vs-one-stale-opponent trap, and
here it doesn't even win that exchange now.

**Verdict:** legal (pure + self-contained), so **recorded** in the archive and rated; it is
neither the Strongest (dead last) nor crowned. **Building block to keep:** the
**opponent-modeling calibration** (reconstruct per-player accept thresholds from trade
history) is the genuinely novel piece and is exactly the *opponent-adaptive* direction the
jane-v3 cycle points to — archived, available to borrow into a stronger base later; the
trade engine wrapped around it here is not.

**Lineage note:** trade-v1 is the first **paradigm-named** family — `trade-v` namespaces the
*system it explores* (asymmetric-valuation trading), not its authoring machine (it was
written on Jane). See "Bot lineages" above: a prefix can carve a family by provenance *or*
by paradigm.

## Coexistence & promotion

A seat fields a **concrete version label** (`Player.botStrategy`), resolved by
`registry.ts` `botFor` straight through `VERSIONS`. There is **no** curated
production pointer any more — no `live.ts`, no `LIVE_VERSION`, no
`CHAMPION_VERSION`. So:

- experimental versions **run side-by-side** in one process — they're all just
  entries in `VERSIONS`, fielded by label by the tournament and the lobby alike;
- **the player default is automatic and ungated.** Register a version + run
  `npm run sim:ratings`; the regenerated Elo ladder (`bots/ratings.ts`) re-ranks
  the field, and whoever tops it becomes the lobby's **Strongest/default**. No code
  copy, no pointer to bump, no test churn (each version owns its tests under
  `versions/`). **This is NOT the crown** — crowning needs SPRT (above);
- **measurement and the anchor are orthogonal.** The Elo anchor (`claude-v2 = 0`)
  only fixes the scale; it never has to be the best or the floor. Adding a version
  can't move the anchor, so saved numbers stay comparable across regenerations;
- the archive reconstructs and runs any past version — `claude-v1` included, a real
  frozen snapshot (`versions/claude-v1/`).

The archive is the single source of truth; the Elo ladder is the single source of
**player-facing rank**; the SPRT verdict is the single source of **crown/substrate**.

### The lobby is derived, not curated

The lobby offering (`bots/roles.ts` `LOBBY_BOTS`) is computed entirely from the
archive + the generated Elo ladder, **Elo-only, no hand-edited pointers**, and
**never surfaces the crown** to players:

- **Strongest** — highest Elo across all families. The lobby default and the
  `addBot`/`freshGame` seat (`DEFAULT_BOT_VERSION`). No confidence gate.
- **Best of each family** — highest Elo within that family.
- **Full version list per family** — every registered label, oldest → newest.
- **Deprecated** — any version with no Elo (excluded via `RATING_EXCLUDED`, or
  not-yet-rated): rendered struck-through and unselectable.

A seat stores the **exact version label** it plays. Adding a family is one row in
`FAMILY_SPECS` (`roles.ts`); adding a version is one entry in `versions/index.ts`.
`dumb` remains a resolvable strategy for the simulator/gauntlet but is not offered
in the lobby.

**Lineage prefixes name a machine OR a paradigm (2026-06-22).** Originally a prefix
meant the **authoring machine** (`claude-v`/`jane-v`/`gemini-v` — provenance). The
`trade-v` lineage (PR #8) generalizes that: a prefix can instead namespace a
**system/paradigm a line of versions explores** — here an asymmetric-valuation trade
engine — independent of who authored it (`trade-v1` was written on Jane). The rule a
prefix self-documents what the lineage IS still holds; for a paradigm family that's
the *idea*, not the author. Provenance and paradigm are both legitimate ways to carve
a family — pick whichever the lineage is actually *about*. (This doesn't change the
substrate rule: lineages remain non-silos, and a paradigm family's good subsystems are
free to borrow into any base — see "Two bests".)

## Decisions (locked 2026-06-19)

1. **Version representation — self-contained snapshots.** Each version is a
   complete copy of the policy code (strategy + its valuation/trades), free to
   change *anything*. We do **not** pre-extract shared "bot libraries" — that would
   trap future versions into logic we may want to drop. Only genuinely stable,
   non-strategic facts (board geometry, space names, the official net-worth
   calculation) live in shared infrastructure. **What the lobby fields is derived,
   not copied:** a seat stores a concrete version label and `registry.ts` `botFor`
   resolves it through `VERSIONS`; the "best" picks are the highest-Elo labels from
   the generated ladder (`ratings.ts`), so promotion is just the next
   `sim:ratings` — no pointer, no green light. Every version — `claude-v1`
   included — is a self-contained snapshot under `versions/`, so we can
   always run and branch from any of them.
2. **Evaluation target — gauntlet + Elo, decided by SPRT** (see Measurement), not
   head-to-head-with-predecessor only.
3. **Winning = bankruptcy; the turn cap is only a timeout** (see "Winning is
   bankruptcy"). A capped game is a draw/no-result, tracked as a health metric —
   *not* a net-worth win, which would reward the very stalling we're eliminating.
4. **Controlled randomness is in scope.** A version may use randomness to break
   symmetric deadlocks or mix strategies — drawn from the seeded `rngState`, never
   `Math.random`, so replay stays intact. This needs a small `Bot`-contract change
   to thread the rng, made if/when a version wants it.

5. **SPRT bounds — dual one-sided, margin E = 20 Elo, α = β = 0.05** (sized in
   Session A). The indifference margin **E = 20 Elo** (≈ 52.9% win share) is the
   "is this a real edge worth promoting" threshold — about the ~3% the loop
   cares about. It is deliberately **not smaller**: a tighter E (e.g. 10) chases
   1–2% effects but **overfits seed noise** — the v3-vs-v2 point estimate swung
   from +12.5 Elo (train) to −5.5 Elo (held-out) at ~240 games, so a 10-Elo bar
   would flip on which seeds you looked at. E = 20 keeps a near-tie reading
   *inconclusive* (correct), and the held-out split (below) guards the rest. The
   test is the **dual one-sided** form (improvement `[0,+E]` + regression
   `[0,−E]`), **not** a symmetric `[−E,+E]` — see "What's built" for why the
   symmetric form silently promotes coin flips. Default decisive cap per pairing:
   **4000** (enough for a true tie to resolve to a confident `even`; a smaller
   `--max` just yields `inconclusive`, which is treated identically for
   promotion). Bounds are CLI-overridable (`--margin`, `--alpha`, `--beta`,
   `--max`) but these are the defaults.
6. **Draws are DISCARDED from the test** (sized in Session A). A capped game is a
   no-result for *both* sides — it carries zero win/loss signal — so it never
   enters the SPRT; it is only reported as the cap-rate health metric. Justified
   by the data: among real post-v3 bots the cap is ~0% (validated: 5/1500 ≈ 0.3%
   in v3-vs-v2). Pairings that *include* v1 still cap ~22–26%, but that is v1's
   trade-veto deadlock, not a property of the test, and discarding is still the
   right call (a draw tells you nothing about who is stronger). See decision 8.
7. **Seed split — train vs held-out by prefix** (sized in Session A). Seeds are
   namespaced strings, so the practice and validation pools are disjoint *by
   construction*: iterate and tune on `--prefix train` (the default), then
   **confirm the accept on `--prefix holdout`** (a fresh, unseen stream) before
   locking a champion. Don't promote on the train run alone — the v3 train/held-out
   swing above is exactly why.
8. **v1 is DROPPED from the default field — ✅ TAKEN (2026-06-20, by Kyle).** v1's
   hard trade-veto makes ~a quarter of its games deadlock to the turn cap, and a
   *capped* game runs the **full** 2000 turns — the most expensive game there is —
   while contributing **nothing** to the SPRT (draws are discarded). So v1 pairings
   are the slowest *and* the least informative. The floor doctrine ("never go below
   v1") is about ranking robustness, not about running v1 every time: every
   `vN (N≥2)` clears v1 by a wide margin (~160 Elo; v5 beat it 72–80%, the whole
   field +110–216 Elo above it), so a non-transitive loss to v1 by a bot that beats
   v2 is implausible. The condition this decision waited on — *"keep v1 until a
   future version's dominance is locked in"* — was met when **v5 locked in** (it
   dominates v1 on both seed streams), so v1 is now **out of the gauntlet's default
   field**: `npm run sim:gauntlet` excludes it automatically; re-include it for an
   occasional archived floor audit with **`--with-v1`** (or an explicit `--field`).
   When v1 is absent the Elo fit **anchors at the base** instead of v1=0 (the report
   prints `Elo (<base> = 0)`), so ratings stay interpretable. **This is purely a cost
   optimization — v1 is a real strategy and the published floor, NOT a null bot like
   `dumb`** (which measures nothing and is hard-rejected from any field). v1 remains
   in `VERSIONS` and fully runnable; only the *default* field changed.

9. **`gemini-v1` is DEPRECATED — ✅ TAKEN (2026-06-21, by Kyle).** Same cost
   reasoning as Decision 8, applied to the worst bot in the archive. `gemini-v1` sits
   ~150 Elo below the field (the lowest by a wide margin) *and* is the capped-game
   bottleneck: its pairings run to the 2000-turn cap and each one is a ~6-min slog
   that swamps any ratings/gauntlet run for near-zero signal (it dominated the
   focused `claude-v36` ratings run until it was dropped, cutting that run from ~30
   min to ~25 s). So it's added to **`RATING_EXCLUDED`** — unrated, rendered
   deprecated in the lobby, and dropped from the gauntlet's default field (the field
   filter now excludes the whole `RATING_EXCLUDED` set generically, not just
   `claude-v1`; there's no `--with-gemini` opt-in — force it back with an explicit
   `--field` if ever needed). It is the **sole Gemini version**, so this deprecates
   the **entire Gemini family** in the lobby — intended. Like `claude-v1`, this is
   **purely a cost optimization**: `gemini-v1` is a real strategy (a whole lineage's
   v1), stays in `VERSIONS`, and remains fully runnable; only its rating/default-field
   participation changed. The `RATING_EXCLUDED` set is now `{claude-v1, gemini-v1}`.

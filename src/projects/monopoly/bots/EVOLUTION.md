# Evolving the Claude Bot

A long-running, multi-session initiative: make the Monopoly Claude Bot as strong
as possible through an iterative loop, not a one-shot rewrite. This doc is the
durable home for the plan, the methodology, and the honest list of things that
can go wrong — so anyone (human or Claude) can pick it up cold.

Read `bots/CLAUDE.md` first for the bot's charter and current strategy. This doc
is about the *process* of improving it.

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
   forward. Never ratchet in a regression because the narrative was good.
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

## Coexistence & promotion

The production `claude` strategy (`registry.ts`) drives real online and dev
games — but it owns **no** policy code. It is a **pointer into the version
archive**: `bots/live.ts` exports `LIVE_VERSION`, and `registry.ts` resolves
`claude` to that snapshot (`VERSIONS[LIVE_VERSION]`). So:

- experimental versions **run side-by-side** with the live bot in one process —
  they're all just entries in `VERSIONS`, fielded by label by the tournament;
- **promotion is a one-line change** — repoint `LIVE_VERSION` (today `"v3"`); no
  code copy, no test churn (each version owns its tests under `versions/`);
- **the live bot and the gauntlet floor are orthogonal.** Shipping a version
  live is a product call; the floor (`v1`) and the measurement field are
  unaffected — the gauntlet fields versions by label and anchors Elo at `v1`, so
  `LIVE_VERSION` can never move a result. You can ship a version live **without**
  making it the floor;
- the archive reconstructs and runs any past version — `v1` included, now a real
  frozen snapshot (`versions/v1/`), no longer an alias to the live file.

This inverts the old coupling where `v1` *aliased* the live policy file: the
archive is now the single source of truth, and "live" and "floor" are two
independent selectors over it.

## Decisions (locked 2026-06-19)

1. **Version representation — self-contained snapshots.** Each version is a
   complete copy of the policy code (strategy + its valuation/trades), free to
   change *anything*. We do **not** pre-extract shared "bot libraries" — that would
   trap future versions into logic we may want to drop. Only genuinely stable,
   non-strategic facts (board geometry, space names, the official net-worth
   calculation) live in shared infrastructure. **The live bot is a pointer, not a
   copy:** `bots/live.ts`'s `LIVE_VERSION` names which archived snapshot
   `registry.ts` ships, so promotion is a one-line repoint **only on a human
   green light** and never redefines the gauntlet floor (`v1`). Every version —
   `v1` included — is a self-contained snapshot under `versions/`, so we can
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
8. **v1 may be dropped from the ACTIVE field once it is provably dominated**
   (raised by Kyle, 2026-06-20; option, not yet taken). v1's hard trade-veto
   makes ~a quarter of its games deadlock to the turn cap, and a *capped* game
   runs the **full** 2000 turns — the most expensive game there is — while
   contributing **nothing** to the SPRT (draws are discarded). So v1 pairings are
   the slowest *and* the least informative. The floor doctrine ("never go below
   v1") is about ranking robustness, not about running v1 every time: once every
   `vN (N≥2)` clears v1 by a wide margin (it does — ~160 Elo), a non-transitive
   loss to v1 by a bot that beats v2 is implausible, so v1 can be left out of the
   day-to-day gauntlet field (`--field` already makes this a one-flag choice) and
   kept only as an archived audit. **This is purely a cost optimization — v1 is a
   real strategy and the published floor, NOT a null bot like `dumb`** (which
   measures nothing and is hard-rejected from any field for a different reason).
   Keep v1 in the field until a future version's dominance is locked in; revisit
   then.

## Version log

The running record of bot versions and how each fared against the field — **both
the accepted champions and the rejected attempts** (a hypothesis that didn't beat
its predecessor is logged with status `rejected` so it isn't re-walked). v1 = the
bot as of this doc.

| Version | Date | Hypothesis / change | Result vs. field | Status |
|---------|------|---------------------|------------------|--------|
| v1 | 2026-06-19 | Baseline (current `claude`) | — | champion |
| v2 | 2026-06-19 | **Price the rival-monopoly threat instead of vetoing it** (`versions/v2/trades.ts`): handing a rival a new monopoly costs the seller `DENY_FACTOR`×bonus, folded into their valuation, so "cash for the completer" clears when the cash outweighs it. | **v2 win share 69.8%** of decisive games (139–60) over 240 fresh held-out seeds, two independent families (74.0% / 66.0%), z≈5.6 vs the 50% null. Cap rate 40%→~17%; 4×v2 resolves 16/16 previously-deadlocked seeds. | **loop champion** (current best; not yet the live bot) |
| v3 | 2026-06-19 | **N-way / multi-short trade construction** (`versions/v3/trades.ts`): generalize the search from "exactly one lot short, 2-way" to "any number short, N-way" — buy EVERY missing lot of a near-monopoly in one N-party deal — **plus the coupled fix that makes it viable:** price a new monopoly as ONE rival-threat premium *apportioned* across its contributors (`rivalThreatCost`), so a buyer assembling from two holdouts isn't charged the denial premium twice for one set (reduces to v2's full premium for a single seller). | **Eliminates the cap entirely: 0.0% draws in both held-out families** (v2 still caps ~17–26%); trades executed ~93→~800/run. **But win-neutral vs v2: 49.2% win share** over 240 fresh seeds (v3eval 46.7% [56–64], v3eval2 51.7% [62–58]), z≈−0.26 — does **not** clear the >50% bar. The residual deadlock was costing *draws, not losses*, so breaking it splits former draws ~50/50 instead of winning them. | **rejected** as champion (win-neutral); champion stays **v2**. N-way+apportionment archived in `versions/v3/` as a proven, reusable building block (see next step). |

## Status & next step

**Two independent tracks — don't conflate them:**

- **The loop champion** — the latest validated `vX` (currently **v2**; v3 was
  attempted and **rejected** as win-neutral — see below). The improvement loop
  advances this on its own: v2 → v3 → v4 …, each branching from the prior best.
  **No human greenlight is needed to bump versions** — that's just Claude Code
  continuing to make the bot stronger.
- **The live/official bot** — the `claude` strategy in `registry.ts`, the one
  shipped in the game, picked by the UI, played by humans. It is a **pointer**
  (`bots/live.ts` → `LIVE_VERSION`) into the archive, changed **only** on a human
  **greenlight** ("ship vX into the game") — a separate, deliberate, rare
  decision, *not* a precondition for continuing the loop, and **orthogonal to the
  gauntlet floor**.

**As of 2026-06-20:** the loop champion is still **v2** (v3 measured win-neutral
vs v2). **The live bot is now `v3`** — greenlit by Kyle as the more *engaging*
opponent for humans (decisive games, real trading, no deadlock), an explicit
**product call, not a strength claim** over v2, which it ties. The floor stays
**v1**, now a materialized frozen snapshot (`versions/v1/`). **Session A is done**
— the measurement system (parallelism + gauntlet + SPRT + Elo) is built and
validated (see "What's built" under Measurement). **Session B (build v4) is the
next step.**

**v3 — what was tried and what we learned (a logged negative result):**

1. **v3 isolated** in `bots/versions/v3/` (self-contained snapshot from v2;
   registered in `versions/index.ts`; `v3/trades.test.ts` pins the new shapes —
   a 1-1-1 split and a two-short single-owner set v2 proposes nothing on).
2. **The change** generalized trade construction to N-way (buy *every* missing lot
   of a near-monopoly in one N-party deal) and — the coupled fix without which it
   can't clear — apportioned the rival-threat premium across a set's contributors
   (`rivalThreatCost`), so a buyer assembling from two holdouts pays the denial
   premium *once*, not once per seller. It reduces exactly to v2 for any
   single-seller deal, so v2's validated 2-way behavior is untouched.
3. **The result is the lesson.** v3 **eliminates the cap entirely** (0.0% draws in
   both held-out families vs v2's ~17–26%) — the no-trade deadlock is fully gone —
   yet it is **win-neutral vs v2** (49.2% over 240 fresh seeds, z≈−0.26). The
   reason is sharp and worth internalizing: **the residual deadlock was costing
   *draws*, not *losses*.** A capped game is a no-result for *both* sides, so
   converting it to a decisive one just splits it ~50/50 — it doesn't transfer
   wins. Symmetric set-completion (both sides can now do it) is a wash. **To gain
   win share, a change must create ASYMMETRY** — out-develop, deny, or out-tempo
   the opponent — not merely make more deals happen.
4. **Gauntlet check — v3 does NOT regress against the field.** `v3 vs v1` = **70.2%**
   win share (33–14, z≈2.8) on fresh seeds — the *same ~70% margin v2 holds over
   v1*. So v3 ties v2 and beats v1 by v2's margin: no non-transitivity trap, v3 is
   at least as strong as v2 against the whole field. Note v3-vs-v1 still caps ~22%
   — but that's **v1 *refusing* to trade** (its hard veto: 536 declined offers vs
   115 executed), not v3 going passive; when v3's opponents can deal (v2), caps go
   to 0%. (Floor is v1; **`dumb` is a null bot and is never gauntleted** — see
   "Measurement".)

The v2-era engine fix (false-bankruptcy / hotel-shortage liquidation escape in
shared `development.ts`, regression-tested in `development.test.ts`) still stands
and benefits every version and human play.

**Session A — build the measurement system — ✅ DONE (2026-06-20).** The ruler had
become the bottleneck (the v3≈v2 tie unresolvable at fixed-N; marginal ±2–3%
hypotheses ahead; single-core runs painfully slow). It is now fixed: CPU
parallelism (`worker_threads`, ~14 workers, bit-identical to single-threaded),
the **gauntlet** (`npm run sim:gauntlet`), the dual one-sided **SPRT** in Elo, and
**Elo** across the field — all built, unit-tested, and validated by reproducing
v2≫v1 / v3≈v2 / v3>v1. Full detail, the locked parameters, and the validation
table are under **"What's built (Session A)"** in Measurement and decisions 5–8.
No new `vX` was created.

**Session B — build v4 from v3**, measured with the new system. v3 is the
gauntlet-cleared base (ties v2, beats v1 by v2's margin, decisive games = cleaner
substrate). **Lead (judge it):** chase **asymmetry / tempo**, since pure
decisiveness proved win-neutral — strongest is **mortgage-to-fund a
build/sweetener** (roadmap #2 in `bots/CLAUDE.md`: hotel your prize set a turn
*sooner* than rivals can answer — a clean tempo edge, orthogonal to trading), or
**trade-to-deny** (extend v3's N-way search to *block* a rival's completion, not
only complete your own — denial is a `positionValue` lever via `DENY_FACTOR` that
today fires only on landing/auction, never in construction).

**Shipping `vX` to the live bot (whenever a human greenlights it):** change
`LIVE_VERSION` in `bots/live.ts` to `"vX"`. That is the **whole** procedure — the
`claude` strategy resolves through it, so no code is copied and no tests change.
The old copy-over dance is gone: as of 2026-06-20 the live bot is a pointer and
`v1` is a real frozen snapshot (`versions/v1/`), so the gauntlet floor is
permanently decoupled from what ships. (Promotion is still a deliberate, rare,
human call — it's just now a one-liner.) **Done once on 2026-06-20:** the live
bot was repointed from v1 to **v3** by this mechanism.

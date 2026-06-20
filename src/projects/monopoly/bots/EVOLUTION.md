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
- **promotion is a one-line change** — repoint `LIVE_VERSION` in `bots/live.ts`
  (that file is the source of truth for what currently ships); no code copy, no
  test churn (each version owns its tests under `versions/`);
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

## Version log

The running record of bot versions and how each fared against the field — **both
the accepted champions and the rejected attempts** (a hypothesis that didn't beat
its predecessor is logged with status `rejected` so it isn't re-walked). v1 = the
bot as of this doc.

| Version | Date | Hypothesis / change | Result vs. field | Status |
|---------|------|---------------------|------------------|--------|
| v1 | 2026-06-19 | Baseline (current `claude`) | — | champion |
| v2 | 2026-06-19 | **Price the rival-monopoly threat instead of vetoing it** (`versions/v2/trades.ts`): handing a rival a new monopoly costs the seller `DENY_FACTOR`×bonus, folded into their valuation, so "cash for the completer" clears when the cash outweighs it. | **v2 win share 69.8%** of decisive games (139–60) over 240 fresh held-out seeds, two independent families (74.0% / 66.0%), z≈5.6 vs the 50% null. Cap rate 40%→~17%; 4×v2 resolves 16/16 previously-deadlocked seeds. | **loop champion** (current best; not yet the live bot) |
| v3 | 2026-06-19 | **N-way / multi-short trade construction** (`versions/v3/trades.ts`): generalize the search from "exactly one lot short, 2-way" to "any number short, N-way" — buy EVERY missing lot of a near-monopoly in one N-party deal — **plus the coupled fix that makes it viable:** price a new monopoly as ONE rival-threat premium *apportioned* across its contributors (`rivalThreatCost`), so a buyer assembling from two holdouts isn't charged the denial premium twice for one set (reduces to v2's full premium for a single seller). | **Eliminates the cap entirely: 0.0% draws in both held-out families** (v2 still caps ~17–26%); trades executed ~93→~800/run. **But win-neutral vs v2: 49.2% win share** over 240 fresh seeds (v3eval 46.7% [56–64], v3eval2 51.7% [62–58]), z≈−0.26 — does **not** clear the >50% bar. The residual deadlock was costing *draws, not losses*, so breaking it splits former draws ~50/50 instead of winning them. | **rejected** as champion (win-neutral); champion stays **v2**. N-way+apportionment archived in `versions/v3/` as a proven, reusable building block. **Later shipped LIVE** (`LIVE_VERSION = v3`) as the more engaging substrate, and used as the **base** for v4 — a win-safe branch point even though it didn't beat v2. |
| v4 | 2026-06-20 | **Tempo via mortgage-funded development** (`versions/v4/valuation.ts`, `planBuild`): when cash above the liquidity floor can't reach a prize set's desired level, mortgage idle, **non-monopoly** back-burner lots to fund the build a level *sooner* — turning idle equity into rent pressure ahead of rivals. Gated to real sets (`TEMPO_PRIZE_BONUS`, excludes brown) and real builds (`TEMPO_MIN_LEVEL = 3`); never cannibalizes a monopoly; the funded commit still clears the **same** liquidity floor (it redeploys idle capital, it does *not* lower the reserve). First version measured on the Session-A gauntlet. | **Win-neutral vs v3: 50.1% (1006–1000), confident EVEN over 2006 decisive (train).** No regressions: beats **v2 53.6%** (638–552) and **v1 67.9%** (106–50); Elo **v4 +149.3 ≈ v3 +147.4** (within noise), v2 +127.7, v1 0. Does **not** clear the improve-vs-base bar. | **rejected** as champion (win-neutral); base/substrate stays **v3**. Snapshot kept in `versions/v4/` as a win-safe building block (a tempo knob to pair with an asymmetry lever later); `v4/build.test.ts` pins the mechanism. |
| v8 | 2026-06-20 | **Denial + tempo (coupled)** (`versions/v8/`): the marquee synergy the v4 building block was kept for. Carry v5's trade-to-deny engine VERBATIM (`v8/trades.ts`) and fold v4's mortgage-funded TEMPO `planBuild` back in (`v8/valuation.ts`) — so after denying a rival their set, the bot mortgages idle non-monopoly back-burner lots to out-develop the field with the freed leverage. ONE coupled hypothesis: denial alone (v5) won and tempo alone (v4) was win-neutral, but together they compound — deny, then press the advantage faster than rivals recover. Dispatcher verbatim; both changes live in the called modules. | **TRAIN said BETTER, HOLDOUT said EVEN — an overfit caught.** Train: BETTER vs v5 52.9% (942–839, 1781 decisive). Holdout: **EVEN vs v5 50.7% (1744–1697, 3441 decisive, confident),** also EVEN vs v6 (49.8%); BETTER vs v2/v3/v4/v7. Elo (holdout, v5=0): v8 +4.2 ≈ v5 0. The improve-vs-base bar fails on held-out seeds. | **rejected** as champion (win-neutral on holdout); base stays **v5**. The train accept was seed luck — Decision 7's train/holdout split did its job. Tempo adds no robust win share **even coupled with denial**, falsifying v4's "tempo may pay off coupled with denial" caveat. `v8/build.test.ts` + `v8/trades.test.ts` archived. |
| v7 | 2026-06-20 | **Early (two-short) denial** (`versions/v7/trades.ts`): branched from v5 (NOT v6). After v6 showed denial's *funding reach* isn't the lever, push its *scope* instead: block a rival while still TWO lots short of a 3-lot set, taking one of the two missing lots from a holdout (holding one needed lot makes the set impossible). Hypothesis: at two-short the lots are still distributed/cheap, so early denial catches prize sets that become unblockable once the rival goes one-short and grabs the completer itself. Credit discounted by `TWO_SHORT_DISCOUNT = 0.5` (a two-short rival is further from completing); 2-lot sets excluded (their "two short" is "owns none"). `evaluateTrade` untouched; Offer D mirrors v5's go/no-go. | **WORSE vs v5 (base): 47.8% (1520–1663, 3183 decisive, confident REGRESSION, train).** Still beats the older field (v3 56.1%, v2 60.1%) but loses to v5; Elo v7 −13.6 < v5 0. | **rejected** (regresses the champion); base stays **v5**. Early denial is premature: it spends cash/assets on speculative blocks the rival might never have completed, and tying up capital early costs more than the rare unblockable-later set it saves. **v5's one-short timing — block exactly when the threat is imminent and the completer is pinpointed — is near-optimal for the denial lever.** `v7/trades.test.ts` pins Offer D. |
| v6 | 2026-06-20 | **Deny-via-swap** (`versions/v6/trades.ts`): push the proven v5 denial harder by removing its CASH gate. v5 could only block a rival when it could fund the holdout's sweetener in cash (`sweetenFor` returns null otherwise), so a denial it wanted but couldn't afford never happened. v6 adds a SWAP variant — pay the holdout with a junk lot (`junkLotForSwap`: a lone color lot in a set neither I nor the holdout have a stake in) plus minimal cash. Same block, fundable on a thinner bankroll. Both variants constructed; selection takes the higher denial-augmented delta. `evaluateTrade` untouched; the junk-lot filter + unchanged rival-threat pricing keep the in-kind sweetener from advancing the holdout. | **Win-neutral vs v5 (base): 50.4% (1222–1204, 2426 decisive, confident EVEN, train).** No regressions: beats v3 59.0% (203–141), v2 66.3% (116–59); Elo v6 +5.6 ≈ v5 0 (within noise), v3 −52.3, v2 −77.2. Does **not** clear the improve-vs-base bar (triage; no holdout run — triage already EVEN). | **rejected** as champion (win-neutral); base stays **v5**. The cash gate wasn't the binding constraint — cash-fundable denials already capture the value; in-kind funding adds reach but no win share. `v6/trades.test.ts` pins the swap construction; archived as a building block. |
| v11 | 2026-06-20 | **Threat-weighted denial** (`versions/v11/trades.ts`): the one denial axis v5 is naive about — target SELECTION. v5's denial premium is identical no matter WHICH rival is blocked, so it would spend as much to deny a hopeless trailer as the player about to win. v11 scales the premium by `threatWeight` — the denied rival's position value over the strongest opponent's, clamped to `[DENY_THREAT_FLOOR=0.5, 1]` — so the leading opponent keeps v5's full premium (cap 1.0, never above — respecting v10's overpay lesson) while a laggard's block is trimmed toward the floor. Denial spend is always ≤ v5's: it reallocates toward the threat and trims the weakest blocks, never inflates. `denial-target.test.ts` pins the weight math + a flip (v5 denies a trailer's bigger set, v11 denies the leader's). `valuation.ts`/`claude.ts` carried verbatim from v5. | **INCONCLUSIVE vs v5 (base): 48.8% (1951–2049, 4000 decisive, ran to cap, improve-LLR −12.27 — firmly NOT improving, regr-LLR −0.98 — no regression).** Beats v2 61.6%, v3 55.0%; Elo (v5=0) **v11 −7.5 ≈ v5 0**. Win-neutral; no holdout (triage already rejects on no-improvement, as v6). | **rejected** as champion (win-neutral); base stays **v5**. The best of the v9–v11 rejects — the only one that doesn't regress — but it adds no win share. v5's threat-blind denial already captures essentially all the available denial value; concentrating blocks on the leader vs trailers doesn't transfer extra wins (a trailer one-short of a strong set is still a real threat once completed, so denying it wasn't waste). `v11/denial-target.test.ts` pins the targeting. |
| v10 | 2026-06-20 | **Auction denial aggression** (`versions/v10/valuation.ts` `auctionValue`, `claude.ts` auction handler): a fresh CHANNEL for the proven denial lever. v5's 0.6 `DENY_FACTOR` is calibrated for trade-to-deny, where the denied rival isn't a party and can't bid; an AUCTION is the opposite — the rival is a competing bidder valuing its own completer at the FULL bonus, so a 0.6 ceiling always drops out and the rival completes. v10 bids a rival's pinpointed completer up to `AUCTION_DENY_FACTOR=1.0`×bonus (the full swing) — either denying the set or forcing the rival to overpay near its max. `acquisitionValue` (buy/landing) and trade construction UNTOUCHED; scoped to the auction channel only. `auction.test.ts` pins it. | **WORSE vs v5 (base): 46.4% (549–635, 1184 decisive, confident REGRESSION, triage).** Beats v2 62.9%, v3 54.4%; Elo (v5=0) **v10 −19.1** < v5 0. No holdout — triage rejects. | **rejected** (regresses the champion); base stays **v5**. Paying up toward the full bonus to deny **overpays**: the cash sunk winning (or chasing) a rival's completer weakens my own position more than the block helps. Echoes v7 — pushing the denial lever *harder* (scope in v7, **price** here) destroys win share. v5's 0.6, one-short, cash-funded denial is tuned on every axis tried; the **magnitude** of the denial premium is right where it is. `v10/auction.test.ts` pins the aggressive ceiling. |
| v9 | 2026-06-20 | **Graduated survival / liquidity guard** (`versions/v9/valuation.ts`, `liquidityFloor`): a NEW axis after the denial/tempo machinery tapped out. On top of v5's moderate reserve (half worst rent, capped $500), when a DEVELOPED rival board threatens, reserve a graduated 0.8× of the worst DEVELOPED rent, bounded by `SURVIVAL_CAP=$900` (below a full hotel hit, so never fully passive). Hypothesis: since tempo is proven worthless, trading a little development speed for a survival buffer is ~free on offense and converts variance into win share — outlast the hotel hit that busts a rival without fire-selling my own monopolies. A DEFENSIVE hardening, NOT a monopoly-value discount (`positionValue`/`acquisitionValue` untouched). `floor.test.ts` pins it; trade engine carried verbatim from v5. | **WORSE vs v5 (base): 45.2% (352–426, 778 decisive, confident REGRESSION, triage).** Beats v2 55.2%, EVEN vs v3 50.4%; Elo (v5=0) **v9 −31.4** < v5 0. No holdout run — triage already rejects. | **rejected** (regresses the champion); base stays **v5**. The buffer isn't ~free: a permanently higher reserve makes the bot **systematically under-develop** (unlike v4, which only re-ordered a build sooner), so it loses the rent race and the survival cash sits idle. Over-conservatism actively costs win share. `v9/floor.test.ts` pins the guard. |
| v5 | 2026-06-20 | **Trade-to-deny** (`versions/v5/trades.ts`): extend v3's N-way trade CONSTRUCTION with a NEGATIVE-SUM move — when a rival is one lot short of a set and the completer sits with a third-party **holdout** (not me, not the rival, building-free), buy that lot to ME purely to **block** the completion, even though it doesn't complete my own set. Priced off the existing `DENY_FACTOR` lever (which `acquisitionValue` already applies on a landing/auction denial but construction never did): a new `denyBonus` candidate type with its own go/no-go gate `plainDelta + DENY_FACTOR×bonus > ACCEPT_MIN`. `evaluateTrade` is **unchanged** (completion + counterparty model + incoming vote all intact); the holdout judges by plain `evaluateTrade`; **the denied rival is NOT a party, so it can't veto its own denial — the asymmetry.** Weak sets self-gate (a small bonus rarely clears the holdout's sweetener). | **BETTER vs v3 (base): 54.0% (537–457, 994 decisive, train), confident.** No regressions — sweeps the whole field both streams: **train** v2 64.0%, v4 54.6%, v1 71.7%; **holdout** v3 54.2%, v2 65.1%, v4 61.8%, v1 80.0%. Elo (holdout) **v5 +216.3** > v3 +175.3 > v4 +149.3 > v2 +141.4 > v1 0 — clear top of the field. | **ACCEPTED — new loop champion.** The first non-neutral structural win since v2: a negative-sum, rival-specific move transfers win share where two positive-sum self-improvements (v3, v4) did not. Base for v6. `v5/trades.test.ts` pins the denial construction. |
| v13 | 2026-06-20 | **Anti-kingmaker — standings-weighted acceptance** (`versions/v13/trades.ts`, `claude.ts`): the first board-shape / standings lever, and the first on the SELLER/APPROVER side (all prior denial is proposer-side). v5 prices handing ANY rival a new monopoly at a flat `RIVAL_THREAT_FACTOR×bonus`, blind to who; v13 scales that threat in the bot's own incoming-trade VOTE by the recipient's standing — `kingmakerWeight` maps the strongest opponent to `KM_HI=1.4` (extra loath to feed the real threat), the weakest to `KM_LO=0.6` (a harmless trailer is cheaper to feed). Scoped to the vote only: construction + the counterparty model keep the flat threat (exactly v5), so the bot doesn't mis-model the non-anti-kingmaker field. `kingmaker.test.ts` pins the weighting + accept-flips. | **WORSE vs v5 (base): 40.1% (121–181, 302 decisive, confident REGRESSION).** Also regresses v3 46.8%; beats v2 56.5%. Elo (v5=0) **v13 −54.1** < v5 0. No holdout — triage rejects. | **rejected** (regresses the champion, hard); base stays **v5**. The acceptance threshold is not a free lever: declining good cash to avoid feeding the leader is v9's over-caution (passivity under-resources the bot), and the `KM_LO` discount hands trailers extra monopolies too cheaply — both directions of the symmetric weight cost. Echoes v11 (proposer-side threat-weighting, neutral) but worse, because forgoing the sweetener on the acceptance side directly weakens the bot. `v13/kingmaker.test.ts` pins the lever. |
| v12 | 2026-06-20 | **Mixed equal-value trade selection — the RNG seam, first use** (`versions/v12/mix.ts`, `trades.ts`): the marquee untested axis (information / unpredictability). Wire a replay-safe seeded draw by HASHING `state.rngState` (xmur3-style, + a per-decision salt; **no `Bot`-contract change needed** — `rngState` is already in the `GameState` the bot receives, and reading it never advances the engine's stream, so games stay byte-identical and the draw is stable across the pacer's re-consults; never `Math.random`). First use: MIX which trade to propose among candidates within `MIX_TOLERANCE=50` of the best effective delta, instead of v5's fixed color-order argmax. Hypothesis: an unpredictable proposer denies a modelling opponent a clean read. Isolated to selection — `evaluateTrade`, v5's trade-to-deny construction, and the go/no-go gates are VERBATIM. | **WORSE vs v5 (base): 47.0% (778–877, 1655 decisive, confident REGRESSION, LLR impr −8.44).** Beats v2 59.9%, v3 55.8%; Elo (v5=0) **v12 −16.7** < v5 0. No holdout — triage rejects. | **rejected** (regresses the champion); base stays **v5**. The field is deterministic value-maximizers with **no predictive opponent-model**, so unpredictability has no read to deny — and mixing off the greedy argmax (even by ≤$50) is then a **pure value leak** that compounds over thousands of trades. Information/bluff is neutral-or-worse against this field; the RNG seam is built, replay-safe, and reusable, but **the information axis is closed**. `v12/mix.test.ts` pins the seam + the mixed tie-break. |

| v14 | 2026-06-20 | **Phantom-denial fix — gate Offer C on rival acquirability** (`versions/v14/trades.ts` `rivalCanAcquire`): a CORRECTNESS fix for a live-game bug (Finding 1). v5's Offer C books the `DENY_FACTOR×bonus` denial premium gated only on the rival owning N-1 of a set — never on whether the rival can actually ACQUIRE the completer. When the completer already sits with a non-rival holdout (every claude bot prices `RIVAL_THREAT_FACTOR` and won't hand a rival a monopoly), the rival is already blocked → marginal denial ~0, yet each bot re-books the premium, so a weak lot (brown $50, above the ~$30 hop cost) HOT-POTATOES forever (observed: Baltic traded 29× in a bot→bot ring, net-zero cash). v14 gates Offer C on the rival being able to realistically acquire the completer — afford the holder's threat-adjusted break-even AND have completing be comfortably worth it — restoring v5's stated "weak sets self-gate" intent. | **EVEN vs v5 (base) on BOTH streams, NO regressions:** train 49.5% (1373–1401, 2774 decisive, confident), holdout 50.0% (918–919, 1837 decisive, confident); BETTER vs v2 (55.7% / 58.3%), v3 (56.1% / 57.3%). Elo (v5=0) v14 −3.6 (train) / −1.1 (hold) ≈ v5 0. | **WIN-SAFE CORRECTNESS BASE** (not champion — EVEN, so v5 keeps top Elo; like v3→v4, a win-safe branch point). Removing the phantom denials costs ZERO win share → v5's denial edge was the REAL strong-set denials, never the brown churn. Also cuts trade churn (faster games + headless training) and stops the live bot's hot-potato. **Base for v15+; ready to ship LIVE** (a product call — fixes the observed real-game bug). `v14/phantom-denial.test.ts` reproduces the ring + pins the gate. |

| v15 | 2026-06-20 | **Near-monopoly option value** (`versions/v15/trades.ts`, `claude.ts`): Finding 2 — `positionValue` credits only COMPLETED sets, so a lone lot in a color the bot is one-short of reads as `assetBase` only; in a mutual-blocker standoff the bot sells its half for cash, foreclosing its OWN set for $0 on the books (a human exploits this by always being the buyer). v15 charges the bot's own incoming-trade VOTE an option penalty `OPTION_FACTOR=0.6 × monopolyBonus` when a trade drops it from one-short (N-1) to further short — so it holds the blocker unless the cash is a clear overpay. Scoped to the vote (construction + counterparty model keep plain valuation). Branched from v14. | **WORSE vs v14 (base): 41.7% (156–218, 374 decisive, confident REGRESSION).** Also WORSE vs v5 40.4%, v3 44.8%; beats v2 53.0%. Elo (v14=0) v15 −47.6 < v14 0. No holdout — triage rejects. | **rejected** (regresses the base, hard); base stays **v14**. Holding contested near-monopolies you can't develop is the LOSING line — exactly the Finding-2 twist (the human who hoarded both sets still went bankrupt). The bot SELLING its half of a standoff for cash is correct EV; the option penalty makes it cower and under-resource. **Third acceptance-side possessiveness lever to regress** (after v9 liquidity, v13 anti-kingmaker): the bot's value-maximizing acceptance is right — making it hold/refuse more is −EV. `v15/option.test.ts` pins the lever. |

| v16 | 2026-06-20 | **Jail-as-haven sharpening** (`versions/v16/valuation.ts` `jailChoice`): lead 3. v5/v14 stay in jail whenever ANY rival board is developed — a defensive cower, blind to the bot's own position. v16 reframes jail as a HAVEN keyed off the bot's OWN board: sit to collect rent risk-free only when *I* hold a developed board (own property, dev rent ≥ `JAIL_DANGER_RENT`) rivals must traverse; otherwise get out and keep moving (develop, pass GO, acquire). Branched from v14; only `jailChoice` changes. | **WIN-NEUTRAL vs v14 (base): INCONCLUSIVE 48.8% (1952–2048, 4000 decisive, ran to cap, improve-LLR −12.15 firmly NOT improving, no regression).** EVEN vs v5 49.8%; BETTER vs v2 54.8%, v3 52.9%. Elo (v14=0) v16 −7.2 ≈ v14 0. No holdout — triage rejects on no-improvement (like v6/v11). | **rejected** (win-neutral); base stays **v14**. The best of this run's rejects (neutral, not a regression — unlike v13/v15). Jail decisions are too infrequent and low-leverage to transfer win share; the own-board-haven vs rival-cower reframing is sound but washes. The last handoff lead (jail) joins the others as a logged dead end. `v16/jail.test.ts` pins the haven flip. |

| v17 | 2026-06-20 | **Lower liquidity reserve — aggression on the liquidity axis** (`versions/v17/valuation.ts`): the INVERSE of v9. v9 RAISED the voluntary-spend reserve and regressed (under-development lost the rent race); v17 asks whether v5's 0.5×worst-rent / $500 cap was itself too cautious and LOWERS it (`FLOOR_RENT_FRACTION` 0.5→0.3, `FLOOR_CAP` 500→300) — freeing cash to buy and develop sooner (reaches "flush"/hotels earlier), leaning on must-raise-cash for the rare big hit. Branched from v14; only the reserve changes. | **BETTER vs v14 (base) on BOTH streams, NO regressions:** triage 52.5% (1313–1189, 2502 decisive); full-field **train** BETTER vs v14 52.5% (only EVEN vs v6); full-field **holdout** BETTER vs v14 52.7% **AND BETTER vs the WHOLE archive v2–v16** (only INCONCLUSIVE vs v8 — not a regression). Elo (holdout, v14=0) **v17 +13.2 — top of the field**. | **ACCEPTED — new loop champion.** The first win since v5, and the first NON-denial structural win. Confirms the meta-lesson from the OTHER direction: not only does defensive over-caution lose (v9 raised the reserve → regressed), v5's *moderate* reserve was itself too conservative — a thinner buffer wins the development/rent race. **Aggression beats defense, on the liquidity axis too.** Inherits v14's phantom-denial fix. Base for v18. `v17/floor.test.ts` pins the lower reserve. |

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

**As of 2026-06-20:** the loop champion is still **v5** (trade-to-deny) — the only
change to beat its base since v2, validated on both seed streams against the whole
field (see the v5 row and note). **The live bot is whatever `bots/live.ts` →
`LIVE_VERSION` points to** (a product call, separate from the loop champion and the
gauntlet floor — read that file for the current value; v5 was promoted live once it
proved strictly stronger, replacing v3, which had been shipped earlier as the more
*engaging* opponent for humans). The floor stays **v1**, a materialized frozen
snapshot (`versions/v1/`). **Sessions A–D are done.** Session A built the measurement
system; Session B built `v4` (tempo, REJECTED); Session C built `v5` (ACCEPTED), `v6`
(REJECTED win-neutral) and `v7` (REJECTED regression); **Session D built three more
off v5 — `v8` (denial+tempo, REJECTED overfit/even-on-holdout), `v9` (survival /
liquidity guard, REJECTED regression), `v10` (auction denial aggression, REJECTED
regression), and `v11` (threat-weighted denial, REJECTED win-neutral).** The base is
still **v5** and is now confirmed a **sharp local optimum**: the denial lever is tuned
on every axis tried — funding (v6), scope (v7), price (v10), coupling (v8), target
(v11) — and the non-denial axes tried are neutral-or-worse (tempo v4/v8; liquidity v9,
which actively regresses because under-development loses).

**Lead for the next session (from v5).** Two genuinely different directions were
flagged off v5; **(a) is now CLOSED and (b) is the active lead:**

- **(a) information / bluff via the RNG seam — CLOSED by v12 (regression).** The bot is
  deterministic and legible, so the idea was a mixed strategy to deny a "read." The seam
  is now built and replay-safe (hash `state.rngState`, no `Bot`-contract change — see the
  v12 note), but mixing **regresses**: the field models the candidate's VALUE, not its
  BEHAVIOR, so there is no read to deny, and any deviation from the greedy argmax is a
  pure value leak. Do NOT re-walk mixed/bluff strategies against this (non-predictive)
  field — the seam waits for an adaptive-opponent field that doesn't exist yet.
- **(b) coordinated multi-rival / board-shape pressure — the active lead.** All denial so
  far targets ONE rival's ONE set, and all of it is **proposer-side**. The untouched
  surface is **standings-keyed acceptance** (the seller/approver vote in `evaluateTrade`):
  an *anti-kingmaker* rule — be more loath to hand a monopoly to whoever is closest to
  winning (the leader / a close pursuer), more willing to feed a harmless trailer — or
  trades that leave TWO rivals each one-short and bid them against each other. Prefer the
  negative-sum / asymmetry shape; expect mostly rejects.

**Do NOT re-walk any denial parameter** (funding v6, scope v7, price v10, coupling v8,
target v11), **defensive liquidity/tempo** (v4, v8, v9), or **information/bluff** (v12) —
all logged dead ends.

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

**v4 — what was tried and what we learned (a second logged negative result):**

1. **v4 isolated** in `bots/versions/v4/` (self-contained snapshot from v3; trade
   engine carried over verbatim; registered in `versions/index.ts`;
   `v4/build.test.ts` pins the new build behavior — mortgages idle lots to reach a
   higher level, refuses to touch a monopoly lot, and doesn't leverage when cash
   already suffices).
2. **The change** is the **tempo / mortgage-to-fund-a-build** lead (roadmap #2).
   `planBuild` now, when cash above the floor can't reach a prize set's desired
   level, mortgages idle **non-monopoly** back-burner lots (`fundShortfall`,
   least-essential first) to fund the build a level sooner — so a bot that just
   spent its cash *completing* a set can still *develop* it immediately instead of
   waiting to re-accumulate. Crucially it keeps the **same** reserve floor (it
   redeploys idle equity, doesn't dip the buffer) and never cannibalizes a
   monopoly. Gated to real sets and builds (`TEMPO_PRIZE_BONUS` / `TEMPO_MIN_LEVEL`).
3. **The result is the lesson — and it sharpens v3's.** v4 is **win-neutral vs v3**
   (50.1%, confident EVEN over 2006 decisive), with **no regressions** (beats v2
   53.6%, v1 67.9%; Elo tied with v3). What's striking: in the v4-vs-v3 pairing
   **only the v4 seats can mortgage-to-fund** — an *asymmetric capability* — yet it
   bought **zero** win share. So the rule isn't just "symmetric capabilities wash"
   (v3); it's broader: **a change that improves your own engine — completing sets
   sooner (v3), developing them sooner (v4) — washes out even when the opponent
   lacks it**, because over many seats/seeds both sides reach comparable developed
   positions and the one-level/one-turn nudge is too small to convert (and its
   leverage cost — lost back-burner rent, 10% interest, a thinner liquidity buffer
   for the next hit — roughly cancels the tempo gain). **The untested lever is
   targeted DENIAL:** an action whose entire value is *setting back a specific
   rival* (negative-sum against them), which a rival can't neutralize by doing the
   same to someone else. That is the lead for Session C — see below.
4. **Caveat for whoever revisits tempo.** This rejects *mortgage-funded* tempo as a
   standalone win lever; it does **not** prove development speed is irrelevant. The
   v4 snapshot is win-safe and kept as a building block — tempo may yet pay off
   *coupled* with denial (deny a rival their set, then out-develop the field with
   the freed leverage), which is the synergy a future version could test.

**v5 — what was tried and what we learned (the first ACCEPTED win since v2):**

1. **v5 isolated** in `bots/versions/v5/` (self-contained snapshot from v3;
   registered in `versions/index.ts`; `v5/trades.test.ts` pins the new denial
   construction — buys a rival's completer from a holdout where v3 proposes
   nothing, doesn't fire when the completer is unowned or already mine, refuses a
   denial it can't fund in cash, and prefers completing my own strong set over
   denying a rival's).
2. **The change** acts on the lead Session B sharpened: the only lever left was a
   **negative-sum move against a specific rival**. `proposeBestTrade` now scans, per
   rival one lot short of a set whose last lot sits with a **third-party holdout**,
   a denial buy of that lot to me — credited the `DENY_FACTOR` premium on the set I
   block (the *same* credit `acquisitionValue` applies on a landing/auction denial,
   which construction never did). It is surgically isolated: `evaluateTrade` is
   untouched, so completion, the counterparty model, and the incoming-offer vote are
   exactly v3; the denial credit lives ONLY in the proposer's go/no-go on the new
   candidate type. **The denied rival is not a party to the deal** (only the holdout
   and I are), so it never gets a vote — the asymmetry a symmetric capability lacks.
3. **The result confirms the meta-lesson.** v5 is **BETTER vs v3** (54.0% train,
   54.2% holdout) and sweeps the entire field on both seed streams with no
   regression, topping the Elo table (+216 holdout). Where v3 (complete sooner) and
   v4 (develop sooner) — both positive-sum self-improvements — washed out even
   against opponents that lacked them, v5's negative-sum denial **transfers win
   share**: taking a rival's prize set off the board before they complete it is a
   loss *they* eat and can't reciprocate, so it doesn't average out over seats and
   seeds. **The shape of a winning change is now empirically clear: deny, don't
   merely out-build.**
4. **Why it doesn't just cost me cash for nothing.** A denial buy spends real cash
   (the holdout's sweetener) on a lot that doesn't complete my own set — a cost the
   `DENY_FACTOR` gate justifies only when the blocked set is valuable enough. Weak
   sets self-gate (brown's tiny bonus barely clears the sweetener), strong sets
   clear easily, and a genuine completion for *me* always outranks an equal denial
   (the ranking is the denial-augmented delta for both). So the bot denies a rival's
   orange/red but won't burn cash blocking a brown it could ignore.

**v6 — what was tried and what we learned (a logged negative result):**

1. **v6 isolated** in `bots/versions/v6/` (snapshot from v5; `v6/trades.test.ts`
   pins the swap: it funds a denial in kind when too cash-short for v5's cash buy,
   refuses to give away a lot from a set I have a stake in, won't hand the holdout
   a lot in a color they already hold, and still denies via cash when flush).
2. **The change** removed the cash gate on v5's denial. Reasoning: v5 only denies
   when it can fund the holdout's sweetener in cash, and mid-game — just after
   spending on its own sets — the bot is often exactly that short, so a wanted
   block silently doesn't fire. v6 lets it pay in kind with a junk lot (a lone lot
   in a set neither side cares about) + minimal cash.
3. **The result is the lesson.** v6 is **win-neutral vs v5** (50.4%, confident EVEN
   over 2426 decisive), no regressions. So the cash gate was **not** the binding
   constraint on denial's value. Two readings, both consistent with the data: the
   denials v5 already funds in cash capture nearly all the available win share, and
   the *extra* denials swap unlocks are the marginal, low-value ones (the bot is
   cash-short precisely when its own position is weak, where spending an asset to
   deny a rival pays the least). Funding **reach** isn't the lever; the one-short
   cash denial of v5 is already at the point of diminishing returns.
4. **Caveat.** This rejects *in-kind funding* as a win lever; it does not impugn
   v5's denial, which still wins. The v6 swap machinery is archived as a building
   block — if a future denial-scope change (e.g. blocking two-short sets) needs to
   fire on a thin bankroll, the in-kind sweetener is ready to pair with it.

**v7 — what was tried and what we learned (a logged negative result — a regression):**

1. **v7 isolated** in `bots/versions/v7/` (snapshot from **v5**, not v6 — v6's swap
   was rejected; `v7/trades.test.ts` pins Offer D: it blocks a two-short rival from
   a holdout where v5 proposes nothing, prefers a one-short full-credit block over a
   discounted two-short one, adds nothing when I already hold a blocker, and skips
   2-lot sets).
2. **The change** pushed denial's SCOPE (after v6 showed funding reach is a dead
   end): block a rival while still *two* lots short of a 3-lot set, since holding one
   of the two lots they need makes the set impossible just as surely as taking the
   last one — and the bet was that catching it early (lots still at holdouts, cheap)
   converts blocks v5 misses once the rival goes one-short and self-completes.
3. **The result is the lesson — denial timing matters, and earlier is worse.** v7
   **regresses vs v5** (47.8%, confident WORSE over 3183 decisive) while still
   beating the older field. So the hypothesis is wrong in the direction that matters:
   early denial **destroys** win share. Two reasons, both pointing the same way:
   (a) a two-short rival is genuinely uncertain to complete, so the discounted credit
   still *overpays* for blocks that were never going to matter; and (b) acquiring a
   blocking lot early ties up cash/assets the bot needs for its OWN sets, and the
   rival — not yet committed to that color — simply pivots, so the "block" constrains
   nobody. **v5's one-short denial is well-timed precisely because it fires only when
   the threat is imminent and the completer is pinpointed at a holdout** — the
   information is maximal and the spend is justified. This sharpens the meta-lesson
   once more: the winning lever isn't "more denial," it's *well-timed* denial.
4. **Net for the run.** Three hypotheses tested from the negative-sum family: v5
   (one-short denial) **won and is the new champion**; v6 (deny-via-swap, more
   funding) and v7 (two-short, more scope) both **failed** — funding reach is
   irrelevant and earlier scope is harmful. The denial lever appears **tuned at v5**:
   block one-short, in cash, exactly when the completer is reachable.

**v8 — what was tried and what we learned (an OVERFIT caught by the holdout):**

1. **v8 assembled** in `bots/versions/v8/` from two existing building blocks: v5's
   trade-to-deny (`trades.ts`, verbatim) + v4's mortgage-funded tempo (`valuation.ts`
   `planBuild`). `v8/trades.test.ts` and `v8/build.test.ts` pin both mechanisms are
   intact. ONE coupled hypothesis: deny a rival their set, then out-develop the field
   with the freed leverage — the synergy v4's caveat hoped for.
2. **The result is a methodology win as much as a bot result.** Triage (train seeds)
   said **BETTER vs v5 (52.9%, confident)** — and it would have been tempting to
   crown it. But the **holdout** run said **EVEN (50.7% over 3441 decisive,
   confident)**: v8's edge over v5 evaporates on seeds it wasn't measured on. This is
   exactly the train→holdout swing Decision 5/7 warned about (v3-vs-v2 swung +12.5 →
   −5.5 the same way), and the split caught it. **Always confirm on holdout before
   ratcheting — a confident train BETTER is not enough.**
3. **The substantive lesson.** Tempo adds **no robust win share even coupled with
   denial.** v4 (tempo alone) was win-neutral; the hope was that denial's freed
   leverage would let tempo convert. It doesn't — over held-out seeds the coupled
   bot ties v5. Combined with v6 (funding) and v7 (scope), the picture is firm:
   **v5's one-short, cash-funded denial is the whole edge; surrounding it with tempo,
   in-kind funding, or earlier blocks adds nothing or hurts.** The next lever must be
   a genuinely different axis, not another tweak to the development/denial machinery.
4. **Process note (tooling).** This run also exposed two infrastructure gaps, now
   fixed: (a) `npm run sim:gauntlet` had no progress output, so a long run was a
   black box — added a live per-pairing progress line (games/cap bar + win% + SPRT
   LLR); the bar filling toward the cap is the visible "drifting to inconclusive"
   signal. (b) Decision 8 (drop v1 from the default field) was finally **taken** —
   v1 is dominated and its deadlock-capped games are the slowest, least-informative
   pairing; it's now excluded by default (re-add with `--with-v1`).

**v9 — what was tried and what we learned (a logged negative result — a regression):**

1. **v9 isolated** in `bots/versions/v9/` (snapshot from v5; trade-to-deny engine +
   dispatcher carried VERBATIM; `v9/floor.test.ts` pins the survival guard — it
   reserves more than v5 on a developed board (3-house and hotel cases), the
   reserve scales with the developed rent, it's bounded by `SURVIVAL_CAP`, and it
   is byte-for-byte v5's floor on any UNDEVELOPED board; `v9/trades.test.ts`
   re-pins the carried denial engine).
2. **The change** is the first NEW axis after the denial/tempo machinery tapped
   out: a **graduated survival / liquidity guard**. v5's `liquidityFloor` reserves
   half the worst board rent capped at $500 — far short of a hotel hit ($1000–2000).
   v9 adds a survival term: when a rival board is *developed*, reserve 0.8× of the
   worst developed rent, capped at $900 (deliberately below a full hotel so the bot
   keeps developing). Framing: tempo is proven worthless, so trading a little dev
   speed for a buffer should be ~free on offense and might convert variance (the
   hotel hit that busts a rival) into win share. It is a liquidity guard, NOT the
   cash-scaled monopoly *discount* that `bots/CLAUDE.md` rejects — valuation is
   untouched.
3. **The result falsifies the "~free" framing.** v9 **regresses vs v5** (45.2%,
   confident WORSE over 778 decisive). The buffer is *not* free: v4's tempo only
   *re-ordered* a single build a turn sooner, but v9 holds a permanently higher
   reserve across the WHOLE game, so it systematically **under-develops** — it
   builds less, earns less rent, and loses the race while the survival cash sits
   idle. The hit it's bracing against is forced (it routes through must-raise-cash
   regardless of the voluntary floor), so the extra reserve doesn't even prevent
   the fire-sale it was meant to — it just spends less on offense. **Over-cautious
   liquidity is a losing trade.** This sharpens the meta-lesson from the other
   direction: not only do positive-sum self-improvements wash out (v3/v4/v8) — a
   *defensive* self-improvement actively costs, because passivity surrenders the
   board. The winning shape remains negative-sum *aggression* against a rival, not
   self-protection.

**v10 — what was tried and what we learned (a logged negative result — a regression):**

1. **v10 isolated** in `bots/versions/v10/` (snapshot from v5; trade engine carried
   verbatim; `v10/auction.test.ts` pins the new bid ceiling — it bids a rival's
   completer higher than v5 (full bonus vs 0.6), equals `acquisitionValue` on any
   lot that blocks no rival and on a lot that completes MY OWN set, and self-gates
   on a weak/brown set; `v10/trades.test.ts` re-pins the carried denial engine).
2. **The change** moved the proven denial lever into a fresh CHANNEL — the auction.
   v5's `DENY_FACTOR=0.6` works for trade-to-deny because the denied rival can't
   bid; in an auction it's a competing bidder valuing its own completer at the full
   bonus, so the 0.6 ceiling drops out and the rival completes the set cheaply. v10
   bids a rival's pinpointed completer up to `AUCTION_DENY_FACTOR=1.0`×bonus,
   contesting the rival who'd otherwise walk away with the set.
3. **The result is the lesson — the denial premium's MAGNITUDE is tuned, not just
   its timing/scope/funding.** v10 **regresses vs v5** (46.4%, confident WORSE over
   1184 decisive) while still beating the older field (v2 62.9%, v3 54.4%). Paying
   up toward the full bonus **overpays**: the cash sunk winning (or chasing the
   rival up on) a completer that doesn't complete *my* set weakens my own position
   — fewer builds, a thinner buffer for the next hit — more than the block helps.
   This is v7's lesson in a new dimension: v7 pushed denial *scope* (earlier), v10
   pushes denial *price* (higher), and both **destroy** win share. The picture is
   now firm across four axes: denial **funding** (v6, neutral), **scope** (v7,
   worse), **channel/price** (v10, worse), and tempo coupling (v8, neutral) all
   fail. **v5's one-short, cash-funded, 0.6-priced, trade-channel denial is a sharp
   local optimum — every direction away from it is neutral or worse.** The next
   lever must be a genuinely different decision (whom to target, when to sit), not
   another parameter on the denial premium.

**v11 — what was tried and what we learned (a logged negative result — win-neutral):**

1. **v11 isolated** in `bots/versions/v11/` (snapshot from v5; valuation + dispatcher
   carried verbatim; `v11/denial-target.test.ts` pins `threatWeight` — the leading
   opponent gets 1.0, a laggard floors to 0.5, an equal field is all-1.0 (so v11 ==
   v5 there) — plus a behavioral flip: on a board where v5 denies a trailing rival's
   bigger set, v11 denies the leader's slightly-smaller one; `v11/trades.test.ts`
   re-pins the carried denial engine).
2. **The change** is the one denial axis v5 is naive about: **target selection**.
   v5 prices every block at `DENY_FACTOR×bonus` regardless of which rival it blocks,
   so it spends as much to deny a hopeless trailer as the leader. v11 scales the
   premium by the rival's position value relative to the strongest opponent (clamped
   `[0.5, 1]`), concentrating the cash-costly block on the genuine threat and trimming
   the weakest. Capped at 1.0 so it never pays above v5's level (v10's lesson) — it
   only reallocates and trims.
3. **The result is the lesson.** v11 is **win-neutral vs v5** (48.8%, ran to the 4000
   cap with the improvement test firmly rejected, LLR −12.27, and no regression) — the
   *best* of the three rejects this run (the only one that doesn't regress) but it
   adds no win share. The reading: v5's threat-blind denial already captures
   essentially all the available denial value. Trimming a trailer's block doesn't free
   enough cash to matter, and the leader rarely has a *separate* simultaneous block
   that the trailer's denial was crowding out — so reallocation is mostly a no-op, and
   a trailer one-short of a strong set is a genuine threat the moment it completes
   (denying it was never waste). This is the v6 pattern (a denial refinement that
   neither helps nor hurts) on the targeting axis.
4. **Net for the run (v9–v11).** Three more axes tested off v5, all rejected: **v9**
   (survival/liquidity guard) — a defensive self-improvement that *regresses* (passive
   under-development loses); **v10** (auction denial aggression) — pushing the denial
   *price* higher, *regresses* (overpay); **v11** (threat-weighted denial) — denial
   *target* selection, *win-neutral*. Combined with the Session-C results, **v5 is now
   a sharp local optimum on every denial axis tried — funding (v6), scope (v7), price
   (v10), coupling (v8), target (v11) — and the two non-denial axes tried (tempo: v4/v8;
   liquidity: v9) are neutral-or-worse.** The denial machinery is fully tapped out and
   defensive tuning backfires. The next genuinely new lever is unclear from valuation /
   trades / liquidity / jail-channel tuning; a future session should look at a
   different decision surface entirely (e.g. *information/​bluff* via the RNG seam, or
   coordinated multi-rival pressure) rather than another knob on the proven denial.

**v12 — what was tried and what we learned (a logged negative result — a regression):**

1. **v12 isolated** in `bots/versions/v12/` (snapshot from the champion v5; valuation
   + dispatcher carried verbatim except the selection step; `v12/mix.ts` is the new
   RNG-seam helper; `v12/mix.test.ts` pins the seeded draw + the mixed tie-break, and
   `v12/trades.test.ts` re-pins that the carried v5 denial engine is identical on
   single-candidate boards).
2. **The change** is the first use of the **RNG seam** — the marquee untested axis
   (information / bluff). Key design call: the seam needs **no `Bot`-contract change**.
   The bot is already a pure function of `GameState`, and `GameState.rngState` (the live
   mulberry32 state) is right there in it — so the bot draws replay-safe randomness by
   *hashing* `rngState` (+ a decision salt), never `Math.random`. This is strictly
   better than threading a live `Rng` into the contract (the alternative the docs
   floated): reading `rngState` never advances the engine's stream (games stay
   byte-identical where the bot doesn't diverge) and the draw is **stable across the
   pacer's re-consults** within one decision window (a live `Rng` would hand back a
   different value each consult and spin the arm/commit handshake). The behavioral use:
   among trade candidates within `MIX_TOLERANCE=50` of the best effective delta, MIX
   which to propose instead of v5's fixed color-order argmax.
3. **The result closes the information axis.** v12 **regresses vs v5** (47.0%, confident
   WORSE over 1655 decisive). The reading is sharp and matches the a-priori: **the field
   models the candidate's VALUE, not its BEHAVIOR.** `evaluateTrade` answers "would the
   counterparty accept *this* trade," but no opponent tracks the candidate's history or
   predicts its future moves — so there is no *read* for unpredictability to deny. With
   the information benefit at zero, the only remaining effect of mixing is the value you
   give up by not always taking the greedy argmax: deviating even ≤$50 per trade, over
   thousands of trades a game, is a **pure leak** that costs ~3% win share. So mixing is
   neutral-at-best (a $0 / exact-tie band) and negative once it deviates at all.
   **Information / bluff is a dead axis against a non-predictive field** — it would only
   pay against an opponent that exploits a behavioral read, which this field doesn't do.
   The RNG seam itself is built, replay-safe, unit-tested, and reusable (a future
   adaptive-opponent field could revive it), but it buys no win share here.
4. **Methodology note.** This is a *regression*, not merely win-neutral — stronger than
   the expected wash, and decisive enough to retire the axis without a second variant:
   if a tiny ($50) deviation-from-optimal already regresses, no larger mixing band can
   recover, and a pure exact-tie band (zero deviation) can at best tie. The pivot is to
   the other named lead — **coordinated multi-rival / board-shape pressure** keyed off
   STANDINGS (anti-kingmaker / leader-aware acceptance), a genuinely different decision
   surface (the seller/approver side of trades, which every prior denial version left
   untouched — they are all proposer-side).

**v13 — what was tried and what we learned (a logged negative result — a regression):**

1. **v13 isolated** in `bots/versions/v13/` (snapshot from v5; construction + the
   counterparty model carried verbatim; `v13/kingmaker.test.ts` pins the standings
   weight — strongest opponent → `KM_HI`, weakest → `KM_LO`, single/level field → 1.0
   = v5 — plus accept-flips where v13 refuses to feed the leader / agrees to feed a
   trailer; `v13/trades.test.ts` re-pins that proposals are byte-for-byte v5's).
2. **The change** is the **anti-kingmaker** lead — the first board-shape / standings
   lever, on the previously-untouched SELLER/APPROVER side. The bot's incoming-trade
   vote prices the rival-monopoly threat by the recipient's standing: extra loath to
   hand its strongest opponent a set, more willing to feed a harmless trailer. Scoped to
   the vote only (construction stays flat-threat v5) so the bot doesn't mis-model the
   non-anti-kingmaker field.
3. **The result is the lesson — the acceptance threshold is a losing lever.** v13
   **regresses vs v5** (40.1%, confident WORSE) and also regresses v3. Both halves of
   the symmetric weight hurt: (a) amplifying the leader's threat makes the bot **decline
   good cash deals** to avoid feeding them — v9's over-caution in a new guise (forgoing
   the sweetener under-resources the bot, and passivity surrenders tempo); (b) the
   `KM_LO` discount hands **trailers extra monopolies too cheaply**, manufacturing new
   rivals. This is v11's lesson (proposer-side threat-weighting was neutral) made
   *worse* on the acceptance side, where giving up the sweetener directly weakens the
   bot rather than merely reallocating a denial premium. **Standings-keyed
   possessiveness on the trade-vote is neutral-or-worse; v5's threat-blind flat
   acceptance is right.** The board-shape lead is not dead in general (proposer-side
   coordination is still untried), but the *acceptance* axis is now a logged dead end.

**v14 — what was tried and what we learned (a win-safe CORRECTNESS base, from live play):**

1. **v14 isolated** in `bots/versions/v14/` (snapshot from v5; the only change is one
   gate in Offer C; `v14/phantom-denial.test.ts` reproduces the brown hot-potato ring
   and asserts no denial buy is built, plus that strong-set denials still fire and a
   cash-poor rival's denial is skipped).
2. **The change** fixes **Finding 1** — a phantom-denial bug found in two real DB games.
   v5's trade-to-deny (Offer C) credits the denial premium for buying a rival's
   completer from a holdout, gated only on the rival owning N-1 of the set. It never
   checks whether the rival could ACTUALLY acquire the last lot. When the completer is
   already held by a non-rival who would block the rival (every claude bot prices
   `RIVAL_THREAT_FACTOR`), the rival is already blocked — moving the lot holdout→me is
   zero marginal denial, but each bot re-books the full premium, so a weak lot cycles
   among bots forever (Baltic 29× in a perfect ring). `rivalCanAcquire` gates the buy on
   the rival's realistic ability to get the completer (afford the holder's
   threat-adjusted break-even AND have completing be comfortably worth the cost). Weak
   sets self-gate by valuation; strong-set denials still fire.
3. **The result is a clean methodology point.** v14 is **EVEN vs v5 on BOTH seed streams
   (train and holdout), with no regressions.** Removing the phantom denials costs **zero
   win share** — which proves v5's measured denial edge came entirely from the **real**
   (strong-set, reachable) denials, NOT the brown hot-potato churn the bug also produced.
   So this is a **win-safe correctness fix**: it is not crowned champion (a tie doesn't
   beat v5 on Elo), but — exactly like v3 became the win-safe base for v4 — **v14 is
   adopted as the BASE for the ongoing run**, because it is strictly better engineering
   (a real bug fixed, fewer wasted trade slots, faster headless training and live games)
   at no competitive cost. It is also **ready to promote LIVE** to fix the observed
   real-game churn — a product call left to a human green-light (live pointer untouched).
4. **Why a bug fix can be a base without being champion.** The champion is the
   highest-Elo version (still v5). The *base* is the win-safe branch point the loop
   builds from. A correctness fix that measures EVEN with no regression is exactly such a
   point: it changes nothing about who wins, removes a defect, and is safe to build on.
   Conflating the two would either (a) refuse a free correctness fix, or (b) crown noise
   — both wrong. v15+ branch from v14.

**v15 — what was tried and what we learned (a logged negative result — a regression):**

1. **v15 isolated** in `bots/versions/v15/` (snapshot from **v14**, the win-safe base;
   construction + counterparty model verbatim; `v15/option.test.ts` pins the option
   charge — declines selling a standoff half v14/v5 would sell, still sells for a clear
   overpay, and is a no-op when the bot isn't one-short of the sold color).
2. **The change** addresses **Finding 2**: `positionValue` credits only completed sets,
   so the bot sells its half of a mutual-blocker standoff for cash, foreclosing its own
   one-short shot for $0 on the books. v15 charges its own incoming vote a near-monopoly
   OPTION VALUE (`OPTION_FACTOR × bonus`) for that foreclosure, so it holds the blocker
   unless the cash clearly overpays.
3. **The result confirms the user's own twist — and the meta-lesson.** v15 **regresses
   vs v14** (41.7%, confident WORSE) and vs v5/v3. So Finding 2's "exploit" is not a bug
   in the bot: **selling a contested completer to a cash-strapped rival is correct EV**;
   the human's instinct to overpay for sets it can't defend is the losing line (the
   human in the evidence won BOTH sets this way and still went bankrupt). Charging the
   option value makes the bot **cower and under-resource** — it holds dead near-monopoly
   lots instead of taking cash. This is the **third acceptance-side possessiveness lever
   to regress** (v9 graduated liquidity, v13 anti-kingmaker weight, v15 option value):
   the firm pattern is that the bot's **plain value-maximizing acceptance is right** —
   any rule that makes it hold/refuse MORE (out of caution, standings, or option value)
   under-resources it and loses. Aggression and liquidity win; possessiveness loses.
   (Finding 2's *secondary* value — being less exploitable by a human — is real, but it
   costs win share against the field, so it is **not** adopted; if a future "human-facing
   robustness" mode is ever wanted, it would be an explicit opt-in, separate from the
   training objective, like the timed-net-worth mode.)

**v17 — what was tried and what we learned (the first ACCEPTED win since v5):**

1. **v17 isolated** in `bots/versions/v17/` (snapshot from v14, the win-safe base; only
   the three floor constants change; `v17/floor.test.ts` pins that the reserve is
   strictly lower than v14's on a developed board and equal on a quiet one).
2. **The change** is a single-knob LOWERING of the voluntary-spend liquidity reserve
   (`FLOOR_RENT_FRACTION` 0.5→0.3, `FLOOR_CAP` 500→300). It was chosen as the *inverse*
   of v9: v9 raised the reserve and regressed, which proved the reserve is a live knob
   AND that over-caution costs — so the obvious untried question was whether v5's
   moderate reserve was *itself* still too cautious. A thinner buffer leaves more cash
   above the floor, so the bot buys, completes, and develops sooner (and reaches the
   "flush → hotels" threshold earlier), leaning on the forced `must-raise-cash` path for
   the rare big rent it can't pre-fund.
3. **The result is the run's headline.** v17 is **BETTER vs v14 on BOTH seed streams and
   BETTER vs the entire archive on the holdout**, with no regressions — Elo top of the
   field. The lesson completes the arc the whole run has been tracing: **aggression beats
   defense, and v5's caution was leaving win share on the table.** v9 showed raising the
   reserve loses; v17 shows v5's reserve was already too high. The bot was over-insuring
   against rent it rarely pays in full, at the cost of the development tempo that wins
   the rent race. This is *also* why v4/v8 tempo washed but v17 wins: v4 bought tempo by
   *mortgaging* (paying 10% interest + losing back-burner rent — the leverage cost
   cancelled the gain), whereas v17 buys the SAME tempo for FREE by simply holding less
   idle cash. Same goal (develop sooner), but v17's funding is costless, so it converts.
4. **Why this isn't v9 in reverse risk.** A thinner reserve could in principle bust the
   bot on a hotel hit before it can liquidate — but the engine's `must-raise-cash` path
   already liquidates value-preservingly for any forced charge regardless of the
   voluntary floor, so the floor only governs *voluntary* spend. Lowering it trades a
   little fire-sale risk for a lot of tempo, and the measurement says that trade wins
   clearly. The next question (v18): how far does lowering the reserve keep paying?

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

**Session B — build v4 from v3 — ✅ DONE (2026-06-20), REJECTED.** Built the tempo /
mortgage-funded-development lead; the gauntlet returned a confident win-neutral vs
v3 (above). A clean negative result, archived in `versions/v4/`. No champion bump.

**Session C (overnight run) — build `v5`, `v6`, `v7` from the denial family — ✅
DONE (2026-06-20).** The lead was **trade-to-deny**, the one asymmetry lever left
untested after v3/v4's positive-sum self-improvements both washed out. Result:
- **v5 (one-short trade-to-deny) — ACCEPTED, new champion.** Extend v3's N-way
  construction to block a rival one lot short of a set by buying that completer from
  a third-party holdout, priced off `DENY_FACTOR`; the denied rival isn't a party so
  it can't veto. BETTER vs v3 on both seed streams, sweeps the field (see the v5 row
  + note). The negative-sum lever the meta-lesson predicted.
- **v6 (deny-via-swap) — REJECTED, win-neutral.** Fund the block in kind (junk lot +
  cash) so it fires when cash-short. The cash gate wasn't the binding constraint;
  funding *reach* adds no win share (v6 row + note).
- **v7 (two-short denial) — REJECTED, regression.** Block earlier (rival two lots
  short). Earlier denial *destroys* win share — premature blocks overpay for sets the
  rival might never complete; v5's one-short timing is near-optimal (v7 row + note).

**The denial lever is tuned at v5, and the denial+development machinery is tapped
out.** Do NOT re-walk denial funding (v6), denial scope (v7), or tempo (v4, v8) —
all logged dead ends. The next lever must be a **different axis**: the leads are a
graduated **survival / liquidity guard** (outlast variance — recommended), then
jail-as-haven timing or auction aggression — see "Status & next step". Next version
is **v9 from v5**. NEVER gauntlet `dumb`. v1 is now **out of the default field**
(Decision 8, taken) — re-add with `--with-v1` only for an occasional floor audit.

**Shipping `vX` to the live bot (whenever a human greenlights it):** change
`LIVE_VERSION` in `bots/live.ts` to `"vX"`. That is the **whole** procedure — the
`claude` strategy resolves through it, so no code is copied and no tests change.
`bots/live.ts` is the single source of truth for what currently ships; this doc
deliberately does **not** restate the current live version (it would only go
stale). The old copy-over dance is gone: the live bot is a pointer and `v1` is a
real frozen snapshot (`versions/v1/`), so the gauntlet floor is permanently
decoupled from what ships. (Promotion is still a deliberate, rare, human call —
it's just now a one-liner.) The mechanism has been exercised on real promotions
(v1→v3, then v3→v5); see the version log for which were strength vs engagement calls.

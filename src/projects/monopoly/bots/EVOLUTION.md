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
   forward. Never ratchet in a regression because the narrative was good. When a
   version *is* crowned, **also bump `CHAMPION_VERSION` in `bots/roles.ts`** — the
   lobby's "Champion" pointer — in the same change (see "Coexistence & promotion").
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

### The three lobby pointers (Claude / Champion / Latest)

The lobby lets a player field a bot under **three named pointers**, declared as
data in `bots/roles.ts` (`BOT_ROLES`) and resolved through `registry.ts`. They
are **live pointers**: a seat stores its *role* (`claude` / `champion` /
`latest`), not a frozen version, so it always plays whatever the pointer names
in the deployed code — retargeting one moves every seat using it on the next
deploy. Each is moved by a different hand:

- **Claude** → `LIVE_VERSION` (`bots/live.ts`) — the hand-picked shipped bot. A
  product call on a **human green light**, as above.
- **Champion** → `CHAMPION_VERSION` (`bots/roles.ts`) — the best by measurement.
  **Re-pointing this is the code half of the acceptance ritual:** when a `vN`
  clears the bar and the version log below crowns it the new champion, bump
  `CHAMPION_VERSION` to that label in the same change. (The loop advancing the
  champion needs no human green light — only the *Live* pointer does.)
- **Latest** → `LATEST_VERSION` (`bots/roles.ts`) — the newest snapshot,
  **derived** from `VERSIONS`. Nobody edits it; registering a version in
  `versions/index.ts` makes it the latest automatically.

So Champion, Live, and Latest are three independent selectors over the same
archive, and can all name different versions (today: Live = Champion = `v17`,
Latest = `v18`). `dumb` remains a resolvable strategy for the simulator/gauntlet
but is no longer offered in the lobby.

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
| v31 | 2026-06-21 | **From-scratch DISTRESS grab — corner (A)** (`versions/v31/trades.ts` `proposeBestTrade` Offer E): extend the proven distress-discount lever to a whole-set buy. v29 buys a distressed rival's COMPLETER for a set the bot is one short of; v31 opens a from-scratch grab — when a GENUINELY DISTRESSED opponent owns a WHOLE, building-free monopoly of a color the bot holds NONE of, buy the entire set at the distress-discounted price and take it off the board. v24 proved a FAIR-PRICE from-scratch grab washes (positive-sum); the new `isDistressed` gate was meant to make it UNDERPRICED (the winning condition). Held + developed, never relocated (a complete monopoly has no third party to bounce to). Gated by `worthAcquiring` (real prize ≥ 100, stays above the rent reserve). Branched from champion v29; isolated to Offer E. `v31/acquire.test.ts` pins the structural finding (below). | **REJECTED on triage — EVEN vs v29 (base): 49.4% win share (1540–1578, 3118 decisive, 27 draws, confident EVEN, LLR impr −7.35 / regr −2.98).** Elo (v29=0) **v31 −4.2 ≈ v29 0**; no regression. No holdout (triage rejects on no-improvement). | **rejected** (win-neutral); champion stays **v29**. **Offer E is -EV by CONSTRUCTION and self-rejects — it never fires positively, so v31 plays identically to v29.** The proof (pinned in `acquire.test.ts`): the distress discount only erases the seller's rival-THREAT premium (the cost of arming the buyer); it does NOT discount the set's own `monopolyBonus`. When the buyer takes a WHOLE monopoly that bonus transfers ~1:1 — the seller loses exactly what the buyer gains — so the buyer's gain never clears the seller's discounted break-even plus the accept margin (measured: buyer gain +1120 vs seller discounted loss −1120 → net −30 after the $30 margin). **The asymmetry that made v29's Offer B win has no analogue here:** Offer B buys the LAST lot and banks the WHOLE bonus for one lot's price; a whole-set buy carries the bonus proportionally in every lot, so it is a fair (washing) transfer even at maximal distress — exactly v24's "intact-monopoly buy is -EV and self-rejects" lesson, and distress doesn't change it because the only thing it discounts (the threat premium) is precisely what cancels the buyer's gain. The ONLY way to make it clear would be to discount the bare set's own `monopolyBonus` by the owner's cash — the **cash-scaled-monopoly-value** idea that `bots/CLAUDE.md` explicitly considered and rejected. **Corner (A) is a closed dead end.** `v31/acquire.test.ts` pins the -EV self-reject. |
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

| v18 | 2026-06-20 | **Push the liquidity reduction further** (`versions/v18/valuation.ts`): v17's lower reserve WON, so per the loop push the winning lever — `FLOOR_RENT_FRACTION` 0.3→0.15, `FLOOR_CAP` 300→200, `BASE_FLOOR` 120→80 (an even thinner buffer) — to find where the aggression stops paying. Branched from the champion v17. | **WIN-NEUTRAL vs v17 (base): INCONCLUSIVE 51.9% (2075–1925, 4000 decisive, ran to cap, improve-LLR +2.01 short of the +2.94 accept boundary, no regression).** BETTER vs v14 55.7%, v5 57.3%, v3 58.7%, v2 58.4%; Elo (v17=0) **v18 +13.1** (leans positive but below the E=20 promotion bar). | **rejected** as champion (does not confirm BETTER vs base); base stays **v17**. Brackets the optimum: v9 (raise) regressed, v17 (0.5→0.3) won, v18 (0.3→0.15) adds no CONFIRMED win share — diminishing returns past v17. The true optimum may sit a hair below 0.3 (v18 leans +13 Elo) but within E=20 noise, so not worth crowning (Decision 5 — don't chase 1–2%). **v17's 0.3 / $300 reserve is the validated setting.** `v18/floor.test.ts` pins the thinner reserve. |
| v19 | 2026-06-20 | **Endgame elimination pressure** (`versions/v19/valuation.ts` `desiredLevel`): the marquee untried lead — proactive, proposer-side, negative-sum. Key development off a RIVAL'S DISTRESS: when an active rival is on the ropes (their raisable cash `cash + mortgageableTotal` can't cover my deadliest developed rent — one landing on my board ends them), enter ELIMINATION MODE and push my monopolies to MAX rent (hotels, or 4-and-hold under a house shortage) **even when not flush**, deploying my cushion into the rent that finishes the kill before variance lets them recover. Branched from the champion v17; isolated to `desiredLevel`. `v19/elimination.test.ts` pins the level-5 flip on a rival on the ropes and the no-op when none is. | **WORSE vs v17 (base): 46.5% (574–661, 1235 decisive, confident REGRESSION, improve-LLR −7.05).** Yet BETTER vs the whole OLDER field — v2 56.8%, v3 57.3%, v5 52.4%, v14 55.2%; Elo (v17=0) **v19 −17.0** < v17 0 (but > v5 −32.5, v14 −41.7). No holdout — triage rejects on the regression. | **rejected** (regresses the champion); base stays **v17**. A clean non-transitivity trap caught by the SPRT: v19 sits BETWEEN v5/v14 and v17 — stronger than the older field, weaker than v17. The mechanism: forcing HOTELS below the flush threshold spends the cushion v17 deliberately keeps, and **houses are illiquid** (sell back at half), so it's a *worse* form of aggression than v18's thinner cash reserve (which stays liquid and only went win-NEUTRAL). A distressed rival busts from normal developed rents anyway — over-developing to "finish" them faster transfers no net win share and just thins/illiquefies my own position, losing to the disciplined v17. **Fourth "deploy more aggressively than v17" lever to fail to beat it** (v18 lower reserve neutral, v19 forced hotels regress): v17 sits at the aggression frontier on the deployment axis. `v19/elimination.test.ts` pins the elimination flip. |
| v20 | 2026-06-20 | **Buy-aggression — looser DIP gate** (`versions/v20/claude.ts`): lead 2, the ACQUISITION analog of v17's winning thin reserve. Lower `DIP_WORTH_MULT` 1.4→1.15 so the bot dips below its (already thin) rent reserve to buy land of clear value (set progress, railroad synergy, denial) more readily — funded by cash on hand, so FREE (no mortgage interest, unlike the v4/v8 tempo that washed). Branched from the champion v17; one constant. `v20/dip.test.ts` pins a 1.35×-worth second railroad v20 buys below the reserve and v17 passes. | **WIN-NEUTRAL vs v17 (base): INCONCLUSIVE 52.0% (2079–1921, 4000 decisive, ran to cap, improve-LLR +2.47 short of the +2.94 accept boundary, no regression).** BETTER vs v2 59.8%, v3 66.7%, v5 54.4%, v14 53.8%; Elo (v17=0) **v20 +13.5** (top of the field on Elo, but below the E=20 promotion bar). | **rejected** as champion (does not confirm BETTER vs base); base stays **v17**. The SECOND liquid-deployment lever to land at ~+13 Elo inconclusive (after v18's +13.1) — two independent sub-threshold leans in the same direction, real but within the E=20 noise Decision 5 refuses to chase alone. Sets up v21's coupling test. `v20/dip.test.ts` pins the looser gate. |
| v21 | 2026-06-20 | **Couple the two liquid-deployment near-misses** (`versions/v21/`): v18 (thinner reserve 0.3→0.15, cap 300→200, base 120→80) AND v20 (looser buy-dip 1.4→1.15) each leaned ~+13 Elo sub-threshold vs v17. ONE coherent hypothesis: v17 leaves a small liquid-deployment edge on BOTH gates that crosses E=20 only when loosened together. Branched from v17 (reserve half in `valuation.ts`, buy-dip half in `claude.ts`). `v21/coupled.test.ts` pins both halves. | **EVEN vs v17 (base): 50.0% (891–891, 1782 decisive, confident EVEN, both LLRs −2.95).** BETTER vs v2 58.0%, v3 64.8%, v5 53.5%, v14 59.0%; Elo (v17=0) **v21 +3.2 ≈ v17 0**. No holdout — triage rejects (confident even). | **rejected** (win-neutral); base stays **v17**. The two +13 leans did **NOT compound** — combined they wash to dead even (+3.2), which means the individual leans were seed noise within E=20, not a real consistent edge. **The liquid-deployment axis is fully tapped out at v17** (reserve v9/v17/v18, buy-dip v20, hotels-vs-distress v19, coupling v21 — all explored). Methodology lesson: coupling two sub-threshold noise leans manufactures no signal. `v21/coupled.test.ts` pins the coupled loosening. |
| v22 | 2026-06-20 | **House-famine denial** (`versions/v22/valuation.ts` `desiredLevel`): the proven negative-sum SHAPE (v5) on a NEW channel — the 32-house bank. v17 only holds at 4-and-hold (vs hoteling, which frees 4 houses back to the bank) once houses are nearly gone (≤ `HOUSE_SCARCE` 6); v22 starts the famine-hold while the bank is merely DRAWING DOWN (≤ `HOUSE_RACE` 12) and a rival could use houses, foregoing its own hotel rent to keep houses locked away and win the race to starve rivals' development. Off the exhausted liquid-deployment axis (deploys LESS, not more). Branched from v17; isolated to `desiredLevel`. `v22/famine.test.ts` pins the race-zone hold and the full-bank/no-rival no-ops. | **EVEN vs v17 (base): 50.0% (907–906, 1813 decisive, confident EVEN, LLRs impr −2.94 / regr −3.06).** BETTER vs v2 57.9%, v3 57.4%, v5 55.0%, v14 52.5%; Elo (v17=0) **v22 +0.0 ≈ v17 0**. No holdout — triage rejects (confident even). | **rejected** (win-neutral); base stays **v17**. House-famine **washes — and the reason sharpens the meta-lesson.** It is **reciprocable**: both bots compete for the *same* 32-house bank symmetrically, and foregoing my hotel rent ≈ the denial I impose, so it cancels (exactly v3's symmetric-set-completion wash). v5's trade-to-deny wins precisely because it is **unreciprocable** — the denied rival isn't a party and can't deny me back. **Negative-sum transfers win share only when ASYMMETRIC**; a symmetric denial race nets to zero. `v22/famine.test.ts` pins the famine hold. |
| v23 | 2026-06-20 | **Unmortgage-eagerness — reclaim dead monopolies sooner** (`versions/v23/valuation.ts` `planBuild`): lead 2b. A mortgaged monopoly earns NOTHING (frozen rent, can't build), so reactivating it is an unusually high-value-per-dollar redeploy. v17 only reclaims when comfortably "flush" (cash > floor + `HOTEL_CUSHION` 600); v23 reclaims at a thinner cushion (floor + `RECLAIM_CUSHION` 200), deploying idle capital sooner to turn a frozen set's double-rent back on. The "deploy capital faster" direction v17 won on, but a DISTINCT gate (the unmortgage-reclaim) and a step-change in value, not the marginal nudges that washed. Branched from v17; isolated to planBuild's reclaim gate. `v23/reclaim.test.ts` pins the reclaim at 500 cash (v17 waits) and the no-op when genuinely thin. | **EVEN vs v17 (base): 50.6% (1509–1475, 2984 decisive, confident EVEN, LLRs impr −2.98 / regr −6.90).** BETTER vs v2 56.2%, v3 53.9%, v5 53.7%, v14 53.0%; Elo (v17=0) **v23 +1.7 ≈ v17 0**. No holdout — triage rejects (confident even). | **rejected** (win-neutral); base stays **v17**. Reclaiming dead monopolies sooner adds no net win share: v17's flush-gated reclaim already captures the value, and doing it earlier at a thinner cushion roughly trades the extra rent for the thinner buffer + 10% interest paid sooner. **A THIRD liquid-capital-deployment gate to wash at v17** (reserve, buy-dip, now unmortgage-reclaim) — even on a step-change-value redeploy. v17 is a sharp deployment optimum. `v23/reclaim.test.ts` pins the eager reclaim. |
| v24 | 2026-06-20 | **From-scratch monopoly acquisition** (`versions/v24/trades.ts` `proposeBestTrade`): the user's "property > cash" thesis — exploit opponents willing to sell, assemble a prize set the bot holds NONE of by buying its every lot off its split owners in one N-party deal ("pay them what they want, then build and crush them"). v17 only completes a set it already holds a STAKE in (`if (owned === 0) continue` — "buying a whole color from scratch isn't this engine's job"). v24 deletes that limit, gated to real prizes (`ACQUIRE_MIN_GAIN` 100, self-excluding pink/light-blue/brown whose thin ≈0.4×bonus net can't clear the bar) that keep the bot above its rent reserve (never a bare set it can't develop). Buying an INTACT monopoly off one owner is already -EV and self-rejects. Branched from champion v17; isolated to trade construction (valuation/dispatcher verbatim). `v24/acquire.test.ts` pins the grab, the cheap-set + intact-monopoly self-gates, and the liquidity gate. | **EVEN vs v17 (base): 49.9% (955–958, 1913 decisive, 15 draws, confident EVEN, LLR impr −3.34 / regr −3.00).** Elo (v17=0) **v24 −0.5 ≈ v17 0**; no regression. No holdout — triage rejects (confident even). | **rejected** (win-neutral); base stays **v17**. The grab is **POSITIVE-SUM, not the asymmetric transfer it looked like.** Each seller is paid its FAIR break-even (deeds + the 0.6×bonus rival-threat premium it prices for handing the bot a monopoly), so the set is bought at full value — the bot's booked +0.4×bonus is a fair trade, not a discount, and over many seeds both sides reach comparable developed positions. **Exactly v3/v4's lesson on a new instance: improving your OWN engine — complete sooner (v3), develop sooner (v4), now ACQUIRE MORE (v24) — washes even when the opponent can't do it**, because the gain is fairly priced and too small to convert. Taking a set "off the board" isn't a net transfer when you pay for it in full. **An acquisition transfers win share only if the property is UNDERPRICED** — a distressed seller below break-even (lead b), not a fair-price prize. Sharpens the user's "property > cash" thesis: true, but the *price* already captures the value, so paying it nets zero. `v24/acquire.test.ts` pins the grab. |
| v27 | 2026-06-20 | **Dark-blue set-weight bump — value-table lead (c), magnitude 2/2 (SMALLER)** (`versions/v27/valuation.ts` `GROUP_WEIGHT`): v26's leap to the published #2 (weight 0.73, bonus 548) leaned −11 Elo, hypothesized as over-valuing a LOW-traffic 2-lot set in the own-buy/liquidation channels. v27 tries a SMALLER, more conservative correction: weight 0.55→0.62, lifting dark-blue's `monopolyBonus` 413→465 — only to ≈#4, level with the other big sets (just above green 460, below yellow 480) — to nudge it out of v17's last-of-the-big-sets #5 WITHOUT leaping past them. Grounded in the tight published "desirability per roll" cluster (dark-blue 3.10 ≈ red 3.09 ≈ yellow 3.03). Branched from champion v17; one weight changes. `v27/group-weight.test.ts` pins bonus 465 + the flow-through. | **REJECTED — confident WORSE: 47.7% win share (1512–1655, 3167 decisive, 22 draws, improve-LLR −13.48, regr-LLR +2.99 CROSSED → confident regression).** Elo (v17=0) **v27 −15.7** < v17 0. No holdout (triage rejects). | **rejected** (regresses the champion); base stays **v17**. Confirms and SHARPENS v26: even a MODEST dark-blue over-valuation hurts — v27's smaller bump regressed MORE confidently (crossed the regression boundary where v26 only leaned). **The direction is unambiguous: raising dark-blue's weight is −EV at every magnitude tried (0.62 confident-worse, 0.73 slight-worse).** The published "#2 desirability" rank does NOT translate to win-accuracy here; v17's #5 (penalizing dark-blue's 4.8% landing rarity) is correct. **Lead (c) on dark-blue is a closed dead end** — the foundational value dial is well-tuned at v17's settings on its one researched discrepancy. `v27/group-weight.test.ts` pins it. |
| v26 | 2026-06-20 | **Dark-blue set-weight bump — value-table lead (c), magnitude 1/2** (`versions/v26/valuation.ts` `GROUP_WEIGHT`): the FIRST touch of the foundational set-VALUE dial since v1, single-variable. Web-researched grounding (monopolyland "desirability per roll", folding landing probability AND 3-house ROI) ranks dark-blue **#2** (3.10%/roll ≈ red 3.09%); v17's table ranked it **#5**. v26 RAISES dark-blue's weight 0.55→0.73, lifting its `monopolyBonus` 413→548 — just above red (544), landing it at the published #2. Touches every dark-blue decision (buy, auction bid cap, denial/threat pricing, liquidation). Branched from champion v17; only the one weight changes (other 7 verbatim). `v26/group-weight.test.ts` pins the new bonus, the unchanged sets, and the completion + denial-premium flow-through. | **REJECTED on triage — INCONCLUSIVE, leaning slightly NEGATIVE: 48.4% win share (1937–2063, 4000 decisive, 20 draws, improve-LLR −13.88 firmly NOT improving, regr-LLR +0.63 no confident regression).** Elo (v17=0) **v26 −10.9** < v17 0. No holdout (triage rejects on no-improvement). | **rejected** (does not improve vs base; leans slightly worse); base stays **v17**. Lead (c) magnitude 1 washes (slightly negative) — exactly the **positive-sum self-valuation** wash the handoff predicted (v3/v4/v24): raising my own valuation of dark-blue doesn't transfer win share, and here it leans −11 Elo because dark-blue's LOW LANDING TRAFFIC (4.8%, 2nd-worst) is real — over-valuing a rarely-hit set mildly mis-prioritizes buys/auctions/liquidation toward it vs higher-traffic sets the bot completes and earns from more often. The published "#2 desirability" folds in development the bot reaches less reliably for a 2-lot set; v17's #5 rank (penalizing the rarity) is at least as WIN-accurate. `v26/group-weight.test.ts` pins it. |
| v30 | 2026-06-21 | **Widen the distress GATE** (`versions/v30/valuation.ts` `DISTRESS_MARGIN`): v29 maxed the discount; the other distress knob is the GATE — WHEN it fires. v29 flags distress only when one deadly developed rent busts the seat outright (`liquidity < deadlyRent`). v30 adds `DISTRESS_MARGIN = 1.3`, widening it to "one hit from BROKE" (`liquidity < deadlyRent × 1.3`) — a seat that can barely cover one hit is still cornered (paying it leaves it broke for the next), so the proven discount should fire on more genuinely-distressed seats. A STRICT SUPERSET of v29's gate (pinned in `v30/distress.test.ts`: anything v29 flags v30 flags, plus a non-empty wider band). Branched from champion v29; one constant added. | **REJECTED on triage — EVEN vs v29 (base): 50.1% win share (988–983, 1971 decisive, 12 draws, confident EVEN, LLR impr −2.98 / regr −3.55).** Elo (v29=0) **v30 +0.9 ≈ v29 0**; no regression. No holdout (triage rejects on no-improvement). | **rejected** (win-neutral); champion stays **v29**. Widening the gate adds NO win share: v29's strict "one hit from BANKRUPT" gate already captures the value. The extra seats v30 flags ("one hit from BROKE") either RECOVER — so the cheap sale was an unnecessary leak that washes — or they cross into true distress anyway and get caught there. **The distress GATE is a sharp optimum at v29's strict setting**, exactly like v17's reserve and v29's discount ceiling: the desperation mechanism's two knobs (discount magnitude, gate strictness) are BOTH tuned. The remaining open follow-up on lead (b) is the distressed-DENIAL extension (Offer C off a distressed holdout), not the gate. `v30/distress.test.ts` pins the widened (superset) gate. |
| v29 | 2026-06-21 | **Push the desperation discount to MAXIMUM** (`versions/v29/valuation.ts`): v28's `DISTRESS_DISCOUNT` 0.75 WON, so per the loop probe the winning lever harder — 1.0, the maximal discount: a distressed seller prices NO rival-monopoly threat at all, selling its completer at its bare cash-equivalent break-even, so the buyer banks the WHOLE premium. The hypothesis: a seat one landing from bankruptcy gains nothing from guarding against arming a rival it may never outlive, so the deeper discount lets the bot buy MORE completers (deals that didn't clear at 0.75 now do) and cheaper. Branched from champion v28; ONE constant changes (0.75→1.0). `v29` inherits v28's `distress.test.ts` (the seller discount only widens). | **BETTER vs v28 (base) on BOTH streams, NO regressions.** Triage: BETTER 52.7% (1116–1003, 2119 decisive, +18.5 Elo). Holdout: **BETTER 52.6% (1154–1039, 2193 decisive, +18.2 Elo)** — train/holdout near-identical (+18.5/+18.2), strong evidence it's real not noise. Full-field (train): BETTER vs v28 52.7% AND the whole archive v2–v17, v19–v20, v22, v24–v27; EVEN vs v18/v21, INCONCLUSIVE vs v23 (none a regression). | **ACCEPTED — new loop champion.** The desperation discount had MORE to give past v28's 0.75: the maximal 1.0 extracts another ~+18 Elo, and unusually for a "push the parameter harder" probe it did NOT hit the v7/v10 wall — because a DEEPER discount is strictly MORE underpricing (the winning condition), not a different lever stretched thin. A distressed seat one landing from bust rationally takes every dollar, so pricing zero threat is correct, not reckless. **The discount optimum is at/above 1.0** — v30 should test whether it sits exactly at 1.0 (can't go higher — the threat floors at 0) or whether the GATE (`DEADLY_RENT`, the strictness) is the next lever. Base for the next version. Inherits v28's whole mechanism + v17/v14. |
| v28 | 2026-06-21 | **Desperation-pricing acquisition — lead (b), the TOP remaining lead** (`versions/v28/valuation.ts` + `trades.ts`): the ONE acquisition shape v24 didn't test and its result pointed straight at — an asymmetric, proposer-side, UNDERPRICED buy. ONE COUPLED hypothesis, bisectable. **SELLER half** (`valuation.ts` `isDistressed` + `distressThreatScale`, applied in `trades.ts` `rivalThreatCost`): a GENUINELY distressed seat — one deadly DEVELOPED rent (`≥ JAIL_DANGER_RENT 350`) it can't cover even after mortgaging out (`cash + mortgageableTotal < deadlyRent`) — discounts the rival-monopoly threat premium it normally holds out for by `DISTRESS_DISCOUNT 0.75`, valuing immediate cash above the future cost of arming a rival, so it accepts a sale below normal break-even. VOLUNTARY/pre-emptive (fires BEFORE the forced must-raise-cash path). **BUYER half** (Offer B's `sweetenForAll` automatically computes the discounted break-even): the bot buys a distressed rival's set-COMPLETER below fair price to finish its OWN near-monopoly — the bought lot is held + developed, never relocated, so it cannot hot-potato (v14/v25). The coupling is required (a v17 seller would just decline a below-fair offer → wash, v24's lesson) and bisectable (seller = `distressThreatScale`, buyer = the distress-aware `sweetenForAll`). Branched from champion v17; dispatcher verbatim. `v28/distress.test.ts` pins the distress gate (fires near-bankrupt, NOT comfortable, NOT on a bare board), the seller discount, and the buyer's underpriced construction + self-gate. | **BETTER vs v17 (base) on BOTH streams, NO regressions.** Triage: BETTER 55.8% (331–262, 593 decisive). Holdout: **BETTER 53.2% (772–679, 1451 decisive, +22.3 Elo)** on fresh seeds. Full-field (train): BETTER vs v17 55.8% AND vs the WHOLE archive v2–v16, v20, v22–v27; EVEN vs v18/v21, INCONCLUSIVE vs v19/v22 (none a regression). Elo (v17=0) **v28 +17.0 — TOP of the field** (> v21 +15.0 > v18 +13.3 > v17 0). | **ACCEPTED — new loop champion.** The first win since v17, and the FIRST acquisition win. Confirms the meta-lesson's positive prediction: an acquisition transfers win share **iff it is ASYMMETRIC AND UNDERPRICED** — the two conditions every prior win shared (v5 denial asymmetric, v17 deploys idle cash). v24's fair-price grab washed because the price captured the value; v28 buys CHEAP off a seat that rationally values liquidity above the asset, so the buyer banks the discount as a real transfer. The sim fired the mechanism every game (the "cheap off a cash-strapped owner" note recurs) and the bought completer DEVELOPS, never churns. Inherits v17's thin reserve + v14's phantom-denial fix. Base for the next version. `v28/distress.test.ts` pins the model. |
| v25 | 2026-06-20 | **Railroad / utility denial via trade** (`versions/v25/trades.ts`): lead (a) — extend the proven trade-to-deny shape (v5) past COLOR sets to a new ASSET CLASS, the 4-railroad set / utility pair, via `kindCompletionBonus` (the synergy analog of `monopolyBonus`: rail 3→4 = 200, util pair = 40). The PROACTIVE half (an Offer C buy of a rival's rail completer from a holdout) was prototyped, then DROPPED after a live `--log` check: it reproduces Finding 1's phantom-denial HOT-POTATO (Reading Railroad bounced bot→bot every turn). Scoped to the DEFENSIVE half only: `rivalThreatCost` now prices HANDING a rival their 4th railroad / 2nd utility, so the bot won't SELL a rail-set completer for face value (the leak v17 had — it looped color sets only). Branched from v17; Offer C left color-only. `v25/rail-threat.test.ts` pins the rail/util threat-decline and that no proactive rail denial is constructed. | **EVEN vs v17 (base): 50.1% (990–985, 1975 decisive, 11 draws, confident EVEN, LLR impr −2.98 / regr −3.56).** Elo (v17=0) **v25 +0.9 ≈ v17 0**; no regression. No holdout — triage rejects (confident even). | **rejected** (win-neutral); base stays **v17**. TWO findings. (1) **PROCESS — the proactive rail denial reproduces the phantom-denial hot-potato on a NEW asset class.** A trade-denial never TRULY blocks in a bot field — the new holder would re-sell the completer to the rival at threat-price — so it degenerates into churn wherever the config is STATIC and clears v14's acquirability gate. Brown was caught by v14 (rival's gain doesn't clear the extraction cost); railroads are not (gain ~400 > cost ~350) AND a rail split never resolves (no development/bankruptcy), so it bounces forever. v14 patched one mole; rails are the next — patching the heuristic is whack-a-mole. (2) **The DEFENSIVE threat-pricing WASHES** — being asked to sell a rival a rail/utility completer is rare, and rail denial is the SMALLEST lever anyway (you can't undo the 3 rails they already own; basis 200 vs orange's 560). **The asset-class extension of the proven denial shape transfers no win share** — v5's denial win is colors-specific (high traffic, all-or-nothing, resolving configs), not a general "deny any set" principle. `v25/rail-threat.test.ts` pins it. |

## Status & next step

**Two independent tracks — don't conflate them:**

- **The loop champion** — the latest validated `vX` (currently **v29**). The
  improvement loop advances this on its own, each version branching from the prior
  best. **No human greenlight is needed to bump versions** — that's just Claude Code
  continuing to make the bot stronger. (The code half of crowning a champion is the
  `CHAMPION_VERSION` pointer in `bots/roles.ts`; the doc half is the version-log row.)
- **The live/official bot** — the `claude` strategy in `registry.ts`, the one
  shipped in the game, picked by the UI, played by humans. It is a **pointer**
  (`bots/live.ts` → `LIVE_VERSION`) into the archive, changed **only** on a human
  **greenlight** ("ship vX into the game") — a separate, deliberate, rare
  decision, *not* a precondition for continuing the loop, and **orthogonal to the
  gauntlet floor**.

**As of 2026-06-21 (after the v28 → v29 run):** the loop champion is now **v29**
(desperation acquisition with the MAXIMAL distress discount), branched from **v28**
(the desperation-acquisition breakthrough) ← **v17** ← **v14** ← v5. After NINE straight
rejects (v19–v27), lead (b) broke through: **v28** introduced desperation-pricing
acquisition (buy a distressed rival's set-completer BELOW fair price to finish your own
monopoly — asymmetric + underpriced, the two conditions every prior win shared; BETTER vs
v17 train 55.8% / holdout 53.2% / +22.3 Elo), and **v29** then pushed its `DISTRESS_DISCOUNT`
0.75→1.0 for another ~+18 Elo (BETTER vs v28 train 52.7% / holdout 52.6%, near-identical
streams). TWO acquisition wins in a row on the same lead. The floor stays **v1**; the **live
bot is whatever `bots/live.ts` → `LIVE_VERSION` points to** (currently **v17** — v28/v29 are
a product call not yet greenlit).

**The v28 → v29 run (2026-06-21), lead (b) — desperation/underpriced acquisition — TWO CHAMPIONS:**

- **v29** push `DISTRESS_DISCOUNT` 0.75→1.0 (the maximal discount — a distressed seller prices
  NO rival threat, selling at bare break-even). **ACCEPTED — BETTER vs v28 train 52.7% (+18.5
  Elo) AND holdout 52.6% (+18.2 Elo), no regressions.** Unusually for "push the parameter
  harder," it did NOT hit the v7/v10 wall: a deeper discount is strictly MORE underpricing (the
  winning condition), not a different lever stretched thin. A seat one landing from bust
  rationally takes every dollar, so pricing zero threat is correct. The discount optimum sits
  at/above the 1.0 ceiling.

- **v28** couples a SELLER-side distress discount (a near-bankrupt seat — one deadly
  developed rent it can't cover even after mortgaging out — discounts the rival-threat
  premium 0.75, accepting a below-break-even sale, valuing liquidity NOW over arming a
  rival later) with a BUYER-side underpriced completion (Offer B's `sweetenForAll`
  automatically pays the discounted break-even to finish the buyer's OWN near-monopoly).
  **ACCEPTED — BETTER on train (55.8%) and holdout (53.2%, +22.3 Elo), top-of-field Elo
  +17.0, no regressions.** The coupling was REQUIRED (a v17 seller declines a below-fair
  offer → the v24 wash) and is bisectable. The bought completer is held + developed, so
  it never hot-potatoes (v14/v25) — verified in `--log` sims, where the mechanism fires
  every game. **This validates the meta-lesson's positive prediction precisely: an
  acquisition transfers win share iff ASYMMETRIC AND UNDERPRICED.** v24's fair-price grab
  washed because the price captured the value; v28 wins because the distressed seller
  rationally sells CHEAP, so the discount is a real proposer-side transfer.

**The v26–v27 run (2026-06-20), lead (c) — re-tune the set VALUE table, dark-blue — BOTH REJECTED, v17 holds:**

- **v26** dark-blue weight 0.55→0.73 (bonus 413→548, landing it at the web-researched #2,
  just above red) — **REJECTED (INCONCLUSIVE, leans negative, 48.4%, Elo −10.9)**, no confident
  regression. The positive-sum self-valuation wash the handoff predicted (v3/v4/v24), with a
  slight negative lean: dark-blue's LOW landing traffic (4.8%, 2nd-worst) makes over-valuing it
  mildly mis-prioritize own-buys/auctions/liquidation vs higher-traffic sets the bot completes
  and earns from more often.
- **v27** dark-blue weight 0.55→0.62 (bonus 413→465, only to ≈#4, a SMALLER bump) —
  **REJECTED (confident WORSE, 47.7%, Elo −15.7)**. Even a modest over-valuation hurts, MORE
  confidently than v26's leap (it crossed the regression boundary). **The direction is
  unambiguous: raising dark-blue's weight is −EV at every magnitude tried.** The published "#2
  desirability" rank does NOT translate to win-accuracy in this engine — v17's #5 (penalizing
  dark-blue's rarity) is correct. **Lead (c) on dark-blue is a closed dead end.**

**Net for v26–v27:** two rejects, no champion bump. The competitive-channel hope (out-bid the
field at auction for dark-blue, price its denial correctly) did NOT materialize — at both
magnitudes the own-buy/liquidation mis-prioritization swamped any auction/denial gain, leaving
the bot net worse. **The foundational set-value dial is well-tuned at v17 on its one researched
discrepancy.** This adds a sub-lesson to the positive-sum family: **self-valuation of a
LOW-TRAFFIC set is actively −EV (not merely neutral)** — over-weighting a rarely-landed set
steers limited cash toward it and away from the high-traffic sets that actually convert, so it
loses where a higher-traffic self-valuation would merely wash.

- **v25** railroad/utility denial via trade (extend v5's trade-to-deny to the rail set /
  utility pair) — **REJECTED (EVEN, 50.1%, Elo +0.9)**. The PROACTIVE half hot-potatoes
  (Finding 1 reborn: rail splits are static and clear v14's gate, so the completer bounces
  bot→bot — a trade-denial never truly blocks in a bot field). Scoped to the safe DEFENSIVE
  half (don't sell a rival their 4th rail cheap), which **washes** — rare to be asked, and
  rail denial is the smallest lever (you can't undo the 3 rails they own). **v5's denial win
  is colors-specific, not a general "deny any set" principle.**
- **v24** from-scratch monopoly acquisition (assemble a prize set you hold none of by
  buying its every lot off its split owners) — **REJECTED (EVEN, 49.9%, Elo −0.5)**. The
  grab is **positive-sum**: each seller is paid its FAIR break-even (deeds + the 0.6×bonus
  threat premium), so the set is bought at full value, not taken at a discount — exactly
  v3/v4's wash (improving your own engine washes even when the opponent can't), now on the
  ACQUISITION instance. **An acquisition transfers win share only if the property is
  UNDERPRICED (a distressed seller below break-even — lead b), never at fair price.**

The earlier **v12–v18 run:**

- **v12** RNG-seam / mixed-strategy (information) — REJECTED (regression). The field
  models VALUE, not behaviour, so unpredictability has no read to deny; deviating from
  the greedy argmax is a pure value leak. **Information/bluff axis CLOSED.**
- **v13** anti-kingmaker (standings-weighted acceptance) — REJECTED (regression).
- **v14** phantom-denial fix (gate Offer C on rival acquirability) — **EVEN, win-safe
  CORRECTNESS base** (adopted; fixes the live hot-potato bug, cuts churn; ready to ship).
- **v15** near-monopoly option value — REJECTED (regression).
- **v16** jail-as-haven sharpening — REJECTED (win-neutral).
- **v17** lower liquidity reserve (0.5→0.3, cap 500→300) — **ACCEPTED, new champion.**
- **v18** push the reserve lower still (→0.15) — REJECTED (win-neutral; brackets the
  optimum at ~v17's 0.3).

**The v19–v23 run (2026-06-20), building from champion v17 — ALL FIVE REJECTED, v17 holds:**

- **v19** endgame elimination pressure (max-rent development keyed off a rival on the
  ropes) — **REJECTED (regresses v17, 46.5%)**, though it BEATS the older field (v2–v14).
  A non-transitivity trap the SPRT caught. Forcing hotels below the flush threshold
  spends v17's deliberately-kept cushion into *illiquid* houses (sell back at half) — a
  worse aggression than v18's still-liquid thin reserve. A distressed rival busts from
  normal rents anyway; over-developing to finish them transfers no net win share. **The
  preferred "elimination pressure" lead, on the DEVELOPMENT channel, is a dead end** —
  v17 is at the deployment-aggression frontier (v18 neutral, v19 regress). Whether
  elimination pressure pays on the DENIAL/ACQUISITION channel (target a weakened rival's
  sets specifically) is still untried — but the development channel is closed.
- **v20** buy-aggression (looser DIP gate, 1.4→1.15 — dip below the reserve to buy
  clear-value land) — **REJECTED (win-neutral, inconclusive 52.0%, +13.5 Elo)**, no
  regression. The SECOND liquid-deployment lever to lean ~+13 Elo without crossing
  (after v18's +13.1). Two independent sub-threshold leans → looked like a real but small edge.
- **v21** couple v18's reserve cut + v20's DIP cut — **REJECTED (EVEN, +3.2 Elo)**. The two
  +13 leans did NOT compound; combined they wash to dead even, exposing the individual leans
  as seed noise. **The liquid-deployment axis is now fully tapped out at v17** — reserve
  (v9/v17/v18), buy-dip (v20), hotels-vs-distress (v19), coupling (v21) all explored. Pivot
  to a genuinely off-deployment, negative-sum axis (v22+).
- **v22** house-famine denial (hold at 4-and-hold, not hotel, while the bank draws down ≤12
  and rivals want houses — starve their development) — **REJECTED (EVEN, +0.0 Elo)**. Washes
  because it is **reciprocable**: both bots race for the same 32-house bank, and my foregone
  hotel rent ≈ the denial imposed, netting to zero (like v3's symmetric set-completion).
  **Sharpens the meta-lesson: negative-sum wins only when ASYMMETRIC/unreciprocable** (v5's
  denied rival isn't a party and can't deny back); a symmetric denial race nets to zero.
- **v23** unmortgage-eagerness (reclaim a dead/mortgaged monopoly at a thinner cushion,
  floor+200 vs v17's floor+600) — **REJECTED (EVEN, +1.7 Elo)**. Reclaiming frozen sets
  sooner adds no net win share: v17's flush-gated reclaim already captures the value, and
  doing it earlier trades the extra rent for the thinner buffer + 10% interest paid sooner.
  A THIRD liquid-capital-deployment gate to wash at v17 (reserve, buy-dip, unmortgage).

**Net for v19–v23:** five rejects, no champion bump — the methodology refusing to crown
noise, as the handoff predicted. **v17 + v5 + v14 is a sharp, validated optimum.** Three
sub-lessons added: (1) elimination pressure on the DEVELOPMENT channel REGRESSES (forcing
illiquid hotels below flush is worse than a liquid thin reserve — v19); (2) the
liquid-deployment axis is fully tapped (two +13 leans v18/v20 do NOT compound — v21 — and a
step-change redeploy still washes — v23); (3) negative-sum denial transfers win share only
when **ASYMMETRIC/unreciprocable** — a symmetric house-famine race nets to zero (v22), which
is *why* v5's trade-to-deny (the denied rival isn't a party) is special.

**The meta-lesson is now sharp and two-sided. AGGRESSION beats DEFENCE/POSSESSIVENESS.**
Every lever that makes the bot HOLD MORE / refuse / cower regresses — v9 (raise reserve),
v13 (anti-kingmaker refuse), v15 (hold near-monopolies), all acceptance-side. The bot's
plain value-maximising acceptance and a THIN reserve are right; v5's caution left win
share on the table (v17). The winning shapes are exactly two: **negative-sum proposer-side
denial** (v2, v5) and **deploying capital faster** (v17 — and note v4/v8 tempo washed only
because they *mortgaged* for tempo; v17 gets the same tempo for free by holding less idle
cash). Positive-sum self-improvement (v3, v4, **and v24's fair-price acquisition**) and
information (v12) wash; defence (v9/v13/v15) and over-pushing a denial parameter (v7/v10)
regress.

**Promotion status (product call — `bots/live.ts`):** **`LIVE_VERSION = v17`** (promoted
last session — carries v14's phantom-denial fix and is the strongest measured version).
No promotion pending; v19–v24 produced no champion to ship.

**Lead for the next session (from v17, after the v19–v27 sweep).** Both proven winning
shapes are at sharp local optima: capital deployment is tapped on EVERY gate (reserve
v9/v17/v18, buy-dip v20, coupling v21, unmortgage-reclaim v23, forced-hotels v19), the
denial lever is tapped on every PARAMETER (funding v6, scope v7, price v10, coupling v8,
target v11) AND a new ASSET CLASS (rail/util v25 — washes; v5's denial is colors-specific),
and now the **foundational set VALUE table is tapped on its one researched discrepancy**
(dark-blue, v26/v27 — both REJECTED, raising its weight is −EV at every magnitude). v22 taught
**negative-sum denial transfers win share only when ASYMMETRIC/unreciprocable**; **v24 added
the BUY-side mirror: a FAIR-PRICE acquisition is positive-sum and washes — an acquisition only
pays if UNDERPRICED**; **v26/v27 added: self-valuation of a LOW-TRAFFIC set is actively −EV,
not merely neutral** (over-weighting a rarely-landed set steers cash off the high-traffic sets
that convert). The surviving lead:

- **(b) Desperation-pricing acquisition — WON TWICE (v28, v29), now the CHAMPION's mechanism.**
  A near-bankrupt seat values immediate cash above an asset's `positionValue`, so it sells a
  building-free completer BELOW break-even; the bot buys it cheap to finish its own set. v28
  realized this as a coupled seller-discount + buyer-underprice and **WON**; v29 pushed the
  discount to its 1.0 ceiling and **WON AGAIN** (both BETTER on train + holdout, no regressions).
  This is now a PROVEN winning shape — the third after negative-sum denial (v5) and faster
  capital deployment (v17). BOTH of its knobs are now TAPPED: the DISCOUNT MAGNITUDE is CLOSED
  (v29 maxed it at 1.0; the threat floors at 0) and the GATE is CLOSED (v30 widened it 1.0→1.3×
  and washed — v29's strict "one hit from bankrupt" gate already captures the value; looser fires
  on seats that recover, a leak). **Corner (A) — a WHOLE-SET from-scratch grab off a distressed
  owner (v31) — is now CLOSED: -EV by construction.** The distress discount only erases the
  rival-THREAT premium, not the set's own `monopolyBonus`; on a whole-set buy that bonus transfers
  1:1, so the buyer's gain exactly cancels the seller's discounted break-even (v24's intact-monopoly
  wash, unchanged by distress). The asymmetry that won in Offer B — buy the LAST lot, bank the WHOLE
  bonus for one lot's price — has no analogue for a whole set; only discounting the bare set's bonus
  by the owner's cash (the rejected cash-scaled-monopoly-value idea) could make it clear. **The
  remaining open follow-ups on lead (b):** (i) a TWO-SHORT distress completion (does the discount
  make a normally-too-expensive two-short buy clear off a distressed seller? — note Offer B already
  reaches multi-lot completions, so this may already be captured); (ii) the distressed-DENIAL
  extension (Offer C cheaper off a distressed holdout), watching the hot-potato gate (v14/v25).
  Expect a sharp optimum (the mechanism's tuning knobs all were).

- **A fresh web-researched specific edge** — the obvious published discrepancy (dark-blue) is
  spent, so any new edge needs genuinely new grounding (a specific opening-buy or trade-timing
  heuristic from competitive-play sources), not a re-tune of an existing dial.

- **(c) Set VALUE table — CLOSED for dark-blue, NOT promising elsewhere.** The one researched
  discrepancy (dark-blue #2 published vs #5 ours) is settled: raising it is −EV (v26/v27). The
  rest of the table was VALIDATED by the research (orange top, brown bottom, light-blue/pink
  correctly low in absolute value). No other single-set discrepancy is known, and an 8-knob
  re-tune overfits (EVOLUTION is explicit). Do not re-walk dark-blue; only revisit the table if
  NEW research surfaces a different specific, single-set discrepancy.

Expect mostly rejects — the bot is a strong, sharp optimum. The v19–v27 runs added NINE
negative results; v28/v29 then broke through TWICE on lead (b) exactly where the meta-lesson
predicted (asymmetric AND underpriced), and v30 confirmed the desperation mechanism is now
tuned (both its knobs — discount magnitude v29, gate strictness v30 — are at sharp optima). The
one open follow-up is the distressed-DENIAL extension (Offer C off a distressed holdout); beyond
that, a fresh web-researched single-set/timing edge is the only untapped direction.

**Do NOT re-walk:** any denial PARAMETER (funding v6, scope v7, price v10, coupling v8,
target v11), **denial on rails/utilities** (v25 — proactive hot-potatoes, defensive washes;
v5's denial is colors-specific), **defensive liquidity/tempo/possessiveness** (v4, v8, v9,
v13, v15), **information/bluff** (v12), **jail** (v16), **pushing the reserve below ~0.3**
(v18), the **whole liquid-deployment axis** (buy-dip v20, coupling v21, unmortgage-reclaim
v23), **elimination pressure on the DEVELOPMENT channel** (forced hotels v19, regresses),
**symmetric/reciprocable denial** (house-famine v22, washes), **FAIR-PRICE acquisition /
buying a prize set at full value** (from-scratch grab v24, washes — positive-sum), **buying a
WHOLE bare monopoly off a DISTRESSED owner** (from-scratch distress grab v31 — -EV by
construction, self-rejects: the discount erases only the threat premium, not the bonus, which
transfers 1:1 on a whole-set buy; no Offer-B-style asymmetry), and
**WIDENING the distress GATE** (v30 `DISTRESS_MARGIN` 1.0→1.3 — washes; v29's strict "one hit
from bankrupt" gate already captures it, looser fires on recoverable seats), **pushing the
distress DISCOUNT past 1.0** (v29 maxed it; the threat floors at 0), and
**raising the DARK-BLUE set weight / `GROUP_WEIGHT` re-tune** (v26 0.73 leans −11 Elo, v27 0.62
confident-worse — raising it is −EV at every magnitude; the published "#2 desirability" rank
doesn't translate to win-accuracy because dark-blue's low landing traffic makes self-valuation
−EV; the rest of the value table was research-VALIDATED) — all logged dead ends.

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

**v18 — what was tried and what we learned (a logged negative result — brackets the optimum):**

1. **v18 isolated** in `bots/versions/v18/` (snapshot from the champion v17; only the
   three floor constants pushed further; `v18/floor.test.ts` pins the thinner reserve).
2. **The change** follows the loop's "push a winning lever" rule: v17 lowered the reserve
   and won, so v18 lowers it more (0.3→0.15, cap 300→200, base 120→80).
3. **The result brackets the liquidity optimum.** v18 is **win-neutral vs v17** (51.9%,
   ran to the 4000 cap, the improvement test leaning positive at LLR +2.01 but NOT
   crossing the +2.94 boundary, no regression). So the gain from cutting the reserve is
   real but SATURATES around v17's 0.3/$300 — pushing past it adds no confirmed win share.
   Combined with v9 (raised the reserve → regressed) and v17 (0.5→0.3 → won), the reserve
   axis is now bracketed: **too high loses, v5's moderate was too high, ~0.3 is the
   sweet spot, and lower than that is flat.** v18 *leans* a hair better (+13 Elo, beats
   the older field by more than v17 did), so the true optimum may be marginally below
   0.3 — but it's within the E=20 indifference band, exactly the 1–2% noise Decision 5
   refuses to chase. v17 stays champion.

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

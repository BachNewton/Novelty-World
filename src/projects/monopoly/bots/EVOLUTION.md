# Evolving the Claude Bot

A long-running, multi-session initiative: make the Monopoly Claude Bot as strong
as possible through an iterative loop, not a one-shot rewrite. This doc is the
durable home for the plan, the methodology, and the honest list of things that
can go wrong — so anyone (human or Claude) can pick it up cold.

Read `bots/CLAUDE.md` first for the bot's charter and current strategy. This doc
is about the *process* of improving it.

> **Label note (2026-06-21):** the Claude lineage's versions were renamed from the
> bare `vN` scheme to the namespaced `claude-vN` scheme, matching Jane (`jane-vN`)
> and Gemini (`gemini-vN`) so every label self-documents its family. Directories
> are now `versions/claude-vN/`, the registry keys and pointers are `claude-vN`, and
> the gauntlet floor is `claude-v1` / `claude-v2`. **The historical log entries below
> were left as originally written** (bare `v1`…`v35`) — they are an append-only
> record, and rewriting them would erase that history. Read a historical `vN` as
> today's `claude-vN`.

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
answer to a cycle: a pure strategy is always counterable, a mixed one isn't); (2) **the
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

## Paradigm experiments (2026-06-23): search lookahead + ES parameter optimization

By v38 the heuristic-tuning loop was, by its own honest assessment, **near-converged**:
38 Claude versions + jane/gemini/trade-v1 had swept every single-axis lever, and the
top of the ladder (claude-v36 / claude-v38 / jane-v2) sat in a tight **~10-Elo
non-transitive cluster** that no parameter nudge could confidently break. So this branch
(`monopoly-search-paradigm`) deliberately left tuning behind and tried the **two
paradigms the entire archive had never used** — a different *decision procedure* (search)
and a different *search method over the strategy space* (machine optimization of the
rule bot). Both are recorded; neither has crowned (yet); both produced sharp, durable
lessons and reusable infrastructure.

### `search-v1` — rollout policy improvement (the first non-greedy bot). RECORDED, not crowned.

Every prior bot is a **greedy 1-ply** value-maximizer. `search-v1` (lineage `search-v`,
paradigm-named) plays claude-v38 verbatim *except* at two high-leverage discrete decisions
(buy-decision, incoming trade votes), where it runs a **truncated-rollout search** —
Tesauro's TD-Gammon rollout policy improvement: enumerate ≤4 legal candidates (the base
policy's own move **always included**, so search can only match-or-beat it — the trade-v1
trap avoidance), score each by rolling the game forward with all seats on the base policy
(R=12 seeded samples × horizon=30), leaf = my `positionValue` **share** among active
players. All rollout RNG derives from `state.rngState` → determinism/replay intact.

- **Result (sim:versus):** BEATS base claude-v38 **55% train / 60% holdout**; BEATS
  champion claude-v36 **52.5%**; BEATS anchor claude-v2 **62.5%** — but **REGRESSES vs
  jane-v2 (45%)**. By the crown rule (no panel regression — the jane-v3 RPS-cycle guard)
  → **NOT crowned**: it is a **non-transitive counter**, beating the line it forked from
  while losing to a different strong strategy.
- **The load-bearing finding — horizon, i.e. leaf quality, is everything.** At horizon
  10/20 the position-share leaf is **myopic**: buying lowers my share *now* (cash out,
  opponents keep earning) while the rent payoff lands a board-lap later, so short rollouts
  systematically flip buys into declines (27/29 overrides at horizon 10) — the exact passive
  cash-hoarding the project fights. The win only appears at ~30 turns, when the payoff
  registers inside the horizon. **Diagnosis: the ceiling is leaf-evaluation quality, not
  search depth** — short rollouts of a hand-tuned base mostly re-derive that base's own
  preferences. This is the strongest argument yet for a **learned value** at the leaf
  (the `RL-DESIGN.md` direction): it would remove the myopia without paying for 30-turn
  rollouts.
- **Building block:** `versions/search-v1/search.ts` — a pure, deterministic, self-contained
  truncated-rollout engine (`rolloutOnce` / `scoreState` / `searchBest` / `sampleRngState`),
  composing with the existing `candidates.ts`/`applyCandidate` primitives. Reusable for any
  rollout/MCTS bot. (commit `a16a8a0`.)

### `search-v2` / `search-v3` — rollout search on the TUNED champion (claude-v45). RECORDED, washed.

search-v1 proved truncated-rollout policy improvement sound but wrapped the **untuned** claude-v38
(~119 Elo). This answers the "search-on-opt-v4" open lead by putting the **same** machinery on the
ES-tuned champion **claude-v45** as both the rollout policy and the `positionValue` leaf (self-
contained: a verbatim copy of v45's factory + a `makeParamValue` export for the tuned leaf). The
base policy's greedy move is always a candidate (`searchBest` tie-break), so it can only match-or-beat.

- **`search-v2`** (search buy + trade-vote, like search-v1): **≈ EVEN — 50.2% @ 448 decisive**, but
  the SPRT was **stopped early** (a wash drifts toward the 4000 cap, so it was cut for CPU, not run
  to a boundary). The champion's ES-tuned reactive decisions are already near-optimal; policy-
  improvement search just reproduces them.
- **`search-v3`** (+ auction + jail, i.e. the full monte-carlo-v1 decision set — the *deferred-payoff*
  decisions a 1-ply eval is structurally blind to): a **600-capped** SPRT *completed*
  **INCONCLUSIVE — 51.8% (+12.7 Elo, 311–289)**; the uncapped SPRT was **not** taken to a ±20 boundary.
  A faint nudge from auction/jail, well within noise — not a confident win.
- **Caveat (honesty):** neither result is a boundary-definitive SPRT — both are partial/capped
  samples (the v3 600-game run finished, v2's was cut early). The wash conclusion is well-supported by
  both point estimates but a clean uncapped SPRT was never run; given the point estimates it's low
  priority to confirm.
- **The finding:** rollout *policy improvement* diminishes as the base approaches optimality — it
  beat the untuned v38/jane-v3 precisely because they were improvable; on the tuned champion there is
  little left for shallow search to fix. Breaking the plateau needs *deeper* search (learned value at
  the leaf — the `RL-DESIGN.md` direction) or a *different* lever, not search over the same decisions.
- **Both `RATING_EXCLUDED`** (cost: full v3 SPRT was ~48 min / 600 games on 14 workers). Determinism
  intact (rollouts seed from `state.rngState`); 10 determinism/legality tests each.
- **Iteration affordance** (`search-v3/search.ts`): `MONO_ROLLOUT_SAMPLES` / `MONO_ROLLOUT_HORIZON`
  env knobs (default to the production 12/30) for fast screening — cutting *samples* is unbiased
  variance reduction (~14× faster reproduced the verdict); cutting *horizon* biases the leaf (myopia),
  so keep it near 30. (commit `98610b2`.)

### `opt-v1` — ES-optimized parameter vector (ML tooling boosting the rule bot). RECORDED, not crowned.

The whole archive was hand-tuned **one or two constants at a time**, SPRT-gating each
step — manual hill-climbing that structurally cannot explore *combinatorial* parameter
interactions. `opt-v1` (lineage `opt-v`, paradigm-named for the **method**) applied a
**Separable Natural Evolution Strategy (SNES)** to claude-v38's **full 15-parameter
vector jointly** (`optimize/` harness: `params.ts`/`snes.ts`/`fitness.ts`/`worker.ts`/
`bot.ts`; a `param-fidelity.test.ts` pins that the default vector reproduces claude-v38
byte-for-byte, so the ES optimizes the *real* bot). Fitness = win-share vs the anchor
panel. The frozen `opt-v1` reuses the *exact* parameterized factory bound to the winning
vector (fidelity by construction, not hand-transcription).

- **The winning vector is genuinely non-obvious** — it moved against the hand-tuned grain:
  **denyFactor 0.15→0.39** (the whole recent trend was to *lower* denial!), bonusScale
  16489→20956, railSynergyScale 1.0→1.41, jailDangerRent 350→150, raiseWorthMult 1.25→1.99,
  survivalFactor 1.5→0.81, houseScarce 6→3 — a coordinated combination no one-axis sweep
  would reach. **75.3% aggregate train win-share vs the panel** (baseline 58%).
- **Crown gate (both streams): REJECT — but instructively.** opt-v1 is **EVEN vs the base
  claude-v36** (49.7% train / 49.6% holdout) → fails "improve vs base." YET it has the
  **highest panel Elo on both streams (Champion)** and — unlike search-v1 — **regresses
  against NO panel member**, tying-or-beating *every* one including jane-v2 (52.5% train /
  51.1% holdout). It crushes the weak members (v2 72–77%, v5 68–80%, v17 72–75%, v35 62–66%).
- **The lesson — fitness must be crown-aligned.** The 75% aggregate was **inflated by the
  easy wins**; the marginal battle vs the two strongest (v36, jane-v2) is a wash. Optimizing
  *aggregate* win-share spent the ES's pressure on members it already beat, not on the hard
  matchup the crown actually requires. (commit `dd51935`; fidelity via factory reuse.)

### `opt-v2` — crown-aligned **maximin** ES. **NEW CROWNED CHAMPION (crown + substrate).**

The direct fix for opt-v1's misalignment: optimize the **minimum per-member win-share**
(`--fitness maximin`, commit `a616616`), measured in the **same 2v2 pairing shape as the
crown gauntlet**, so the ES maximizes its *worst* matchup — forced to fight v36/jane-v2
instead of padding against the weak members. It worked, decisively.

- **Crown gate (`--base claude-v36 --panel`), BOTH streams: ✅ ACCEPT.** opt-v2 is SPRT
  **BETTER vs every panel member on both streams, with NO regressions** — including the base
  claude-v36 (**65.6% train / 59.6% holdout**) and jane-v2 (**68.2% / 66.7%**), the exact bot
  that capped search-v1 and that opt-v1 could only tie. Panel Elo (claude-v36 = 0):
  **opt-v2 +103 train / +89 holdout** — far clear of the field.
- **Out-of-panel generalization (50 seeds each, opponents NOT in the optimization panel):**
  opt-v2 BEATS all of them — claude-v38 54%, jane-v4 54%, jane-v3 64%, claude-v30 80%,
  claude-v21 74%, claude-v29 80%. **Zero losses anywhere in the archive.** This is the
  signature of *general* strength, NOT a non-transitive counter (which would win some / lose
  others, like jane-v3). It is a real, defensible champion.
- **Honest margin caveat:** opt-v2 was optimized vs the panel and the panel-graph Elo
  (+89–103) **overstates** its edge over the strongest few — vs the toughest non-panel bots
  (claude-v38, jane-v4) the true edge is ~**54% ≈ +28 Elo**, real but modest. It dominates the
  mid-field and *beats* the top; the +100 is panel-inflated. The rigorous verdict is the
  two-stream SPRT crown gate, which is clean.
- **What it discovered — joint optimization found what one-axis tuning structurally couldn't:
  a coherent HYPER-AGGRESSIVE profile across many axes at once.** denial UP (0.15→0.408),
  voluntary reserve very thin (floorRentFraction 0.3→0.126), trades accepted on a tiny cushion
  (acceptMargin 30→5), never hoard houses — always hotel (houseScarce 6→0), distressed-cash
  weighted heavily (survivalFactor 1.5→2.556), cash deployed hard (raise/dip mults up). The
  archive's entire arc was *"aggression beats defense"* (v17's thinner reserve, etc.); opt-v2
  pushes aggression **further than any hand-tuned version dared, on five-plus axes
  simultaneously** — precisely the combinatorial region a one-or-two-constant SPRT walk cannot
  reach. **This is the headline result of the branch: the ES-as-mutation-operator, given a
  crown-aligned (maximin) fitness, broke the heuristic frontier the hand-tuned loop had
  declared converged.** (commit `d285df4`; faithful factory reuse like opt-v1.)

### Meta-read and the open frontier

Three things this branch established. (1) **Search genuinely beats greedy** — search-v1 over
claude-v36 (52.5%) is a real, first-of-its-kind signal; its ceiling is leaf-evaluation quality
(the horizon finding), pointing at a learned value. (2) **The hand-tuned frontier was NOT a hard
cap** — it only looked converged because the search method (manual one-axis SPRT) couldn't see
multi-axis combinations; a crown-aligned ES walked straight past it. (3) **Fitness alignment is
everything** — opt-v1 (aggregate) only tied the champion; opt-v2 (maximin, = the crown metric)
crushed it. The same vector space, a better objective.

**How the maximin loop actually ran (2026-06-23):** opt-v2 (robust crown) → opt-v3 (re-run with
opt-v2 in the panel: SPRT-beat opt-v2 but **counter-overfit**, losing to the omitted jane-v4 →
recorded, not crowned) → **add jane-v4 to the panel** → **opt-v4** (beats opt-v2 AND jane-v4,
NO out-of-panel regressions → ROBUST crown, supersedes opt-v2). Lesson proven: **panel-completion
+ the out-of-panel check converts the overfit-counter trap into a robust gain.** BUT the top is now
a **non-transitive CLUSTER** (opt-v2/opt-v3/opt-v4 + jane-v4, all within ~12 Elo, cycling): the Elo
ladder nominally ranks the latest *counter* (opt-v3) #1, while the *crown* (no-regression) correctly
holds opt-v4. Further maximin rounds will likely keep cycling inside this cluster rather than
dominate it, so **the next real gain is STRUCTURAL, not another parameter round.**

Open structural leads from here:
- **search-on-opt-v4:** put search-v1's rollout improvement on top of the opt-v4 base — combine
  lookahead's edge with opt-v4's robustness. (Measurement is slow; rollout bot.) **ANSWERED — WASHED
  (search-v2/v3, see below): search on the tuned champion does not beat it.** Not the way out.
- **Expanded parameter space:** the ES only optimized claude-v38's 15 existing constants. The
  optimizer has since been **widened to 28 dimensions** (commit `70b4888`: 8 per-color
  `MONOPOLY_BONUS` multipliers + 3 rail-synergy values + `distressSafeRatio` + `spreadFloor`,
  all fidelity-preserved) — a richer basin the maximin loop can climb. **Not yet run.**

### In-flight handoff (2026-06-23) — two experiments queued, neither baked

The durable pickup state, so a fresh session can resume from the repo alone (the loop's rule:
state lives here, not in a pasted blob).

**(A) `opt-v5` — a harvested 15-param maximin winner, NOT yet baked or validated.** Re-run of the
maximin ES against the **9-member panel** (claude-v2/v5/v17/v35, jane-v2, claude-v36, opt-v2, jane-v4,
**opt-v4**). Train maximin **54.5%** (baseline claude-v38 35.5%) — its worst matchup over the 9 panel
members, *including opt-v4*, is >50% on the train seeds, so it is a genuine **candidate to beat the
champion opt-v4** (same pattern by which opt-v4 beat opt-v2). The exact winning vector (SNES, maximin,
9-panel, seed 1):
```
denyFactor 0.37993327623361783, bonusScale 18467.037936993464, railSynergyScale 1.2285592260282767,
utilPairBonus 16.29118711197981, baseFloor 7.008983216778028, floorRentFraction 0.1,
floorCap 161.54101792608975, hotelCushion 344.2221252625536, houseScarce 2.0115417088378957,
jailDangerRent 150, acceptMargin 5, survivalFactor 1.6007327817476908,
liquidityRiskGain 258.5361030857855, dipWorthMult 1.2653800365373533, raiseWorthMult 1.9729047015060546
```
**To finish opt-v5:** (1) bake — `cp -r versions/opt-v2 versions/opt-v5`, rewrite `index.ts`
(`OPT_V5_PARAMS` = the vector above, `optV5Bot`, header), adapt `policy.test.ts`'s pinned vector,
register in `versions/index.ts`. (It is a **15-param** vector, so opt-v2's copied `bot.ts` factory is
the right one — no 28-param work needed.) (2) `npm run typecheck` + `lint` + the new `policy.test.ts`.
(3) crown gate: `npm run sim:gauntlet -- opt-v5 --base opt-v4 --panel` on **both** streams (add
`--prefix holdout`). (4) **MANDATORY out-of-panel check** (this is what caught opt-v3):
`npm run sim:versus -- opt-v5 <jane-v3 | claude-v38 | claude-v30>` — must NOT regress. (5) If BETTER
vs base on both streams AND no regressions **panel AND out-of-panel** → robust champion (run
`sim:ratings`, add opt-v5 to `RATING_PANEL`, push); else record as recorded-not-crowned (a counter).

**(B) The 28-param wide run — harness ready (`70b4888`), NOT started.** Launch:
`npm run sim:optimize -- --pop 36 --gens 30 --games 990 --fitness maximin --workers 14 --seed 1`
(~3–6 h; the space is bigger, hence the larger pop/gens). **Baking caveat:** a 28-param winner
**cannot** bake from opt-v2's 15-param `bot.ts` — copy the **current** `optimize/bot.ts` (28-param
factory) into the new snapshot dir and bind the 28-vector to it, then the same crown-gate +
out-of-panel discipline as above. Note: opt-v5 and a wide run both write `optimize/best-vector.json`,
so **run them one at a time** (or in separate worktrees).
- **Out-of-distribution robustness:** opt-v2 is optimized vs THIS panel; a future check is its
  strength vs a held-out *opponent* set and vs humans, to confirm the hyper-aggressive profile
  isn't exploiting a shared bot blind spot. (It generalized across the archive, which is
  encouraging, but the whole archive shares lineage.)

### claude-v41 crowned; claude-v42/v43 substrate-swap REJECTED — trade pricing and the base vector are COUPLED (2026-06-23)

**claude-v41 (CROWNED).** Kyle's seller-side trade thesis (bots/CLAUDE.md Refinement #3),
on the v39 substrate (opt-v4 vector + restored `denialPositionCost`): decouple
`rivalThreatFactor` from `denyFactor` → **0.4**, and add a **0.5 `deployabilityDiscount`** on
incoming set-handover cash. Crown gate `--base opt-v4 --panel`, both streams: SPRT **BETTER vs
opt-v4 (55.7% train / 62.4% holdout) and every panel member, zero regressions** → crowned and
added to `RATING_PANEL`. NOTE it sits ~4 Elo **below** opt-v4 on the panel-graph ladder (197.2 vs
201.4) yet beats it head-to-head — the panel-graph Elo systematically ranks the trade-priced
(robust, less raw-aggressive) bots **below** their bare opt bases. **"Champion ≠ top Elo" is
structural here**, not an accident.

**claude-v42 / claude-v43 (RECORDED, REJECTED).** The goal was a version that is BOTH crown AND
top Elo (v41 is crown but #3-ish on the ladder, under the opt cluster). Since v41's trade logic is
*parameterized over the opt factory*, the cheap shot was to keep the trade logic and **swap the
base vector** to a higher-Elo opt vector: `claude-v42` = **opt-v3** (the ladder leader) + v41's
trade params; `claude-v43` = **opt-v2** (the robust ex-crown) + v41's trade params (trade logic
byte-identical to v41, so the only delta is the base vector). **Both REGRESSED vs their own base:**
v42 opt-v3 201.7 → **187.0 (−15)**; v43 opt-v2 195.6 → **146.2 (−49)**. Neither beats champion v41.

**The lesson — the trade pricing and the base vector are COUPLED, not independent.** The trade
params (`rivalThreatFactor 0.4`, `deployabilityDiscount 0.5`) were tuned *on the opt-v4 vector*, and
`denialPositionCost ∝ denyFactor`. So a different base shifts the balance: opt-v2's high
`denyFactor` (0.408) makes its holder-side denial price large; stacking `rivalThreatFactor 0.4` on
top drives **severe over-refusal** (the trade-deadlock failure mode the games-must-be-decisive rule
guards) → the −49 crash. **You cannot hand-swap the base under fixed trade params — they must be
CO-tuned.** This kills the "swap within the opt cluster" shortcut and points squarely at a
**combined-space maximin ES**: co-optimize the opt vector AND the two trade params jointly, with
maximin fitness (= the crown metric) and jane-v4 + claude-v41 in the panel — the only path likely
to land champion + top Elo *together*. (v42/v43 archived + rated per the record-everything-legal
rule; not crowned.)

**search-v1 → `RATING_EXCLUDED` (cost, NOT strength).** Rating the new versions surfaced that
search-v1 (the lone rollout/lookahead bot) dominated the run's wall-clock: a single
`search-v1 × claude-v41` panel pairing ran **>6 min** (truncated rollouts, R×horizon per decision)
while every greedy pairing is seconds. It is **not weak** (~119 Elo, mid-ladder — a real, legal
paradigm); excluded purely for cost, exactly like `claude-v1`/`gemini-v1` (Decisions 8–9). Sole
`search` version, so the `search` family deprecates in the lobby. **Reversal condition:** re-include
`search-v` the moment a future version posts a competitive Elo — then the lookahead paradigm earns
its rating cost.

### claude-v44 CROWNED — the combined-space ES delivers champion AND top-Elo together (2026-06-24)

**The split it closes.** claude-v41 was the crown but sat ~4 Elo *below* opt-v4 on the panel-graph
ladder — "champion ≠ top Elo," which the v41 section above called *structural*: the panel-graph Elo
systematically ranks the trade-priced (robust, less raw-aggressive) bots below their bare opt bases.
The v42/v43 rejection proved you can't fix this by hand-swapping a higher-Elo base under fixed trade
params — **the trade pricing and the base vector are COUPLED** (`denialPositionCost ∝ denyFactor`; the
v41 levers were tuned on opt-v4), so they crashed. That pointed squarely at a **combined-space maximin
ES**: co-optimize the base vector AND the trade levers *jointly*.

**The run.** A 31-dim SNES — claude-v38's 28-param base PLUS the three v41 seller-side trade levers
(`rivalThreatFactor`, `holderDenialFrac`, `deployabilityDiscount`) — by **maximin** win-share (= the
crown metric) vs the 10-member `RATING_PANEL`. `--pop 36 --gens 30 --games 990 --fitness maximin
--seed 1`, ~7h local. Baseline claude-v38 (default vector) maximin **35.35%** (worst matchup opt-v2);
the winner lifted the **worst** panel matchup to **69.70%** — every panel member ≥69.7%, the two
former weak spots (opt-v2, claude-v41) now its floor. The ES turned the trade levers **ON**
(`holderDenialFrac` 0→0.46, `deployabilityDiscount` 0→0.60, `rivalThreatFactor` decoupled to 0.34)
and re-shaped the set-value ranking (light-blue/orange multipliers up to ~2.6/2.2, red/yellow/
dark-blue/green floored to 0.3), with a higher `survivalFactor` (1.5→2.92) and `raiseWorthMult`
(1.25→1.88). This is the joint solution the coupled space only the ES could reach.

**Crown gate — both streams, clean sweep.** `--base claude-v41 --panel`: SPRT **BETTER vs claude-v41
(73.1% train / 67.7% holdout) AND every one of the 10 panel members, ZERO regressions** on both seed
streams → ✅ ACCEPT. **Out-of-panel anti-overfit** (the guard that caught opt-v3): beats every strong
non-panel bot — **opt-v3 76.0%, claude-v39 74.0%, claude-v38 74.0%, jane-v3 68.0%**, no regression.

**Champion AND top Elo — split resolved.** Unlike v41, claude-v44 also **tops the panel-graph ladder:
249.3 Elo, +51 over the field** (opt-v4 198.2, claude-v41 194.5, opt-v2 192.2, opt-v3 190.1) — it is
both the SPRT crown and the lobby's Strongest/default. It is *not* a turn-cap staller: across its 51
ratings pairings (20,400 games) only 15 cap-draws total (0.07%). Crowned and added to `RATING_PANEL`
(claude-v41 kept as a strong distinct vector and the crown base v44 was measured against). Snapshot
`versions/claude-v44/` binds the 31-param factory (a verbatim copy of `optimize/bot.ts`) to the
winning vector; the factory's no-op-default fidelity to claude-v38 stays pinned by
`optimize/param-fidelity.test.ts`, so no per-version test was added (new vector, not new behavior).

### claude-v45 — lockstep restored; the win-share ES is blind to net-zero churn (2026-06-27)

**The find.** A real human-vs-bot game (`npm run game:review 2b6y55`, four seats, three on
claude-v44) stalled at the turn cap on an **infinite trade loop**: the browns were split — the
one-short rival held Baltic, a NON-rival held Mediterranean — and two non-rivals swapped Mediterranean
back and forth every turn T60–T72 at a "fair" ~$73, net zero, forever. This is the **held-completer
hot-potato** the v35 `denialPositionCost` work eliminated, recurring in the *crowned champion*.

**Root cause — the ES broke an invariant.** The fix prices a held completer at its **option value**
(the premium the one-short rival pays when it caves, ~$254 median; `bots/CLAUDE.md` "Denial is a premium
game"). In the factory that is `holderDenialFrac`, and the only correct value is **1.0** (holder charges
the full premium a buyer books → no non-rival hop clears). The combined-space ES that produced
claude-v44 was free to move it and settled it at **0.461** — re-opening a clearing band of width
`(1 − 0.461) × premium` on every hop. **Why the ES did it and the gauntlet missed it:** the churn is
**net-zero cash on the weakest set**, so it costs **~0 win share** — invisible to a win-share fitness,
yet it inflates self-play **trade volume ~65%** (3839→1324 trades / 200 mirror games — every spurious
trade is a draft build + double `positionValue` eval the simulator pays for) and stalls real games in
front of a human. The win-share optimizer and the product goal **diverged**, and the optimizer
optimized the metric.

**claude-v45 = claude-v44's vector with `holderDenialFrac` pinned back to 1.0, every other dim
verbatim** (the smallest coherent change — one constant, zero added code). Ring provably dead:
`versions/claude-v45/policy.test.ts` reproduces the 2b6y55 brown geometry and asserts the 0.461 vector
ARMS the deny-buy while the 1.0 vector REFUSES it.

**Crown gate — `--base claude-v44 --panel`, both streams:** BETTER vs **every** panel member on
**both** streams (train 58–74%, holdout 63–78%), **zero regressions**. Vs claude-v44 itself: SPRT
**BETTER on train (52.8%)** but **EVEN on holdout (49.7%, 2338 decisive)** — exactly as theory predicts
for a *net-zero exchange between near-identical bots*. So it is **NOT a confident SPRT crown** (needs
BETTER on both streams). **Promoted anyway**, as a deliberate **equal-strength + defect-removal** call:
identical strength, identical complexity, minus a degenerate behavior — the bloat/ratchet guard (which
exists to stop *added complexity* riding a within-noise gain) does not apply when nothing is added.

**Panel + ladder — and why claude-v44 is now DEPRECATED.** First regen (cache-minimized: only v45's ~11
panel columns simulate, 11 played / 506 cached) put the ladder at **claude-v44 +245.6, claude-v45
+242.1** — a 3.5-Elo noise tie (SE ~17), but the lobby default takes the *strict* top, so v44 (the
defective twin) would stay the player-facing bot and the fix would never ship. Since v45 strictly
supersedes v44 (same strength, minus the hot-potato), claude-v44 was **moved to `RATING_EXCLUDED` and
removed from `RATING_PANEL`** → unrated, renders deprecated, and **claude-v45 is now the Strongest /
`DEFAULT_BOT_VERSION`**. This was **cache-free**: *removing* a panel member only ever uses cached
pairings (the 10-member round-robin + every vs-panel column are subsets of what's already computed).
v45 was deliberately **NOT added** to the panel — that would force ~30 new vs-v45 pairings for ~zero new
signal (it's a v44 twin); it joins the panel at the next `--full` recalibration. The panel ceiling is
now claude-v41 (~190). claude-v44 stays in `VERSIONS`, fully runnable, fielded explicitly via `--field`
(reversal: drop it from `RATING_EXCLUDED` and restore it to `RATING_PANEL`).

**Two durable lessons.** (1) **A win-share optimizer is blind to net-zero degenerate behavior** —
constrain the levers that govern it (pin `holderDenialFrac` out of the search) rather than hoping
fitness penalizes the ring; it can't. (2) **Real human games are the canary the gauntlet structurally
lacks** — this is the third hot-potato regression (`514j43`, `16043u`, now `2b6y55`) that passed SPRT
but showed in live play. A ring/termination check (trade-hops-per-lot, or the 65% trade-volume signal)
belongs in the crown gate alongside SPRT.

## Post-v45 overnight campaign (2026-06-28)

An autonomous session to push past claude-v45. The proven win lever is **parameter
optimization** (maximin ES), so the headline experiment re-optimizes the factory under
the *corrected* `holderDenialFrac=1.0` constraint; alongside it, two cheap leads were
explored and the optimizer + factory were extended. Results recorded below as they land.

### Optimizer + factory infrastructure (committed)

- **Warm-start / pin / extra-panel** (`optimize-cli.ts`): `--init <file.json>` seeds the
  SNES mean from a saved champion vector (refine around a known-good point instead of
  re-discovering it cold); `--pin key=value` FREEZES a parameter out of the search;
  `--extra-panel a,b` appends opponents to the *fitness* panel (not `RATING_PANEL`).
  Also a SIGINT/SIGTERM handler that terminates the worker pool, so an interrupted
  optimize run no longer orphans a core-pegging node process.
- **Why `--pin holderDenialFrac=1.0` matters.** claude-v45 is claude-v44's vector with
  ONE lever force-corrected (`holderDenialFrac` 0.461 → 1.0) — but v44's *other 30 dims*
  were ES-tuned with `holderDenialFrac` FREE. So v45's vector is **not ES-optimal under
  the lockstep invariant**. Pinning `holderDenialFrac=1.0` and re-optimizing operationalizes
  the v45 lesson ("constrain the levers that govern the ring rather than hoping fitness
  will") and asks whether a genuinely better, ring-free vector exists near the champion.
- **Risk-aware / play-to-standing dims** (`optimize/params.ts` + `bot.ts`, 31 → 33 dims,
  NO-OP default so claude-v38 fidelity holds — `param-fidelity.test.ts` green). Two levers
  scale a posture knob by a STANDING RATIO `s = myPV / mean(opponent PV)`:
  `standingFloorGain` (a leader banks a fatter reserve, a laggard deploys) and
  `standingAuctionGain` (a laggard gambles past book in auctions). This is the
  risk-NEUTRAL→risk-aware lever (positionValue ignores variance; a pro modulates it by
  rank). NOT the rejected cash-scaled monopoly value (it scales posture, never a set's
  worth). Ready for a combined-space campaign; may wash vs the risk-neutral monoculture.

### Search-as-oracle (idea #4) — WASHED / negative finding

Ran 8 `search-v3 ×4` self-play games (`MONO_ROLLOUT_SAMPLES=8`) and categorized every
"Rollout search overrides greedy" line (41 overrides), looking for a SYSTEMATIC place
v45's greedy is wrong that could be baked into a cheap rule. There isn't one:

- **Jail (10 overrides): "leave more" (9 leave vs 1 stay)** — search keeps overriding
  v45's *stay* with pay-$50/card. But this points **opposite** to what the crown-winning
  ES deliberately chose: `jailDangerRent` sits at its bound FLOOR (150) in the v44/v45
  vector, i.e. *maximal* jail-staying. The ES (measured by real win-share vs the field)
  and the rollout (position-share over a 30-turn horizon) disagree, and the rollout is
  the one that produced search-v3's INCONCLUSIVE wash. The "leave" signal is the
  documented position-share **horizon myopia** (short rollouts undervalue avoided rent),
  not a real correction. (Note `jailDangerRent` is a tunable the running ES is free to
  raise — so even the scalar version is already inside the ES's reach.)
- **Trades (4 overrides): "decline more" (4/4)** — same myopia: a 30-turn position-share
  leaf undervalues giving cash/assets now for a delayed monopoly payoff (the exact effect
  search-v1 documented for buys). v45's trade acceptance was heavily tuned (v41/v44/v45);
  4 myopic declines are not evidence against it.
- **Auctions / buys (~27 overrides): MIXED noise** — both "pass" AND "bid", "decline" AND
  "raise to buy", no direction. Consistent with search-v3's faint +12.7 Elo wash.

**Verdict:** the oracle surfaces no trustworthy cheap rule; its only directional signals
contradict deliberate, measured-stronger choices and are explained by position-share
myopia. This corroborates the search-v2/v3 wash from a *per-decision* angle (not just
aggregate win-share). No version built. Lesson: a myopic-leaf rollout is a poor oracle
for correcting an already-tuned greedy policy — exactly where its leaf is weakest.

### Campaign A — warm-start maximin ES, `holderDenialFrac` pinned (in progress)

`--init claude-v45 --pin holderDenialFrac=1.0 --extra-panel claude-v45 --fitness maximin
--pop 24 --gens 14 --games 1100 --seed 7`. The fitness panel is `RATING_PANEL` + the
champion claude-v45, so the **maximin floor is the v45 matchup the crown actually
requires** (the baseline warm-start vector's worst matchup is exactly the v45 mirror at
52%). The ES must lift that floor above the mirror — i.e. genuinely beat v45 while
regressing against no panel member, which is the crown condition. _Result: TBD._

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

## Version log

The running record of bot versions and how each fared against the field — **both
the accepted champions and the rejected attempts** (a hypothesis that didn't beat
its predecessor is logged with status `rejected` so it isn't re-walked). v1 = the
bot as of this doc.

| Version | Date | Hypothesis / change | Result vs. field | Status |
|---------|------|---------------------|------------------|--------|
| claude-v41 | 2026-06-23 | **Seller-side trade pricing — Refinement #3 (b)+(c)** (`versions/claude-v41/`, PR #1): the claude-v39 substrate (opt-v4 vector + restored `denialPositionCost`) plus Kyle's thesis "don't gift a monopoly for spendable-on-nothing cash." Two changes: **(b)** decouple `rivalThreatFactor` from `denyFactor` and set it to **0.4** (was pinned to ~0.317), so the bot prices its OWN harm in handing a rival a set nearer to what the rival gains; **(c)** a **`deployabilityDiscount` (0.5)** on incoming cash in a set-handover trade — a safe seat with no outlet values that cash below face. PR also shipped `claude-v40` (same idea at `rivalThreatFactor=0.6`, the author's failed intermediate — too aggressive, refuses balanced trades). Re-measured from current `main` (PR was NOT stale this time — merge-base = HEAD). | **CROWN GATE `--base opt-v4 --panel`, BOTH streams: ✅ ACCEPT.** SPRT BETTER vs base opt-v4 (55.7% train / 62.4% holdout) AND every panel member — claude-v2 65.7/67.5, claude-v5 72.0/76.7, claude-v17 71.7/74.8, claude-v35 67.7/70.3, jane-v2 55.4/55.0, claude-v36 54.8/52.7, opt-v2 54.4/53.5, jane-v4 53.9/56.0 — **9/9 BETTER, ZERO regressions on both streams.** Ladder Elo **+194.1** (top of the Claude family). PR's own claim REPRODUCED exactly. | **ACCEPTED — NEW CROWNED CHAMPION (crown + substrate, supersedes opt-v4).** First crown that addresses the *root* of the hot-potato (bots too willing to SELL completers) rather than the symptom (denial pricing the buy/hold side). NON-TRANSITIVITY NOTE: claude-v41 sits **#4 on the panel-graph Elo ladder** (behind opt-v3 +210.7 / opt-v4 +204.2 / opt-v2 +201.1) despite BEATING opt-v4 (56%) and opt-v2 (59%) HEAD-TO-HEAD — the opt trio crush the low floor slightly harder, so the global least-squares fit can't fully credit v41's direct edge (~6-Elo panel-fit noise). The crown is the head-to-head SPRT vs the field, NOT the global Elo rank — so it's the champion but NOT the lobby's Strongest/default (opt-v3 still tops the ladder). Added to RATING_PANEL. claude-v40 RECORDED at +125.5 (mid-pack — confirms 0.6 over-aggression). |
| claude-v39 | 2026-06-23 | **Restore the holder-side denial price on the opt base** (`versions/claude-v39/`): the opt-v4 champion factory + `denialPositionCost` (the v35 symmetric-pricing fix the v36→opt line dropped), opt-v4 vector unchanged — ONE logical change. Motivated by real human-vs-bot games `514j43` + `16043u`, where two opt/claude bots hot-potatoed one completer 18–24× (the strong-set ring the `rivalCanAcquire` phantom gate doesn't catch) while the human just developed and won. | **Ring collapses** — one lot's hops 15–99 → 1–6 in the accumulator config (pinned in `policy.test.ts`). Gauntlet `--base opt-v4 --panel`: **EVEN vs opt-v4 (50.1%, ~2k games)**, **BETTER vs all 8 other panel members** (57–68%), **zero regressions**. Confirmed EVEN across 3 seed streams (50/52/54%). | **RECORDED, not crowned** — EVEN vs base (a clean non-regression, not a strict win), so a player-default-eligible ladder peer of the opt trio, not a crown. Value: removes a human-exploitable degenerate behavior at no measured cost; the clean substrate for Refinement-target #3 (seller-side trade pricing). NOTE: the deny-knob is NOT the Bot-2 lever — sweeping `denyFactor` down regressed (42–45% vs opt-v4), up plateaued then deadlocked; see Refinement-target #3 for the decoupled seller-side direction. |
| opt-v4 | 2026-06-23 | **Maximin ES vs the COMPLETED 8-panel** (`versions/opt-v4/`): the opt-v3 fix in action — add jane-v4 (the bot opt-v3 counter-overfit against) to the panel, so the maximin search must beat opt-v2 AND jane-v4. A distinct robust vector (denial 0.317, hotelCushion 300→0, bonusScale 16.4k→22k). | **CROWN GATE vs base opt-v2, BOTH STREAMS: ✅ ACCEPT.** SPRT BETTER vs opt-v2 (57.1% train / 59.3% holdout), vs jane-v4 (58.1/57.7%), and vs every panel member; NO regressions. **Out-of-panel: NO regressions either** (jane-v3 56%, claude-v38 52%, claude-v30 80%, claude-v21 70%) — unlike opt-v3, it holds EVERYWHERE. | **ACCEPTED — NEW ROBUST CROWNED CHAMPION (crown + substrate, supersedes opt-v2).** Validates the methodology end-to-end: COMPLETING the panel (adding the counter's nemesis jane-v4) turned opt-v3's overfit-counter trap into a genuine robust improvement. The maximin loop + panel-completion + out-of-panel check is productively self-improving. Added to RATING_PANEL. |
| opt-v3 | 2026-06-23 | **Maximin ES re-run with opt-v2 IN the panel** (`versions/opt-v3/`): the apparent "self-improving loop" step — add the champion opt-v2 to the panel so the maximin search must beat it. Found a DISTINCT aggressive vector (denial 0.29 vs opt-v2's 0.41, monopoly weight bonusScale 16.4k→24.8k, floorCap 300→100). | **Crown gate vs base opt-v2 (panel): SPRT BETTER both streams (55.9% train / 55.2% holdout vs opt-v2), no PANEL regressions, +12 panel-Elo. BUT the out-of-panel check REGRESSES vs jane-v4 (38%)** — jane-v4 is NOT in the panel. | **RECORDED, NOT crowned; opt-v2 stays champion.** The jane-v3 RPS-cycle trap, now at the OPTIMIZATION layer: maximin against an INCOMPLETE panel overfits into a non-transitive COUNTER that loses to the omitted strong bot. The `--panel` crown gate alone CAN'T catch it (jane-v4 isn't a member); the **out-of-panel sim:versus check is what caught it — run it on every ES candidate.** Fix for opt-v4: **add jane-v4 (+ other strong non-panel bots) to the optimization panel.** opt-v2's robustness (it beat jane-v4 54%, zero out-of-panel losses) is exactly what opt-v3 sacrificed. |
| opt-v2 | 2026-06-23 | **Crown-aligned MAXIMIN ES** (`versions/opt-v2/`, lineage `opt-v`): re-run the SNES joint optimization of claude-v38's 15-param vector with fitness = the MINIMUM per-member win-share vs the panel (same 2v2 shape as the crown gauntlet), fixing opt-v1's aggregate-fitness misalignment. Hyper-aggressive multi-axis winner: denial 0.15→0.408, reserve fraction 0.3→0.126, acceptMargin 30→5, houseScarce 6→0 (always-hotel), survivalFactor 1.5→2.56. | **CROWN GATE BOTH STREAMS: ✅ ACCEPT.** SPRT BETTER vs base claude-v36 (train 65.6% / holdout 59.6%) AND every panel member incl jane-v2 (68/67%), NO regressions. Out-of-panel: beats claude-v38/jane-v4/v30/v21/v29 (54–80%, ZERO losses in the archive). Panel Elo **+103/+89 over v36** (panel-inflated; honest edge vs the strongest ~+28). Ladder **#1 at 206**. | **ACCEPTED — NEW CROWNED CHAMPION (crown + substrate).** First crown of the branch; broke the "converged" hand-tuned frontier via a multi-axis combo one-axis SPRT tuning structurally couldn't reach. Added to RATING_PANEL. |
| opt-v1 | 2026-06-23 | **ES joint param-optimization, AGGREGATE fitness** (`versions/opt-v1/`): SNES over claude-v38's 15-param vector, fitness = win-share vs the anchor panel — the first "ML-tooling boosts the rule bot" version. Non-obvious winner (denial UP 0.15→0.387, against the hand-tuned trend). Faithful factory reuse (bound vector). | **Crown gate BOTH streams: REJECT.** EVEN vs base claude-v36 (49.7/49.6%) but highest panel Elo + NO regressions (ties/beats every member incl jane-v2). 75% train fitness inflated by crushing the WEAK members. Ladder #2 at 168. | **RECORDED, not crowned.** Lesson: aggregate fitness is misaligned with the crown (pads easy wins) → motivated opt-v2's maximin. |
| search-v1 | 2026-06-23 | **Rollout policy improvement** (`versions/search-v1/`, lineage `search-v`): the FIRST non-greedy bot — truncated-rollout search (TD-Gammon style) over claude-v38 at the buy + trade-vote decisions; the champion's own move is ALWAYS a candidate (safety, so search can only match-or-beat greedy). Horizon=30 (load-bearing). | **Beats base v38 55%/60%, champion v36 52.5%, anchor 62.5% — but REGRESSES vs jane-v2 (45%).** Ladder #6 at 108 (Bradley-Terry correctly discounts the jane-v2 loss). | **RECORDED, not crowned** — a non-transitive counter (the jane-v3 pattern). Lesson: lookahead beats greedy, but leaf-eval QUALITY (horizon-sensitive myopia) is the ceiling → points at a learned value. Building block: `search.ts` rollout engine. |
| jane-v3 | 2026-06-22 | **DENY_FACTOR 0.3 → 0.0625, SURVIVAL_FACTOR 1.5 → 2.0** (PR #7, `versions/jane-v3/`): a two-constant fork of `jane-v2` chasing the "sweep DENY below claude-v36's 0.15" lead — push denial near zero. Self-contained graft onto current `main` (PR branched from stale `324bd2c`); legality clean (deterministic, no cross-version imports). Diff vs jane-v2 is exactly the two constants. | **RECORDED on the ladder at rank 4/39** (Elo 95.8 full-RR / 109.5 panel — below champion claude-v36 132.7, and 3rd in the Jane family behind jane-v2 and jane-v4). **Crown gate `--panel` (anchor-panel field), BOTH streams: REJECT.** BETTER vs base claude-v36 (train 54.2% / +29.2 Elo, holdout 59.3% / +65.2 Elo) and vs claude-v2/v5/v17/v35, but **WORSE vs jane-v2** (train 39.9%, holdout 39.7%); field champion = jane-v2. The PR's own (stale, single-opponent) claim of +28.6/+66.8 vs claude-v36 REPRODUCED — but it only ever measured vs claude-v36. | **RECORDED, NOT CROWNED.** A non-transitive COUNTER to claude-v36, not a global improvement: jane-v3 ▷ claude-v36 ▷ jane-v2 ▷ jane-v3 is an RPS cycle (see "Non-transitivity & the crown"). Champion/substrate stays **claude-v36**. Archived building block: sub-0.15 denial as a known claude-v36 counter / seed for a future **mixed-denial** bot. This PR is what motivated the crown-gate-vs-field fix (panel field) and the anchor-panel rating refactor. |
| claude-v36 | 2026-06-21 | **DENY_FACTOR 0.3 → 0.15 — denial STILL over-weighted** (`versions/claude-v36/valuation.ts`): branched from the cross-lineage champion **jane-v2** (substrate per "Two bests" — borrowing across lineages is free; the FIRST Claude-label version on the Jane base, since the Claude line's own v35 sits behind jane-v2). jane-v2's single biggest discovery was halving the denial knob 0.6→0.3 (+71 Elo vs v29: "wasting resources blocking opponents"); it then moved to the reserve/cushion axes and **never swept DENY below 0.3** (no record in the repo). DENY 0.6→0.3 is the STEEPEST single-parameter gradient in the whole log, so the optimum may sit lower. This is the direct, gauntlet-actionable lesson from the real 4-player game vs humans (`npm run game:review -- 2h0y0y`): a Claude bot (Rebecca) mortgaged THREE lots to deny-buy Boardwalk, left itself no liquidity buffer, and that over-leverage killed it (finished last). Halving again (0.3→0.15) mirrors jane's own 0.6→0.3 step; the bot still books a real (thinner) premium for a rival's last open lot — v5 proved denial has genuine positive value, so this sharpens self-focus without abandoning it. Single variable; everything else jane-v2 verbatim. | **BETTER vs jane-v2 (base) on BOTH streams, NO regressions:** train 58.9% (205–143, 348 decisive, 0 draws, +62.6 Elo), holdout 60.6% (172–112, 284 decisive, 0 draws, +74.5 Elo) — near-identical streams (real, not noise). Targeted field (train) BETTER vs ALL: claude-v5 (heavy-denial 0.6) 61.6%, claude-v35 53.6%, jane-v4 54.9%, gemini-v1 82.9%; Elo (jane-v2=0) **claude-v36 +27.7 — top of field**, no regressions. | **ACCEPTED — NEW CROSS-LINEAGE CHAMPION (crown + substrate).** Confirms denial was over-weighted even at jane-v2's 0.3: another step down transfers win share with NO regression against the denial-heavy claude-v5 (in fact BETTER, 61.6%) — there was no non-transitive denial-sensitivity trap. The first Claude-lineage champion since the line adopted the Jane base; the game's "denial over-investment is fatal" lesson is the one that the gauntlet rewards (its develop-faster / keep-a-buffer lessons map onto the already-rejected v4/v9/v19 — the "eval blind spot": those matter vs HUMANS but wash vs the bot field). Base for the next version. The DENY optimum is now somewhere **≤0.15** — a future version should sweep lower and bracket it (as v18 did the reserve). |
| v31 | 2026-06-21 | **From-scratch DISTRESS grab — corner (A)** (`versions/v31/trades.ts` `proposeBestTrade` Offer E): extend the proven distress-discount lever to a whole-set buy. v29 buys a distressed rival's COMPLETER for a set the bot is one short of; v31 opens a from-scratch grab — when a GENUINELY DISTRESSED opponent owns a WHOLE, building-free monopoly of a color the bot holds NONE of, buy the entire set at the distress-discounted price and take it off the board. v24 proved a FAIR-PRICE from-scratch grab washes (positive-sum); the new `isDistressed` gate was meant to make it UNDERPRICED (the winning condition). Held + developed, never relocated (a complete monopoly has no third party to bounce to). Gated by `worthAcquiring` (real prize ≥ 100, stays above the rent reserve). Branched from champion v29; isolated to Offer E. `v31/acquire.test.ts` pins the structural finding (below). | **REJECTED on triage — EVEN vs v29 (base): 49.4% win share (1540–1578, 3118 decisive, 27 draws, confident EVEN, LLR impr −7.35 / regr −2.98).** Elo (v29=0) **v31 −4.2 ≈ v29 0**; no regression. No holdout (triage rejects on no-improvement). | **rejected** (win-neutral); champion stays **v29**. **Offer E is -EV by CONSTRUCTION and self-rejects — it never fires positively, so v31 plays identically to v29.** The proof (pinned in `acquire.test.ts`): the distress discount only erases the seller's rival-THREAT premium (the cost of arming the buyer); it does NOT discount the set's own `monopolyBonus`. When the buyer takes a WHOLE monopoly that bonus transfers ~1:1 — the seller loses exactly what the buyer gains — so the buyer's gain never clears the seller's discounted break-even plus the accept margin (measured: buyer gain +1120 vs seller discounted loss −1120 → net −30 after the $30 margin). **The asymmetry that made v29's Offer B win has no analogue here:** Offer B buys the LAST lot and banks the WHOLE bonus for one lot's price; a whole-set buy carries the bonus proportionally in every lot, so it is a fair (washing) transfer even at maximal distress — exactly v24's "intact-monopoly buy is -EV and self-rejects" lesson, and distress doesn't change it because the only thing it discounts (the threat premium) is precisely what cancels the buyer's gain. The ONLY way to make it clear would be to discount the bare set's own `monopolyBonus` by the owner's cash — the **cash-scaled-monopoly-value** idea that `bots/CLAUDE.md` explicitly considered and rejected. **Corner (A) is a closed dead end.** `v31/acquire.test.ts` pins the -EV self-reject. |
| v33 | 2026-06-21 | **STRONG-set hot-potato — marginal-denial price gate** (`versions/v33/trades.ts`): a CORRECTNESS attempt for a live-game bug (Finding 2). A 4-player online game (a cash-rich HUMAN one dark-blue short, Boardwalk at a bot holdout) showed v14's gate closes only the WEAK-set ring: for a strong set + liquid rival, `rivalCanAcquire` PASSES, so each bot re-books the DENY premium and the completer hot-potatoes bot→bot until the rival buys in. v33 added a second, destination-side gate: fire only if the rival could acquire from the holder but NOT from ME after the buy (i.e. my buy actually makes it unreachable). Branched from champion v29; isolated to Offer C. `v33/phantom-denial.test.ts` pins the dark-blue repro + the distressed-holder denial that survives. | **REJECTED — WORSE vs v29: 47.5% (1198–1322, 2520 decisive, confident REGRESSION, −15.1 Elo).** Also WORSE vs v17 (47.0%). | **rejected** (regression). The gate keyed on the RIVAL'S WEALTH, so it deleted not just churn hops but the whole class of rich-rival denials — and the proactive strong-set denial carries real win share. First data point of the load-bearing-churn finding (see v35). `v33` archived. |
| v34 | 2026-06-21 | **STRONG-set hot-potato — temporal anti-churn cooldown** (`versions/v34/trades.ts` `tradedWithin` + `DENY_COOLDOWN_TURNS`): after v33, attack only the REPETITION, not the denial — a completer traded within K turns is off-limits for a fresh denial buy (first denial fires, re-hops don't). Branched from champion v29; isolated to Offer C. K-swept {3,8,24}. `v34/cooldown.test.ts` pins the suppression + that completions/first-denials are untouched. | **REJECTED — WORSE vs v29: 47.7% (1493–1635, 3128 decisive, −15.8 Elo), IDENTICAL across all K** (rings are tight, ≤3-turn hops, so even K=3 catches them all). | **rejected** (regression). Confirmed v33's lesson by a second, independent mechanism: removing the ring costs ~15 Elo regardless of method. Triggered the diagnostic (below). `v34` archived (also recommended-against as live: same churn-kill as v35 but at −15 Elo). |
| — | 2026-06-21 | **DIAGNOSTIC — what the hot-potato actually IS** (instrumented 120 v29 self-play games, `bots/_ring.ts` throwaway): per lot, traced denial trades + whether the one-short rival eventually acquired the completer and at what price. | **The ring is a PREMIUM-EXTRACTION war of attrition, not a denial.** 86% of rings end with the rival CAVING — buying the completer and completing the set anyway — paying a **median $254 premium** over book to whoever holds it at cash-out. The hops are net-zero; only the FINAL holder banks the premium. So the bots rotate the lot to compete for the cash-out position. | **finding.** Removing the ring loses Elo in MIXED play (v33/v34) because an abstaining bot PAYS the premium as the rival but never COLLECTS it as a holder — a Nash/attrition asymmetry. But it's collectively pointless (net-zero, no monopolies prevented), so a UNIFORM no-ring field is a wash. The fix is to stop the rotation WITHOUT leaving the premium game → v35. |
| v35 | 2026-06-21 | **Hot-potato fix — denial-position OPTION VALUE** (`versions/v35/trades.ts` `denialPositionCost`, folded into `evaluateTrade`): the diagnostic's prescription. The ring spins because pricing is ASYMMETRIC — a BUYER books the full `DENY_FACTOR` premium (`acquisitionValue`) but a HOLDER values its held completer at only printed price, so every hop clears at break-even (free to churn). v35 makes it SYMMETRIC: handing a held completer to anyone BUT the one-short rival forfeits the premium the holder is positioned to extract, so the holder charges that premium → no hop clears → the completer STAYS PUT and its holder collects the rival's payout directly (same cash-out, zero rotation). Unlike v33/v34 the bot stays IN the premium game (collects as well as pays), so no attrition drain. Selling TO the rival = the cash-out (priced by `rivalThreatCost`, no double-count); distress-scaled so a near-bust holder still sheds it cheap (protective grab preserved). Branched from champion v29; isolated to `evaluateTrade`. `v35/denial-position.test.ts` pins the symmetric pricing, the cash-out exemption, the distress exemption, and that completions are untouched. | **EVEN vs v29 (base) on BOTH streams, NO regressions: train 50.6% (1563–1526, 3089 decisive, +4.2 Elo); holdout 50.7% (1837–1784, 3621 decisive, +5.1 Elo).** Ring diagnostic vs v29: longest single-lot ring **21→3 hops**, ring-games **33/120→2/120**, total denial trades **242→55 (−77%)**, fully decisive 40/40. | **WIN-SAFE CORRECTNESS BASE → SHIPPED LIVE → CROWNED CHAMPION + BASE FOR NEXT VERSION** (`LIVE_VERSION = v35`; `CHAMPION_VERSION = v29→v35`). The first hot-potato fix that is win-NEUTRAL: it kills the value-less rotation at no win cost because it removes the *waste* (the rotation) while keeping the *mechanism* (the premium cash-out). The v14 precedent on a new finding. **Promoted to champion on a QUALITY TIEBREAK AT PARITY, not a strictly-better result** — EVEN with v29 on both streams (+4–5 Elo within noise), so the crown breaks toward the version WITHOUT the degenerate ring, keeping the carried-forward base AND the lobby Champion bug-free. A deliberate, documented deviation from "crown only on BETTER" (rationale at `roles.ts` `CHAMPION_VERSION`); justified because the parity is two-stream-confirmed and the displaced behavior is a genuine defect. Confirms the load-bearing-churn diagnosis: the value was the premium game, not the hops. `v35/denial-position.test.ts` pins it. |
| v32 | 2026-06-21 | **Mortgage-to-fund a DISTRESS COMPLETION — roadmap #2's open sweetener half** (`versions/v32/trades.ts` `distressCompletionNeedingCash` + `policy.ts` `distressRaisePlan`): the ONE genuinely-open corner the Batch-3 audit surfaced. v29 returns NULL on a +EV distress-discounted completion it can't fund in CASH but COULD fund by mortgaging an idle back-burner lot (`sweetenForAll` bails when `myCash < total`). v32 detects that case — HARD-GATED to a genuinely distressed seller (the fleeting, asymmetric, UNDERPRICED v28/v29 opportunity), a completion that is +EV-for-me AND accepted-by-every-seller once funded, blocked SOLELY by cash and within `cash + mortgageableTotal` reach — and pre-raises the shortfall. **FEASIBILITY: in-machinery, no engine change** — the trade flow has no in-trade raise phase (unlike the buy path's `raising-cash`), so the funding is CROSS-TURN: at pre-roll the policy arms a mortgage-only `manage` (`planRaiseByMortgage`, least-essential lots first, monopolies protected), then on a LATER turn Offer B proposes the now-cash-fundable completion. SELF-LIMITS to one raise: once mortgaged, cash covers the sweetener so the detector returns null (no re-arm loop / interest-bleed spiral). NOT a general mortgage-to-fund (that is v4's washed plain tempo). Branched from champion v29; isolated to the detector + the two pre-roll/managing arms. `v32/mortgage-fund.test.ts` pins the detector + all four self-gates + the cross-turn arm. | **REJECTED on triage — EVEN vs v29 (base): 49.6% win share (1204–1222, 2426 decisive, 14 draws, confident EVEN, LLR impr −5.05 / regr −2.98).** Elo (v29=0) **v32 −2.6 ≈ v29 0**; no regression. No holdout (triage rejects on no-improvement). | **rejected** (win-neutral); champion stays **v29**. The mechanism is CORRECT and fires cleanly — verified in `--log` self-play (the "Mortgaging idle land to raise cash for a cheap X completer" note appears in ~8/13 sampled seeds, usually once, and in EVERY seed it fired it was immediately followed by the actual completion; raises ≤ completions in all seeds → **no interest-bleed misfires**). But it adds NO win share, for the v4/v6 reason the handoff flagged might apply: pre-mortgaging only pulls a few distress completions a turn or two EARLIER — cash regenerates via GO/rent within a turn or two, so Offer B reaches most of these completions on its own once cash arrives, and the funding-reach extension just trades the leverage cost (10% interest + the idle mortgaged lot) for the small tempo of completing sooner (**leverage cost ≈ tempo gain — exactly v4's washed plain-tempo result, now confirmed on the distress channel**). The distress DISCOUNT is the win (v28/v29, the underpriced transfer); the funding-REACH to grab a few more/sooner is a wash, mirroring **v6** (denial funding-reach washed identically — "the cash-fundable opportunities already capture the value; in-kind/mortgage funding adds reach but no win share"). **Roadmap #2's sweetener half is now CLOSED** (build half closed by v4, sweetener half by v32 — both washed). `v32/mortgage-fund.test.ts` pins the gate. |
| v1 | 2026-06-19 | Baseline (current `claude`) | — | champion |
| v2 | 2026-06-19 | **Price the rival-monopoly threat instead of vetoing it** (`versions/v2/trades.ts`): handing a rival a new monopoly costs the seller `DENY_FACTOR`×bonus, folded into their valuation, so "cash for the completer" clears when the cash outweighs it. | **v2 win share 69.8%** of decisive games (139–60) over 240 fresh held-out seeds, two independent families (74.0% / 66.0%), z≈5.6 vs the 50% null. Cap rate 40%→~17%; 4×v2 resolves 16/16 previously-deadlocked seeds. | **loop champion** (current best; not yet the live bot) |
| v3 | 2026-06-19 | **N-way / multi-short trade construction** (`versions/v3/trades.ts`): generalize the search from "exactly one lot short, 2-way" to "any number short, N-way" — buy EVERY missing lot of a near-monopoly in one N-party deal — **plus the coupled fix that makes it viable:** price a new monopoly as ONE rival-threat premium *apportioned* across its contributors (`rivalThreatCost`), so a buyer assembling from two holdouts isn't charged the denial premium twice for one set (reduces to v2's full premium for a single seller). | **Eliminates the cap entirely: 0.0% draws in both held-out families** (v2 still caps ~17–26%); trades executed ~93→~800/run. **But win-neutral vs v2: 49.2% win share** over 240 fresh seeds (v3eval 46.7% [56–64], v3eval2 51.7% [62–58]), z≈−0.26 — does **not** clear the >50% bar. The residual deadlock was costing *draws, not losses*, so breaking it splits former draws ~50/50 instead of winning them. | **rejected** as champion (win-neutral); champion stays **v2**. N-way+apportionment archived in `versions/v3/` as a proven, reusable building block. **Later shipped LIVE** (`LIVE_VERSION = v3`) as the more engaging substrate, and used as the **base** for v4 — a win-safe branch point even though it didn't beat v2. |
| v4 | 2026-06-20 | **Tempo via mortgage-funded development** (`versions/v4/valuation.ts`, `planBuild`): when cash above the liquidity floor can't reach a prize set's desired level, mortgage idle, **non-monopoly** back-burner lots to fund the build a level *sooner* — turning idle equity into rent pressure ahead of rivals. Gated to real sets (`TEMPO_PRIZE_BONUS`, excludes brown) and real builds (`TEMPO_MIN_LEVEL = 3`); never cannibalizes a monopoly; the funded commit still clears the **same** liquidity floor (it redeploys idle capital, it does *not* lower the reserve). First version measured on the Session-A gauntlet. | **Win-neutral vs v3: 50.1% (1006–1000), confident EVEN over 2006 decisive (train).** No regressions: beats **v2 53.6%** (638–552) and **v1 67.9%** (106–50); Elo **v4 +149.3 ≈ v3 +147.4** (within noise), v2 +127.7, v1 0. Does **not** clear the improve-vs-base bar. | **rejected** as champion (win-neutral); base/substrate stays **v3**. Snapshot kept in `versions/v4/` as a win-safe building block (a tempo knob to pair with an asymmetry lever later); `v4/build.test.ts` pins the mechanism. |
| v8 | 2026-06-20 | **Denial + tempo (coupled)** (`versions/v8/`): the marquee synergy the v4 building block was kept for. Carry v5's trade-to-deny engine VERBATIM (`v8/trades.ts`) and fold v4's mortgage-funded TEMPO `planBuild` back in (`v8/valuation.ts`) — so after denying a rival their set, the bot mortgages idle non-monopoly back-burner lots to out-develop the field with the freed leverage. ONE coupled hypothesis: denial alone (v5) won and tempo alone (v4) was win-neutral, but together they compound — deny, then press the advantage faster than rivals recover. Dispatcher verbatim; both changes live in the called modules. | **TRAIN said BETTER, HOLDOUT said EVEN — an overfit caught.** Train: BETTER vs v5 52.9% (942–839, 1781 decisive). Holdout: **EVEN vs v5 50.7% (1744–1697, 3441 decisive, confident),** also EVEN vs v6 (49.8%); BETTER vs v2/v3/v4/v7. Elo (holdout, v5=0): v8 +4.2 ≈ v5 0. The improve-vs-base bar fails on held-out seeds. | **rejected** as champion (win-neutral on holdout); base stays **v5**. The train accept was seed luck — Decision 7's train/holdout split did its job. Tempo adds no robust win share **even coupled with denial**, falsifying v4's "tempo may pay off coupled with denial" caveat. `v8/build.test.ts` + `v8/trades.test.ts` archived. |
| v7 | 2026-06-20 | **Early (two-short) denial** (`versions/v7/trades.ts`): branched from v5 (NOT v6). After v6 showed denial's *funding reach* isn't the lever, push its *scope* instead: block a rival while still TWO lots short of a 3-lot set, taking one of the two missing lots from a holdout (holding one needed lot makes the set impossible). Hypothesis: at two-short the lots are still distributed/cheap, so early denial catches prize sets that become unblockable once the rival goes one-short and grabs the completer itself. Credit discounted by `TWO_SHORT_DISCOUNT = 0.5` (a two-short rival is further from completing); 2-lot sets excluded (their "two short" is "owns none"). `evaluateTrade` untouched; Offer D mirrors v5's go/no-go. | **WORSE vs v5 (base): 47.8% (1520–1663, 3183 decisive, confident REGRESSION, train).** Still beats the older field (v3 56.1%, v2 60.1%) but loses to v5; Elo v7 −13.6 < v5 0. | **rejected** (regresses the champion); base stays **v5**. Early denial is premature: it spends cash/assets on speculative blocks the rival might never have completed, and tying up capital early costs more than the rare unblockable-later set it saves. **v5's one-short timing — block exactly when the threat is imminent and the completer is pinpointed — is near-optimal for the denial lever.** `v7/trades.test.ts` pins Offer D. |
| v6 | 2026-06-20 | **Deny-via-swap** (`versions/v6/trades.ts`): push the proven v5 denial harder by removing its CASH gate. v5 could only block a rival when it could fund the holdout's sweetener in cash (`sweetenFor` returns null otherwise), so a denial it wanted but couldn't afford never happened. v6 adds a SWAP variant — pay the holdout with a junk lot (`junkLotForSwap`: a lone color lot in a set neither I nor the holdout have a stake in) plus minimal cash. Same block, fundable on a thinner bankroll. Both variants constructed; selection takes the higher denial-augmented delta. `evaluateTrade` untouched; the junk-lot filter + unchanged rival-threat pricing keep the in-kind sweetener from advancing the holdout. | **Win-neutral vs v5 (base): 50.4% (1222–1204, 2426 decisive, confident EVEN, train).** No regressions: beats v3 59.0% (203–141), v2 66.3% (116–59); Elo v6 +5.6 ≈ v5 0 (within noise), v3 −52.3, v2 −77.2. Does **not** clear the improve-vs-base bar (triage; no holdout run — triage already EVEN). | **rejected** as champion (win-neutral); base stays **v5**. The cash gate wasn't the binding constraint — cash-fundable denials already capture the value; in-kind funding adds reach but no win share. `v6/trades.test.ts` pins the swap construction; archived as a building block. |
| v11 | 2026-06-20 | **Threat-weighted denial** (`versions/v11/trades.ts`): the one denial axis v5 is naive about — target SELECTION. v5's denial premium is identical no matter WHICH rival is blocked, so it would spend as much to deny a hopeless trailer as the player about to win. v11 scales the premium by `threatWeight` — the denied rival's position value over the strongest opponent's, clamped to `[DENY_THREAT_FLOOR=0.5, 1]` — so the leading opponent keeps v5's full premium (cap 1.0, never above — respecting v10's overpay lesson) while a laggard's block is trimmed toward the floor. Denial spend is always ≤ v5's: it reallocates toward the threat and trims the weakest blocks, never inflates. `denial-target.test.ts` pins the weight math + a flip (v5 denies a trailer's bigger set, v11 denies the leader's). `valuation.ts`/`policy.ts` carried verbatim from v5. | **INCONCLUSIVE vs v5 (base): 48.8% (1951–2049, 4000 decisive, ran to cap, improve-LLR −12.27 — firmly NOT improving, regr-LLR −0.98 — no regression).** Beats v2 61.6%, v3 55.0%; Elo (v5=0) **v11 −7.5 ≈ v5 0**. Win-neutral; no holdout (triage already rejects on no-improvement, as v6). | **rejected** as champion (win-neutral); base stays **v5**. The best of the v9–v11 rejects — the only one that doesn't regress — but it adds no win share. v5's threat-blind denial already captures essentially all the available denial value; concentrating blocks on the leader vs trailers doesn't transfer extra wins (a trailer one-short of a strong set is still a real threat once completed, so denying it wasn't waste). `v11/denial-target.test.ts` pins the targeting. |
| v10 | 2026-06-20 | **Auction denial aggression** (`versions/v10/valuation.ts` `auctionValue`, `policy.ts` auction handler): a fresh CHANNEL for the proven denial lever. v5's 0.6 `DENY_FACTOR` is calibrated for trade-to-deny, where the denied rival isn't a party and can't bid; an AUCTION is the opposite — the rival is a competing bidder valuing its own completer at the FULL bonus, so a 0.6 ceiling always drops out and the rival completes. v10 bids a rival's pinpointed completer up to `AUCTION_DENY_FACTOR=1.0`×bonus (the full swing) — either denying the set or forcing the rival to overpay near its max. `acquisitionValue` (buy/landing) and trade construction UNTOUCHED; scoped to the auction channel only. `auction.test.ts` pins it. | **WORSE vs v5 (base): 46.4% (549–635, 1184 decisive, confident REGRESSION, triage).** Beats v2 62.9%, v3 54.4%; Elo (v5=0) **v10 −19.1** < v5 0. No holdout — triage rejects. | **rejected** (regresses the champion); base stays **v5**. Paying up toward the full bonus to deny **overpays**: the cash sunk winning (or chasing) a rival's completer weakens my own position more than the block helps. Echoes v7 — pushing the denial lever *harder* (scope in v7, **price** here) destroys win share. v5's 0.6, one-short, cash-funded denial is tuned on every axis tried; the **magnitude** of the denial premium is right where it is. `v10/auction.test.ts` pins the aggressive ceiling. |
| v9 | 2026-06-20 | **Graduated survival / liquidity guard** (`versions/v9/valuation.ts`, `liquidityFloor`): a NEW axis after the denial/tempo machinery tapped out. On top of v5's moderate reserve (half worst rent, capped $500), when a DEVELOPED rival board threatens, reserve a graduated 0.8× of the worst DEVELOPED rent, bounded by `SURVIVAL_CAP=$900` (below a full hotel hit, so never fully passive). Hypothesis: since tempo is proven worthless, trading a little development speed for a survival buffer is ~free on offense and converts variance into win share — outlast the hotel hit that busts a rival without fire-selling my own monopolies. A DEFENSIVE hardening, NOT a monopoly-value discount (`positionValue`/`acquisitionValue` untouched). `floor.test.ts` pins it; trade engine carried verbatim from v5. | **WORSE vs v5 (base): 45.2% (352–426, 778 decisive, confident REGRESSION, triage).** Beats v2 55.2%, EVEN vs v3 50.4%; Elo (v5=0) **v9 −31.4** < v5 0. No holdout run — triage already rejects. | **rejected** (regresses the champion); base stays **v5**. The buffer isn't ~free: a permanently higher reserve makes the bot **systematically under-develop** (unlike v4, which only re-ordered a build sooner), so it loses the rent race and the survival cash sits idle. Over-conservatism actively costs win share. `v9/floor.test.ts` pins the guard. |
| v5 | 2026-06-20 | **Trade-to-deny** (`versions/v5/trades.ts`): extend v3's N-way trade CONSTRUCTION with a NEGATIVE-SUM move — when a rival is one lot short of a set and the completer sits with a third-party **holdout** (not me, not the rival, building-free), buy that lot to ME purely to **block** the completion, even though it doesn't complete my own set. Priced off the existing `DENY_FACTOR` lever (which `acquisitionValue` already applies on a landing/auction denial but construction never did): a new `denyBonus` candidate type with its own go/no-go gate `plainDelta + DENY_FACTOR×bonus > ACCEPT_MIN`. `evaluateTrade` is **unchanged** (completion + counterparty model + incoming vote all intact); the holdout judges by plain `evaluateTrade`; **the denied rival is NOT a party, so it can't veto its own denial — the asymmetry.** Weak sets self-gate (a small bonus rarely clears the holdout's sweetener). | **BETTER vs v3 (base): 54.0% (537–457, 994 decisive, train), confident.** No regressions — sweeps the whole field both streams: **train** v2 64.0%, v4 54.6%, v1 71.7%; **holdout** v3 54.2%, v2 65.1%, v4 61.8%, v1 80.0%. Elo (holdout) **v5 +216.3** > v3 +175.3 > v4 +149.3 > v2 +141.4 > v1 0 — clear top of the field. | **ACCEPTED — new loop champion.** The first non-neutral structural win since v2: a negative-sum, rival-specific move transfers win share where two positive-sum self-improvements (v3, v4) did not. Base for v6. `v5/trades.test.ts` pins the denial construction. |
| v13 | 2026-06-20 | **Anti-kingmaker — standings-weighted acceptance** (`versions/v13/trades.ts`, `policy.ts`): the first board-shape / standings lever, and the first on the SELLER/APPROVER side (all prior denial is proposer-side). v5 prices handing ANY rival a new monopoly at a flat `RIVAL_THREAT_FACTOR×bonus`, blind to who; v13 scales that threat in the bot's own incoming-trade VOTE by the recipient's standing — `kingmakerWeight` maps the strongest opponent to `KM_HI=1.4` (extra loath to feed the real threat), the weakest to `KM_LO=0.6` (a harmless trailer is cheaper to feed). Scoped to the vote only: construction + the counterparty model keep the flat threat (exactly v5), so the bot doesn't mis-model the non-anti-kingmaker field. `kingmaker.test.ts` pins the weighting + accept-flips. | **WORSE vs v5 (base): 40.1% (121–181, 302 decisive, confident REGRESSION).** Also regresses v3 46.8%; beats v2 56.5%. Elo (v5=0) **v13 −54.1** < v5 0. No holdout — triage rejects. | **rejected** (regresses the champion, hard); base stays **v5**. The acceptance threshold is not a free lever: declining good cash to avoid feeding the leader is v9's over-caution (passivity under-resources the bot), and the `KM_LO` discount hands trailers extra monopolies too cheaply — both directions of the symmetric weight cost. Echoes v11 (proposer-side threat-weighting, neutral) but worse, because forgoing the sweetener on the acceptance side directly weakens the bot. `v13/kingmaker.test.ts` pins the lever. |
| v12 | 2026-06-20 | **Mixed equal-value trade selection — the RNG seam, first use** (`versions/v12/mix.ts`, `trades.ts`): the marquee untested axis (information / unpredictability). Wire a replay-safe seeded draw by HASHING `state.rngState` (xmur3-style, + a per-decision salt; **no `Bot`-contract change needed** — `rngState` is already in the `GameState` the bot receives, and reading it never advances the engine's stream, so games stay byte-identical and the draw is stable across the pacer's re-consults; never `Math.random`). First use: MIX which trade to propose among candidates within `MIX_TOLERANCE=50` of the best effective delta, instead of v5's fixed color-order argmax. Hypothesis: an unpredictable proposer denies a modelling opponent a clean read. Isolated to selection — `evaluateTrade`, v5's trade-to-deny construction, and the go/no-go gates are VERBATIM. | **WORSE vs v5 (base): 47.0% (778–877, 1655 decisive, confident REGRESSION, LLR impr −8.44).** Beats v2 59.9%, v3 55.8%; Elo (v5=0) **v12 −16.7** < v5 0. No holdout — triage rejects. | **rejected** (regresses the champion); base stays **v5**. The field is deterministic value-maximizers with **no predictive opponent-model**, so unpredictability has no read to deny — and mixing off the greedy argmax (even by ≤$50) is then a **pure value leak** that compounds over thousands of trades. Information/bluff is neutral-or-worse against this field; the RNG seam is built, replay-safe, and reusable, but **the information axis is closed**. `v12/mix.test.ts` pins the seam + the mixed tie-break. |

| v14 | 2026-06-20 | **Phantom-denial fix — gate Offer C on rival acquirability** (`versions/v14/trades.ts` `rivalCanAcquire`): a CORRECTNESS fix for a live-game bug (Finding 1). v5's Offer C books the `DENY_FACTOR×bonus` denial premium gated only on the rival owning N-1 of a set — never on whether the rival can actually ACQUIRE the completer. When the completer already sits with a non-rival holdout (every claude bot prices `RIVAL_THREAT_FACTOR` and won't hand a rival a monopoly), the rival is already blocked → marginal denial ~0, yet each bot re-books the premium, so a weak lot (brown $50, above the ~$30 hop cost) HOT-POTATOES forever (observed: Baltic traded 29× in a bot→bot ring, net-zero cash). v14 gates Offer C on the rival being able to realistically acquire the completer — afford the holder's threat-adjusted break-even AND have completing be comfortably worth it — restoring v5's stated "weak sets self-gate" intent. | **EVEN vs v5 (base) on BOTH streams, NO regressions:** train 49.5% (1373–1401, 2774 decisive, confident), holdout 50.0% (918–919, 1837 decisive, confident); BETTER vs v2 (55.7% / 58.3%), v3 (56.1% / 57.3%). Elo (v5=0) v14 −3.6 (train) / −1.1 (hold) ≈ v5 0. | **WIN-SAFE CORRECTNESS BASE** (not champion — EVEN, so v5 keeps top Elo; like v3→v4, a win-safe branch point). Removing the phantom denials costs ZERO win share → v5's denial edge was the REAL strong-set denials, never the brown churn. Also cuts trade churn (faster games + headless training) and stops the live bot's hot-potato. **Base for v15+; ready to ship LIVE** (a product call — fixes the observed real-game bug). `v14/phantom-denial.test.ts` reproduces the ring + pins the gate. |

| v15 | 2026-06-20 | **Near-monopoly option value** (`versions/v15/trades.ts`, `policy.ts`): Finding 2 — `positionValue` credits only COMPLETED sets, so a lone lot in a color the bot is one-short of reads as `assetBase` only; in a mutual-blocker standoff the bot sells its half for cash, foreclosing its OWN set for $0 on the books (a human exploits this by always being the buyer). v15 charges the bot's own incoming-trade VOTE an option penalty `OPTION_FACTOR=0.6 × monopolyBonus` when a trade drops it from one-short (N-1) to further short — so it holds the blocker unless the cash is a clear overpay. Scoped to the vote (construction + counterparty model keep plain valuation). Branched from v14. | **WORSE vs v14 (base): 41.7% (156–218, 374 decisive, confident REGRESSION).** Also WORSE vs v5 40.4%, v3 44.8%; beats v2 53.0%. Elo (v14=0) v15 −47.6 < v14 0. No holdout — triage rejects. | **rejected** (regresses the base, hard); base stays **v14**. Holding contested near-monopolies you can't develop is the LOSING line — exactly the Finding-2 twist (the human who hoarded both sets still went bankrupt). The bot SELLING its half of a standoff for cash is correct EV; the option penalty makes it cower and under-resource. **Third acceptance-side possessiveness lever to regress** (after v9 liquidity, v13 anti-kingmaker): the bot's value-maximizing acceptance is right — making it hold/refuse more is −EV. `v15/option.test.ts` pins the lever. |

| v16 | 2026-06-20 | **Jail-as-haven sharpening** (`versions/v16/valuation.ts` `jailChoice`): lead 3. v5/v14 stay in jail whenever ANY rival board is developed — a defensive cower, blind to the bot's own position. v16 reframes jail as a HAVEN keyed off the bot's OWN board: sit to collect rent risk-free only when *I* hold a developed board (own property, dev rent ≥ `JAIL_DANGER_RENT`) rivals must traverse; otherwise get out and keep moving (develop, pass GO, acquire). Branched from v14; only `jailChoice` changes. | **WIN-NEUTRAL vs v14 (base): INCONCLUSIVE 48.8% (1952–2048, 4000 decisive, ran to cap, improve-LLR −12.15 firmly NOT improving, no regression).** EVEN vs v5 49.8%; BETTER vs v2 54.8%, v3 52.9%. Elo (v14=0) v16 −7.2 ≈ v14 0. No holdout — triage rejects on no-improvement (like v6/v11). | **rejected** (win-neutral); base stays **v14**. The best of this run's rejects (neutral, not a regression — unlike v13/v15). Jail decisions are too infrequent and low-leverage to transfer win share; the own-board-haven vs rival-cower reframing is sound but washes. The last handoff lead (jail) joins the others as a logged dead end. `v16/jail.test.ts` pins the haven flip. |

| v17 | 2026-06-20 | **Lower liquidity reserve — aggression on the liquidity axis** (`versions/v17/valuation.ts`): the INVERSE of v9. v9 RAISED the voluntary-spend reserve and regressed (under-development lost the rent race); v17 asks whether v5's 0.5×worst-rent / $500 cap was itself too cautious and LOWERS it (`FLOOR_RENT_FRACTION` 0.5→0.3, `FLOOR_CAP` 500→300) — freeing cash to buy and develop sooner (reaches "flush"/hotels earlier), leaning on must-raise-cash for the rare big hit. Branched from v14; only the reserve changes. | **BETTER vs v14 (base) on BOTH streams, NO regressions:** triage 52.5% (1313–1189, 2502 decisive); full-field **train** BETTER vs v14 52.5% (only EVEN vs v6); full-field **holdout** BETTER vs v14 52.7% **AND BETTER vs the WHOLE archive v2–v16** (only INCONCLUSIVE vs v8 — not a regression). Elo (holdout, v14=0) **v17 +13.2 — top of the field**. | **ACCEPTED — new loop champion.** The first win since v5, and the first NON-denial structural win. Confirms the meta-lesson from the OTHER direction: not only does defensive over-caution lose (v9 raised the reserve → regressed), v5's *moderate* reserve was itself too conservative — a thinner buffer wins the development/rent race. **Aggression beats defense, on the liquidity axis too.** Inherits v14's phantom-denial fix. Base for v18. `v17/floor.test.ts` pins the lower reserve. |

| v18 | 2026-06-20 | **Push the liquidity reduction further** (`versions/v18/valuation.ts`): v17's lower reserve WON, so per the loop push the winning lever — `FLOOR_RENT_FRACTION` 0.3→0.15, `FLOOR_CAP` 300→200, `BASE_FLOOR` 120→80 (an even thinner buffer) — to find where the aggression stops paying. Branched from the champion v17. | **WIN-NEUTRAL vs v17 (base): INCONCLUSIVE 51.9% (2075–1925, 4000 decisive, ran to cap, improve-LLR +2.01 short of the +2.94 accept boundary, no regression).** BETTER vs v14 55.7%, v5 57.3%, v3 58.7%, v2 58.4%; Elo (v17=0) **v18 +13.1** (leans positive but below the E=20 promotion bar). | **rejected** as champion (does not confirm BETTER vs base); base stays **v17**. Brackets the optimum: v9 (raise) regressed, v17 (0.5→0.3) won, v18 (0.3→0.15) adds no CONFIRMED win share — diminishing returns past v17. The true optimum may sit a hair below 0.3 (v18 leans +13 Elo) but within E=20 noise, so not worth crowning (Decision 5 — don't chase 1–2%). **v17's 0.3 / $300 reserve is the validated setting.** `v18/floor.test.ts` pins the thinner reserve. |
| v19 | 2026-06-20 | **Endgame elimination pressure** (`versions/v19/valuation.ts` `desiredLevel`): the marquee untried lead — proactive, proposer-side, negative-sum. Key development off a RIVAL'S DISTRESS: when an active rival is on the ropes (their raisable cash `cash + mortgageableTotal` can't cover my deadliest developed rent — one landing on my board ends them), enter ELIMINATION MODE and push my monopolies to MAX rent (hotels, or 4-and-hold under a house shortage) **even when not flush**, deploying my cushion into the rent that finishes the kill before variance lets them recover. Branched from the champion v17; isolated to `desiredLevel`. `v19/elimination.test.ts` pins the level-5 flip on a rival on the ropes and the no-op when none is. | **WORSE vs v17 (base): 46.5% (574–661, 1235 decisive, confident REGRESSION, improve-LLR −7.05).** Yet BETTER vs the whole OLDER field — v2 56.8%, v3 57.3%, v5 52.4%, v14 55.2%; Elo (v17=0) **v19 −17.0** < v17 0 (but > v5 −32.5, v14 −41.7). No holdout — triage rejects on the regression. | **rejected** (regresses the champion); base stays **v17**. A clean non-transitivity trap caught by the SPRT: v19 sits BETWEEN v5/v14 and v17 — stronger than the older field, weaker than v17. The mechanism: forcing HOTELS below the flush threshold spends the cushion v17 deliberately keeps, and **houses are illiquid** (sell back at half), so it's a *worse* form of aggression than v18's thinner cash reserve (which stays liquid and only went win-NEUTRAL). A distressed rival busts from normal developed rents anyway — over-developing to "finish" them faster transfers no net win share and just thins/illiquefies my own position, losing to the disciplined v17. **Fourth "deploy more aggressively than v17" lever to fail to beat it** (v18 lower reserve neutral, v19 forced hotels regress): v17 sits at the aggression frontier on the deployment axis. `v19/elimination.test.ts` pins the elimination flip. |
| v20 | 2026-06-20 | **Buy-aggression — looser DIP gate** (`versions/v20/policy.ts`): lead 2, the ACQUISITION analog of v17's winning thin reserve. Lower `DIP_WORTH_MULT` 1.4→1.15 so the bot dips below its (already thin) rent reserve to buy land of clear value (set progress, railroad synergy, denial) more readily — funded by cash on hand, so FREE (no mortgage interest, unlike the v4/v8 tempo that washed). Branched from the champion v17; one constant. `v20/dip.test.ts` pins a 1.35×-worth second railroad v20 buys below the reserve and v17 passes. | **WIN-NEUTRAL vs v17 (base): INCONCLUSIVE 52.0% (2079–1921, 4000 decisive, ran to cap, improve-LLR +2.47 short of the +2.94 accept boundary, no regression).** BETTER vs v2 59.8%, v3 66.7%, v5 54.4%, v14 53.8%; Elo (v17=0) **v20 +13.5** (top of the field on Elo, but below the E=20 promotion bar). | **rejected** as champion (does not confirm BETTER vs base); base stays **v17**. The SECOND liquid-deployment lever to land at ~+13 Elo inconclusive (after v18's +13.1) — two independent sub-threshold leans in the same direction, real but within the E=20 noise Decision 5 refuses to chase alone. Sets up v21's coupling test. `v20/dip.test.ts` pins the looser gate. |
| v21 | 2026-06-20 | **Couple the two liquid-deployment near-misses** (`versions/v21/`): v18 (thinner reserve 0.3→0.15, cap 300→200, base 120→80) AND v20 (looser buy-dip 1.4→1.15) each leaned ~+13 Elo sub-threshold vs v17. ONE coherent hypothesis: v17 leaves a small liquid-deployment edge on BOTH gates that crosses E=20 only when loosened together. Branched from v17 (reserve half in `valuation.ts`, buy-dip half in `policy.ts`). `v21/coupled.test.ts` pins both halves. | **EVEN vs v17 (base): 50.0% (891–891, 1782 decisive, confident EVEN, both LLRs −2.95).** BETTER vs v2 58.0%, v3 64.8%, v5 53.5%, v14 59.0%; Elo (v17=0) **v21 +3.2 ≈ v17 0**. No holdout — triage rejects (confident even). | **rejected** (win-neutral); base stays **v17**. The two +13 leans did **NOT compound** — combined they wash to dead even (+3.2), which means the individual leans were seed noise within E=20, not a real consistent edge. **The liquid-deployment axis is fully tapped out at v17** (reserve v9/v17/v18, buy-dip v20, hotels-vs-distress v19, coupling v21 — all explored). Methodology lesson: coupling two sub-threshold noise leans manufactures no signal. `v21/coupled.test.ts` pins the coupled loosening. |
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

- **The loop champion (crown + substrate)** — the latest *confidently-validated*
  `vX`, the version the next one branches from. The improvement loop advances this
  on its own — **no human greenlight needed** — but only on a **SPRT-confirmed** win
  (gauntlet `BETTER` on both streams), never a bare Elo point lead. The doc half is
  the version-log row.
- **What the lobby/game fields (strongest/default)** — there is no "live" pointer.
  Humans pick a concrete version, and the Add-Bot / new-game default is whatever
  currently **tops the Elo ladder** (`DEFAULT_BOT_VERSION`), ungated. So the player
  default tracks the *measured* strongest, which may briefly be a version that isn't
  (yet) the SPRT-confirmed crown — that's fine and expected (see "Two bests").

**As of 2026-06-21:** the cross-lineage champion (crown + default substrate) is **`claude-v36`**
(see the Champion-status note above — that note is authoritative): a single-knob fork of the
prior champion `jane-v2` (DENY_FACTOR 0.3→0.15) proving denial was still over-weighted, BETTER on
both streams with no regressions. It superseded **`jane-v2`** (the first non-Claude champion).
Within the Claude machine the line reached **v35** (← v29 ← v28 ← v17 ← v14 ← v5) before adopting
the Jane base at v36; the v28→v29 desperation-acquisition wins are the live lead this section
tracks. (The "loop champion" framing below was written at v29, before
the v33/v34 rejects and the v35 crown.) After NINE straight
rejects (v19–v27), lead (b) broke through: **v28** introduced desperation-pricing
acquisition (buy a distressed rival's set-completer BELOW fair price to finish your own
monopoly — asymmetric + underpriced, the two conditions every prior win shared; BETTER vs
v17 train 55.8% / holdout 53.2% / +22.3 Elo), and **v29** then pushed its `DISTRESS_DISCOUNT`
0.75→1.0 for another ~+18 Elo (BETTER vs v28 train 52.7% / holdout 52.6%, near-identical
streams). TWO acquisition wins in a row on the same lead. The Elo **anchor** stays **claude-v2**;
the lobby's player-facing **Strongest/default** is whoever tops `bots/ratings.ts`, while the
**crown/substrate** is the SPRT-confirmed best (the two can differ — see "Two bests").
(Historical note: this lineage's prior "live/champion" pointers were retired when the lobby
moved to deriving the player default from the Elo ladder.)

**Lead landscape for the next session (after Batch 4 closed the mortgage-to-fund lead):**

The search space is now very thoroughly explored (v1–v32). The ONE structural win shape proven
across the whole run is **ASYMMETRIC + UNDERPRICED transfers** (v5 denial, v28/v29 distress
discount); every "deploy / press / grab / hold MORE" lever has washed or regressed. What remains:

- **CLOSED dead ends (do not re-walk):** all the do-not-re-walk items below, PLUS now —
  mortgage-to-fund / roadmap #2 sweetener half (v32, washed — leverage cost ≈ tempo gain), the
  whole-set distress grab (v31, −EV by construction), the distress GATE width (v30) and DISCOUNT
  ceiling (v29, both at their optimum), and the distress lever's surrounding corners (Batch-3
  audit: multi-lot already in v29, dip-below-reserve non-applicable, distressed-denial inert).
  The desperation/distress lead (b) is **fully mined** — its productive surface is exactly v29's
  Offer B.
- **NOT cleanly built, but strong PRIOR toward washing (a future session could still A/B, but
  reason first):** *heads-up / endgame closing theory.* The bot has NO 2-player-specific code
  (verified) — a genuine structural gap. BUT every concrete hypothesis in it maps onto an
  already-closed result: deadlock-breaking completion (v3, win-neutral — split former draws
  50/50), asymmetric-swap refusal / standings-weighting (v13/v15 possessiveness, regressed),
  endgame development pressure (v19, regressed), information/first-mover (v12, the field has no
  predictive model), auction precision (v10, regressed). The likely reason it washes: by the time
  a game reaches heads-up it is usually already DECIDED (the leader snowballs after the first
  bankruptcy), so a closing-SPEED lever transfers no win share (busting a turn sooner doesn't
  change WHO wins) — the same reason v19 washed. If a future session tries it, the only shape
  with any hope is a NEW asymmetric+underpriced TRADE edge specific to the 2-player threat
  calculus, not a closing-speed or possessiveness knob.
- **Web research surfaced NO concrete new quantitative edge** (Batch 4): searches returned only
  generic strategy the bot already encodes (refuse rival-completing trades = the threat veto;
  cash-vs-property by phase; block monopolies = v5). No academic/simulation data with a testable
  dial the bot doesn't have.

**Honest assessment:** the bot is strongly tuned and the obvious structural edges are captured.
v29 is a robust champion (vs v17 holdout 54.7%, +32.6 Elo per Batch 3). Further gains, if any,
are likely small and hard to separate from E=20 noise — the next session should set a high bar
and expect rejects, or judge the loop effectively converged.

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

**The v31 run (2026-06-21), lead (b) corner (A) — from-scratch DISTRESS grab — REJECTED, v29 holds; and the surrounding-corner audit:**

This batch set out to extend the proven distress/underpriced shape into its untapped
non-relocating corners (A whole-set grab, B multi-lot completion, C dip-below-reserve,
D distressed-denial). The audit found the distress lever's PRODUCTIVE SURFACE is already
fully captured by v29's Offer B, and the remaining corners are structurally inert:

- **(A) whole-set from-scratch grab off a distressed owner — v31, REJECTED (EVEN vs v29,
  49.4%, −4.2 Elo).** -EV by construction, self-rejects, never fires positively (so v31 ≡
  v29). The distress discount erases only the rival-THREAT premium, not the set's own
  `monopolyBonus`; on a whole-set buy the bonus transfers ~1:1, so the buyer's gain exactly
  cancels the seller's discounted break-even (measured +1120 gain vs −1120 discounted loss →
  −30 after margin). The Offer-B asymmetry (buy the LAST lot, bank the WHOLE bonus for one
  lot's price) has NO analogue for a whole set. v24's intact-monopoly wash, unchanged by
  distress. **Closed dead end.**
- **(B) multi-lot / two-short completion off a distressed seller — ALREADY IN v29, no new
  version.** Offer B's `sweetenForAll` already applies the distress discount across ALL
  missing lots in one N-way deal, so a two-short distress completion already clears whenever
  it's +EV. Confirmed in `--log` self-play: the "missing <colors>" (plural) distress
  completions fire regularly (the mechanism fires in 14/15 sampled seeds, often multi-lot),
  with no hot-potato churn (completions develop and hold).
- **(C) dip below the rent reserve to fund a distress buy — NON-APPLICABLE.** The TRADE path
  has NO reserve gate — `sweetenForAll` already funds a profitable trade in cash down to $0
  (only cash-NEGATIVE is blocked). The reserve only gates landed-property BUYS (`DIP_WORTH_MULT`),
  not trade construction. There is nothing to loosen for free.
- **(D) distress discount on a DENIAL buy off a distressed holdout — STRUCTURALLY INERT.** A
  denial buy moves the lot to the BOT (defensively), not to a rival, so the holder prices NO
  rival-threat premium — and distress only discounts the threat premium. Measured: a distressed
  holder's break-even for parting with a denial lot is IDENTICAL to a comfortable one's (−200
  either way). The distress lever cannot bite on a denial. (Also relocating — v14/v25 risk — and
  edges into v6's closed funding-reach lesson.) **Inert.**

The one genuinely-open corner the audit surfaced: **mortgage-to-fund a distress completion.** v29
returns NULL on a +EV distress completion it can't fund in CASH but COULD fund by mortgaging a
back-burner lot (measured: p1 cash $60, wants a distress-discounted orange completer, holds
mortgageable railroads → v29 proposes nothing). This is the proven asymmetric+underpriced shape
(a COMPLETION, not a denial), distinct from v6 (denial funding-reach) and from v4 (plain
mortgage-tempo, washed) IF gated to the fleeting distress discount. NOT built this batch: the
trade flow can't bundle a self-mortgage (no raise-cash-then-propose trade phase like the buy
path's raise-to-buy), so it needs cross-turn orchestration (pre-mortgage, then complete) that
risks the v4 washed-tempo failure mode (interest bled every misfire). Handed to Batch 4 as a
sharply-scoped lead.

**The v32 run (2026-06-21, Batch 4), the mortgage-to-fund-distress lead — BUILT, REJECTED, v29 holds:**

Batch 4 took the one open corner above and BUILT it (Batch 3 had stopped at the feasibility
question). The feasibility finding came out POSITIVE: **mortgage-then-propose is expressible
WITHIN the existing bot/pacer/engine machinery with NO engine change.** The trade flow indeed has
no in-trade raise phase, but the voluntary `managing` intermission accepts a mortgage-only `manage`
commit, and the bot is a pure `(state)→intent` function, so the orchestration is CROSS-TURN: arm a
mortgage-only `manage` at one pre-roll (`distressRaisePlan` → `planRaiseByMortgage`), then propose
the now-cash-fundable completion via Offer B on a later turn. The detector
(`distressCompletionNeedingCash`) hard-gates to a genuinely distressed seller + a +EV-and-all-accept
completion + blocked-solely-by-cash + within-mortgage-reach, and self-limits to one raise (once
mortgaged, cash covers the sweetener → detector returns null, no re-arm loop).

The **mechanism fired cleanly and did NOT misfire/bleed** — verified in `--log` self-play across 13
seeds: the distress-raise note appears in ~8/13 (usually once per game) and in EVERY seed it fired
it was immediately followed by the actual completion (raises ≤ completions in all seeds → no
interest-bleed misfires, no hot-potato churn). The self-limiting gate worked as designed. **But it
adds NO win share: EVEN vs v29, 49.6% (1204–1222, 2426 decisive, confident, Elo −2.6).** The reason
is exactly the v4/v6 failure mode the handoff flagged as a risk, now CONFIRMED on this channel:
pre-mortgaging only pulls a few distress completions a turn or two EARLIER. Cash regenerates via
GO/rent within a turn or two, so Offer B reaches MOST of these completions on its own once cash
arrives; the funding-reach extension just trades the leverage cost (10% interest + the idle
mortgaged lot's lost rent) for the small tempo of completing sooner — **leverage cost ≈ tempo gain,
v4's washed plain-tempo result reproduced on the distress channel.** The distress DISCOUNT is the
win (the underpriced transfer, v28/v29); the funding-REACH to grab a few more/sooner washes,
mirroring **v6** (denial funding-reach washed for the identical reason: cash-fundable opportunities
already capture the value; mortgage funding adds reach but no win share). **Roadmap #2 is now fully
CLOSED** — the build half by v4, the sweetener half by v32, both washed; mortgage-to-fund is a
win-neutral building block, not an edge. `v32/mortgage-fund.test.ts` pins the detector + all four
self-gates + the cross-turn arm.

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

**Champion (crown + substrate) status:** the SPRT-confirmed best is
**`claude-v41`** (2026-06-23, PR #1) — the claude-v39 substrate (opt-v4 vector +
restored `denialPositionCost`) plus Kyle's **seller-side trade pricing** (Refinement
#3): `rivalThreatFactor` decoupled from `denyFactor` to **0.4**, and a **0.5
deployability discount** on incoming set-handover cash. Crown gate `--base opt-v4
--panel`, BOTH streams: SPRT **BETTER vs opt-v4 (55.7% train / 62.4% holdout) AND every
panel member, zero regressions** (9/9). It supersedes the prior crown `opt-v4` (the
robust maximin-ES champion) and the whole opt trio as the crown — it addresses the
*root* of the trade hot-potato (bots too willing to SELL completers) rather than the
buy/hold-side denial patch.
**Crown ≠ ladder-top here — a documented non-transitivity.** claude-v41 sits **#4 on
the panel-graph Elo ladder** (opt-v3 +210.7, opt-v4 +204.2, opt-v2 +201.1, then
claude-v41 +194.1) even though it BEATS opt-v4 (56%) and opt-v2 (59%) **head-to-head**:
the opt trio crush the low floor slightly harder, so the global least-squares Elo fit
can't fully credit v41's direct edge (~6-Elo panel-fit noise; see "Non-transitivity &
the crown"). The crown is gated on the **head-to-head SPRT vs the panel field**, not the
global Elo rank — so claude-v41 is the **champion + substrate**, but the lobby's
player-facing **Strongest/default** stays `opt-v3` (the ladder top, itself a rejected
non-robust counter — never crowned). This is the inverse of the usual ladder-topper-
that-fails-crown case, and exactly why the three decisions are kept separate.
**The next version we evolve branches from the current champion `claude-v41` by default**
— improve the measured best directly. Lineages are just provenance (the machine a
version was discovered on) and borrowing across them is free, so the substrate is the
best base regardless of family. Branch from a different base only as a deliberate call
— an archived building block to exploit, or to escape a local maximum. The standing
denial-knob lesson still holds: it is a **CYCLE, not a slope** (jane-v3 ▷ claude-v36 ▷
jane-v2 ▷ jane-v3 — an RPS loop; see "Non-transitivity & the crown"), so a future
version chasing more win share should look to a **different axis** than denial level (as
claude-v41 did — the seller-side trade axis), or to an **opponent-adaptive / mixed
denial** strategy, not a lower constant. Jane's own evolution is in
`versions/jane-v2/index.ts`, not this Claude log.

**`jane-v4`** (2026-06-21, PR #6) — **RECORDED + player default, NOT crowned, NOT substrate.**
A textbook case of the three decisions diverging (see "Two bests"):
- **Record:** YES — legal (deterministic, self-contained, typecheck/lint clean), registered in
  `versions/index.ts`.
- **Strongest / player default:** YES — on the regenerated ladder it **tops the field** (jane-v4
  +114.8 > jane-v2 +100.8 > jane-v1 +69.8 > claude-v35 +65.2 > claude-v2 0 > gemini-v1 −154.1),
  so `DEFAULT_BOT_VERSION` follows it. Ungated — that's the point.
- **Crown / substrate:** NO — the SPRT gate is not met. Gauntlet vs the champion `jane-v2` (both
  seed streams, bit-reproducible across 3 reruns each): **train EVEN** (50.4%, +3.0 Elo,
  1283–1261), **holdout BETTER** (52.3%, +16.0 Elo, 1560–1423). The streams aren't statistically
  distinguishable (~1.4 SE apart) — its true edge is a thin ~+1% / ≈+7 Elo straddling the SPRT
  EVEN/BETTER line, so it wins holdout but not train. A one-stream win fails the both-streams gate,
  so **the next evolution still branches from the champion `jane-v2`**, not jane-v4.

So a higher ladder Elo did NOT crown it — exactly the noise-vs-confidence distinction the gate
exists for. (The PR's self-reported +47.8 Elo was vs `claude-v35`, a baseline `jane-v2` already
dominates, so it didn't survive a champion re-measure.) Its **trade-memory subsystem** is a
candidate **archived building block** — scaffolding a later lever might exploit — to be judged on
its own, never inherited by branching. Jane's own evolution is documented in
`versions/jane-v4/index.ts`, not this Claude log.

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

**Promoting `vX` — two separate acts (see "Two bests"):**

1. **Make it the player default (strongest):** register it in `versions/index.ts`
   and run `npm run sim:ratings`. The cached round-robin rates the new version, the
   regenerated `ratings.ts` re-ranks the field, and the lobby derives
   Strongest / per-family-best straight from it (`roles.ts`). No code copied, no
   tests change, no pointer to bump — the default just follows the ladder.
2. **Crown it / make it the default substrate:** only on a **confident SPRT win
   against the FIELD** — `npm run sim:gauntlet -- <vX> --base <champion> --panel` on
   **both** seed streams, accepted iff it is `BETTER` than its base AND regresses
   against **no panel member**. Beating the champion head-to-head is *not* sufficient
   on its own (non-transitivity — see "Non-transitivity & the crown"); the panel field
   is the guard. Record the crown as the version-log row below; by default the next
   version branches from it (though substrate is ultimately a judgment — you may branch
   elsewhere or start fresh to escape a local maximum; see "Two bests"). A ladder-topper
   that's only EVEN under SPRT, or a counter that regresses against a panel member, is
   the player default at most but **stays uncrowned** and is **not** the default
   substrate (this is the complexity-ratchet guard).

This doc deliberately does **not** restate the current best (it would only go stale;
read `ratings.ts` for the ladder, the version log below for the crown). `claude-v1`
is a real frozen snapshot (`versions/claude-v1/`) deliberately left unrated
(`RATING_EXCLUDED`), so it stays decoupled from the competitive field.

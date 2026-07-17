# LEAPS — the large-jump roadmap (and how to disagree with this archive)

Written 2026-07-17 by Claude Fable 5, at Kyle's direction: document the next
steps that are **large evolutionary leaps, not incremental improvements** — and
write it for a reader who may be a *smarter model than the author*. This doc is
self-contained; the companion deep-dives are `RL-DESIGN.md` (the learned-bot
architecture, already written and still current) and `EVOLUTION.md` (the
measurement process and the full experimental record).

---

## 0. Epistemic charter — read this before trusting anything below

Every conclusion in this repo's bot docs — including this one — was produced by
an AI model reasoning under a time budget, then checked by simulation against
**the field of bots that existed that day**. That has two consequences a
stronger reader must exploit:

**1. A negative result refutes a POINT, not an idea.** Formally, every
"washed/rejected" verdict in EVOLUTION.md refutes the tuple *(idea ×
implementation × parameter vector × opponent field × measurement budget)* — and
nothing more. The proof this matters happened within 24 hours of this doc:

- **Buy-to-scalp** measured −5 points *at every hand-swept value* on fable-v1's
  vector (2026-07-17 morning, honest 800-game sweeps). The same evening's
  combined-space ES **re-opened it profitably at 0.2–0.39** — it works when the
  set valuations around it move too. The hand-sweep verdict was real and
  point-true, and would have been idea-false if recorded as "scalping doesn't
  work."
- **N-way trades** (claude-v3, "win-neutral, archived") were measured against a
  field with **no asymmetry lever**; the doc itself predicted "the win only
  comes when paired with an asymmetry lever." Extraction (fable-v1) IS that
  lever, and nobody has re-run N-way since it landed.
- **Risk-awareness** (claude-v47, "washed") was measured against a monoculture
  of risk-neutral mirrors — the one field structurally unable to reward it.
  Against humans (variance-rich, tilt-prone) it is unmeasured to this day.
- **The EV jail rule** (fable-v1, "measured out, monotone") is monotone *against
  this archive's board-development profile*. A field that develops different
  sets — or humans, who under-develop — changes the reachable-rent geometry the
  rule reads.

When you re-litigate a closed conclusion, do it honestly: state what changed
since the original measurement (new lever, new field, new vector, more compute),
then re-measure at full rigor. The discipline "reasoning proposes, measurement
selects" is NOT up for re-litigation — it is what caught the author's own
failures repeatedly (a 56% first read that was really 48.7%; an ES winner that
was secretly a counter).

**2. Some things really are invariants — know which.** Do not confuse the
point-measurements above with the small set of structural guards, which encode
*product truths the fitness function cannot see* (the win-share-blindness class
of defects: net-zero trade rings, fire-sales, churn). `holderDenialFrac = 1`,
bounded survival credit, the transfer memory, and deterministic replay via
`state.rngState` are in this class. Re-examine their *implementations* freely;
re-open the *behaviors they forbid* only with a replacement guard, never on the
grounds that fitness didn't complain — fitness structurally can't.

**3. The measurement system itself embeds guessable-wrong assumptions.** The
most under-questioned code is the judge, not the bots. Known soft spots, each
with a precedent where questioning it paid:

- **Seat geometry.** Everything is measured 2+2, but real lobbies are 1-vs-3.
  The one time 1v3 was measured, it *reversed* a conclusion: claude-v46 ("equal
  twin" by 2+2) collapses to 17.8% outnumbered while fable-v1 thrives at 30.8%.
  What else does 2+2 hide?
- **The panel graph.** The ladder ranked the summit tier by transitive
  inference for a full day while direct SPRT evidence said the opposite; adding
  claude-v45 to the panel flipped the player-facing default. Graph blindness is
  quiet and consequential — audit what the fit can actually see.
- **The turn-cap-draw rule, the ±20 Elo SPRT band, aggregate-vs-maximin
  fitness** — each is a considered choice (see EVOLUTION.md for the reasoning),
  and each shapes what "better" means. A leap in the judge changes every
  verdict downstream of it.

---

## 1. The leap map

Ranked by expected size of the jump, not ease. Each entry: why it's a leap, the
evidence pointing at it, the first milestone, and what would kill it. Journey
length and certainty are stated up front for every entry — the long-journey
leaps (L1/L2) are deliberately structured as **staged bets with cheap kill
gates**, because their payoff is genuinely uncertain: a learned value must beat
a hand value carrying ~50 generations of SPRT selection plus two ES campaigns,
and RL-DESIGN's own §6 concedes capability ≠ guarantee. Do not start their
expensive stages before their cheap gates pass.

### L1 — The learned value function (the keystone — staged, with kill gates)

**Journey: long (weeks end-to-end). Certainty: genuinely uncertain — which is
why Stage A exists.** The complete architecture and built substrate (encoder,
action enumerator, 1-ply agent, trade search — all pure, tested, reusable) are
in `RL-DESIGN.md`.

**What:** replace the hand-authored `positionValue` (and its ~47 tuned
constants) with a trained V(state).

**Why it's a leap:** every hand vector is a linear-ish shadow of the true value
surface. Three independent signposts say the surface is where the ceiling is:
(a) search-v1/v2/v3 showed rollout search adds nothing because the *leaf* is
the bottleneck ("the strongest argument yet for a learned value" — their
words); (b) three ES campaigns plateaued the constants at the v45 tier, and the
fable campaigns moved the ladder mainly by re-weighting *set valuations* — i.e.
the value function was the active ingredient again; (c) the extraction engine's
entire edge is that the archive's value model misprices held completers —
a learned V would price them, and whatever ELSE is mispriced that no one has
noticed.

**Stage A — the prediction probe (days; buys the kill decision, no bot built).**
Generate ~10⁵ outcome-labeled states from fable-v2 self-play (the engine is
fast and pure; the labels are free), fix per-opponent ownership in
`features.ts` (RL-DESIGN §4.B), train a small net, and measure ONE number on
held-out games: does V(state) **predict final outcomes better than
`positionValue` does** (compare calibration / rank correlation of each seat's
value share vs who actually won)? No MCTS, no action layer, no inference-speed
problem, no gauntlet. **Kill gate: if a competently trained net cannot even
out-PREDICT the hand value, the entire L1/L2 path dies here** — for the price
of a data pipeline. Record it as a first-class EVOLUTION finding either way;
the prediction-gap number also tells you the SIZE of the prize before you pay
for it.

**Stage B — the value transplant (a week; the shortcut RL-DESIGN doesn't
mention).** `positionValue` is the **single seam** every fable decision flows
through (buys, auctions, trades, extraction pricing, standing). If Stage A
passes, bind V there — inside the existing, battle-tested policy shell, keeping
the trade constructors, the guards, and the extraction engine — rather than
building the full RL-DESIGN agent. This tests the value-surface hypothesis in
the strongest available harness. Engineering risk to respect: `positionValue`
is called ~10³–10⁴× per turn inside trade search, so V must be small/cached or
applied selectively at the top-level decisions. **Gate: gauntlet vs the
mid-ladder, then the summit; if transplanted-V can't beat hand-V in the same
shell, stop before Stage C.**

**Stage C — the full RL-DESIGN path** (only after A and B pay): the 1-ply
`valueNetBot`, then L2.

**What changed since RL-DESIGN.md was written:** fable-v2 exists — a far
stronger self-play data generator and bootstrap target than the claude-v2-era
prototypes it mentions; and extraction changed the trade-state distribution any
net must train on. The doc's plan is otherwise current.

### L2 — Policy + value + MCTS (the full jump; do not start before L1 Stage B pays)

**Journey: long (a multi-week program). Certainty: lowest on this list — and
strictly downstream of L1 (the value head IS L1), so its go/no-go decision is
free: L1's gates make it.**

**What:** RL-DESIGN §3 — the AlphaZero-style agent over the engine's atomic
action seam.

**Why it's a leap:** it removes the last structural ceiling — the hand-written
*generators*. Every bot in the archive, fable included, can only play moves
some generator emits; extraction proved a single missing generator was worth a
crown. The factored-token vocabulary makes ALL legal play reachable, and search
finds the sequences no one hand-authored. If Monopoly has more exploits like
extraction sitting in unproposed-trade space, this is what finds them.

**First milestone:** RL-DESIGN §5 steps 1–3 (the atomic action layer + a
token-driven greedy bot over `heuristicValue`) — pure engineering, no ML,
proves the action seam end-to-end. Safe to build early: it's reusable
regardless of how the ML bets land.

**Kill criterion:** if L1 succeeded but MCTS + policy can't beat the 1-ply
agent given real search budgets, record the compute wall and stop.

### L3 — Opponent-conditioned play (priors, portfolios, mixing)

**Journey: short-to-medium (the first milestone is days, pure TS, no ML
infrastructure). Certainty: moderate — the payoff is bounded but the trade-off
it resolves is already measured.**

**What:** a bot whose policy depends on *who it is playing* — via offline-
learned opponent priors (classify the opponent's type from its first observed
decisions; play the counter-vector), and/or genuinely mixed strategies (the RNG
seam is documented and replay-safe: thread `state.rngState` into the bot
contract).

**Why it's a leap:** two independent results say pure, opponent-blind
strategies have a hard ceiling. The jane-v3 RPS cycle proved the top of any
pure-strategy ladder is non-transitive ("a pure strategy is always counterable,
a mixed one isn't" — the game-theoretic escape no bot has taken). And fable-v1's
weak-field/strong-field trade-off (defense costs ~6 points vs weak bots, earns
more vs strong) is EXACTLY the trade an opponent-conditioned bot doesn't have to
make — it plays the fable stack against sharks and the v45 stack against fish.

**Evidence on the hard part:** the fish gate (2026-07-17) proved *within-game*
evidence arrives too late — by the time an opponent has demonstrably overpaid,
it's been eaten. So the classification must come from PRIORS learned offline
(behavior signatures of the archive + human games) applied to early-game
observations, not from in-game accounting. That null is the design constraint,
not a dead end.

**First milestone:** offline, train a classifier from logged games: given the
first N decisions of a seat (buy rates, trade shapes, build timing), predict
which archive family it is. If that's accurate by mid-game, wire a two-vector
portfolio (fable-v2 vs the v45-baseline stack) switched by the classifier, and
gauntlet it. **Measure vs the 1v3 geometry too** — adaptivity should shine
where the field is majority one type.

**Kill criterion:** if early-game behavior doesn't separate the archive's
families (they may all look identical for 20 turns), the signal isn't there and
mixing (randomized vectors) becomes the fallback leap.

### L4 — League self-play (fix the field, not the bot)

**Journey: short (extends the existing ES harness). Certainty: high that it
addresses a repeatedly-observed failure; the open question is only the compute
multiplier.**

**What:** replace "optimize vs the frozen panel" with a co-evolving league
(populations of vectors/nets playing each other AND the anchors — the
AlphaStar-league shape), so the optimization target can't be counter-overfit.

**Why it's a leap:** the single most repeated failure shape in this archive is
the counter: opt-v3 (counter-overfit to its panel), jane-v3 (RPS), search-v1
(beats its base line, loses elsewhere), and this week the fable-v2 raw ES
winner (beat everything, lost to its own base). Every one was caught *after*
the campaign by the no-regression gate. A league makes counters unprofitable
*during* training instead — the fix moves from the judge to the objective.

**First milestone:** extend `optimize-cli.ts` with a `--league` mode: keep the
last K generation-champions in the fitness field alongside the anchors.
Cheap to build on the existing harness; measure whether it stops producing
counters (the fable-v2 campaign is the perfect regression case).

**Kill criterion:** league fitness costs ~K× compute per generation; if the
counter-rate doesn't drop measurably, the anchors were already enough.

### L5 — The human-data loop (the unmeasured half of the objective)

**Journey: short per iteration (the instrument exists). Certainty: highest on
this list — its one prior run produced the extraction engine.**

**What:** make real human games a first-class measurement and training signal.
The DB already stores every game; `game:review` already compiles them; the
six-game Papa analysis already proved a single review session can find exploits
worth a crown. Close the loop: a periodic sweep of stored human-vs-fable games
→ exploit taxonomy → targeted counter-levers → (eventually) human-behavior
priors for L3 and human-state training data for L1.

**Why it's a leap:** the entire archive is optimized against itself — a
monoculture objective. The one time human data entered the loop (the Papa
review), it produced the extraction engine, the largest single jump in the
project's history. Humans are the canary AND the point: "this bot should be
the best work we can produce" is defined against pros, not against claude-v2.

**First milestone:** once ~10 human-vs-fable-v2 games exist in the DB, re-run
the review methodology against fable-v2 specifically: does the Papa system
still work? Which fable guard actually fired, which never did? (The defensive
stack has literally never been measured against the opponents it was built
for.)

**Kill criterion:** none — this is an instrument, not a hypothesis. It can't
wash; it can only be neglected.

### L6 — Judge leaps (change what "better" means, carefully)

**Journey: an afternoon per item. Certainty: high — the two judge fixes made
this week each reversed a standing conclusion within an hour of existing.**

**What:** the measurement-system re-examinations from §0.3, promoted to
first-class work: seat-geometry-aware fitness (1v3 alongside 2+2), a
mixed-geometry gauntlet, draw-rule alternatives, panel-graph audits.

**Why it's a leap:** every bot leap is bounded by what the judge can see. The
two judge fixes made this week (the 1v3 instrument; the summit-tier panel fix)
each *reversed a standing conclusion* within an hour of existing. That rate of
reversal per unit effort is the highest in the project.

**First milestone:** add 1v3 (vs the current default bot) as a standard
gauntlet report column next to mirror-churn — one afternoon, and every future
verdict gets a second geometry for free.

**Kill criterion:** per-change judgment; the guard is that judge changes must
never be made *in order to* favor a candidate (see the summit-fix precedent:
decided before knowing whom it would help — hold that line).

---

## 2. Sequencing advice (from the author, freely overridable)

Buy information before buying journeys. The short-journey leaps (L6's 1v3
column, L5's review sweep, L4's league mode, L3's classifier probe) each fit in
a session and have already-measured motivations — do them opportunistically.
The long-journey leap (L1→L2) is the biggest prize and the biggest risk, which
is exactly why it is STAGED: L1 Stage A (the prediction probe) costs days and
buys the kill decision for the whole ML program — run it before any opinion
about whether "RL will beat rule-based bots" hardens in either direction. The
right mental model: L1 Stage A is not a commitment to the moonshot; it is the
measurement that tells you whether the moonshot is real.

If you have one long session: **L1 Stage A**. If you have an hour: **L6's 1v3
column**. If you are meaningfully smarter than this doc's author: start at §0,
find the conclusion that smells wrong, and attack it with the harness — the
archive's biggest wins (v41's seller-side thesis, extraction) both started as
someone rejecting the standing consensus.

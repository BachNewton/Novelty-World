# fable-v1 — the flow-aware bot

`fable-v` is a new lineage authored by **Fable** (Anthropic's flagship model,
driving Claude Code). Provenance-named like `claude-v` / `jane-v`; the paradigm
it carries is **flow-awareness**: every prior bot in the archive values a
position *statically* (cash + deeds + set bonuses). fable-v1 additionally prices
**where the tokens are** — the exact 2d6 landing distribution over the next
roll(s) — and **who it is trading with** — the recipient's standing. Monopoly is
a race on a ring; the next roll is 11 weighted outcomes you can enumerate
exactly. Nobody in the archive does.

## Substrate

The claude-v45 31-param factory + its combined-space ES vector, borrowed
wholesale (EVOLUTION.md: "winning is the only loyalty — applies to the code").
v45 is the SPRT-confirmed champion and three ES campaigns showed its *parameter*
space is exhausted (~240 Elo ceiling); the levers below are *structural*.

## Evidence base

Two sources, both in-repo:

1. **Six real games where a human (Papa) beat three claude-v45 seats**
   (`game:review 2o4j54 1l5n1w 2g2r50 354i2n 0g1s18 3n3l2s`, 2026-07-16
   review). The human ran one repeatable system; each exploit maps to a
   concrete mechanism in the v45 evaluator.
2. **The v45/v46/v47 EVOLUTION.md record** — what the ES could and couldn't
   see, and the explicit warning that net-zero degenerate behavior is invisible
   to win-share fitness.

## The levers

### F1 — the flow engine (`flow` section of bot.ts)

Exact next-roll expectation from the 2d6 pmf (1..6,5..1 / 36), per player:

- `rollOutgo(state, pid)` — expected payment my token makes on my next roll
  (rent owed at each reachable square + tax; Go-To-Jail = $0; +$200 credit
  weighted by P(passing GO)), plus the **worst single hit** (the tail a mean
  hides).
- `rollInflow(state, pid)` — Σ over live opponents of P(they land on my
  chargeable lots next roll) × current rent. Jailed opponents scaled by an exit
  probability.

Uses:

- **F1a danger-aware liquidity floor.** v45's floor is
  `min(100, 0.1 × worst-board-rent)` — capped at $100 even against hotel
  boards, which is the *build-sell churn* engine (0g1s18: Sharon built reds to
  3 houses and force-sold all nine back at half price, three times, −$675
  torched). fable's floor = `flowFloorFrac × rollOutgo + flowTailFrac ×
  worstHit`, min `baseFloor` — small when the geometry is safe (opponents just
  passed my danger zone, or are jailed/far), large exactly when a hit looms.
  Same aggression, timed.
- **F1b jail EV.** Replace the static `jailDangerRent` threshold with the real
  quantity: leaving costs `rollOutgo(from just-visiting) − GO credit`; staying
  costs ~nothing and keeps collecting. Stay iff expected exit cost exceeds
  `jailStayThreshold`.
- **F1c tempo build order.** `planBuild` walks sets in a static tier list.
  fable orders **buildable** monopolies by next-roll opponent landing mass ×
  marginal rent uplift — build the set the tokens are approaching.

### F2 — trade-pricing overhaul (`evaluateTrade`)

- **F2a bounded survival credit.** v45 credits incoming cash at up to
  `cash × distress × 2.92` — *unbounded in the cash amount*. On any developed
  board `sellerDistress > 0` for everyone (safe = 2.15 × worst rent), so the
  survival credit is what let Sofía sell a complete Park+Boardwalk set to the
  human leader for $250 (2o4j54 T120) and what re-opened the hot-potato
  clearing band that `holderDenialFrac = 1.0` had closed. fable caps the
  credited portion at **the cash that actually erases the distress**
  (`needToSafe`): survival is a liquidity story, not a valuation multiplier on
  arbitrarily large checks.
- **F2b standing-scaled rival threat.** `rivalThreatCost` is flat (0.34): the
  evaluator prices handing a set to a broke laggard and to a runaway leader
  identically. fable multiplies threat by the **recipient's standing ratio**
  (their positionValue / mean opponent positionValue, clamped), gain
  `standingThreatGain`. Handing the leader a monopoly is how every one of the
  six human games was lost. This is NOT claude-v47's washed "risk posture"
  lever (which scaled MY reserve/bids by MY standing); it prices the OTHER
  side's threat by THEIR standing inside the existing threat term.
- **F2c synergy threat.** Only color-set completions are threat-priced;
  railroads/utilities hand over synergy for free. Papa vacuumed all four
  railroads for ~book+$50 in 4 of 6 games ($200/landing engine). fable adds the
  recipient's **synergy delta** (rail count-ups, utility pair) × threat factor
  to `rivalThreatCost`.
- **F2d heads-up endgame.** With two live players the game is zero-sum: any
  deal that strengthens the only rival strengthens the only person who can beat
  me. Threat costs are multiplied by `headsUpThreatMult`.
- **F2e trade liquidity guard.** v45 vetoes only `postCash < 0`. The human
  scalped $423–$503 completer premiums that left bots unable to develop what
  they bought (2g2r50 T33: Timothy paid $503, built one house level, sold it
  the same turn, bankrupt T89). fable extends the veto: a voluntary trade
  leaving `postCash` below the flow floor needs `delta ≥ liquidityRiskGain`.
  Acquiring sets boldly stays correct — paying so much you can never build does
  not.

### F3 — the ring-proof transfer memory

Third structural defense after `holderDenialFrac` (v45) and F2a: **never move a
lot to a player who already held it recently** (`transferMemoryTurns`), by
declining such trades and never proposing them — *unless* the recipient is the
one-short completing rival (the legitimate cash-out). Scans the event log
(`state.turns`), pure and deterministic. Whatever pricing leak a future tuner
re-opens, the geometry `A→B→A` is dead by construction. The live-game evidence:
the ring ran in 4 of the 6 reviewed v45 games (2o4j54 T82–95: Ventnor ±$71,
~28 hops) despite the lockstep pin — pricing alone keeps losing this fight.

## What deliberately did NOT change

- `positionValue` stays static (no flow term): it is called inside nested
  trade-construction loops; flow there would be O(opponents × 11) per call on
  projected states and the tempo signal is delivered at the *decision* layer
  (floor / jail / build order) instead.
- The build planner core, forced-liquidation order, auction shape,
  trade-construction shapes, pacing/arming contracts: v45 verbatim.
- The "cash-scaled monopoly value" rejection in bots/CLAUDE.md stands — F2e
  guards *liquidity at the moment of the deal*, it never discounts what a set
  is worth.

## F4 — the extraction engine (added after measurement; the WIN lever)

The defensive levers above closed the holes *humans* exploited — and measured
**win-neutral vs the bot field** (~48–50% solo, 800-game leave-one-out), because
v45 seats never attack those surfaces: they don't offer scalp trades, don't
prey on fire-sales, don't farm the ring. Defense only pays against attackers.

The lever that pays against the *bots* is the inverse: **attack their known
willingness to overpay.** The v35 finding ("a one-short rival completes the set
~86% of the time, paying ~$254 median over book") was priced into *holding*
(`denialPositionCost`) but never *exercised*: no bot in the archive ever
proactively OFFERS a held completer to the one-short rival. fable-v1 does — it
solves the rival's exact surplus from their own evaluator (their delta is
linear in cash, so the max premium is closed-form), charges it minus the accept
margin, capped by their cash, and lets its own threat-priced evaluator decide
whether that check clears. A poor rival's small check is rejected there, so the
engine can never fire-sale a completer downhill. The same margin-pricing is
applied to mutual-completion swaps (`chargeSurplus`): v45 sweetens the
counterparty up to break-even but never charges them when THEIR surplus is
huge.

Three extraction channels ship:

- **F4 completer sales** — the one-short color rival (the headline case);
- **F4b rail sales** — railroads compound ($25→$200), so a 2–3-rail holder
  pays synergy + book for one of mine, and *no bot in the archive constructs
  rail trades at all* (the six-game review: a human vacuumed all four rails in
  4 of 6 games for ~book — this channel runs that play in reverse);
- **`chargeSurplus` on swaps** — price mutual-completion proposals to the
  margin in BOTH directions.

The standing multiplier doubles as extraction's safety: a sale INTO a
clamp-max leader prices above any premium they can pay, so the engine refuses
to feed the winner (pinned in policy.test.ts).

Measured: removing extraction from the full stack costs ~7 points (46.5% vs
53.8%, 800 games); extraction alone on the v45 baseline is only ~52% — the
defensive stack (keep MY cash safe, flow-floor the reserve, guard my
liquidity) is what lets the harvested cash compound. Offense and defense are
complements. Final frozen config vs claude-v45: **57.5% / 56.6% on two fresh
1500-game streams (57.1% combined, ≈ +50 Elo)**; panel pre-screen 61.7–66.3%
vs jane-v2 / claude-v36 / claude-v41 / opt-v4 / claude-v5 (400 games each).

## The honest trade-off: strong-field edge, weak-field margin

fable-v1 beats **every** bot in the archive head-to-head — but its margins
against the weak field are smaller than claude-v45's (a 600-game leave-one-out
vs claude-v2: the defensive stack costs ~6 points there, additively across the
levers, while earning more than that back against strong opponents). So the
Bradley–Terry ladder — a margins average — ranks fable-v1 BELOW v45 (+172.5 vs
+220.1) even though the SPRT crown gate passed on both streams. The crown and
the lobby default therefore diverge (see EVOLUTION.md "Two bests" and the
fable-v1 session entry): fable-v1 is the crowned champion; claude-v45 remains
the ladder-top lobby default. The fable-v2 lead that resolves it is
opponent-quality modeling (defend against sharks, punish fish — trade-v1's
archived calibration is the building block).

## Measured OUT (kept as levers, set to no-op)

- **F1b jail EV** (`jailStayThreshold = 0`): an 800-game sweep was monotone
  against it (0 → 54.3%, 55 → 52.4%, 90 → 51.3%). The ES's max-stay
  (`jailDangerRent` at its bound floor) is correct in this field; my EV rule
  left jail too often. The lever remains for a future field where mobility
  matters more (weaker opponents, sparser boards).
- **F5 buy-to-scalp** (`scalpFrac = 0`): every swept fraction cost ~5 points.
  Selling a held completer costs no capital; BUYING the option up front burns
  cash v45 redeploys better. The asymmetry is the finding.
- **F2f lead defense** (`selfLeadGain = 0`): scaling threat by MY OWN standing
  ("a dominant leader stops selling sets") gained ~+2 vs claude-v45 but lost
  more everywhere else (−2.5 vs claude-v2, −2 vs claude-v5): against most of
  the field, extraction stays +EV even from the lead — a weak rival handed a
  set still can't out-earn the premium.
- The flow floor swept best SOFT (0.6 × expected outgo + 0.15 × worst hit,
  cap $300): reserve against real geometry, but stay hungry.

## Measurement record

Iterated via `sim:versus` vs claude-v45 (100–1500-seed screens, multiple fresh
seed prefixes after an early stream-noise scare), 800-game solo/leave-one-out
ablations per lever, and 800-game sweeps per constant; confirmed at 1500×2 on
fresh streams (54.4% / 55.5% pre-floor-tune). Crown gate: `sim:gauntlet --
fable-v1 --base claude-v45 --panel` on both streams + the out-of-panel
anti-overfit sweep; ring/termination checked via self-play mirror trade volume
(the v45 lesson: win share alone cannot see degenerate churn) — fable mirrors
run 5–8 trades/game, same as v45, all decisive.

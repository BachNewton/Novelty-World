// v27 candidate — self-contained snapshot (see EVOLUTION.md). Branched from the
// champion v17. Lead (c), magnitude 2: a SMALLER dark-blue weight bump than v26's.
// v27's one change lives in `valuation.ts`'s GROUP_WEIGHT: it RAISES dark-blue's set
// weight 0.55→0.62 (vs v26's 0.73), lifting its monopolyBonus 413→465 — to ≈#4, level
// with the other big sets (just above green 460, below yellow 480) — rather than
// leaping to the published #2 (which v26 did and leaned −11 Elo). Liquidity reserve,
// trade engine, and dispatcher are v17 verbatim. Exposed as `v27Bot`.
export { policy as v27Bot } from "./policy";

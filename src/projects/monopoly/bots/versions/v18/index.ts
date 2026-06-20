// v18 candidate — self-contained snapshot (see EVOLUTION.md). Branched from the
// CHAMPION v17. v18 PUSHES v17's winning liquidity-reduction lever further
// (FLOOR_RENT_FRACTION 0.3→0.15, FLOOR_CAP 300→200, BASE_FLOOR 120→80) — an even
// thinner reserve, to find where the aggression on the liquidity axis stops paying.
// The trade engine is verbatim v17/v14. Exposed as `v18Bot`.
export { claudeBot as v18Bot } from "./claude";

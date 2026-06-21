// v21 candidate — self-contained snapshot (see EVOLUTION.md). COUPLES the two
// leaning-positive liquid-deployment near-misses, both ~+13 Elo sub-threshold vs the
// champion v17: v18's thinner reserve (FLOOR_RENT_FRACTION 0.3→0.15, FLOOR_CAP 300→200,
// BASE_FLOOR 120→80) AND v20's looser buy-dip gate (DIP_WORTH_MULT 1.4→1.15). ONE
// coherent hypothesis: v17 leaves a small liquid-capital-deployment edge on BOTH gates,
// and loosening them together crosses the E=20 promotion bar. The trade engine is
// verbatim v17/v14. Exposed as `v21Bot`.
export { policy as v21Bot } from "./policy";

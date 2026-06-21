// v17 candidate — self-contained snapshot (see EVOLUTION.md). Branched from v14 (the
// phantom-denial-fixed base). v17 LOWERS the voluntary-spend liquidity reserve
// (FLOOR_RENT_FRACTION 0.5→0.3, FLOOR_CAP 500→300) — the aggressive direction on the
// liquidity axis (v9 raised it and regressed), freeing cash to buy/develop sooner.
// The trade engine is verbatim v14. Exposed as `v17Bot`.
export { policy as v17Bot } from "./policy";

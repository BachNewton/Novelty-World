// v26 candidate — self-contained snapshot (see EVOLUTION.md). Branched from the
// champion v17. v26's one change lives in `valuation.ts`'s GROUP_WEIGHT: it RAISES
// dark-blue's set weight 0.55→0.73 (lead c — the first touch of the foundational
// set-VALUE dial since v1), lifting dark-blue's monopolyBonus 413→548 to land it at
// the published #2 rank (just above red 544). Liquidity reserve, trade engine, and
// dispatcher are v17 verbatim. Exposed as `v26Bot`.
export { claudeBot as v26Bot } from "./claude";

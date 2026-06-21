// v20 candidate — self-contained snapshot (see EVOLUTION.md). Branched from the champion
// v17 (lower liquidity reserve). v20 loosens the BUY-AGGRESSION gate: it lowers
// `DIP_WORTH_MULT` (1.4→1.15) so the bot dips below its (already thin) reserve to
// acquire land of clear value more readily — the ACQUISITION analog of v17's winning
// "hold less idle cash", and free (cash on hand, no mortgage interest). The trade engine
// and valuation are verbatim v17/v14. Exposed as `v20Bot`.
export { policy as v20Bot } from "./policy";

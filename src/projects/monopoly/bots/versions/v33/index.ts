// v33 candidate — Jane's survival-pricing acquisition (see EVOLUTION.md).
// Branched from v17. Independently developed from upstream's v28/v29 (which use
// a different mechanism: distressThreatScale on the threat premium). v33 instead
// adds a SURVIVAL_FACTOR on incoming cash: each dollar of cash is worth up to
// $1.40 to a distressed seller (sellerDistress * SURVIVAL_FACTOR=0.4), so trade
// construction sweetens less and the buyer acquires set-completers at a DISCOUNT.
// Asymmetric (buyer constructs, seller reacts) and underpriced — the two
// conditions every prior win shared. Exposed as `v33Bot`.
export { claudeBot as v33Bot } from "./claude";

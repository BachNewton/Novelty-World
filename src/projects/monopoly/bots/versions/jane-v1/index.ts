// jane-v1 — the first version of the JANE lineage (a bot family distinct from
// Claude; see EVOLUTION.md "Bot lineages"). Authored by Jane (PR #3), where it
// was proposed as "v33". Branched from Claude's v17.
//
// SURVIVAL-PRICING ACQUISITION: independently derived alongside Claude's
// v28/v29, which reached the same distressed-seller insight via a different
// mechanism (discount the rival-threat premium). jane-v1 instead adds a
// SURVIVAL_FACTOR on incoming cash — each dollar is worth up to $1.40 to a
// distressed seller (sellerDistress × 0.4) — so construction sweetens less and
// the buyer acquires set-completers at a DISCOUNT. Asymmetric and underpriced,
// the two conditions every prior win shared.
//
// Measured (our gauntlet, dual one-sided SPRT): BETTER vs Claude's v17 on both
// seed streams (~+32 Elo, holdout-confirmed), and EVEN vs Claude's champion v29
// (50.1% over 1942 decisive) — two independent mechanisms landing on the same
// optimum. A strong lineage anchor; not the global champion (it ties v29).
export { claudeBot as janeV1Bot } from "./claude";

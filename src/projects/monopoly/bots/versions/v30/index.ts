// v30 candidate — self-contained snapshot (see EVOLUTION.md). Branched from v17
// (the champion). v28 adds DESPERATION-PRICING ACQUISITION: when a seller is
// distressed (cash below their liquidity floor), they value incoming cash above
// its face value because it helps survival. Model that so the buyer needs less
// sweetening to clear a distressed seller's break-even — buying their
// set-completers at a DISCOUNT. Asymmetric (the buyer constructs the deal;
// the seller only reacts), proposer-side, UNDERPRICED — the two conditions every
// prior win shared (v5 denial is asymmetric, v17 deploys cash the field leaves
// idle). Exposed as `v28Bot`.
export { claudeBot as v30Bot } from "./claude";

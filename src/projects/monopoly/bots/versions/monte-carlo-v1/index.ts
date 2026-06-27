// monte-carlo-v1 — Monte Carlo decision-making (see EVOLUTION.md "Bot lineages").
//
// PARADIGM SHIFT from jane-v3: instead of hand-coding heuristic valuations,
// simulate the consequences of each choice and pick the action with the
// highest expected win rate. Forward-looking instead of reactive.
//
// Applied at two decision points (buy + jail); everything else delegates to
// jane-v3's proven heuristics. See policy.ts for the full design rationale.
export { monteCarloV1Bot as monteCarloV1Bot } from "./policy";

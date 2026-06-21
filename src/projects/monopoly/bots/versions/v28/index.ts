// v28 candidate — self-contained snapshot (see EVOLUTION.md). Branched from the
// champion v17. v28 adds DESPERATION-ACQUISITION (lead b) as one coupled hypothesis:
// a genuinely distressed seat (one deadly developed rent from bankruptcy) discounts
// the rival-monopoly threat premium it holds out for (the SELLER half, in
// `valuation.ts` `distressThreatScale` + `trades.ts` `rivalThreatCost`), which lets
// the bot BUY that seat's set-completer BELOW fair price to finish its own monopoly
// (the BUYER half — Offer B's `sweetenForAll` automatically offers the discounted
// break-even). Asymmetric + underpriced — the two conditions every prior win shared.
// The bought lot completes the buyer's set (held + developed, never relocated), so it
// cannot hot-potato. Isolated to trade pricing/construction; dispatcher verbatim v17.
// Exposed as `v28Bot`.
export { policy as v28Bot } from "./policy";

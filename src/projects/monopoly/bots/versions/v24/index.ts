// v24 candidate — self-contained snapshot (see EVOLUTION.md). Branched from the champion
// v17. v24 lets the bot ASSEMBLE A MONOPOLY FROM SCRATCH: `proposeBestTrade` now buys
// EVERY lot of a high-value color it holds NONE of, off its opponent owners, in one
// N-party deal — the aggressive, asymmetric grab that exploits opponents willing to sell
// property for cash ("pay them what they want, then build and crush them"). Gated to real
// prizes that keep the bot above its rent reserve, so it never buys a bare set it can't
// develop. Isolated to trade construction; valuation, dispatcher, and the rest of the
// trade engine are verbatim v17. Exposed as `v24Bot`.
export { policy as v24Bot } from "./policy";

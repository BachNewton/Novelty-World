// v31 candidate — self-contained snapshot (see EVOLUTION.md). Branched from the
// champion v29. ONE structural change in trades.ts: a FROM-SCRATCH DISTRESS GRAB
// (Offer E) — buying a whole bare monopoly off a GENUINELY DISTRESSED owner for a
// color the bot holds NONE of, at the distress-discounted price. Corner (A) of the
// proven asymmetric+underpriced acquisition shape: v24's fair-price from-scratch
// grab washed (positive-sum); the `isDistressed` gate makes it UNDERPRICED, the
// winning condition. Exposed as `v31Bot`.
export { claudeBot as v31Bot } from "./claude";

// v34 candidate — self-contained snapshot (see EVOLUTION.md). Branched from the
// champion v29. The ONLY change is the ANTI-CHURN COOLDOWN in `./trades.ts`'s Offer
// C: a per-lot cooldown that suppresses the no-progress RE-denial of a completer
// that was just traded (the strong-set hot-potato), while leaving the first,
// win-carrying denial intact. Targets only the repetition v33 wrongly cured by
// deleting the whole mechanism. Dispatcher + valuation are v29 verbatim. Exposed as
// `v34Bot`.
export { policy as v34Bot } from "./policy";

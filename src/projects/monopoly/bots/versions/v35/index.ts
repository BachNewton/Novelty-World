// v35 candidate — self-contained snapshot (see EVOLUTION.md). Branched from the
// champion v29. The ONLY change is the DENIAL-POSITION OPTION VALUE in
// `./trades.ts`'s `evaluateTrade`: a holder values a completer it holds against a
// one-short rival at the premium it can extract, so it won't sell its denial
// position cheap to another denier — killing the hot-potato ring at its economic
// root (symmetric pricing) while still collecting the rival's eventual premium.
// Dispatcher + valuation are v29 verbatim. Exposed as `v35Bot`.
export { policy as v35Bot } from "./policy";

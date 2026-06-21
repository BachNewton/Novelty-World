// v33 candidate — self-contained snapshot (see EVOLUTION.md). Branched from the
// champion v29. The ONLY change is the MARGINAL-DENIAL GATE in `./trades.ts`'s
// Offer C: a correctness fix for the STRONG-set hot-potato (live-game Finding 2)
// that v14's gate left open. A denial buy now fires only when it actually makes the
// completer unacquirable to the rival (the current holder is softer than me — a
// distressed seat that would feed it cheap), never as a futile bot→bot relocation a
// cash-rich rival just re-buys. Dispatcher + valuation are v29 verbatim. Exposed as
// `v33Bot`.
export { policy as v33Bot } from "./policy";

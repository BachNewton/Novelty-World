// v25 candidate — self-contained snapshot (see EVOLUTION.md). Branched from the champion
// v17. ONE defensive change: `rivalThreatCost` now prices HANDING a rival their 4th
// railroad / 2nd utility (the synergy analog of a color monopoly), so the bot won't SELL a
// rival its rail-set completer for face value — the leak v17 had (rivalThreatCost looped
// color sets only). PROACTIVE rail denial (an Offer C buy) was prototyped and dropped: it
// reproduces Finding 1's phantom-denial hot-potato (static rail splits bounce bot→bot), so
// Offer C stays color-only. Isolated to the trade channel; valuation (bar two new exported
// helpers) and the dispatcher are verbatim v17. Exposed as `v25Bot`.
export { policy as v25Bot } from "./policy";

// v15 candidate — self-contained snapshot (see EVOLUTION.md). Branched from v14 (the
// phantom-denial-fixed base). v15 adds the NEAR-MONOPOLY OPTION VALUE (live-game
// Finding 2): the bot's incoming-trade vote charges for foreclosing its own one-short
// completion shot, so it won't sell its half of a mutual-blocker standoff cheaply.
// v14's phantom-denial gate is carried verbatim. Exposed as `v15Bot`.
export { policy as v15Bot } from "./policy";

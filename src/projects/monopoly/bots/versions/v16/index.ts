// v16 candidate — self-contained snapshot (see EVOLUTION.md). Branched from v14 (the
// phantom-denial-fixed base). v16 reframes the JAIL policy from a defensive cower
// (stay whenever any rival board is developed) into a HAVEN keyed off the bot's OWN
// board — sit to collect rent risk-free only when it holds the developed board rivals
// must traverse, otherwise get out and keep moving. Exposed as `v16Bot`.
export { claudeBot as v16Bot } from "./claude";

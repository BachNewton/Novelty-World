// v19 candidate — self-contained snapshot (see EVOLUTION.md). Branched from the champion
// v17 (lower liquidity reserve). v19 adds ENDGAME ELIMINATION PRESSURE: when an active
// rival is on the ropes (their raisable cash can't cover my deadliest developed rent —
// one landing finishes them), `desiredLevel` switches to elimination mode and pushes my
// monopolies to MAX rent (hotels, or 4-and-hold under a house shortage) regardless of
// "flush", deploying my cushion into finishing the kill faster and cutting the variance
// that lets luck swing an already-won game. The trade engine is verbatim v17/v14.
// Exposed as `v19Bot`.
export { claudeBot as v19Bot } from "./claude";

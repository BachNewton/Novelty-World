// v12 candidate — self-contained snapshot (see EVOLUTION.md). Branched from the
// champion v5. v12's change is the FIRST use of the replay-safe RNG seam: among
// trade candidates the bot rates within a tolerance of the best, it MIXES which
// one to propose (drawn deterministically from `state.rngState`, never
// Math.random), instead of v5's fixed-color-order tie-break — testing whether
// unpredictability denies the field a clean read. Exposed as `v12Bot`.
export { claudeBot as v12Bot } from "./claude";

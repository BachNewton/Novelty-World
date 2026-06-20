// v29 candidate — fork of v28 (the champion). v29 pushes SURVIVAL_FACTOR
// 0.4→0.6 — more aggressive desperation discount (each dollar of cash worth up
// to $1.60 to a fully distressed seller). Tests the parameter frontier of v28's
// winning desperation-pricing mechanism. Exposed as `v29Bot`.
export { claudeBot as v29Bot } from "./claude";

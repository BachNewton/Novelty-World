// v32 candidate — self-contained snapshot (see EVOLUTION.md). Branched from the
// champion v29. IDENTICAL to v29 except ONE added mechanism: MORTGAGE-TO-FUND a
// DISTRESS COMPLETION (roadmap #2's open sweetener half, hard-gated to the proven
// distress shape). v29 returns NULL on a +EV distress-discounted completion it
// can't fund in CASH but COULD fund by mortgaging an idle back-burner lot. v32
// pre-mortgages (cross-turn) to seize that completion. Exposed as `v32Bot`.
export { policy as v32Bot } from "./policy";

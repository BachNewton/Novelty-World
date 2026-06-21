// v30 candidate — self-contained snapshot (see EVOLUTION.md). Branched from the
// champion v29. IDENTICAL to v29 except the distress GATE: v30 adds DISTRESS_MARGIN
// 1.3, widening isDistressed from v29's strict "can't cover one deadly hit at all"
// to "can't comfortably cover it" (broke after one hit also qualifies), so the proven
// desperation discount fires on more genuinely-cornered seats. Exposed as `v30Bot`.
export { policy as v30Bot } from "./policy";

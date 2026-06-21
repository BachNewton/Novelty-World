// v29 candidate — self-contained snapshot (see EVOLUTION.md). Branched from the
// champion v28. IDENTICAL to v28 except one constant: `DISTRESS_DISCOUNT` 0.75→1.0
// — pushing v28's winning desperation-acquisition lever to its maximum, so a
// distressed seller prices NO rival-monopoly threat and the buyer banks the whole
// premium. Brackets the discount optimum. Exposed as `v29Bot`.
export { policy as v29Bot } from "./policy";

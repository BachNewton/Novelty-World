// v11 candidate — self-contained snapshot (see EVOLUTION.md). Exposes the policy
// as `v11Bot`, a drop-in `Bot` the simulator injects per seat for head-to-head
// A/B against the v5 base. v11's one change is THREAT-WEIGHTED DENIAL in
// `./trades.ts`: scale v5's denial premium by how strong the denied rival is
// relative to the strongest opponent, so denial focuses on the genuine threat
// (the leader) and prunes wasteful blocks of trailing rivals. The weight is capped
// at 1.0 (never exceeds v5's premium — respecting v10's overpay lesson) and
// floored so real blocks still fire. `./valuation.ts` and `./policy.ts` are
// carried VERBATIM from v5. Nothing here is wired into production `registry.ts`.
export { policy as v11Bot } from "./policy";

// v3 candidate — self-contained snapshot (see EVOLUTION.md). Exposes the policy
// as `v3Bot`, a drop-in `Bot` the simulator injects per seat for head-to-head
// A/B against the v2 champion. Nothing here is wired into production
// `registry.ts`; promotion to the live `claude` strategy is a human green-light.
export { claudeBot as v3Bot } from "./claude";

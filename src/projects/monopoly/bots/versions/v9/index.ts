// v9 candidate — self-contained snapshot (see EVOLUTION.md). Exposes the policy
// as `v9Bot`, a drop-in `Bot` the simulator injects per seat for head-to-head
// A/B against the v5 base. v9's one change is a graduated SURVIVAL / liquidity
// guard in `./valuation.ts` (`liquidityFloor`): hold a larger cash reserve when a
// DEVELOPED rival board threatens, so the bot outlasts the variance — surviving
// the hotel hit that busts a rival without fire-selling its own monopolies. The
// trade-to-deny engine (`./trades.ts`) and dispatcher (`./policy.ts`) are carried
// VERBATIM from v5. Nothing here is wired into production `registry.ts`.
export { policy as v9Bot } from "./policy";

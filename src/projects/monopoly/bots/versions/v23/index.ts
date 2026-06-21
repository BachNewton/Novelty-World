// v23 candidate — self-contained snapshot (see EVOLUTION.md). Branched from the champion
// v17. v23 makes the bot RECLAIM IDLE CAPITAL more eagerly: planBuild only unmortgages a
// dead (mortgaged) monopoly when comfortably "flush" (cash > floor + HOTEL_CUSHION 600);
// v23 reactivates it at a thinner cushion (floor + RECLAIM_CUSHION 200). A mortgaged
// monopoly earns NOTHING, so reclaiming it (restoring its double-rent and unfreezing it
// for building) is an unusually high-value-per-dollar redeploy — the "deploy idle capital
// faster" direction v17 proved wins, on a distinct gate. Isolated to planBuild; the trade
// engine and everything else are verbatim v17/v14. Exposed as `v23Bot`.
export { policy as v23Bot } from "./policy";

// v10 candidate — self-contained snapshot (see EVOLUTION.md). Exposes the policy
// as `v10Bot`, a drop-in `Bot` the simulator injects per seat for head-to-head
// A/B against the v5 base. v10's one change is AUCTION DENIAL AGGRESSION: in the
// auction handler (`./policy.ts`) the bid ceiling for a rival's pinpointed
// completer is computed with a higher `AUCTION_DENY_FACTOR` (`./valuation.ts`
// `auctionValue`) than the 0.6 trade `DENY_FACTOR` — bidding up toward the full
// monopoly bonus, since in an auction the rival is a competing bidder who values
// its own completer fully, so the timid 0.6 ceiling never wins the bid war. The
// trade-to-deny engine (`./trades.ts`) is carried VERBATIM from v5. Nothing here
// is wired into production `registry.ts`.
export { policy as v10Bot } from "./policy";

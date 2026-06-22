// trade-v1 — eval-based opponent-modeling trade system.
//
// Kyle's design (2026-06-22): NO Monte Carlo for trades. Instead:
//   1. Strong multi-factor eval function (eval.ts) scores any board state
//      from any player's seat with parameterized weights
//   2. OpponentModel (opponent-model.ts) calibrates per-player weights by
//      learning from trade accept/reject behavior
//   3. TradeEngine (trades.ts) enumerates trades, scores from both sides,
//      proposes where we extract surplus (our delta > 0, opponent would accept)
//   4. Online learning loop: every accept/reject refines our model
//
// Non-trade logic (buy, build, jail, auction, raise-cash) is INHERITED VERBATIM
// from jane-v3 (current champion). Only trade decision points are replaced.
//
// Branches off jane-v3-champion. Parallel strategy family to mc-v1.
export { tradeV1Bot } from "./policy";

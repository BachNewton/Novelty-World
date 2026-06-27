// search-v3 — rollout/lookahead search on the TUNED champion (claude-v45), over
// the FULL monte-carlo-v1 decision set: buy, trade-vote, AUCTION, and JAIL.
//
// search-v2 (buy + trade-vote on v45) measured EVEN — the champion's ES-tuned
// reactive decisions are already near-optimal, so search just matches them.
// search-v3 adds the two decisions where a 1-ply tuned eval is STRUCTURALLY blind
// because the payoff is DEFERRED: auction willingness-to-pay (a price paid now for
// rent over future turns — RL-DESIGN.md's canonical 1-ply blind spot) and jail
// (staying to dodge a developed board). The hypothesis: search beats the champion
// exactly where greedy 1-ply can't see the future, not on the decisions tuning
// already nailed.
//
// Same base (claude-v45 via ./base), same rollout machinery and budget
// (R=12 × horizon=30) and base tie-break as search-v1/v2. All rollout randomness
// derives deterministically from `state.rngState` — replay intact. See
// search-v3/policy.ts and EVOLUTION.md.
export { searchBot as searchV3Bot } from "./policy";

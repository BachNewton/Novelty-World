// search-v2 — the SEARCH / LOOKAHEAD paradigm, on the TUNED champion. Identical
// rollout machinery to search-v1 (truncated-rollout policy improvement, Tesauro
// TD-Gammon style; the base policy's greedy move is always a candidate, so search
// can only MATCH or BEAT it), but the base is claude-v45 — the combined-space ES
// champion — instead of search-v1's UNTUNED claude-v38.
//
// WHY. search-v1 proved the paradigm sound (replay-safe rollouts, horizon-30
// sweet spot, beats its own base) but wrapped the default-parameter v38 policy, so
// it only reached ~119 Elo — search over a weak base. The open question search-v1
// never answered: does lookahead help the STRONG base? search-v2 answers it —
// claude-v45 fields every rollout seat (so the simulated continuation is
// ~250-Elo play) and its tuned `positionValue` scores the truncated-leaf shares.
//
// PARADIGM LINEAGE: `search-v` namespaces the SYSTEM (rollout/lookahead search),
// not a machine — see EVOLUTION.md "Bot lineages". Searched decisions, budget
// (R=12 × horizon=30), and the base tie-break are search-v1 verbatim; only the
// base policy + leaf yardstick changed (claude-v45). All rollout randomness
// derives deterministically from `state.rngState` (no Math.random / Date), so the
// played move is a pure function of state — replay intact.
export { searchBot as searchV2Bot } from "./policy";

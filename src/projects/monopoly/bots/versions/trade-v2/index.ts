// trade-v2 — Trade lineage, observation-based asymmetric trading.
//
// Forked from claude-v36 (the actual champion). The ONLY change vs claude-v36
// is the trade proposal engine: claude-v36's evaluateTrade-based construction
// is replaced with an observation-based OpponentModel that learns each
// opponent's accept threshold from trade history.
//
// PRINCIPLE (Kyle): "We don't care what eval THEY use, we just know OURS is
// the best. We figure out their eval by offering trades and seeing what they
// say yes and no to. If we find a net positive diff in our eval vs what they
// say yes and no to, that's when we get them."
//
// trade-v1 failed because it used jane-v3's actual evaluateTrade for acceptance
// prediction — overfitting to one opponent's logic. trade-v2 uses NO other bot's
// logic. It observes trade accept/reject events, computes OUR positionValue for
// each side, and infers each opponent's threshold from that data.
//
// Acceptance: must beat the anchor panel (claude-v2/v5/v17/v35 + jane-v2 +
// claude-v36) on the crown gauntlet. No jane-v3-specific testing.
export { claudeBot as tradeV2Bot } from "./policy";

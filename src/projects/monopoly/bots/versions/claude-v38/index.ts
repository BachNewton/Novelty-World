// claude-v38 — Claude lineage, authored by Claude Code. Branched from the
// current champion claude-v36 (top of the Elo ladder; the substrate per
// EVOLUTION.md "Two bests").
//
// SINGLE (STRUCTURAL) CHANGE vs claude-v36: the monopoly valuation is rebuilt
// from first principles. claude-v36 priced a completed set as
// SET_TOTAL_PRICE × GROUP_WEIGHT — hand-tuned fudge factors. claude-v38 derives
// it from the set's EXPECTED RENT per opponent turn, relative to the capital to
// reach that state (ROI):
//
//   monopolyBonus(color) = BONUS_SCALE × Σ_lot (landingProb[lot] × rent3[lot])
//                                        ──────────────────────────────────────
//                                          Σ_lot (price[lot] + 3 × houseCost)
//
// HYPOTHESIS — a principled, measured valuation should rank/scale sets at least
// as well as the intuition-tuned weights, and may correct mis-priced sets the
// fudge factors got slightly wrong (so the bot makes better buy/trade/build
// calls on the margin).
//
// FINDING BAKED INTO THE DESIGN: a PURE landing-prob × developed-rent sum (no
// capital denominator) does NOT keep orange/red on top — it ranks the expensive
// high-rent sets (green/yellow/dark-blue) above them, because absolute 3-house
// rent dwarfs the small traffic differences. The capital-ROI denominator is the
// literature's real ranking axis and is what restores ORANGE at #1 with red in
// the upper tier — and it is what the sanity gate (orange/red top) requires.
// landingProb is the classic Truman Collins steady-state Markov table (an
// approximation; documented in valuation.ts). BONUS_SCALE pins orange to 560 so
// DENY_FACTOR / ACCEPT_MARGIN / the liquidity floors keep the same magnitude.
//
// Everything else is claude-v36 verbatim (DENY_FACTOR 0.15, RAIL_SYNERGY,
// SPREAD-development planBuild, desperation-pricing acquisition, phantom-denial
// gate; GROUP_WEIGHT survives only as the liquidation-precedence weight).
//
// Acceptance: crown only on a confident SPRT win (gauntlet BETTER vs claude-v36
// on BOTH seed streams). A wash means the hand-tuned weights were already ~right
// — a real negative result (the principled rebuild buys no win share).
export { claudeBot as claudeV38Bot } from "./policy";

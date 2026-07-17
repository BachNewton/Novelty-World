// claude-v36 — Claude lineage, authored by Claude Code. Branched from the
// cross-lineage champion jane-v2 (METHOD.md "Two bests": the substrate is the
// best base regardless of family; borrowing across lineages is free). This is the
// first Claude version to adopt the Jane base — the Claude line's own v35 sits
// behind jane-v2.
//
// SINGLE CHANGE vs jane-v2: DENY_FACTOR 0.3 → 0.15.
//
// HYPOTHESIS — denial is STILL over-weighted at jane-v2's 0.3.
//   jane-v2's single biggest discovery (Discovery 2) was halving the denial knob
//   0.6 → 0.3, worth +71 Elo vs Claude's v29: "wasting resources blocking
//   opponents." It then moved to other axes (reserve, cushion) and never swept
//   DENY below 0.3 (no record in the repo). DENY 0.6→0.3 is the steepest single-
//   parameter gradient in the whole evolution log, so the optimum may sit lower.
//
//   This is the direct, gauntlet-actionable lesson from the real 4-player game vs
//   humans (analyzed via `npm run game:review -- 2h0y0y`): the bots' fatal habit
//   was over-investing in denial. Rebecca (a Claude bot) mortgaged THREE lots to
//   deny-buy Boardwalk, leaving herself no liquidity buffer; one big rent hit then
//   forced her to sell her only developed monopoly's houses, and she finished
//   last. Less denial → more self-development → a thicker buffer. (The game's
//   other lessons — develop-faster / keep-a-buffer — map onto the already-rejected
//   v4/v9/v19; denial-reduction is the one the gauntlet rewards, as jane proved.)
//
// Halving again (0.3 → 0.15) mirrors jane's own 0.6 → 0.3 step. The bot still
// books a real (thinner) premium for taking a rival's last open lot — v5 proved
// denial has genuine positive value, so this sharpens self-focus without
// abandoning it. Everything else is jane-v2 verbatim (SPREAD-development
// planBuild, desperation-pricing acquisition, the phantom-denial gate).
//
// Acceptance: crown only on a confident SPRT win (gauntlet BETTER vs jane-v2 on
// BOTH seed streams). A wash brackets the denial optimum at jane-v2's 0.3 (a real
// negative result, like v18 bracketed the reserve).
export { claudeBot as claudeV36Bot } from "./policy";

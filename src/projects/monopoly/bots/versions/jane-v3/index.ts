// jane-v3 — the third version of the JANE lineage (see EVOLUTION.md "Bot
// lineages"). Branched from jane-v2, extends claude-v36's DENY_FACTOR insight
// further down the gradient.
//
// claude-v36 (the current champion) proved that lowering DENY_FACTOR improves
// play: Claude went 0.6→0.3→0.15, each step was better. jane-v2 was stuck at
// 0.3. jane-v3 sweeps the full sub-0.3 range and finds the sweet spot.
//
// DENY_FACTOR sweep results (vs claude-v36, SPRT gauntlet, both seed streams):
//   0.15 → EVEN (+0.0 Elo)
//   0.10 → +15.9 train / +21.6 holdout
//   0.075 → +27.9 train / +80.6 holdout
//   0.0625 → +28.6 train / +66.8 holdout ← PEAK (both streams pass)
//   0.056 → +11.8 (declining)
//   0.05 → +1.2 (noise)
//   0.00 → +7.5
//
// Two changes vs jane-v2:
//   DENY_FACTOR 0.3 → 0.0625 (+28.6 Elo vs claude-v36)
//   SURVIVAL_FACTOR 1.5 → 2.0 (marginal +0.6, within noise)
//
// All other 9 dials swept with no signal (HOUSE_SCARCE, HOTEL_CUSHION,
// BASE_FLOOR, FLOOR_RENT_FRACTION, FLOOR_CAP, UTIL_PAIR_BONUS, RAIL_SYNERGY,
// JAIL_DANGER_RENT, ACCEPT_MARGIN — all within noise).
export { claudeBot as janeV3Bot } from "./policy";

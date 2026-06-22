// opt-v1 — the OPT lineage, a PARADIGM-named family (like trade-v / search-v):
// namespaced by the METHOD that produced it, not an authoring machine. opt-v1 is
// claude-v38's policy VERBATIM with its full 15-constant tuning vector JOINTLY
// optimized by an Evolutionary Strategy — the breakout the hand-tuned archive
// never attempted. Every prior version moved ONE or TWO constants at a time,
// SPRT-gated; here the ES sampled the WHOLE vector and followed the
// fitness-shaped natural gradient, so it could find COMBINATIONS hand-tuning
// could not reach.
//
// HOW IT WAS PRODUCED: a faithful parameterized copy of claude-v38 (the same
// factory baked here in `bot.ts`, pinned byte-identical at DEFAULT_PARAMS) was
// scored by WIN-SHARE vs the diverse ANCHOR PANEL
// [claude-v2, claude-v5, claude-v17, claude-v35, jane-v2, claude-v36] over a fixed
// TRAIN seed stream (common random numbers within a generation). A Separable
// Natural Evolution Strategy (SNES) followed the fitness gradient over the
// 15-dim parameter space. The winning vector — `OPT_V1_PARAMS` below, the
// `bestParams` from seed-1 of the search (train fitness 75.33% win-share vs the
// panel; baseline claude-v38 ≈ 58%) — is frozen here as PLAIN STATIC NUMBERS.
//
// FIDELITY: opt-v1 binds the SAME proven factory the ES optimized to its winning
// vector — it is NOT a hand-transcription of 15 constants into a copy of
// claude-v38. So the fielded bot is provably the bot the ES scored: at
// DEFAULT_PARAMS the factory reproduces claude-v38 move-for-move (re-pinned in
// `policy.test.ts`), and opt-v1 differs from it ONLY by these numbers. It is a
// pure, deterministic, self-contained rule bot — no cross-version imports, no
// `optimize/` imports, no Math.random/Date.
//
// NOTABLE PARAM DELTAS vs claude-v38 (default → opt-v1):
//   - denyFactor        0.15  → 0.387   (also raises RIVAL_THREAT_FACTOR in lockstep)
//   - bonusScale        16489 → 20956   (whole monopoly-vs-cash tradeoff scaled up)
//   - railSynergyScale  1.0   → 1.41
//   - jailDangerRent    350   → 150     (sits in jail on far less developed boards)
//   - raiseWorthMult    1.25  → 1.99    (mortgages to buy only for much clearer value)
//   - survivalFactor    1.5   → 0.81    (less weight on a distressed seller's cash)
//   - houseScarce       6     → 3       (hoards houses only in a tighter shortage)
//   - baseFloor         60    → 31      (thinner bare reserve → more cash deployed)
//   - acceptMargin      30    → 16      (sweetens trades to a smaller acceptance cushion)
//   (utilPairBonus, floorRentFraction, floorCap, hotelCushion, liquidityRiskGain,
//    dipWorthMult also moved by smaller amounts — full vector below.)
//
// The ES MAXIMIZED win-share vs the panel on the TRAIN stream; the honest verdict
// is the held-out crown gauntlet, owned by the orchestrator — not this header.
import { type ParamVector, makeParamBot } from "./bot";

/** The ES-winning parameter vector (SNES, seed-1 `bestParams`). Frozen as plain
 *  static numbers — the single source of truth for what opt-v1 IS. Every field is
 *  the optimizer's exact output; `policy.test.ts` pins these against the recorded
 *  search result so a stray edit can't silently change the fielded bot. */
const OPT_V1_PARAMS: ParamVector = {
  denyFactor: 0.3867036270605299,
  bonusScale: 20955.74232563981,
  railSynergyScale: 1.411278168704543,
  utilPairBonus: 64.21758500422052,
  baseFloor: 30.745803550413537,
  floorRentFraction: 0.26862607621806633,
  floorCap: 275.2457310929403,
  hotelCushion: 320.2665619052735,
  houseScarce: 3.0689279992889134,
  jailDangerRent: 150,
  acceptMargin: 16.309276955521433,
  survivalFactor: 0.8084680823414464,
  liquidityRiskGain: 340.42757614807084,
  dipWorthMult: 1.5644087060015985,
  raiseWorthMult: 1.9860940026394964,
};

export { OPT_V1_PARAMS };

/** The frozen opt-v1 bot: the parameterized claude-v38 factory bound to the
 *  ES-winning vector. */
export const optV1Bot = makeParamBot(OPT_V1_PARAMS);

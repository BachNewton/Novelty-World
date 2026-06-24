// claude-v44 — Claude lineage, authored by Claude Code. The COMBINED-SPACE ES
// champion candidate: the claude-v38-shaped 31-param factory (28 base tuning
// constants + claude-v41's three seller-side trade levers) with EVERY dimension
// co-tuned jointly by a maximin Evolutionary Strategy (SNES).
//
// WHY combined-space. claude-v41 (the crown) sits ~10 Elo below the opt-v* cluster
// on the ladder, and the hand-built substrate swaps that chased "champion AND top
// Elo" both REGRESSED (claude-v42 on opt-v3, claude-v43 on opt-v2): the trade
// pricing and the base vector are COUPLED — `denialPositionCost` is keyed off
// `denyFactor`, and the v41 levers were tuned on opt-v4 — so they can only be set
// in concert, by the ES, not by hand. So this run folded the three v41 trade
// levers (`rivalThreatFactor`, `holderDenialFrac`, `deployabilityDiscount`) INTO
// the 28-param base space (31 dims total) and let the ES move them together.
//
// THE RUN. `npm run sim:optimize --pop 36 --gens 30 --games 990 --fitness maximin
// --workers 14 --seed 1` against the 10-member RATING_PANEL field. Baseline
// claude-v38 (the default vector) scored maximin 35.35% (worst matchup vs opt-v2);
// this winner lifted the WORST panel matchup to 69.70% — every panel member ≥69.7%,
// the two former weak spots (opt-v2, claude-v41) now its floor. The ES turned the
// trade levers ON (holderDenialFrac 0→0.46, deployabilityDiscount 0→0.60,
// rivalThreatFactor decoupled to 0.34) and re-shaped the set-value ranking
// (light-blue/orange up, red/yellow/dark-blue/green floored).
//
// FIDELITY: binds the SAME factory in `./bot.ts` (a verbatim copy of the 31-param
// `optimize/bot.ts`) to the winning vector below; pure, deterministic, self-
// contained (no cross-version / `optimize/` imports, no Math.random / Date). The
// factory's no-op-default fidelity to claude-v38 is pinned by
// `optimize/param-fidelity.test.ts`. Crown-gate status is recorded in EVOLUTION.md.
import { type ParamVector, makeParamBot } from "./bot";

/** The combined-space maximin ES winner (31 dims, co-tuned). Worst panel matchup
 *  69.70% (vs claude-v38's 35.35%). Copied verbatim from the run's
 *  `optimize/best-vector.json` (`--seed 1`). */
const CLAUDE_V44_PARAMS: ParamVector = {
  denyFactor: 0.10424595338999776,
  bonusScale: 12319.680680754447,
  railSynergyScale: 1.0631638801418597,
  utilPairBonus: 68.54614780321296,
  baseFloor: 0,
  floorRentFraction: 0.1,
  floorCap: 100,
  hotelCushion: 191.14147226467384,
  houseScarce: 6.581739014680775,
  jailDangerRent: 150,
  acceptMargin: 5,
  survivalFactor: 2.924201534053176,
  liquidityRiskGain: 481.55782931413603,
  dipWorthMult: 1.3633338433426045,
  raiseWorthMult: 1.880074167967108,
  monoMultOrange: 2.2187703712119484,
  monoMultRed: 0.3,
  monoMultLightBlue: 2.635033129650045,
  monoMultPink: 1.38803726682945,
  monoMultYellow: 0.3,
  monoMultDarkBlue: 0.3,
  monoMultGreen: 0.3,
  monoMultBrown: 0.9359984888364441,
  railSynergy2: 0,
  railSynergy3: 114.10069101114836,
  railSynergy4: 671.4373656163531,
  distressSafeRatio: 2.1464849122600227,
  spreadFloor: 4,
  rivalThreatFactor: 0.34223274250450647,
  holderDenialFrac: 0.46116817823802936,
  deployabilityDiscount: 0.5985890918407256,
};

export { CLAUDE_V44_PARAMS };

/** The frozen claude-v44 bot: the 31-param factory bound to the combined-space
 *  maximin ES winner (base vector + the three v41 seller-side trade levers,
 *  jointly co-tuned). */
export const claudeV44Bot = makeParamBot(CLAUDE_V44_PARAMS);

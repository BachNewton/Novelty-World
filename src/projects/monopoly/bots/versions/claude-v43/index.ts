// claude-v43 — Claude lineage. The ROBUSTNESS-comparison sibling of claude-v42:
// claude-v41's seller-side trade logic bound to the **opt-v2 base vector** instead
// of opt-v3's.
//
// WHY a second candidate. opt-v3 (claude-v42's base) tops the Elo ladder but is a
// panel-overfit counter that loses to jane-v4. opt-v2 is the ROBUST ex-crown —
// maximin-optimized, "beats the whole archive out-of-panel, no losses." So v43 is
// the lower-ceiling / higher-floor bet: opt-v2 + the seller-side trade logic is more
// likely to clear the out-of-panel check and crown, even if its raw Elo lands below
// v42's. Running both isolates whether the win comes from raw vector strength
// (opt-v3) or robustness (opt-v2), under identical trade logic.
//
// Differs from claude-v41 by EXACTLY the base vector (opt-v2's 15 constants instead
// of opt-v4's); the trade logic in `bot.ts` is verbatim v41.
import { type ParamVector, makeParamBot } from "./bot";

/** The opt-v2 ES-winning vector (the robust ex-crown, maximin) plus claude-v41's two
 *  seller-side trade params. The 15 opt-v2 constants are verbatim from
 *  `versions/opt-v2/index.ts`; `policy.test.ts` pins that equality. */
const CLAUDE_V43_PARAMS: ParamVector = {
  // opt-v2 ES-winning vector (the robust ex-crown) — verbatim
  denyFactor: 0.4077865202089374,
  bonusScale: 16445.344286753978,
  railSynergyScale: 1.0097635130054328,
  utilPairBonus: 72.64042699522366,
  baseFloor: 45.13399032273108,
  floorRentFraction: 0.12619316909714123,
  floorCap: 351.9653844143328,
  hotelCushion: 201.1938408133869,
  houseScarce: 0,
  jailDangerRent: 289.7154580600488,
  acceptMargin: 5,
  survivalFactor: 2.555873116250935,
  liquidityRiskGain: 195.01891918549356,
  dipWorthMult: 1.850819704440693,
  raiseWorthMult: 1.787002692643207,
  // claude-v41 seller-side trade params — carried over unchanged
  rivalThreatFactor: 0.4,
  deployabilityDiscount: 0.5,
};

export { CLAUDE_V43_PARAMS };

/** The frozen claude-v43 bot: opt-v2 base vector + claude-v41's seller-side trade
 *  logic (rivalThreatFactor 0.4, deployabilityDiscount 0.5, denialPositionCost). */
export const claudeV43Bot = makeParamBot(CLAUDE_V43_PARAMS);

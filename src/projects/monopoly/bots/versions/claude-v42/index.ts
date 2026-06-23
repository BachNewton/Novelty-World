// claude-v42 — Claude lineage. A SUBSTRATE-SWAP candidate: claude-v41's seller-side
// trade logic (decoupled rivalThreatFactor 0.4 + deployabilityDiscount 0.5 +
// denialPositionCost) bound to the **opt-v3 base vector** instead of opt-v4's.
//
// WHY. claude-v41 is the crown but sits #4 on the Elo ladder, behind the opt-v*
// cluster (opt-v3 210.7 leads). v41's trade logic is parameterized over the opt
// factory, so "champion AND top Elo" can be chased by keeping the trade logic and
// swapping the base vector to the ladder leader. opt-v3 is the highest-Elo vector
// but was recorded-not-crowned because it COUNTER-OVERFIT and loses to jane-v4
// out-of-panel. The open hypothesis this bot tests: does the seller-side pricing
// (stop gifting sets cheaply) fix opt-v3's jane-v4 hole? If so, opt-v3 + trade logic
// is both top-Elo AND robust → champion. If not, it's a higher-Elo counter, not a
// crown — and the out-of-panel check (jane-v4 decisive) will say which.
//
// This snapshot differs from claude-v41 by EXACTLY the base vector (opt-v3's 15
// constants instead of opt-v4's); the trade logic in `bot.ts` is verbatim v41, so a
// win/loss vs v41 is cleanly attributable to the substrate swap.
import { type ParamVector, makeParamBot } from "./bot";

/** The opt-v3 ES-winning vector (the ladder leader, 7-panel maximin) plus
 *  claude-v41's two seller-side trade params. The 15 opt-v3 constants are verbatim
 *  from `versions/opt-v3/index.ts`; `policy.test.ts` pins that equality. */
const CLAUDE_V42_PARAMS: ParamVector = {
  // opt-v3 ES-winning vector (the ladder leader) — verbatim
  denyFactor: 0.29201629002124435,
  bonusScale: 24758.083425980785,
  railSynergyScale: 1.2590710072564122,
  utilPairBonus: 47.46128844789236,
  baseFloor: 30.84576166961448,
  floorRentFraction: 0.1691826784984239,
  floorCap: 100,
  hotelCushion: 177.41733334829428,
  houseScarce: 5.760702561046529,
  jailDangerRent: 183.5945651907561,
  acceptMargin: 5,
  survivalFactor: 1.8289194430382332,
  liquidityRiskGain: 176.84648922354438,
  dipWorthMult: 1.6114562025539851,
  raiseWorthMult: 1.3210940236042945,
  // claude-v41 seller-side trade params — carried over unchanged
  rivalThreatFactor: 0.4,
  deployabilityDiscount: 0.5,
};

export { CLAUDE_V42_PARAMS };

/** The frozen claude-v42 bot: opt-v3 base vector + claude-v41's seller-side trade
 *  logic (rivalThreatFactor 0.4, deployabilityDiscount 0.5, denialPositionCost). */
export const claudeV42Bot = makeParamBot(CLAUDE_V42_PARAMS);

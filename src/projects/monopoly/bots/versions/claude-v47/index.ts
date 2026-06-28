// claude-v47 — Claude lineage, authored by Claude Code. A COMBINED-SPACE maximin ES
// run on the 33-param factory: claude-v45's 31 dims PLUS two RISK-AWARE / play-to-
// standing levers (`standingFloorGain`, `standingAuctionGain`), warm-started from
// claude-v45 with `holderDenialFrac` PINNED at the 1.0 lockstep.
//
// WHY. positionValue is risk-NEUTRAL; expert play modulates VARIANCE by rank. This
// run tests whether letting the ES scale the voluntary reserve and auction
// aggression by a STANDING RATIO (s = my positionValue / mean opponent positionValue)
// beats the risk-neutral champion. The factory's standing levers default to a no-op
// (factor ≡ 1), so claude-v38 fidelity is preserved; the ES turned them ON.
//
// WHAT IT FOUND. `standingFloorGain` = -0.783, `standingAuctionGain` = +0.379 — a
// coherent, counter-intuitive "PRESS YOUR LEAD" posture (the OPPOSITE of textbook
// "leader de-risks"): a LEADER (s>1) THINS its cash buffer and BIDS HARDER to press
// the advantage, while a laggard fattens the buffer and pulls back to survive. So the
// risk lever is real and the ES exploited it — but the in-sample maximin (55%) did NOT
// exceed the risk-NEUTRAL re-tune claude-v46 (57%, same warm-start). Crown-gate result
// recorded in EVOLUTION.md.
//
// FIDELITY: binds the 33-param factory in `./bot.ts` (claude-v46's self-contained
// 31-param factory + the two standing levers wired into liquidityFloor and auction).
// Pure, deterministic, self-contained — no cross-version imports.
import { type ParamVector, makeParamBot } from "./bot";

/** The combined-space maximin ES winner: claude-v45's substrate re-tuned with the two
 *  risk-aware standing levers FREE and `holderDenialFrac` pinned to the 1.0 lockstep. */
const CLAUDE_V47_PARAMS: ParamVector = {
  denyFactor: 0.4038125470285816,
  bonusScale: 17519.528103416887,
  railSynergyScale: 1.4140827030404997,
  utilPairBonus: 54.2374698512365,
  baseFloor: 22.444539909018186,
  floorRentFraction: 0.23899167639291538,
  floorCap: 110.75956657892091,
  hotelCushion: 152.5488070490127,
  houseScarce: 7.326270216141088,
  jailDangerRent: 193.32365721344223,
  acceptMargin: 5,
  survivalFactor: 3,
  liquidityRiskGain: 492.40183249835053,
  dipWorthMult: 1.3738179273801026,
  raiseWorthMult: 1.396817807139978,
  monoMultOrange: 2.1169597029097726,
  monoMultRed: 0.3,
  monoMultLightBlue: 2.8714358458827305,
  monoMultPink: 1.9529423558214662,
  monoMultYellow: 0.5304462850796028,
  monoMultDarkBlue: 0.9015995592632191,
  monoMultGreen: 0.3756242225970535,
  monoMultBrown: 0.9723702814866542,
  railSynergy2: 82.52583924316099,
  railSynergy3: 194.20107654194038,
  railSynergy4: 634.4216265986307,
  distressSafeRatio: 2.900614569560121,
  spreadFloor: 4,
  rivalThreatFactor: 0.3246161179664244,
  holderDenialFrac: 1, // PINNED to the buyer/holder lockstep (out of the ES search)
  deployabilityDiscount: 0.38154219128538314,
  standingFloorGain: -0.7831316413384607, // leader thins reserve, laggard fattens it
  standingAuctionGain: 0.3791823597569737, // leader bids harder, laggard pulls back
};

export { CLAUDE_V47_PARAMS };

/** The frozen claude-v47 bot: the 33-param risk-aware factory bound to the ES winner. */
export const claudeV47Bot = makeParamBot(CLAUDE_V47_PARAMS);

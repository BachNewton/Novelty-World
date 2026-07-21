// jane-v19 — RIVAL SURVIVAL LIFELINE PENALTY (J10) on jane-v18 substrate.
//
// jane-v18 passed the crown gate 13/13 BETTER (J9 self-deployability, Elo +22.9).
// J9 corrected the SELF side of deployability in trade evaluation.
//
// J10 corrects the RIVAL side of the survival credit. The F2a survival credit
// boosts my delta when I RECEIVE cash in distress — but when I PAY cash to a
// distressed opponent, there is NO penalty, even though that cash is a lifeline
// that erases their distress and keeps a rival alive. Outgoing cash to a
// distressed opponent is priced at pure face value when its true cost is higher.
//
// J10 adds a rivalSurvivalLifeline penalty to evaluateTrade's delta:
//   - For each opponent receiving cash who is in distress (via distressDetail):
//     penalty += min(cashReceived, needToSafe) × distress × survivalFactor
//   - Total scaled by rivalSurvivalPenalty gain (0 = jane-v18, 1.0 = full mirror)
//   - Bounded by needToSafe — only the cash that actually erases distress counts
//
// This is orthogonal to J9: J9 corrects self-side gain pricing (my undeveloped
// completion), J10 corrects rival-side survival pricing (keeping rivals alive).
// Both target the trade evaluation pipeline only.
//
// Vector: jane-v18's verbatim + rivalSurvivalPenalty 1.0.
import { type ParamVector, makeParamBot } from "./bot";

/** jane-v18's vector verbatim + rival survival lifeline penalty (J10). */
export const JANE_V19_PARAMS: ParamVector = {
  denyFactor: 0.12384655676923122,
  bonusScale: 13640.754394663116,
  railSynergyScale: 1.0463402203744872,
  utilPairBonus: 66.67381996299682,
  baseFloor: 12.24453641337673,
  floorRentFraction: 0.26937313457834133,
  floorCap: 100,
  hotelCushion: 136.04868898472105,
  houseScarce: 3.2908695073403873,
  jailDangerRent: 150,
  acceptMargin: 9.297585157231296,
  survivalFactor: 2.5292357439234783,
  liquidityRiskGain: 540.7789146570681,
  dipWorthMult: 1.5515253724147804,
  raiseWorthMult: 1.9463457079924788,
  monoMultOrange: 2.5755635173849005,
  monoMultRed: 0.41465754521383813,
  monoMultLightBlue: 2.8175165648250227,
  monoMultPink: 1.9149203353908986,
  monoMultYellow: 0.3,
  monoMultDarkBlue: 0.3,
  monoMultGreen: 0.3,
  monoMultBrown: 1.1027110262118955,
  railSynergy2: 70,
  railSynergy3: 184.97982131130476,
  railSynergy4: 705.9855374403176,
  distressSafeRatio: 2.344844651651207,
  spreadFloor: 4,
  rivalThreatFactor: 0.29399434765389476,
  holderDenialFrac: 1,
  deployabilityDiscount: 0.7075095002294787,
  flowFloorFrac: 0.4667301344841967,
  flowTailFrac: 0.14073658893809662,
  flowFloorCap: 446.9120281864929,
  voluntaryTailFrac: 1,
  auctionLiquidCap: 1,
  survivalEquityGain: 1,
  tradeTailFrac: 0.5,
  transformTailFrac: 0.5,
  flowSecondRollFrac: 0.4985865026651327,
  jailStayThreshold: 0,
  jailExitProb: 0.22722169063844416,
  buildTempo: 0.9612244529359772,
  survivalBounded: 1,
  standingThreatGain: 2.1916625996604475,
  synergyThreatFrac: 2.2109262,
  headsUpThreatMult: 1.8453518893375724,
  liqGuardFrac: 0.49783722246807216,
  transferMemoryTurns: 10,
  extractionOn: 1,
  scalpFrac: 0.19550986128061631,
  selfLeadGain: 0,
  // J1 — collateralized development (from jane-v6).
  collateralDev: 1,
  // J2 — greedy marginal-EV build optimizer (from jane-v10).
  greedyBuild: 1,
  // J3 — income flow: opponent-aware monopoly income in positionValue.
  incomeFlow: 1.0,
  // J4 — threat exposure: expected outgo discounted in positionValue.
  threatExposure: 1.0,
  // J5 — income amortization: scale incomeFlow by game-phase horizon (1×-3×).
  incomeHorizon: 1.0,
  // J8 — rival deployability: scale rivalThreatCost by opponent's build capacity.
  rivalDeployability: 1.0,
  // J9 — self deployability: discount monopoly bonus when I can't develop it.
  selfDeployability: 1.0,
  // J10 — rival survival lifeline: penalize cash paid to distressed opponents.
  rivalSurvivalPenalty: 1.0,
};

/** The frozen bot: jane-v18's vector + rival survival lifeline penalty (J10). */
export const janeV19Bot = makeParamBot(JANE_V19_PARAMS);

// jane-v18 — SELF-DEPLOYABILITY DISCOUNT ON MONOPOLY COMPLETION (J9) on jane-v17 substrate.
//
// jane-v17 is champion (rivalDeployability J8, Elo +23.8). J8 corrected the
// RIVAL side: when arming an opponent, price their threat by whether they can
// actually develop the set post-trade.
//
// J9 corrects the SELF side (mirror of J8): when a trade completes MY monopoly
// but I can't afford to develop it post-trade, the flat monopolyBonus in
// positionValue overvalues the completion. A bare monopoly is stuck at 2× base
// rent — far below the development-dependent value the bonus encodes.
//
// J9 adds a selfDeployabilityPenalty to evaluateTrade's delta:
//   - 0 house levels affordable → 0.3× monopolyBonus discounted per completed set
//   - 3+ house levels affordable → no discount (can develop meaningfully)
//   - Default gain=0 → no change → jane-v17 behavior
//
// This is orthogonal to J8: J8 corrects rival-threat pricing, J9 corrects
// self-gain pricing. Both target the trade evaluation pipeline only.
//
// Vector: jane-v17's verbatim + selfDeployability 1.0.
import { type ParamVector, makeParamBot } from "./bot";

/** jane-v17's vector verbatim + self deployability discount (J9). */
export const JANE_V18_PARAMS: ParamVector = {
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
};

/** The frozen bot: jane-v17's vector + self-deployability discount (J9). */
export const janeV18Bot = makeParamBot(JANE_V18_PARAMS);

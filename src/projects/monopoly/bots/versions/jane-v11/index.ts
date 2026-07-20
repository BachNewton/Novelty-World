// jane-v11 — OPPONENT-AWARE EVALUATION on the jane-v10 (greedy build) substrate.
//
// Four consecutive versions (v7-v10) beat the entire panel but couldn't separate
// from jane-v6 in self-play (50.0-50.4%, LLR ~-3.0). The problem is NOT in build
// heuristics, trade logic, or auction strategy — those beat all external bots.
// The problem is in positionValue: the CORE EVALUATION FUNCTION.
//
// jane-v6's positionValue is purely static: cash + book value + flat monopoly
// bonus + rail/utility synergy. It has ZERO opponent awareness. It doesn't know
// what income my monopolies generate, or what threats I face from opponents.
//
// jane-v11 adds two opponent-aware terms to positionValue:
//
//   J3 (incomeFlow): expected rent my developed monopolies collect next opponent
//       turn, computed from actual dice probabilities and current opponent
//       positions. A monopoly worth MORE when opponents are positioned to land
//       on it. This changes valuation at ALL 7 positionValue call sites:
//       acquisition, trade evaluation, standing ratio, opponent comparison.
//
//   J4 (threatExposure): expected rent I'll pay on my next roll landing on
//       opponent properties. Discounts positions where I face high-rent threats.
//
// Both default to 0 (reproduces jane-v10 exactly). This is a structural change
// to the EVALUATION FUNCTION — the thing that hasn't been touched since the
// bot lineage began.
//
// Vector: jane-v10's verbatim + incomeFlow 1.0 + threatExposure 1.0.
import { type ParamVector, makeParamBot } from "./bot";

/** jane-v10's vector verbatim + opponent-aware evaluation (see header). */
export const JANE_V11_PARAMS: ParamVector = {
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
  raiseWorthMult: 1.9463457079924478,
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
};

/** The frozen bot: opponent-aware eval bound to jane-v10's vector. */
export const janeV11Bot = makeParamBot(JANE_V11_PARAMS);

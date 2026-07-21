// jane-v22 — GAME-PHASE CASH DISCOUNT (J13) on jane-v20 substrate.
//
// jane-v20 passed: 35 BETTER, 3 INCONCLUSIVE, 3 EVEN, 0 WORSE across 41 pairings.
// J11 bounded survival credit in the opponent model.
// jane-v21 (J12 equity-weighted lifeline penalty) was REJECTED: 36 BETTER, 3
// INCONCLUSIVE, 2 EVEN, 1 WORSE vs jane-v20 base mirror (46.4%).
//
// J13 discounts idle cash's contribution to positionValue by game phase.
// Currently positionValue credits cash at strict face value (value = player.cash),
// while J5's income horizon multiplier amplifies property income up to 3× in
// late game. This asymmetry overvalues idle cash in the endgame — cash generates
// nothing while income compounds. J13 linearly discounts cash by game phase
// (measured by total developed properties / 40): 0% discount at game start,
// up to `cashPhaseDiscount` (30%) at full development. This makes the bot more
// willing to deploy capital (build, trade cash for properties) in late game
// rather than hoarding.
//
// Vector: jane-v20's verbatim + cashPhaseDiscount 0.3.
import { type ParamVector, makeParamBot } from "../jane-v20/bot";

/** jane-v20's vector verbatim + game-phase cash discount (J13). */
export const JANE_V22_PARAMS: ParamVector = {
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
  monoMultLightBlue: 2.8175165648254227,
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
  // J11 — bound survival credit in opponent model too (F2a was self-only).
  oppSurvivalBounded: 1.0,
  // J12 — equity-weighted lifeline penalty (disabled; J12 was rejected in v21).
  lifelineEquityGain: 0,
  // J13 — game-phase cash discount: 30% at max development.
  cashPhaseDiscount: 0.3,
};

/** The frozen bot: jane-v20's vector + game-phase cash discount (J13). */
export const janeV22Bot = makeParamBot(JANE_V22_PARAMS);

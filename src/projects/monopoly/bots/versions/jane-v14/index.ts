// jane-v14 — THREAT EXPOSURE AMORTIZATION HORIZON (J6) on jane-v13.
//
// jane-v13 (J5) fixed the income side: incomeFlow now correctly values
// developed monopolies by amortizing over a game-phase-aware horizon
// (1× early → 3× late). This passed Kyle's new criteria (12/12 panel BETTER,
// mirror INCONCLUSIVE 50.9%).
//
// jane-v14 adds J6 (threatHorizon): the symmetric counterpart on the
// OUTGO side. jane-v11's threatExposure only counted ONE turn of expected
// rent I'd pay landing on opponent properties. But in late game, being
// positioned near developed opponent monopolies is a persistent recurring
// threat — I'll keep paying rent turn after turn as the board fills up.
// J6 applies the same phase-aware horizon multiplier to threatExposure.
//
// Together J5+J6 form a complete phase-aware net-income projection:
//   netValue ≈ Σ(inflow × horizon) − Σ(outflow × horizon)
// Both inflows and outflows are correctly amortized over remaining game.
//
// The risk: amortizing threatExposure could make v14 overly cautious in
// late game, declining beneficial positions because they're "near" opponent
// monopolies. This may help (avoiding death spirals) or hurt (over-defensive
// play that cedes tempo). The gauntlet will tell.
//
// Vector: jane-v13's verbatim + threatHorizon 1.0.
import { type ParamVector, makeParamBot } from "./bot";

/** jane-v13's vector verbatim + threat exposure amortization horizon (J6). */
export const JANE_V14_PARAMS: ParamVector = {
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
  // J6 — threat amortization: scale threatExposure by game-phase horizon (1×-3×).
  threatHorizon: 1.0,
};

/** The frozen bot: amortized income + threat evaluation on jane-v11's vector. */
export const janeV14Bot = makeParamBot(JANE_V14_PARAMS);

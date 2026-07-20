// jane-v15 — ASYMMETRIC AMORTIZATION HORIZON on jane-v13.
//
// jane-v14 added J6 (threatHorizon=1.0) — the symmetric counterpart to J5.
// The gauntlet showed 12/12 panel BETTER but weaker Elo than v13 (+1.9 vs
// +5.1). The threat amortization made the bot overly cautious in late-game
// positioning, trading aggression vs weaker opponents for defensive play.
//
// jane-v15 keeps the threatHorizon machinery but reduces it to 0.5 — half
// the horizon multiplier strength of incomeHorizon. The hypothesis: the
// asymmetry between inflows and outflows matters. Your own income is
// guaranteed (opponents WILL land on your monopolies eventually), but the
// threat of paying rent is partly mitigable (you can trade, mortgage, or
// develop to change the board). A 0.5 factor captures this: count income
// at full amortization but threats at half, since threats are more volatile.
//
// The bot.ts code already supports independent scaling via the
// incomeHorizon/threatHorizon flags. Only the index.ts param changes.
//
// Vector: jane-v13's verbatim + incomeHorizon 1.0 + threatHorizon 0.5.
import { type ParamVector, makeParamBot } from "./bot";

/** jane-v13's vector verbatim + asymmetric amortization horizon (J5=1.0, J6=0.5). */
export const JANE_V15_PARAMS: ParamVector = {
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
  // J6 — threat amortization: half-strength (0.5). Threats are more volatile
  // than guaranteed income — they're mitigable via trades/mortgages/development.
  threatHorizon: 0.5,
};

/** The frozen bot: asymmetric amortized evaluation on jane-v11's vector. */
export const janeV15Bot = makeParamBot(JANE_V15_PARAMS);

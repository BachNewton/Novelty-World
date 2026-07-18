// jane-v6 — the COLLATERALIZED DEVELOPMENT bot on the fable-v8 substrate.
//
// The Jane lineage's first bot on the Fable factory (47-param). The structural
// innovation: planBuild now mortgages non-monopoly singletons to fund house
// construction on monopolies that couldn't be built from cash alone.
//
// The gap (identified via white-box source analysis of fable-v8, Jul 18):
// Fable's planBuild only builds from liquid cash. When a bot has monopolies
// but limited cash, it leaves capital stranded in undeveloped singletons
// (rails, utilities, incomplete-set properties) while its monopolies sit
// underdeveloped. Monopoly rent at 3 houses massively exceeds the 10%
// mortgage interest cost, so collateralizing is positive-EV.
//
// The fix (J1 — collateralDev): after the standard fable-v8 planBuild passes
// complete, if desired levels weren't reached, identify unmortgaged
// non-monopoly properties, greedily mortgage them (cheapest first), and retry
// building monopoly houses with the freed cash. All existing safety guards
// remain: the flow floor, tail guard, and manageSummary validity checks.
//
// Vector: fable-v8's verbatim + collateralDev 1.
import { type ParamVector, makeParamBot } from "./bot";

/** fable-v8's vector verbatim + collateralized development (see header). */
export const JANE_V6_PARAMS: ParamVector = {
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
  // J1 — collateralized development (see header).
  collateralDev: 1,
};

/** The frozen bot: the collateralized-development factory bound to its vector. */
export const janeV6Bot = makeParamBot(JANE_V6_PARAMS);

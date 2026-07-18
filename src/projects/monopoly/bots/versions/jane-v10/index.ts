// jane-v10 — the GREEDY MARGINAL-EV BUILD OPTIMIZER on the jane-v6 substrate.
//
// Three consecutive failures (jane-v7/v8/v9) at the self-play wall proved that
// incremental behavioral modifications to jane-v6's evaluation don't change
// mirror play. Each beat the entire panel but couldn't separate from jane-v6
// in self-play (50.0-50.4%, LLR ~-3.0).
//
// jane-v10 replaces jane-v6's "spread all monopolies to spreadFloor (4), then
// push to desiredLevel" heuristic with a GREEDY MARGINAL-EV OPTIMIZER that:
//
//   1. Enumerates every possible single-level upgrade across ALL monopolies
//   2. Computes marginal expected rent per dollar for each, using actual
//      dice-based opponent landing probabilities and position-specific rents
//   3. Greedily picks the highest EV-per-dollar upgrade, applies it, repeats
//   4. Produces non-uniform final levels (e.g. orange→5 while green stays→2)
//      instead of jane-v6's uniform spread
//   5. Extends collateralized development into the greedy loop
//
// This is a structural change to the DECISION PROCESS (a heuristic → an
// optimizer), not a parameter tweak. A better algorithm should win more in
// expectation regardless of symmetry, because it makes better capital-
// allocation decisions with the same resources.
//
// Vector: jane-v6's verbatim + greedyBuild 1.
import { type ParamVector, makeParamBot } from "./bot";

/** jane-v6's vector verbatim + greedy marginal-EV build optimizer (see header). */
export const JANE_V10_PARAMS: ParamVector = {
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
  // J2 — greedy marginal-EV build optimizer (new in jane-v10).
  greedyBuild: 1,
};

/** The frozen bot: greedy-EV build optimizer bound to jane-v6's vector. */
export const janeV10Bot = makeParamBot(JANE_V10_PARAMS);

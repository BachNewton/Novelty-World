// fable-v6 — COMEBACK-
// EQUITY SURVIVAL on the fable-v5 substrate: survival cash is worth the win
// probability it preserves, not its face value.
//
// Evidence — three independent streams, one mechanism:
//   - game:review 4q3y6i T222→T229: a beaten bot sold its held completer for
//     $55 of "survival" cash, the buyer went bankrupt handing the lot to the
//     human leader, and the seller then paid $450 rent ON THAT SAME LOT and
//     died. The $55 financed its own loss.
//   - Fable-played probe game 1 (vs fable-v2): a distressed bot accepted a
//     first-offer $60 lowball for a $200-book railroad, no counter.
//   - Fable-played probe game 2 (vs fable-v3): the new 0.65×delta rail charge
//     HELD against a healthy bot (3rd rail refused to book+$150) but was
//     bypassed twice through distress — a distressed seat sold the network-
//     completing 4th rail at book+$50, and an extraction ask cleared its own
//     evaluator the same way. In every case the F2a survival credit
//     (cash × distress × 2.53) swamped the correctly-priced threat charge.
//
// The change (factory revision, one new dim): `survivalEquityGain` — the F2a
// survival credit is scaled by `positionValue(me) / positionValue(strongest
// live opponent)`, clamped [0,1]. A seat still near parity keeps its full
// premium (distress-shedding stays protective, the v35 lesson); a beaten seat
// loses it smoothly and stops fire-selling to finance the winner. Forced
// charges and genuine liquidation (must-raise-cash) are untouched — this only
// reprices VOLUNTARY trade accepts/proposals.
//
// Vector: fable-v5's verbatim + survivalEquityGain 1.
import { type ParamVector, makeParamBot } from "./bot";

/** fable-v5's vector verbatim + the comeback-equity gain (see header). */
export const FABLE_V6_PARAMS: ParamVector = {
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
  // F7 — the comeback-equity survival scaling (see header).
  survivalEquityGain: 1,
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
};

/** The frozen bot: the comeback-equity factory bound to its vector. */
export const fableV6Bot = makeParamBot(FABLE_V6_PARAMS);

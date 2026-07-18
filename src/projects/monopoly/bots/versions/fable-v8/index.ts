// fable-v8 — the TRANSFORMATIVE-TRADE RESERVE on the fable-v7 substrate: the
// F8 exemption stops being total.
//
// Evidence (Fable-played probe game 4, vs 3× fable-v7 — the crown WON the
// game, and the v7 guard validated live by refusing the v6 death trade three
// times): the set-completion exemption still let a ~97% wallet drain through —
// a seat paid $430 of a $442 wallet for a light-blue completer, kept $7,
// never afforded a single $50 house on the set it had just completed, and
// went bankrupt 30 turns later. Completing the set was doctrine-correct
// (bold acquisition); being left unable to DEVELOP it strands the bonus the
// boldness was buying. The v6-era $220-of-$221 completer buy was the same
// pattern — two probes, one mechanism.
//
// The change (factory revision, one new dim): `transformTailFrac` — a
// transformative trade (delta ≥ liquidityRiskGain) must still leave
// transformTailFrac × the F8 reserve (tradeTailFrac × worst board hit): 0.5
// halves the reserve for completers rather than zeroing it. This is a floor
// on the PRICE PAID for a set, never a discount on what the set is worth —
// the rejected cash-scaled-monopoly-value idea stays rejected
// (bots/CLAUDE.md "Considered and rejected").
//
// Vector: fable-v7's verbatim + transformTailFrac 0.5.
import { type ParamVector, makeParamBot } from "./bot";

/** fable-v7's vector verbatim + the transformative reserve (see header). */
export const FABLE_V8_PARAMS: ParamVector = {
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
  // F8 — the trade-outflow tail guard (fable-v7; see its index.ts).
  tradeTailFrac: 0.5,
  // F9 — the transformative-trade reserve (see header).
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
};

/** The frozen bot: the transformative-reserve factory bound to its vector. */
export const fableV8Bot = makeParamBot(FABLE_V8_PARAMS);

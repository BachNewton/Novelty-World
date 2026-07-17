// fable-v4 — the VOLUNTARY-SPEND TAIL GUARD on the fable-v3 substrate: the
// second defect-removal from game:review 4q3y6i.
//
// Evidence (T219→T222): a fable-v2 seat (Mark) voluntarily spent $506
// unmortgaging bare greens while the human leader's hotel board was live, then
// went bankrupt three turns later to a $118 rent it could no longer cover. The
// flow floor structurally allows this: it reserves `0.467 × expected +
// 0.141 × worst`, CAPPED at $447 — a $950 single-landing tail is reserved at
// ~$134. The same under-reserve drove the build→forced-sell→rebuild whipsaw
// (nine green houses sold at half, twice, in the same game).
//
// The change (factory revision, one new dim): `voluntaryTailFrac` — a
// discretionary spend in `planBuild` (build / redeploy / unmortgage) must ALSO
// leave cash ≥ voluntaryTailFrac × the WORST single next-roll landing,
// uncapped, scaled by jail mobility. Forced charges and trade pricing are
// untouched: the design keeps "bold about acquiring, patient about developing"
// — it defers development while the token is inside a lethal window, it never
// stops acquisition. 1.0 = survive the worst hit outright; 0 = fable-v3.
//
// Vector: fable-v3's verbatim + voluntaryTailFrac 1.0.
import { type ParamVector, makeParamBot } from "./bot";

/** fable-v3's vector verbatim + the tail guard (see header). Self-contained
 *  per the snapshot rule — no import from fable-v3. */
export const FABLE_V4_PARAMS: ParamVector = {
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
  // F5 — the tail guard (see header): survive the worst single next-roll hit.
  voluntaryTailFrac: 1,
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

/** The frozen fable-v4 bot: the tail-guard factory bound to its vector. */
export const fableV4Bot = makeParamBot(FABLE_V4_PARAMS);

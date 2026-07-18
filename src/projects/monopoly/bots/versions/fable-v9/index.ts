// fable-v9 — the RE-PITCH MINIMUM STEP on the fable-v8 substrate: a declined
// trade may only be re-proposed with a MEANINGFUL sweetening, not a cosmetic
// dollar.
//
// Evidence (both Fable-played probe games vs the crown line): fable-v6
// re-proposed one identical 3-way completer swap 5 times; fable-v7 did it 7
// times, with +3–10% cosmetic repricing that never converged. Mechanism: the
// decline-memory unblocks a re-pitch on ANY improvement for the decliner, and
// the ask constructor re-solves a slightly different price every turn — so
// the guard that exists to stop re-pitch loops instead paces them. Against a
// human this is also the decline-walk-down channel (each decline farms a
// discount) — the spam is the tell's delivery vehicle.
//
// The change (factory revision, one new dim): `repitchMinStep` — identical
// asset terms may be re-proposed only when the decliner's cash terms improve
// by at least this much. 1 reproduces the old any-improvement rule exactly;
// 50 makes each re-ask a real concession, collapsing the 5–7-pitch spam to
// ~2–3 meaningful steps.
//
// Vector: fable-v8's verbatim + repitchMinStep 50.
import { type ParamVector, makeParamBot } from "./bot";

/** fable-v8's vector verbatim + the re-pitch step (see header). */
export const FABLE_V9_PARAMS: ParamVector = {
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
  // F9 — the transformative-trade reserve (fable-v8; see its index.ts).
  transformTailFrac: 0.5,
  // F10 — the re-pitch minimum step (see header).
  repitchMinStep: 50,
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

/** The frozen bot: the re-pitch-step factory bound to its vector. */
export const fableV9Bot = makeParamBot(FABLE_V9_PARAMS);

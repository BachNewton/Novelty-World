// fable-v2 — the MIDPOINT of the fable-v1 → ES-winner line, chosen by
// line-search on fresh seed streams.
//
// Provenance: the 2026-07-17 combined-space ES campaign (aggregate fitness,
// all 47 dims of the fable factory co-tuned jointly, warm-started from
// fable-v1, 13-member fitness field = the anchor panel + claude-v45 +
// claude-v46, degenerate-behavior guards pinned: holderDenialFrac=1,
// survivalBounded=1, transferMemoryTurns=10, extractionOn=1) reached 71.12%
// in-sample vs the 65.14% fable-v1 baseline — but its raw winner was a summit
// COUNTER: on fresh streams it beat everything in the archive INCLUDING
// claude-v46 (54.8%, the twin fable-v1 could only tie) yet lost to its own
// base fable-v1 (44.8%). A line-search between the two vectors found the
// counter-structure dissolves mid-line: at alpha=0.5 the blend holds
// 52.7% vs fable-v1, 58.3% vs claude-v45, and 60.8% vs claude-v2 (1000-seed
// probes) — ties-to-beats the crown while lifting exactly the weak-field
// margins that kept fable-v1 off the ladder top. The full out-of-sample
// record (crown gate, ladder regen) lives in EVOLUTION.md.
//
// What the ES side of the blend contributes, in one paragraph: re-price the
// board for the EXTRACTION era — a set's worth includes the premium it can be
// sold for, so the cheap/mid sets rise (orange 2.58, light-blue 2.82, pink
// 1.91, brown 1.10, red off the floor) while yellow/green/dark-blue stay
// floored; steeper rail compounding feeds the rail channel; a harder leader
// defense (standingThreatGain 2.19); leaner hotel cushion; and buy-to-scalp
// partially re-opened (0.196) — it washed at every hand-swept value on the
// OLD vector but pays when co-tuned with the new set values (the
// claude-v42/v43 coupling lesson, positive form). selfLeadGain and the EV
// jail rule stayed OFF, matching the hand measurements.
//
// The factory in ./bot.ts is a verbatim copy of fable-v1's (self-contained
// snapshot rule); only the vector differs. NOTE: floorRentFraction/floorCap
// are INERT in this vector (the legacy floor path is only read when
// flowFloorFrac is 0) — they carry optimizer drift, kept verbatim.
import { type ParamVector, makeParamBot } from "./bot";

/** The alpha=0.5 blend of fable-v1's vector and the 2026-07-17 ES winner
 *  (guards pinned, spreadFloor integral). */
export const FABLE_V2_PARAMS: ParamVector = {
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
  railSynergy2: 2.957860229356947,
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
  flowSecondRollFrac: 0.4985865026651327,
  jailStayThreshold: 0,
  jailExitProb: 0.22722169063844416,
  buildTempo: 0.9612244529359772,
  survivalBounded: 1,
  standingThreatGain: 2.1916625996604475,
  synergyThreatFrac: 1.0571287007303642,
  headsUpThreatMult: 1.8453518893375724,
  liqGuardFrac: 0.49783722246807216,
  transferMemoryTurns: 10,
  extractionOn: 1,
  scalpFrac: 0.19550986128061631,
  selfLeadGain: 0,
};

/** The frozen fable-v2 bot: the fable factory bound to the blend vector. */
export const fableV2Bot = makeParamBot(FABLE_V2_PARAMS);

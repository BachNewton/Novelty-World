// fable-v3 — HONEST RAIL-NETWORK PRICING on the fable-v2 substrate: a
// defect-removal version (the claude-v39 shape), motivated by a real game, not
// a self-play gradient.
//
// Evidence (game:review 4q3y6i, 2026-07-17): two fable-v2 seats handed the
// human winner his 3rd and 4th railroads — Mark sold Penn RR + B&O for $500
// (T89, after correctly declining the identical shape at $450), Donald traded
// Reading away for Boardwalk (T95). The evaluator's charge for arming the
// recipient was ~$60–170 (rail synergy delta × rivalThreatFactor 0.294 ×
// synergyThreatFrac 1.057 ≈ a NET 31% of the delta); the realized cost was
// ~$2,400 of rail income to the eventual winner. The quartet funded the orange
// hotels that bankrupted the table.
//
// Two changes vs fable-v2 (one hypothesis: price rail networks honestly):
//   - synergyThreatFrac 1.057 → 2.2109262, netting a 0.65 charge of the
//     synergy delta a trade hands an opponent (0.65 / rivalThreatFactor).
//     0.65 flips the observed accepts (charge ≈ $126 > the ~$100 the $500
//     check cleared by) while staying below 1.0, so the fable extraction
//     engine's rail channel (sell rails TO a 2–3-rail holder at their solved
//     premium) still nets a positive margin — full-delta pricing would cancel
//     the extracted surplus and silence that channel.
//   - railSynergy2 ~2.96 → 70 (the v38 default): the combined-space ES crushed
//     the 2-rail synergy to ~free — optimizer drift on a dim the mirror fitness
//     can't see (bots almost never trade toward rail networks in self-play), a
//     RATIONALE-FREE value on a surface humans actively exploit. Restoring it
//     also makes the bot value ITS OWN second rail (assembly + auction bids).
//
// Screen (bots/_rail-sweep.ts pattern, 600 games/config vs fable-v2): net
// charge {0.50, 0.65, 1.00} and rs2-70 all read 49.5–51.2% — EVEN everywhere,
// draws 0. The surface is invisible to mirror self-play (that is the finding);
// the promotion case is defect-removal at zero cost, adjudicated by the
// no-regression gauntlet, per the claude-v39 precedent recorded in EVOLUTION.md.
import { type ParamVector, makeParamBot } from "./bot";

/** fable-v2's blend vector verbatim except the two rail-pricing dims (see
 *  header). Self-contained per the snapshot rule — no import from fable-v2. */
export const FABLE_V3_PARAMS: ParamVector = {
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
  // v38-default 2-rail synergy restored (ES drift audit — see header).
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
  flowSecondRollFrac: 0.4985865026651327,
  jailStayThreshold: 0,
  jailExitProb: 0.22722169063844416,
  buildTempo: 0.9612244529359772,
  survivalBounded: 1,
  standingThreatGain: 2.1916625996604475,
  // Nets a 0.65 × synergy-delta charge for arming a rival's rail/utility
  // network (0.65 / rivalThreatFactor — see header for why 0.65).
  synergyThreatFrac: 2.2109262,
  headsUpThreatMult: 1.8453518893375724,
  liqGuardFrac: 0.49783722246807216,
  transferMemoryTurns: 10,
  extractionOn: 1,
  scalpFrac: 0.19550986128061631,
  selfLeadGain: 0,
};

/** The frozen fable-v3 bot: the fable factory bound to the honest-rail vector. */
export const fableV3Bot = makeParamBot(FABLE_V3_PARAMS);

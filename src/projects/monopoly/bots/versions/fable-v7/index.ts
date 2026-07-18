// fable-v7 — the TRADE-OUTFLOW TAIL GUARD on the fable-v6 substrate: the v4
// voluntary-spend lesson applied to the trade door, from the crown's own
// first probe game.
//
// Evidence (Fable-played probe game 3, vs 3× fable-v6): the game pivoted when
// a fable-v6 seat accepted a wallet-pegged $735 ask for a MARGINAL 4th
// railroad (delta ≈ +$10), dropping to $38 cash under a 3-house dark-blue
// board, and went bankrupt on the next landing — merging its estate into the
// eventual winner. The existing F2e liquidity guard uses the danger-aware
// flow floor, which reads ~zero when the lethal tiles are outside the seat's
// CURRENT next-roll window; but a trade's cash state persists across many
// rolls, so the guard must be position-independent.
//
// The change (factory revision, one new dim): `tradeTailFrac` — a voluntary
// trade that SPENDS cash must leave ≥ tradeTailFrac × the worst single rent
// on the board (position-independent), unless the gain is transformative
// (delta ≥ liquidityRiskGain — set completions stay bold). Also fixes the
// probe-game-3 miswired decline note (a cash-RECEIVING decline claiming "too
// thin to develop what I get").
//
// Vector: fable-v6's verbatim + tradeTailFrac 1.
import { type ParamVector, makeParamBot } from "./bot";

/** fable-v6's vector verbatim + the trade tail guard (see header). */
export const FABLE_V7_PARAMS: ParamVector = {
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
  // F8 — the trade-outflow tail guard (see header). 0.5, not 1.0: a full
  // worst-hit reserve (~$1400 once 3-house dark blues exist) blocks nearly
  // every marginal mid-game buy — half the worst hit flips the observed
  // $735→$38 death while a genuinely liquid seat still trades.
  tradeTailFrac: 0.5,
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

/** The frozen bot: the trade-tail-guard factory bound to its vector. */
export const fableV7Bot = makeParamBot(FABLE_V7_PARAMS);

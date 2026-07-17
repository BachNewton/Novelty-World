// fable-v5 — AUCTION
// LIQUIDITY DISCIPLINE on the fable-v4 substrate: the first version motivated
// by a FABLE-PLAYED probe game (bots/played-cli.ts) rather than a stored
// human game.
//
// Evidence (played game 1 vs 3× fable-v2, findings 2 + 4): in contested
// auctions the bots counter-bid +$10 up to acquisitionValue with NO liquidity
// term — a bot at $166 cash ratcheted a human's lowball up to face ($260),
// won, and instantly mortgaged the won lot itself to settle. The human
// exploit is total: open low and the bots bid you to face (no bargain), bid
// face+ε and they all drop (no premium extracted) — while any bot "win" is a
// winner's curse paid in liquidation costs.
//
// The change (factory revision, one new dim): `auctionLiquidCap` — a
// voluntary auction bid is additionally capped at liquid capacity
// (`cash + own mortgageable equity − flow floor`), so winning never forces a
// must-raise-cash liquidation of the prize. The acquisitionValue cap stays;
// strategic bids a bot can genuinely fund are untouched.
//
// Vector: fable-v4's verbatim + auctionLiquidCap 1.
import { type ParamVector, makeParamBot } from "./bot";

/** fable-v4's vector verbatim + the auction liquidity cap (see header). */
export const FABLE_V5_PARAMS: ParamVector = {
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
  // F6 — the auction liquidity cap (see header).
  auctionLiquidCap: 1,
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

/** The frozen bot: the auction-discipline factory bound to its vector. */
export const fableV5Bot = makeParamBot(FABLE_V5_PARAMS);

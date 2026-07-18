// fable-v14 — the AUCTION TRANSFORM-TAIL RESERVE on the fable-v12 substrate:
// the F9 completer guard, ported to the auction path.
//
// The defect (probe agent 2, confirmed vs source): `auction()` caps a bid at
// `min(acquisitionValue, auctionBidCap, liquid)`, where the F6 `liquid` cap is
// `cash + mortgageableTotal − floor`. That guarantees a win is SETTLEABLE, not
// SURVIVABLE — and for a lot that COMPLETES the bot's own set, `mortgageableTotal`
// counts the prize's OWN set-mates. So winning a completer at the `liquid` cap
// can force mortgaging those set-mates to settle: complete-into-illiquidity, the
// exact F9 trade defect (fable-v8) on a path F9 never covered. A human baited a
// near-broke bot into it 2/2 — bid it up to win its completer, and it
// self-cripples.
//
// The change (factory revision, one new dim): `auctionTailFrac` (0.25). When the
// auctioned lot completes the bot's set, `auction()` additionally caps the bid so
// post-win cash paid FROM CASH ALONE clears `auctionTailFrac × worstHit` — the
// SAME board-wide worst-single-hit the F8/F9 trade guard computes — so settling
// the won lot cannot reach the set-mates, and the completed set keeps a buffer to
// develop and survive a hit.
//
// Why 0.25, and why NARROW: an auction completer is the same event as completing
// a set via trade, so it takes the same reserve a TRANSFORMATIVE trade must leave
// under F9 — `tradeTailFrac (0.5) × transformTailFrac (0.5) = 0.25 × worstHit`.
// The two acquisition channels then price illiquidity consistently. A larger
// fraction would drop completer auctions the bot should fight for (over-caution);
// 0.25 leaves ~a quarter of the worst board hit as a buffer without walling off
// the acquisition. The guard binds ONLY on completer bids — non-completer
// auctions (the common case) are untouched, so this cannot impose the board-wide
// passivity tax that sank fable-v13 (a per-flush-turn BUILD reserve): a completer
// win is a RARE event, so the guard applies narrowly. This is GENERAL policy
// (self-play visible), not human-gated.
//
// Vector: fable-v12's verbatim + auctionTailFrac 0.25.
import { type ParamVector, makeParamBot } from "./bot";

/** fable-v12's vector verbatim + the auction transform-tail reserve (see header). */
export const FABLE_V14_PARAMS: ParamVector = {
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
  // F12 — the human-counterparty model (fable-v11; see its index.ts).
  humanAskOff: 1,
  humanProposalMargin: 75,
  // F13 — the human threat multiplier (fable-v12; see its index.ts).
  humanThreatMult: 2,
  // F14 — the auction transform-tail reserve (see header). 0.25 = the F9
  // transformative-trade reserve (tradeTailFrac × transformTailFrac), so an
  // auction completer and a trade completer price illiquidity identically.
  auctionTailFrac: 0.25,
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

/** The frozen bot: the auction-tail-reserve factory bound to its vector. */
export const fableV14Bot = makeParamBot(FABLE_V14_PARAMS);

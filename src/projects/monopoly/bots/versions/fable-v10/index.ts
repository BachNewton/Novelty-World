// fable-v10 — the PRICE-AWARE RESERVE on the fable-v8 substrate (branched from
// v8, NOT the rejected v9): the F8/F9 required reserve is capped at a multiple
// of the cash actually spent.
//
// Evidence (Fable-played probe game 5, vs 3× fable-v8 — which validated the
// v8 fix decisively: the completer-drain acceptance boundary moved from 97%
// of wallet to ~4%): the flat floor is PRICE-BLIND. An already-thin seat
// refused a mutual-monopoly swap costing **$8** ("too thin to survive a big
// hit") five turns before dying without ever owning a developed set, and a
// $400-face completer was refused at $60 — the floor froze every bot-to-bot
// completer trade for ~47 turns of the endgame. A seat cannot become
// meaningfully less safe by spending a few dollars.
//
// The change (factory revision, one new dim): `spendReserveMult` — required
// reserve = min(flat reserve, spendReserveMult × cashOut). At 2, an $8 swap
// needs $16 of headroom (clears), a $60 completer needs $120 (clears at any
// reasonable wallet), and the $430 drain needs $860 (still blocked). 0
// disables (= fable-v8's flat floor).
//
// Vector: fable-v8's verbatim + spendReserveMult 2.
import { type ParamVector, makeParamBot } from "./bot";

/** fable-v8's vector verbatim + the price-aware reserve cap (see header). */
export const FABLE_V10_PARAMS: ParamVector = {
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
  // F11 — the price-aware reserve cap (see header).
  spendReserveMult: 2,
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

/** The frozen bot: the price-aware-reserve factory bound to its vector. */
export const fableV10Bot = makeParamBot(FABLE_V10_PARAMS);

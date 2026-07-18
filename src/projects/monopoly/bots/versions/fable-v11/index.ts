// fable-v11 — the HUMAN-COUNTERPARTY MODEL on the fable-v8 substrate: the
// first version whose changes fire ONLY when the seat being modeled is a
// real human (`Player.botStrategy === null`) — so bot-vs-bot play, and with
// it the entire gauntlet/ratings apparatus, is unchanged BY CONSTRUCTION
// (every simulator seat carries a bot marker; the identity is pinned in
// policy.test.ts, which makes an SPRT gate vacuous — see EVOLUTION.md for
// how this version is validated instead).
//
// Evidence — the whole 4q3y6i-night corpus, distilled:
//   - `game:offers` (37 games, 1,237 proposals): bots convert 97.9% of
//     offers against each other and 10.6% against humans; humans convert
//     57.8% against bots, and those accepts built every corpus winner's
//     engine (the rails, the completer packages).
//   - The fitted reservation prior: real humans accepted bot cash-for-
//     property asks ONLY at ≤0.61× book (two distress bargains); every ask
//     from 1.77× to 10× book was declined (n=16).
//   - Probe games 2–6: asks are priced `min(opp.cash, …)` — a literal
//     wallet X-ray, with re-asks that walk DOWN on declines (a human farms
//     discounts by refusing), and ask-spam that never converts.
//   - fable-v9 and fable-v10 (both REJECTED on holdout): fixing these
//     behaviors in the SHARED evaluator costs self-play win share — the
//     human-facing fix must live behind a human gate.
//
// Two changes (factory revision, two dims, one hypothesis — "model the
// counterparty you actually face"):
//   - `humanAskOff` (1): the F4/F4b premium cash-ask channels are not
//     constructed against human counterparties. No conversion, no tell.
//   - `humanProposalMargin` (75): accepting a HUMAN-proposed trade requires
//     an evaluator delta ≥ $75 instead of the ~$9 accept margin a human
//     probes for (the 4q3y6i rails cleared by $9 after a $450 probe was
//     declined). Set completions and other big-delta accepts are untouched.
//
// Vector: fable-v8's verbatim + the two human dims.
import { type ParamVector, makeParamBot } from "./bot";

/** fable-v8's vector verbatim + the human-counterparty dims (see header). */
export const FABLE_V11_PARAMS: ParamVector = {
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
  // F12 — the human-counterparty model (see header).
  humanAskOff: 1,
  humanProposalMargin: 75,
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

/** The frozen bot: the human-counterparty factory bound to its vector. */
export const fableV11Bot = makeParamBot(FABLE_V11_PARAMS);

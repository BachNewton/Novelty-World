// fable-v12 — the HUMAN THREAT MULTIPLIER on the fable-v11 substrate: arming
// a human costs more than arming a bot.
//
// Evidence — the "sets sold to humans too cheap" thread, measured three ways:
//   - The corpus rails (4q3y6i + game:offers): the evaluator charged $60–170
//     of threat for handing the human winner his 3rd/4th railroads; realized
//     cost was ~$2,400 — a ~14× under-charge at the bot-calibrated
//     rivalThreatFactor (0.29).
//   - Probe game 6: two completers sold to the (asset-leading) human at
//     1.3–1.4× book; the resulting $870 red set returned ~$5,500.
//   - Probe game 7 (casual archetype): a $256 completion sale handed the bot
//     side the game — the same pricing is lethal to casuals in reverse, and
//     both directions trace to threat priced for BOT set-conversion rates.
// Humans convert handed sets and networks into wins far better than bots do
// (the entire night's empirical theme) — so the threat of arming one should
// be priced higher, and ONLY for them.
//
// The change (factory revision, one new dim): `humanThreatMult` (2) — the
// selfView `rivalThreatCost` share is doubled when the armed opponent is a
// HUMAN seat (`botStrategy === null`). 2 is deliberately conservative against
// the measured 5–14× realized gaps: it moves completer/rail sales to humans
// from ~1.3× book toward ~1.7–2× book without walling off genuinely rich
// deals (over-refusal is the claude-v40 failure mode; a live probe game
// checks for it). Human-gated: bot-vs-bot pricing — and the whole self-play
// apparatus — is untouched (identity with fable-v11 pinned + demonstrated).
//
// Vector: fable-v11's verbatim + humanThreatMult 2.
import { type ParamVector, makeParamBot } from "./bot";

/** fable-v11's vector verbatim + the human threat multiplier (see header). */
export const FABLE_V12_PARAMS: ParamVector = {
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
  // F13 — the human threat multiplier (see header).
  humanThreatMult: 2,
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

/** The frozen bot: the human-threat factory bound to its vector. */
export const fableV12Bot = makeParamBot(FABLE_V12_PARAMS);

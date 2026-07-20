// jane-v7 — the AUCTION DENIAL bot on the jane-v6 substrate.
//
// jane-v6 was the first Jane bot to become #1 on the Novelty-World monopoly
// ladder (+18.8 Elo). Its innovation was collateralized development (mortgage
// non-monopoly singletons to fund house construction).
//
// jane-v7's structural innovation (J2 — auctionDenyMult): augmented auction
// denial bidding. When a property at auction would complete an opponent's
// monopoly, the standard acquisitionValue uses a conservative denyFactor
// (~0.12) that undervalues the denial. Auctions are the LAST chance to block
// a completion — the deny premium should be amplified. jane-v7 multiplies
// the deny component by auctionDenyMult (default 4x) specifically in the
// auction bid cap, so the bot either wins the blocking property or forces
// the completing opponent to overpay significantly.
//
// Vector: jane-v6's verbatim + auctionDenyMult 4.
import { type ParamVector, makeParamBot } from "./bot";

/** jane-v6's vector verbatim + auction denial bidding (see header). */
export const JANE_V7_PARAMS: ParamVector = {
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
  tradeTailFrac: 0.5,
  transformTailFrac: 0.5,
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
  // J1 — collateralized development (from jane-v6).
  collateralDev: 1,
  // J2 — auction denial bidding (jane-v7). 4x deny premium at auctions.
  auctionDenyMult: 4,
};

/** The frozen bot: jane-v6 + auction denial bidding bound to its vector. */
export const janeV7Bot = makeParamBot(JANE_V7_PARAMS);

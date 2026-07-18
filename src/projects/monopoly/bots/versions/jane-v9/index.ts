// jane-v9 — the DYNAMIC HOUSE HOARDING bot on the jane-v6 substrate.
//
// jane-v6's house hoarding used a STATIC threshold: hoard only when bankSupply
// ≤ houseScarce (3.29). This fires too late — by the time 3 houses remain, the
// bot has already returned houses to the bank by building hotels, letting
// opponents grab them.
//
// jane-v9 replaces the static threshold with a DYNAMIC one. It counts the total
// houses opponents NEED to build their monopolies to level 4 (opponentHouseDemand).
// When bank supply ≤ demand × hoardRatio, the bot holds at 4 houses instead of
// upgrading to hotels, starving opponents of the houses they need. This decision
// fires every build turn, not just in rare situations.
//
// The key insight: the static threshold is opponent-agnostic. It doesn't matter
// if 3 houses are in the bank if no opponent can use them. Conversely, if 8
// houses are in the bank but opponents need all 8 for their monopolies, the bot
// should hoard NOW, before building hotels returns 5 per monopoly to the bank.
//
// This targets a fundamentally different mechanism than v7 (auction denial) or
// v8 (offensive jail value): both were situational. House hoarding runs in
// planBuild → desiredLevel, which executes every single turn.
//
// Vector: jane-v6's verbatim + hoardRatio 1.0 + auctionDenyMult 0.
import { type ParamVector, makeParamBot } from "./bot";

/** jane-v6's vector verbatim + dynamic house hoarding (see header). */
export const JANE_V9_PARAMS: ParamVector = {
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
  collateralDev: 1,
  // J9 — Dynamic house hoarding. hoardRatio=1.0: hoard when bank supply ≤
  // opponent demand. With 2 opponents each having a 3-property monopoly at
  // level 0, demand = 24 houses. The bot starts hoarding when supply ≤ 24,
  // far earlier than v6's static 3.29.
  hoardRatio: 1.0,
};

/** The frozen bot: the dynamic-house-hoarding factory bound to its vector. */
export const janeV9Bot = makeParamBot(JANE_V9_PARAMS);

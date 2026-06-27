// ===========================================================================
// search-v2 BASE — the TUNED champion (claude-v45) bound once, exposed for the
// search layer to (a) field every seat in rollouts, (b) supply the always-present
// greedy candidate, and (c) score truncated-rollout leaves by its own yardstick.
//
// THE DIFFERENCE FROM search-v1: search-v1 wrapped the UNTUNED claude-v38 (its
// `base-policy.ts` / `valuation.ts` carry v38's default constants), so it was
// "search over an untuned base" and rated only ~119 Elo. search-v2 wraps the
// combined-space ES champion claude-v45 — the same 31-param factory bound to the
// ES-winning vector (with `holderDenialFrac` pinned to the denial lockstep, per
// claude-v45). So this is "search over the CHAMPION": the rollout policy plays at
// ~250-Elo strength and the leaf shares are scored by the tuned `positionValue`.
//
// The vector below is claude-v45's CLAUDE_V45_PARAMS, copied verbatim so this
// snapshot stays self-contained (no cross-version import — the archive rule).
// ===========================================================================
import { type ParamVector, makeParamBot, makeParamValue } from "./factory";

export { spaceName } from "./factory";

/** claude-v45's combined-space maximin ES winner (holderDenialFrac pinned to 1.0).
 *  Copied verbatim from `claude-v45/index.ts`. */
const CLAUDE_V45_PARAMS: ParamVector = {
  denyFactor: 0.10424595338999776,
  bonusScale: 12319.680680754447,
  railSynergyScale: 1.0631638801418597,
  utilPairBonus: 68.54614780321296,
  baseFloor: 0,
  floorRentFraction: 0.1,
  floorCap: 100,
  hotelCushion: 191.14147226467384,
  houseScarce: 6.581739014680775,
  jailDangerRent: 150,
  acceptMargin: 5,
  survivalFactor: 2.924201534053176,
  liquidityRiskGain: 481.55782931413603,
  dipWorthMult: 1.3633338433426045,
  raiseWorthMult: 1.880074167967108,
  monoMultOrange: 2.2187703712119484,
  monoMultRed: 0.3,
  monoMultLightBlue: 2.635033129650045,
  monoMultPink: 1.38803726682945,
  monoMultYellow: 0.3,
  monoMultDarkBlue: 0.3,
  monoMultGreen: 0.3,
  monoMultBrown: 0.9359984888364441,
  railSynergy2: 0,
  railSynergy3: 114.10069101114836,
  railSynergy4: 671.4373656163531,
  distressSafeRatio: 2.1464849122600227,
  spreadFloor: 4,
  rivalThreatFactor: 0.34223274250450647,
  holderDenialFrac: 1,
  deployabilityDiscount: 0.5985890918407256,
};

/** The claude-v45 dispatcher — the search layer's base policy (greedy anchor +
 *  rollout driver for every seat). */
export const baseBot = makeParamBot(CLAUDE_V45_PARAMS);

/** claude-v45's tuned `positionValue` — the rollout-search leaf yardstick. */
export const positionValue = makeParamValue(CLAUDE_V45_PARAMS);

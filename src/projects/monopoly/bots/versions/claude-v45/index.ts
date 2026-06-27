// claude-v45 — Claude lineage, authored by Claude Code. The combined-space ES
// champion (claude-v44) with ONE corrected lever: `holderDenialFrac` pinned to
// 1.0, restoring the buyer/holder denial-pricing LOCKSTEP that bots/CLAUDE.md
// names as an invariant ("keep buyer-side and holder-side denial pricing in
// lockstep").
//
// WHY. The combined-space ES that produced claude-v44 was free to move
// `holderDenialFrac` (the holder-side `denialPositionCost` strength) and settled
// it at 0.461 — i.e. a holder charges only 46% of the denial premium a buyer
// books for the same lot. That re-opens a clearing band of width (1 − 0.461) ×
// premium on every held-completer hop, so two NON-rival deniers hot-potato a
// completer back and forth forever at a "fair" price (observed live in
// game:review 2b6y55: Mediterranean swapped John<->Mary every turn T60-T72, the
// browns completer held by neither — Santiago held Baltic). The ES never
// penalized it: the churn is net-zero cash on the weakest set, so it costs ~0 win
// share — but it stalls real games and reads as a broken opponent to a human.
//
// THE FIX is the holder pricing its hold at the FULL option value (the expected
// premium the one-short rival pays when it caves — bots/CLAUDE.md "Denial is a
// premium game"). At holderDenialFrac=1 the holder's reservation price equals the
// max any non-rival buyer will pay, so no bot->bot hop clears; the completer sits
// with its holder and is sold only TO the completing rival (the cash-out, priced
// by rivalThreatCost — mutually exclusive, no double-count). The distress escape
// (distressSafeRatio) still lets a near-bust holder shed it cheap, so the
// protective grab off a seat about to bust is preserved.
//
// All other 30 dims are claude-v44's combined-space ES winner VERBATIM — this is
// the smallest coherent change (one lever) so the A/B grades exactly the lockstep
// claim. Crown-gate status is recorded in EVOLUTION.md.
//
// FIDELITY: binds the SAME factory in `./bot.ts` (a verbatim copy of claude-v44's
// 31-param factory) to the vector below; pure, deterministic, self-contained.
import { type ParamVector, makeParamBot } from "./bot";

/** claude-v44's combined-space maximin ES winner, with `holderDenialFrac` pinned
 *  to 1.0 (buyer/holder denial-pricing lockstep). Every other dim is verbatim. */
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
  holderDenialFrac: 1, // claude-v45: pinned to lockstep (claude-v44 had 0.461 → hot-potato)
  deployabilityDiscount: 0.5985890918407256,
};

export { CLAUDE_V45_PARAMS };

/** The frozen claude-v45 bot: claude-v44's factory bound to the v44 winning
 *  vector with `holderDenialFrac` corrected to the lockstep value 1.0. */
export const claudeV45Bot = makeParamBot(CLAUDE_V45_PARAMS);

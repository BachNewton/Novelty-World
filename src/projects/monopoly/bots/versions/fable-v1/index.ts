// fable-v1 — the first version of the FABLE lineage, authored by Fable
// (Anthropic's flagship model, driving Claude Code). See PHILOSOPHY.md for the
// full strategic model and evidence base; the one-paragraph version:
//
// Every prior bot values a position STATICALLY. fable-v1 borrows the champion
// claude-v45's 31-param factory + ES vector wholesale, then adds the structural
// layer the whole archive lacks — FLOW: the exact 2d6 next-roll landing
// distribution drives a danger-aware liquidity floor (F1a — kills the
// build-sell churn without losing aggression), an EV jail rule (F1b — stay for
// the rents actually reachable from jail, not a board-wide flag), and a tempo
// build order (F1c — fund the set the tokens are approaching). On top, a
// trade-pricing overhaul (F2): survival credit bounded by the cash that
// actually erases distress (the leak that fire-sold complete sets for $250 and
// re-opened the hot-potato band), rival-threat cost scaled by the RECIPIENT's
// standing (handing the leader a set is how humans beat v45 in all six
// reviewed losses), rail/utility synergy priced into the threat, a heads-up
// zero-sum multiplier, and a liquidity guard against completer-premium scalps.
// F3 adds a ring-proof transfer memory: a just-traded lot may only move again
// to the completing rival — the A→B→A hot-potato is dead by construction, not
// by pricing.
//
// Counterparties are modeled with the fable levers OFF (the v45-shaped field
// consensus) — an opponent model should model the OPPONENT, not myself; this is
// the trade-v1 lesson applied.
//
// Every fable lever has a NO-OP default in the factory, so `makeParamBot` bound
// to `FABLE_V1_BASELINE` reproduces claude-v45 decision-for-decision
// (policy.test.ts asserts this fidelity on real states).
import { type ParamVector, makeParamBot } from "./bot";

/** claude-v45's combined-space ES vector (all 31 dims verbatim) with every
 *  fable lever at its NO-OP value — the fidelity baseline that must behave
 *  byte-identically to claude-v45. */
export const FABLE_V1_BASELINE: ParamVector = {
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
  // fable levers, all NO-OP: this vector IS claude-v45.
  flowFloorFrac: 0,
  flowTailFrac: 0,
  flowFloorCap: 0,
  flowSecondRollFrac: 0,
  jailStayThreshold: 0,
  jailExitProb: 0,
  buildTempo: 0,
  survivalBounded: 0,
  standingThreatGain: 0,
  synergyThreatFrac: 0,
  headsUpThreatMult: 1,
  liqGuardFrac: 0,
  transferMemoryTurns: 0,
  extractionOn: 0,
  scalpFrac: 0,
  selfLeadGain: 0,
};

/** The fable-v1 vector: the v45 base verbatim, fable levers ON. Lever values
 *  are hand-picked from the six-game evidence and iterated via `sim:versus`
 *  (the tuning log lives in EVOLUTION.md). */
export const FABLE_V1_PARAMS: ParamVector = {
  ...FABLE_V1_BASELINE,
  // F1a — flow floor: swept best at the SOFT setting (0.6/0.15/300 → 56.3% vs
  // 53.8% for 0.9/0.25/420 over 800 games) — reserve against real geometry,
  // but stay hungry; heavier reserves gave back the tempo they protected.
  flowFloorFrac: 0.6,
  flowTailFrac: 0.15,
  flowFloorCap: 300,
  flowSecondRollFrac: 0.45,
  // F1b — measured OFF: an 800-game sweep vs claude-v45 was monotone against
  // the EV jail rule (threshold 0 → 54.3%, 55 → 52.4%, 90 → 51.3%): the ES's
  // max-stay (`jailDangerRent` at its floor) is simply correct in this field,
  // and leaving "safely" still forfeits the jail haven. v45's static rule stays.
  jailStayThreshold: 0,
  // F1 — jailed tokens move next roll ~1/3 of the time (doubles + pay-outs).
  jailExitProb: 0.35,
  buildTempo: 1,
  // F2 — bounded survival credit; leader-scaled threat; synergy priced fully;
  // heads-up threats near-doubled; trades may not leave me under ~90% of the
  // flow floor without a transformative gain.
  survivalBounded: 1,
  // Two independent sweeps (800 + 1200 games) put the gain at ≥1.5 (53.1% at
  // 0.9 vs 54.9% at 1.5/2.2); 1.5 avoids the extreme end of the clamp.
  standingThreatGain: 1.5,
  synergyThreatFrac: 1,
  headsUpThreatMult: 1.75,
  liqGuardFrac: 0.9,
  // F3 — a traded lot is frozen (except to the completing rival) for ~2.5
  // rounds of a 4-player game.
  transferMemoryTurns: 10,
  // F4 — exercise held completers: sell to the one-short rival at their solved
  // premium (the weaponized form of the human scalp from the six-game review).
  extractionOn: 1,
  // F5 — measured OFF: buy-to-scalp cost ~5 points at every swept fraction
  // (0.35 → 49.9%, 0.55 → 48.4%, 0.75 → 48.1%, vs 54.1% at 0). Extraction's
  // edge is that SELLING a held completer costs no capital; paying cash up
  // front for the option loses more than the harvest recovers. Lever kept for
  // a future field where opponents cave harder (humans).
  scalpFrac: 0,
  // F2f — measured OFF: scaling threat by MY OWN standing ("a leader stops
  // selling sets") gained ~+2 vs claude-v45 but LOST more everywhere else
  // (claude-v2 56.9% → 54.5%, claude-v5 67.1% → 65.0% at gain 1.0): against
  // most of the field, extraction stays +EV even from the lead — a weak rival
  // handed a set usually still can't out-earn the premium. Lever kept for a
  // future re-visit with an opponent-quality signal.
  selfLeadGain: 0,
};

/** The frozen fable-v1 bot: the extended factory bound to the fable vector. */
export const fableV1Bot = makeParamBot(FABLE_V1_PARAMS);

// ===========================================================================
// OFFLINE OPTIMIZATION TOOLING — the tunable parameter vector for a
// FABLE-v1-shaped bot (the flow/extraction factory in `./bot.ts`).
//
// 55 dims: the 31 claude-v45-era base dims (claude-v38's constants + the v41
// seller-side trade levers + the extended color/rail/distress dims) PLUS the
// full fable lever stack through fable-v12 — the 16 fable-v1 levers (flow
// floor, jail EV, build tempo, trade-pricing overhaul, transfer memory,
// extraction, scalp, self-lead) AND the 8 later levers added in fable-v4..v12
// (voluntaryTailFrac, auctionLiquidCap, survivalEquityGain, tradeTailFrac,
// transformTailFrac, humanAskOff, humanProposalMargin, humanThreatMult). The
// harness was REBOUND from the fable-v1 factory (47 dims) to the fable-v12
// factory so the ES optimizes the real fable-v12 substrate, not a weaker
// fable-v1-shaped approximation. The washed v47 standing-POSTURE dims
// (`standingFloorGain`/`standingAuctionGain`) are still absent (EVOLUTION.md
// claude-v47). Saved vectors from an earlier layout are NOT loadable by index
// (`--init` reads by KEY, so a fable-v12 vector JSON loads fine).
//
// INVARIANT: `DEFAULT_PARAMS` reproduces claude-v38 EXACTLY — base dims at v38
// values, every v41 + fable lever at its NO-OP — pinned by
// `param-fidelity.test.ts`, so the ES optimizes the real bot.
//
// INVARIANT PINS (pass via `--pin`; they are NOT safe free levers — the v45
// lesson is that a win-share ES is structurally blind to the net-zero
// degenerate behaviors these levers guard against):
//   holderDenialFrac=1     the buyer/holder denial-pricing LOCKSTEP.
//   survivalBounded=1      the bounded survival credit (the fire-sale leak).
//   transferMemoryTurns=10 the ring-proof transfer memory.
//   extractionOn=1         the family's engine; turning it off just re-tunes
//                          claude-v45 (already done: claude-v46, a twin).
//   survivalEquityGain=1   the fable-v6 comeback-equity fix (fire-sale leak).
//   auctionLiquidCap=1     the fable-v5 auction winner's-curse guard.
//   voluntaryTailFrac / tradeTailFrac / transformTailFrac  the fable-v4/v7/v8
//                          illiquidity tail guards (a spend/trade must survive
//                          the worst next hit) — narrow safety floors, not free
//                          weights.
//   humanAskOff / humanProposalMargin / humanThreatMult  the fable-v11/v12
//                          human-counterparty model — human-gated, invisible to
//                          the all-bot self-play fitness, so the ES must not
//                          move them (validation is a LIVE probe, not SPRT).
// ===========================================================================

/** The tunable constants of a fable-v1-shaped bot. Base dims are claude-v38
 *  verbatim at their defaults; every lever appended after them defaults to a
 *  NO-OP. Field-by-field rationale lives in `versions/fable-v1/bot.ts` (the
 *  factory `./bot.ts` copies) and `versions/fable-v1/PHILOSOPHY.md`. */
export interface ParamVector {
  /** Denial premium as a fraction of the rival set's monopoly bonus. v38 = 0.15. */
  denyFactor: number;
  /** Scales the from-first-principles monopoly bonus. v38 = 16489. */
  bonusScale: number;
  /** Multiplier on the railroad synergy table. 1.0 = v38. */
  railSynergyScale: number;
  /** Both-utilities pair bonus. v38 = 40. */
  utilPairBonus: number;
  /** Bare voluntary-spend reserve floor. v38 = 60. */
  baseFloor: number;
  /** Fraction of worst board rent kept as voluntary-spend reserve. v38 = 0.3. */
  floorRentFraction: number;
  /** Cap on the rent-fraction reserve. v38 = 300. */
  floorCap: number;
  /** Spare cash above the floor that signals "flush" → push to hotels. v38 = 300. */
  hotelCushion: number;
  /** House-bank level below which houses are hoarded. v38 = 6. */
  houseScarce: number;
  /** Opponent rent that marks the board dangerous enough to sit in jail. v38 = 350. */
  jailDangerRent: number;
  /** Cushion past break-even when sweetening a trade. v38 = 30. */
  acceptMargin: number;
  /** Extra value per dollar of cash to a fully-distressed seller. v38 = 1.5. */
  survivalFactor: number;
  /** A cash-negative trade is only stomached for a gain this large. v38 = 250. */
  liquidityRiskGain: number;
  /** Worth/price multiple to dip below the reserve for a buy. v38 = 1.4. */
  dipWorthMult: number;
  /** Worth/price multiple to MORTGAGE to fund a buy. v38 = 1.25. */
  raiseWorthMult: number;

  /** Per-color MULTIPLIER on that set's first-principles monopoly bonus — lets
   *  the ES re-shape the set-value ranking. 1.0 = v38 (no change). */
  monoMultOrange: number;
  monoMultRed: number;
  monoMultLightBlue: number;
  monoMultPink: number;
  monoMultYellow: number;
  monoMultDarkBlue: number;
  monoMultGreen: number;
  monoMultBrown: number;

  /** Per-count railroad synergy values (`RAIL_SYNERGY[2..4]`), still multiplied
   *  by `railSynergyScale`. Defaults are the v38 table: [70, 180, 380]. */
  railSynergy2: number;
  railSynergy3: number;
  railSynergy4: number;

  /** Liquid-to-worst-rent ratio at which `sellerDistress` reaches 0. v38 = 1.5. */
  distressSafeRatio: number;
  /** The develop-floor every monopoly is brought to first in `planBuild`. v38 = 3. */
  spreadFloor: number;

  /** Seller-side rival-threat factor, DECOUPLED from `denyFactor` (claude-v41).
   *  Default 0.15 (= the v38 denyFactor) reproduces v38; ≳1.0 deadlocks games. */
  rivalThreatFactor: number;
  /** Holder-side denial price as a FRACTION of the buyer-side premium
   *  (claude-v35/v39). INVARIANT: pin at 1.0 (the lockstep). Default 0 = v38. */
  holderDenialFrac: number;
  /** Deployability discount on incoming set-handover cash (claude-v41).
   *  0 = cash at face (v38). */
  deployabilityDiscount: number;

  // --- fable levers (all NO-OP by default; see versions/fable-v1/bot.ts) ---

  /** F1a — flow floor: frac × expected next-roll outgo. 0 = the legacy static
   *  floor path (`floorRentFraction`/`floorCap`). */
  flowFloorFrac: number;
  /** F1a — weight on the worst single next-roll hit (the tail a mean hides). */
  flowTailFrac: number;
  /** F1a — cap on the flow floor (only read when the flow floor is on). */
  flowFloorCap: number;
  /** F1 — fraction of a second convolved roll blended into outgo estimates. */
  flowSecondRollFrac: number;
  /** F1b — EV jail rule threshold; 0 = v45's static `jailDangerRent` rule. */
  jailStayThreshold: number;
  /** F1 — probability a jailed opponent moves next roll (flow scaling). */
  jailExitProb: number;
  /** F1c — >0: order buildable monopolies by opponent landing mass. 0 = the
   *  static tier order. */
  buildTempo: number;
  /** F2a — >0: bound survival credit at the cash that erases distress.
   *  INVARIANT: pin at 1 (the fire-sale / ring-reopening leak). 0 = v45. */
  survivalBounded: number;
  /** F2b — rival-threat scaling by the RECIPIENT's standing (floored at 1). */
  standingThreatGain: number;
  /** F2c — fraction of rail/utility synergy delta priced into rival threat. */
  synergyThreatFrac: number;
  /** F2d — threat multiplier when only two players are live. 1 = v45 (no-op). */
  headsUpThreatMult: number;
  /** F2e — voluntary-trade liquidity guard as a fraction of the floor. 0 = off. */
  liqGuardFrac: number;
  /** F3 — ring-proof transfer memory in turn groups. INVARIANT: pin at 10. */
  transferMemoryTurns: number;
  /** F4 — >0: the extraction engine (sell held completers/rails at the rival's
   *  solved premium; charge swap surplus to the margin). INVARIANT: pin at 1. */
  extractionOn: number;
  /** F5 — buy-to-scalp fraction of the future harvest. Hand-measured −5pts at
   *  every swept value on the fable stack; the ES may re-explore. 0 = off. */
  scalpFrac: number;
  /** F2f — threat scaling by MY OWN standing. Hand-measured mixed (+2 vs v45,
   *  −2.5 vs the weak field); the ES may re-explore. 0 = off. */
  selfLeadGain: number;

  // --- fable-v4..v12 levers (added in the fable-v12 rebind; all NO-OP by
  //     default). See versions/fable-v12/bot.ts for the field-by-field rationale. ---

  /** F5 (fable-v4) — voluntary-spend TAIL GUARD: a discretionary build/redeploy/
   *  unmortgage must leave cash ≥ this fraction of the worst single next-roll
   *  landing, UNCAPPED. 0 disables (= fable-v3). INVARIANT: pin. */
  voluntaryTailFrac: number;
  /** F6 (fable-v5) — 1 = cap voluntary auction bids at liquid capacity so winning
   *  never forces liquidating the prize itself. 0 disables (= fable-v4). INVARIANT: pin. */
  auctionLiquidCap: number;
  /** F7 (fable-v6) — scale the survival credit by my positionValue share of the
   *  strongest live opponent, so a beaten seat stops fire-selling to the leader.
   *  0 disables (= fable-v5's unconditional credit). INVARIANT: pin. */
  survivalEquityGain: number;
  /** F8 (fable-v7) — TRADE-OUTFLOW tail guard: a voluntary trade spending cash must
   *  leave ≥ this fraction of the worst single board hit; transformative gains
   *  exempt. 0 disables (= fable-v6). INVARIANT: pin. */
  tradeTailFrac: number;
  /** F9 (fable-v8) — fraction of the F8 reserve a TRANSFORMATIVE trade must still
   *  leave (a completer bought into total illiquidity strands its own bonus).
   *  0 = fable-v7's full exemption. INVARIANT: pin. */
  transformTailFrac: number;
  /** F12a (fable-v11) — 1 = do not construct premium cash asks against a HUMAN
   *  (`botStrategy === null`). Human-gated; bot-vs-bot identical. 0 = fable-v8.
   *  INVARIANT: pin (invisible to self-play fitness). */
  humanAskOff: number;
  /** F12b (fable-v11) — minimum evaluator delta to ACCEPT a HUMAN-proposed trade
   *  (0 = the ordinary ≈$9 margin). Human-gated. INVARIANT: pin. */
  humanProposalMargin: number;
  /** F13 (fable-v12) — multiplier on `rivalThreatCost` when the ARMED seat is a
   *  HUMAN. 1 disables (= fable-v11). Human-gated. INVARIANT: pin. */
  humanThreatMult: number;
}

/** The DEFAULT vector — claude-v38 verbatim (every lever at its no-op). The
 *  parameterized bot built from this must be byte-identical to claude-v38
 *  (pinned by param-fidelity.test.ts). */
export const DEFAULT_PARAMS: ParamVector = {
  denyFactor: 0.15,
  bonusScale: 16489,
  railSynergyScale: 1.0,
  utilPairBonus: 40,
  baseFloor: 60,
  floorRentFraction: 0.3,
  floorCap: 300,
  hotelCushion: 300,
  houseScarce: 6,
  jailDangerRent: 350,
  acceptMargin: 30,
  survivalFactor: 1.5,
  liquidityRiskGain: 250,
  dipWorthMult: 1.4,
  raiseWorthMult: 1.25,
  monoMultOrange: 1.0,
  monoMultRed: 1.0,
  monoMultLightBlue: 1.0,
  monoMultPink: 1.0,
  monoMultYellow: 1.0,
  monoMultDarkBlue: 1.0,
  monoMultGreen: 1.0,
  monoMultBrown: 1.0,
  railSynergy2: 70,
  railSynergy3: 180,
  railSynergy4: 380,
  distressSafeRatio: 1.5,
  spreadFloor: 3,
  // v41 trade levers at their NO-OP defaults (reproduce claude-v38):
  // rivalThreatFactor = denyFactor (v38 pinned them); holder price OFF; no discount.
  rivalThreatFactor: 0.15,
  holderDenialFrac: 0,
  deployabilityDiscount: 0,
  // fable levers all at their NO-OP (reproduce claude-v38):
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
  // fable-v4..v12 levers at their NO-OP (reproduce claude-v38):
  voluntaryTailFrac: 0,
  auctionLiquidCap: 0,
  survivalEquityGain: 0,
  tradeTailFrac: 0,
  transformTailFrac: 0,
  humanAskOff: 0,
  humanProposalMargin: 0,
  humanThreatMult: 1,
};

/** Inclusive [min, max] bounds for each parameter — SANE ranges the ES respects.
 *  Bounds bracket the known-good vectors (v38 defaults AND the fable-v1/v44
 *  winners) with room to move in both directions. Where 0 disables a lever, the
 *  lower bound includes it so the ES can choose OFF; multiplicative levers floor
 *  at their no-op value. */
export const PARAM_BOUNDS: Readonly<Record<keyof ParamVector, readonly [number, number]>> = {
  denyFactor: [0.0, 0.7],
  bonusScale: [4000, 40000],
  railSynergyScale: [0.3, 2.5],
  utilPairBonus: [0, 120],
  baseFloor: [0, 200],
  floorRentFraction: [0.1, 0.8],
  floorCap: [100, 700],
  hotelCushion: [0, 700],
  houseScarce: [0, 16],
  jailDangerRent: [150, 700],
  acceptMargin: [5, 120],
  survivalFactor: [0.0, 3.0],
  liquidityRiskGain: [50, 600],
  dipWorthMult: [1.0, 2.5],
  raiseWorthMult: [1.0, 2.5],
  monoMultOrange: [0.3, 3.0],
  monoMultRed: [0.3, 3.0],
  monoMultLightBlue: [0.3, 3.0],
  monoMultPink: [0.3, 3.0],
  monoMultYellow: [0.3, 3.0],
  monoMultDarkBlue: [0.3, 3.0],
  monoMultGreen: [0.3, 3.0],
  monoMultBrown: [0.3, 3.0],
  railSynergy2: [0, 200],
  railSynergy3: [40, 450],
  railSynergy4: [100, 800],
  distressSafeRatio: [1.0, 3.0],
  spreadFloor: [2, 4],
  rivalThreatFactor: [0.0, 0.8],
  holderDenialFrac: [0.0, 1.5],
  deployabilityDiscount: [0.0, 1.0],
  flowFloorFrac: [0.0, 1.6],
  flowTailFrac: [0.0, 0.8],
  flowFloorCap: [100, 700],
  flowSecondRollFrac: [0.0, 1.0],
  jailStayThreshold: [0, 250],
  jailExitProb: [0.1, 0.6],
  buildTempo: [0, 1],
  survivalBounded: [0, 1],
  standingThreatGain: [0.0, 3.0],
  synergyThreatFrac: [0.0, 2.0],
  headsUpThreatMult: [1.0, 3.0],
  liqGuardFrac: [0.0, 2.0],
  transferMemoryTurns: [0, 16],
  extractionOn: [0, 1],
  scalpFrac: [0.0, 0.9],
  selfLeadGain: [0.0, 2.0],
  voluntaryTailFrac: [0.0, 2.0],
  auctionLiquidCap: [0, 1],
  survivalEquityGain: [0.0, 1.5],
  tradeTailFrac: [0.0, 1.0],
  transformTailFrac: [0.0, 1.0],
  humanAskOff: [0, 1],
  humanProposalMargin: [0, 200],
  humanThreatMult: [1.0, 4.0],
};

/** The parameter names in a FIXED order — the canonical vector layout the ES
 *  packs/unpacks and the worker serializes. Never reorder (it would silently
 *  remap a saved mean/sigma). NOTE: this layout CHANGED at the fable rebind —
 *  saved vectors from the previous 33-dim claude layout are NOT loadable. */
export const PARAM_KEYS: readonly (keyof ParamVector)[] = [
  "denyFactor",
  "bonusScale",
  "railSynergyScale",
  "utilPairBonus",
  "baseFloor",
  "floorRentFraction",
  "floorCap",
  "hotelCushion",
  "houseScarce",
  "jailDangerRent",
  "acceptMargin",
  "survivalFactor",
  "liquidityRiskGain",
  "dipWorthMult",
  "raiseWorthMult",
  "monoMultOrange",
  "monoMultRed",
  "monoMultLightBlue",
  "monoMultPink",
  "monoMultYellow",
  "monoMultDarkBlue",
  "monoMultGreen",
  "monoMultBrown",
  "railSynergy2",
  "railSynergy3",
  "railSynergy4",
  "distressSafeRatio",
  "spreadFloor",
  "rivalThreatFactor",
  "holderDenialFrac",
  "deployabilityDiscount",
  "flowFloorFrac",
  "flowTailFrac",
  "flowFloorCap",
  "flowSecondRollFrac",
  "jailStayThreshold",
  "jailExitProb",
  "buildTempo",
  "survivalBounded",
  "standingThreatGain",
  "synergyThreatFrac",
  "headsUpThreatMult",
  "liqGuardFrac",
  "transferMemoryTurns",
  "extractionOn",
  "scalpFrac",
  "selfLeadGain",
  "voluntaryTailFrac",
  "auctionLiquidCap",
  "survivalEquityGain",
  "tradeTailFrac",
  "transformTailFrac",
  "humanAskOff",
  "humanProposalMargin",
  "humanThreatMult",
];

/** Pack a vector into the fixed-order number array the ES operates on. */
export function packParams(p: ParamVector): number[] {
  return PARAM_KEYS.map((k) => p[k]);
}

/** Unpack a fixed-order array back into a named vector. */
export function unpackParams(v: readonly number[]): ParamVector {
  const out = {} as ParamVector;
  PARAM_KEYS.forEach((k, i) => {
    out[k] = v[i];
  });
  return out;
}

/** Clamp every field to its bound — the ES respects bounds by clamping samples. */
export function clampParams(p: ParamVector): ParamVector {
  const out = {} as ParamVector;
  for (const k of PARAM_KEYS) {
    const [lo, hi] = PARAM_BOUNDS[k];
    out[k] = Math.min(hi, Math.max(lo, p[k]));
  }
  return out;
}

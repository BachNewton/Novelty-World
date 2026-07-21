// fable-v15 — a CONSTRAINED-ES RE-TUNE on the fable-v12 factory. PROMOTED (registered
// + rated) as a strong-but-INTRANSITIVE vector (2026-07-19), NOT crowned and NOT the
// lobby default — the crown gate and the ladder legitimately DISAGREE about it, and
// the ladder (which governs the default) keeps fable-v8 on top.
//
// Provenance: the 2026-07-18 constrained ES leg (the optimizer rebound to the
// fable-v12 factory — the claude-v45 31-param base plus the full fable lever
// stack through fable-v12). Load-bearing levers were pinned per the claude-v45
// lesson (holderDenialFrac = 1.0 lockstep, etc.); the remaining dims were
// jointly co-tuned by the ES. The winning vector leaned ~68% self-play vs a
// ~63% baseline (noisy, in-sample) and independently moved `jailStayThreshold`
// 0 → ~4.9 — corroborating the probe fleet's "sit in jail on a developed board"
// finding, arrived at from a completely different direction (a mirror-fitness
// ES vs a hand-played human-probe exploit).
//
// Measured (two instruments that DISAGREE — the finding):
//   - CROWN GATE (SPRT, thousands of games), `--panel` train stream: ✅ ACCEPT —
//     BETTER vs base fable-v12 AND BETTER-or-EVEN vs ALL 12 panel members incl. the
//     DIVERSE ones (jane-v2/v4 59–59%, opt-v4 60%, claude-v36 56%, claude-v45 55%)
//     and the prior top fable-v8 (52.7%); EVEN vs fable-v1/v7; ZERO regressions. So
//     it is NOT counter-overfit — it beats the diverse field head-to-head. (Fable-
//     field holdout was only EVEN vs base fable-v12, though — the vs-v12 edge is
//     marginal/seed-dependent, which is why this is not a confident two-stream crown.)
//   - LADDER (Bradley–Terry over the whole archive): fable-v15 = 119.7, BELOW base
//     fable-v12 (129.8). The head-to-head wins are INTRANSITIVE — it beats the summit
//     but only ~62% vs the weak floor claude-v2, where a 140-Elo bot sits ~69%, so a
//     1-D Elo can't reconcile "ties fable-v8 yet only modestly beats claude-v2" and
//     compresses it down.
//   Net: a strong vector, but not a clean ladder-topper. The ladder is generated
//   (never hand-edited), so fable-v8 stays the derived default. See EVOLUTION.md.
//
// Vector: the ES `bestParams` verbatim (optimize/best-vector.json).
import { type ParamVector, makeParamBot } from "./bot";

/** The constrained-ES winner on the fable-v12 factory (see header). */
export const FABLE_V15_PARAMS: ParamVector = {
  denyFactor: 0.12384655676923122,
  bonusScale: 15116.112097846008,
  railSynergyScale: 1.119559235841434,
  utilPairBonus: 23.215838512265805,
  baseFloor: 0,
  floorRentFraction: 0.13353340286433854,
  floorCap: 100,
  hotelCushion: 132.58196090376182,
  houseScarce: 1.1116786233250653,
  jailDangerRent: 150,
  acceptMargin: 5.234946949060856,
  survivalFactor: 3,
  liquidityRiskGain: 538.0469875172499,
  dipWorthMult: 1.8850735187753003,
  raiseWorthMult: 1.6417038073019043,
  monoMultOrange: 2.0181654954493653,
  monoMultRed: 1.0620336723970787,
  monoMultLightBlue: 2.517975753570413,
  monoMultPink: 2.0772060189640023,
  monoMultYellow: 0.3,
  monoMultDarkBlue: 1.2652044135048914,
  monoMultGreen: 0.3,
  monoMultBrown: 0.44814877783340357,
  railSynergy2: 70,
  railSynergy3: 215.74836635686333,
  railSynergy4: 541.7207996781232,
  distressSafeRatio: 2.538182983327032,
  spreadFloor: 4,
  rivalThreatFactor: 0.36301320966907286,
  holderDenialFrac: 1,
  deployabilityDiscount: 0.69528826872686,
  flowFloorFrac: 0.1512232912028785,
  flowTailFrac: 0.4986712976538568,
  flowFloorCap: 432.18656679814086,
  flowSecondRollFrac: 0.4167809313988877,
  jailStayThreshold: 4.935375201933431,
  jailExitProb: 0.24980528932944074,
  buildTempo: 0.8794848657509968,
  survivalBounded: 1,
  standingThreatGain: 2.258517900692663,
  synergyThreatFrac: 2.2109262,
  headsUpThreatMult: 2.2930772284111685,
  liqGuardFrac: 0.4898976693203279,
  transferMemoryTurns: 10,
  extractionOn: 1,
  scalpFrac: 0.022581405810067953,
  selfLeadGain: 0,
  voluntaryTailFrac: 1,
  auctionLiquidCap: 1,
  survivalEquityGain: 1,
  tradeTailFrac: 0.5,
  transformTailFrac: 0.5,
  humanAskOff: 1,
  humanProposalMargin: 75,
  humanThreatMult: 2,
};

/** The frozen bot: the fable-v12 factory bound to the constrained-ES vector. */
export const fableV15Bot = makeParamBot(FABLE_V15_PARAMS);

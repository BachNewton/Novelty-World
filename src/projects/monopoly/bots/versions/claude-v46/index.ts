// claude-v46 — Claude lineage, authored by Claude Code. A WARM-START maximin ES
// re-optimization of the champion claude-v45's 31-param vector, run with
// `holderDenialFrac` PINNED to the lockstep value 1.0 (the invariant claude-v45
// established) so the win-share optimizer could not re-open the held-completer
// hot-potato ring it is structurally blind to.
//
// WHY. claude-v45 is claude-v44's combined-space ES vector with ONE lever
// force-corrected (`holderDenialFrac` 0.461 → 1.0). But v44's other 30 dims were
// tuned by an ES that had `holderDenialFrac` FREE — so v45's vector is NOT
// ES-optimal under the lockstep invariant; the correction left value on the table.
// This run asks the obvious next question: re-optimize the full vector with
// `holderDenialFrac` pinned at 1.0, warm-started from v45, with claude-v45 itself
// in the fitness panel so the maximin FLOOR is the matchup the crown requires.
//
// THE RUN. SNES, `--fitness maximin` (= the crown metric), warm-started from v45,
// `--pin holderDenialFrac=1.0`, fitness panel = RATING_PANEL + claude-v45,
// `--pop 24 --gens 14 --games 1100 --seed 7`. The warm-start vector's maximin floor
// is the v45 mirror at 52%; the ES lifted the worst panel matchup to 57% (binding:
// jane-v4 57%, claude-v45 58%) — beating EVERY panel member in-sample with no
// regression. The discovered profile moves coherently: denial UP (denyFactor
// 0.10→0.24, rivalThreatFactor 0.34→0.51), always-hotel (houseScarce & hotelCushion
// →0), and several mid sets lifted off the floor (pink 1.39→2.42, brown 0.94→1.79,
// yellow/green off 0.3). `holderDenialFrac` stayed exactly 1.0 (pinned), so the
// buyer/holder denial lockstep — and the dead hot-potato ring — is preserved by
// construction. Crown-gate status is recorded in EVOLUTION.md.
//
// FIDELITY: binds the SAME 31-param factory in `./bot.ts` (the verbatim copy
// claude-v44/claude-v45 carry) to the vector below; pure, deterministic,
// self-contained — no cross-version imports.
import { type ParamVector, makeParamBot } from "./bot";

/** The warm-start maximin ES winner (claude-v45 substrate, `holderDenialFrac`
 *  pinned to the 1.0 lockstep). Every dim is the ES's tuned value except
 *  `holderDenialFrac`, held at the invariant. */
const CLAUDE_V46_PARAMS: ParamVector = {
  denyFactor: 0.23698658896906347,
  bonusScale: 10355.714560703318,
  railSynergyScale: 1.2668888311464273,
  utilPairBonus: 47.347776440303114,
  baseFloor: 10.829144883662451,
  floorRentFraction: 0.1,
  floorCap: 123.6373368019965,
  hotelCushion: 0,
  houseScarce: 0,
  jailDangerRent: 150,
  acceptMargin: 5,
  survivalFactor: 2.774426297755597,
  liquidityRiskGain: 598.4162445581331,
  dipWorthMult: 1.3443523567974371,
  raiseWorthMult: 1.6737720489507504,
  monoMultOrange: 2.548214269184522,
  monoMultRed: 0.3,
  monoMultLightBlue: 2.6648789356733142,
  monoMultPink: 2.4190544723997465,
  monoMultYellow: 0.5605876256981597,
  monoMultDarkBlue: 0.3,
  monoMultGreen: 0.3952481293420208,
  monoMultBrown: 1.7914739524884369,
  railSynergy2: 50.45620920864826,
  railSynergy3: 40,
  railSynergy4: 536.6889248188813,
  distressSafeRatio: 2.8095792362351775,
  spreadFloor: 4,
  rivalThreatFactor: 0.5139984511344732,
  holderDenialFrac: 1, // PINNED to the buyer/holder lockstep (out of the ES search)
  deployabilityDiscount: 0.29550743869899976,
};

export { CLAUDE_V46_PARAMS };

/** The frozen claude-v46 bot: the 31-param factory bound to the warm-start maximin
 *  ES winner, `holderDenialFrac` held at the lockstep value. */
export const claudeV46Bot = makeParamBot(CLAUDE_V46_PARAMS);

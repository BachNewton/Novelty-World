// opt-v4 — the OPT lineage (paradigm-named: the METHOD that produced it). The
// crown-aligned MAXIMIN ES re-run against the COMPLETED 8-member panel — the six
// originals PLUS the champion opt-v2 AND jane-v4 (the strong bot that opt-v3
// counter-overfit against when it was omitted). So opt-v4 was pressured to beat
// opt-v2 AND jane-v4 simultaneously — a ROBUST improvement, not a non-transitive
// counter. Train maximin over the 8 members: 54.5% (baseline claude-v38 35.5%),
// i.e. its WORST matchup — now including both opt-v2 and jane-v4 — is still >50%
// on the train seeds.
//
// The honest verdict is (a) the held-out crown gauntlet vs base opt-v2 on the
// 8-panel AND (b) the OUT-OF-PANEL sim:versus check vs the bots still outside the
// panel (jane-v3, claude-v38, claude-v30, ...). opt-v3's lesson: maximin overfits
// the binding matchups, and a vector can still counter a bot the panel omits — so
// only a clean BETTER-vs-base + NO-regression (panel AND out-of-panel) result
// crowns. Owned by the orchestrator.
//
// FIDELITY: opt-v4 binds the SAME proven factory (`bot.ts`, pinned byte-identical
// to claude-v38 at DEFAULT_PARAMS) to its winning vector — not a hand-transcription.
// Pure, deterministic, self-contained — no cross-version/`optimize/` imports, no
// Math.random/Date.
//
// NOTABLE PARAM DELTAS vs claude-v38 (default → opt-v4):
//   - denyFactor        0.15  → 0.317
//   - bonusScale        16489 → 21995   (monopolies weighted higher vs cash)
//   - hotelCushion      300   → 0       (hotels the moment it's barely flush)
//   - floorCap          300   → 107     (tiny cap on the rent-fraction reserve)
//   - baseFloor         60    → 16      (very thin bare reserve)
//   - acceptMargin      30    → 5       (sweetens trades to a tiny acceptance cushion)
//   - dipWorthMult      1.4   → 2.01 ; raiseWorthMult 1.25 → 1.65 ; survivalFactor 1.5 → 2.41
//   (railSynergyScale, utilPairBonus, floorRentFraction, houseScarce, jailDangerRent,
//    liquidityRiskGain moved by smaller amounts — full vector below.)
import { type ParamVector, makeParamBot } from "./bot";

/** The ES-winning parameter vector (SNES, MAXIMIN fitness, 8-member panel incl
 *  opt-v2 + jane-v4, seed-1 `bestParams`). Frozen as plain static numbers — the
 *  single source of truth for what opt-v4 IS; `policy.test.ts` pins these. */
const OPT_V4_PARAMS: ParamVector = {
  denyFactor: 0.3173335904752713,
  bonusScale: 21995.472785370766,
  railSynergyScale: 0.9770818630368011,
  utilPairBonus: 73.96170330608032,
  baseFloor: 16.18002489726024,
  floorRentFraction: 0.2507072265465841,
  floorCap: 107.3670759562972,
  hotelCushion: 0,
  houseScarce: 6.236526313557662,
  jailDangerRent: 344.60283894208476,
  acceptMargin: 5,
  survivalFactor: 2.4072701326399173,
  liquidityRiskGain: 239.51454037558878,
  dipWorthMult: 2.01122889280204,
  raiseWorthMult: 1.6502849141314595,
};

export { OPT_V4_PARAMS };

/** The frozen opt-v4 bot: the parameterized claude-v38 factory bound to the
 *  8-panel (completed) maximin ES-winning vector. */
export const optV4Bot = makeParamBot(OPT_V4_PARAMS);

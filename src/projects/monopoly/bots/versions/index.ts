import type { Bot } from "../decision";
import { dumbBot } from "../dumb";
import { claudeV1Bot } from "./claude-v1";
import { claudeV2Bot } from "./claude-v2";
import { claudeV3Bot } from "./claude-v3";
import { claudeV4Bot } from "./claude-v4";
import { claudeV5Bot } from "./claude-v5";
import { claudeV6Bot } from "./claude-v6";
import { claudeV7Bot } from "./claude-v7";
import { claudeV8Bot } from "./claude-v8";
import { claudeV9Bot } from "./claude-v9";
import { claudeV10Bot } from "./claude-v10";
import { claudeV11Bot } from "./claude-v11";
import { claudeV12Bot } from "./claude-v12";
import { claudeV13Bot } from "./claude-v13";
import { claudeV14Bot } from "./claude-v14";
import { claudeV15Bot } from "./claude-v15";
import { claudeV16Bot } from "./claude-v16";
import { claudeV17Bot } from "./claude-v17";
import { claudeV18Bot } from "./claude-v18";
import { claudeV19Bot } from "./claude-v19";
import { claudeV20Bot } from "./claude-v20";
import { claudeV21Bot } from "./claude-v21";
import { claudeV22Bot } from "./claude-v22";
import { claudeV23Bot } from "./claude-v23";
import { claudeV24Bot } from "./claude-v24";
import { claudeV25Bot } from "./claude-v25";
import { claudeV26Bot } from "./claude-v26";
import { claudeV27Bot } from "./claude-v27";
import { claudeV28Bot } from "./claude-v28";
import { claudeV29Bot } from "./claude-v29";
import { claudeV30Bot } from "./claude-v30";
import { claudeV31Bot } from "./claude-v31";
import { claudeV32Bot } from "./claude-v32";
import { claudeV33Bot } from "./claude-v33";
import { claudeV34Bot } from "./claude-v34";
import { claudeV35Bot } from "./claude-v35";
import { claudeV36Bot } from "./claude-v36";
import { claudeV38Bot } from "./claude-v38";
import { claudeV39Bot } from "./claude-v39";
import { claudeV40Bot } from "./claude-v40";
import { claudeV41Bot } from "./claude-v41";
// claude-v42 / claude-v43 — substrate-swap candidates: claude-v41's seller-side
// trade logic bound to the opt-v3 (ladder leader) and opt-v2 (robust ex-crown)
// base vectors respectively, chasing "champion AND top Elo." See each `index.ts`.
import { claudeV42Bot } from "./claude-v42";
import { claudeV43Bot } from "./claude-v43";
// claude-v44 — the COMBINED-SPACE maximin ES champion candidate: the 31-param
// factory (claude-v38 base + claude-v41's three seller-side trade levers) with
// EVERY dim co-tuned jointly (the coupling claude-v42/v43's hand swaps couldn't
// respect). Lifted the worst panel matchup 35.4% → 69.7%. See its `index.ts`.
import { claudeV44Bot } from "./claude-v44";
// claude-v45 — claude-v44's combined-space ES vector with the ONE broken lever
// corrected: `holderDenialFrac` pinned 0.461 → 1.0 (buyer/holder denial-pricing
// lockstep). Kills the held-completer hot-potato the ES re-opened (live in
// game:review 2b6y55). Smallest coherent change; every other dim verbatim v44.
import { claudeV45Bot } from "./claude-v45";
// claude-v46 — a WARM-START maximin ES re-optimization of claude-v45's vector with
// `holderDenialFrac` PINNED at the 1.0 lockstep (out of the search). A measured
// NEAR-EQUAL of v45: crown gate BETTER vs all 10 panel members + all 5 out-of-panel
// bots on both streams, but INCONCLUSIVE vs base v45 (51.5–52.2% head-to-head), and
// the ratings panel-graph ranks v45 just above it — a within-SE noise tie. NOT
// crowned, NOT the default; v45 stays Strongest. Recorded as a distinct equally-strong
// vector (ring dead by construction). See its `index.ts` + EVOLUTION.md.
import { claudeV46Bot } from "./claude-v46";
// claude-v47 — a COMBINED-SPACE maximin ES on the 33-param factory: v45's 31 dims +
// two RISK-AWARE standing levers (`standingFloorGain`/`standingAuctionGain`), warm-
// started from v45, holderDenialFrac pinned. The ES turned the levers ON with a
// "press your lead" posture (floor gain -0.78, auction gain +0.38) but in-sample
// maximin (55%) did NOT beat the risk-NEUTRAL re-tune claude-v46 (57%) — risk-
// awareness WASHED. Recorded as the idea-#2 result. See its `index.ts` + EVOLUTION.md.
import { claudeV47Bot } from "./claude-v47";
// Jane lineage — a bot family distinct from Claude (see EVOLUTION.md "Bot
// lineages"). Every lineage is namespaced by label prefix — `claude-vN`,
// `jane-vN`, `gemini-vN`.
import { janeV1Bot } from "./jane-v1";
import { janeV2Bot } from "./jane-v2";
import { janeV3Bot } from "./jane-v3";
import { janeV4Bot } from "./jane-v4";
// Gemini lineage — a third bot family, authored by Gemini. Labels namespaced
// `gemini-vN`.
import { geminiV1Bot } from "./gemini-v1";
// Trade lineage — the first PARADIGM-named family: namespaced by the SYSTEM its
// versions explore (an asymmetric-valuation TRADE engine), not by the authoring
// machine. A lineage prefix can mark either a machine (claude/jane/gemini) or an
// idea under exploration; see EVOLUTION.md "Bot lineages". (trade-v1 was authored
// on Jane but lives under `trade-v` because the trade paradigm is what it's about.)
import { tradeV1Bot } from "./trade-v1";
// Search lineage — a PARADIGM-named family (like trade-v): namespaced by the
// SYSTEM its versions explore — TRUNCATED-ROLLOUT / lookahead search (the first
// non-greedy bot in the archive) — not by the authoring machine. Authored by
// Claude Code, filed under the paradigm. See EVOLUTION.md "Bot lineages".
import { searchV1Bot } from "./search-v1";
// search-v2 — the same rollout-search machinery on the TUNED champion (claude-v45)
// instead of search-v1's untuned claude-v38 base. See search-v2/index.ts.
import { searchV2Bot } from "./search-v2";
// search-v3 — search-v2 + AUCTION & JAIL search (the deferred-payoff decisions a
// 1-ply tuned eval is blind to). See search-v3/index.ts.
import { searchV3Bot } from "./search-v3";
// Opt lineage — a PARADIGM-named family (like trade-v / search-v): namespaced by
// the METHOD that produced it, not an authoring machine. opt-v1 is claude-v38's
// policy VERBATIM with its full 15-constant tuning vector JOINTLY optimized by an
// Evolutionary Strategy (SNES) — the breakout the hand-tuned archive never did
// (every prior version moved one or two constants at a time, SPRT-gated). The
// winning vector is baked back in as plain static numbers. See `versions/opt-v1/`.
import { optV1Bot } from "./opt-v1";
// opt-v2: same ES paradigm, but a CROWN-ALIGNED MAXIMIN fitness (lift the WORST
// per-member matchup rather than aggregate win-share). See `versions/opt-v2/`.
import { optV2Bot } from "./opt-v2";
// opt-v3: the maximin ES re-run with opt-v2 ITSELF in the 7-member panel, so the
// search had to beat the champion. A distinct aggressive vector. See `versions/opt-v3/`.
import { optV3Bot } from "./opt-v3";
// opt-v4: maximin ES vs the COMPLETED 8-panel (adds jane-v4, the bot opt-v3
// counter-overfit against) — pressured to beat opt-v2 AND jane-v4. See `versions/opt-v4/`.
import { optV4Bot } from "./opt-v4";
// Fable lineage — authored by Fable (Anthropic's flagship model, driving
// Claude Code). fable-v1 = the claude-v45 factory + vector borrowed wholesale,
// extended with the FLOW paradigm the archive lacks: exact 2d6 next-roll
// landing EV (danger-aware liquidity floor, EV jail rule, tempo build order),
// a trade-pricing overhaul (bounded survival credit, recipient-standing-scaled
// rival threat, rail/utility synergy threat, heads-up multiplier, liquidity
// guard), and a ring-proof transfer memory. See fable-v1/PHILOSOPHY.md.
import { fableV1Bot } from "./fable-v1";
// Kyle lineage — a new bot family authored by Kyle, distinct from claude / jane
// / gemini and the paradigm lines (trade / search / opt). Labels namespaced
// `kyle-vN`. kyle-v1 is a from-scratch baseline that defers to engine defaults.
import { kyleV1Bot } from "./kyle-v1";
// kyle-v2 — first KYLE version with real logic (buy / raise-cash / forced
// liquidation; see kyle-v2/PHILOSOPHY.md). Branched from the kyle-v1 baseline.
import { kyleV2Bot } from "./kyle-v2";
// kyle-v3 — kyle-v2 + a MATCH_VALUE-driven TRADE engine (accept any N-way,
// propose best-first mutual-completion cycles; see kyle-v3/PHILOSOPHY.md).
import { kyleV3Bot } from "./kyle-v3";

// ---------------------------------------------------------------------------
// The version archive. Every bot snapshot the simulator can field by name, for
// head-to-head A/B (see EVOLUTION.md "Coexistence & promotion"). Every entry is
// a self-contained frozen SNAPSHOT — so a label always means that exact version.
// What the lobby fields is DERIVED from this archive + the Elo ladder
// (`ratings.ts` → `roles.ts`), not a curated pointer, so registering a version is
// all it takes for it to appear. `dumb` is a null reactive stub — never
// gauntleted. The FLOOR of the default gauntlet field is `claude-v2`.
// `claude-v1` (the original champion) is archived/frozen but EXCLUDED: its bad
// logic stalls/caps too many games (slow and least-informative — see EVOLUTION.md
// Decision 8). It's in `RATING_EXCLUDED` below (so it has no Elo and renders
// DEPRECATED in the lobby) and out of the default gauntlet field (`--with-v1`
// re-adds it for an occasional floor audit).
// ---------------------------------------------------------------------------
export const VERSIONS: Readonly<Record<string, Bot>> = {
  "claude-v1": claudeV1Bot,
  "claude-v2": claudeV2Bot,
  "claude-v3": claudeV3Bot,
  "claude-v4": claudeV4Bot,
  "claude-v5": claudeV5Bot,
  "claude-v6": claudeV6Bot,
  "claude-v7": claudeV7Bot,
  "claude-v8": claudeV8Bot,
  "claude-v9": claudeV9Bot,
  "claude-v10": claudeV10Bot,
  "claude-v11": claudeV11Bot,
  "claude-v12": claudeV12Bot,
  "claude-v13": claudeV13Bot,
  "claude-v14": claudeV14Bot,
  "claude-v15": claudeV15Bot,
  "claude-v16": claudeV16Bot,
  "claude-v17": claudeV17Bot,
  "claude-v18": claudeV18Bot,
  "claude-v19": claudeV19Bot,
  "claude-v20": claudeV20Bot,
  "claude-v21": claudeV21Bot,
  "claude-v22": claudeV22Bot,
  "claude-v23": claudeV23Bot,
  "claude-v24": claudeV24Bot,
  "claude-v25": claudeV25Bot,
  "claude-v26": claudeV26Bot,
  "claude-v27": claudeV27Bot,
  "claude-v28": claudeV28Bot,
  "claude-v29": claudeV29Bot,
  "claude-v30": claudeV30Bot,
  "claude-v31": claudeV31Bot,
  "claude-v32": claudeV32Bot,
  "claude-v33": claudeV33Bot,
  "claude-v34": claudeV34Bot,
  "claude-v35": claudeV35Bot,
  "claude-v36": claudeV36Bot,
  "claude-v38": claudeV38Bot,
  "claude-v39": claudeV39Bot,
  "claude-v40": claudeV40Bot,
  "claude-v41": claudeV41Bot,
  "claude-v42": claudeV42Bot,
  "claude-v43": claudeV43Bot,
  "claude-v44": claudeV44Bot,
  "claude-v45": claudeV45Bot,
  "claude-v46": claudeV46Bot,
  "claude-v47": claudeV47Bot,
  "jane-v1": janeV1Bot,
  "jane-v2": janeV2Bot,
  "jane-v3": janeV3Bot,
  "jane-v4": janeV4Bot,
  "gemini-v1": geminiV1Bot,
  "trade-v1": tradeV1Bot,
  "search-v1": searchV1Bot,
  "search-v2": searchV2Bot,
  "search-v3": searchV3Bot,
  "opt-v1": optV1Bot,
  "opt-v2": optV2Bot,
  "opt-v3": optV3Bot,
  "opt-v4": optV4Bot,
  "fable-v1": fableV1Bot,
  "kyle-v1": kyleV1Bot,
  "kyle-v2": kyleV2Bot,
  "kyle-v3": kyleV3Bot,
  dumb: dumbBot,
};

/** Versions deliberately LEFT OUT of the Elo ladder — the rater skips them, so
 *  they never earn a rating, and the gauntlet drops them from its default field.
 *  Every member is a real, runnable snapshot kept for the archive; they're excluded
 *  purely as a COST optimization (see EVOLUTION.md Decision 8 + the gemini-v1 note):
 *    - `claude-v1` — the original champion; its trade-veto deadlock caps too many
 *      games to the turn limit (slow + least-informative).
 *    - `gemini-v1` — the weakest bot by a wide margin (~ −150 Elo below the field)
 *      AND the capped-game bottleneck, so its pairings are ~6-min slogs that swamp
 *      any ratings/gauntlet run for near-zero signal. It is the sole Gemini version,
 *      so excluding it deprecates the whole Gemini family in the lobby (intended).
 *    - `search-v1` — NOT weak (mid-ladder, ~119 Elo when last rated — a real,
 *      legal rollout/lookahead paradigm). Excluded purely for COST: it is the only
 *      non-greedy bot, so a single 400-game panel pairing runs truncated rollouts
 *      (R×horizon per decision) and takes MINUTES while every greedy pairing takes
 *      seconds — it dominated a ratings run's wall-clock (one `search-v1 × claude-v41`
 *      pairing alone ran >6 min). It is the sole `search` version, so excluding it
 *      deprecates the whole `search` family in the lobby (intended). REVERSAL
 *      CONDITION: re-include `search-v` if a future version posts a competitive Elo —
 *      then the lookahead paradigm earns its rating cost. (Like the two above, it
 *      stays in `VERSIONS`, fully runnable; only its rating/default-field
 *      participation is dropped — field it explicitly via `--field` if ever needed.)
 *    - `kyle-v2` — NOT (yet) a strong bot, but excluded for COST, not weakness: it
 *      buys aggressively and completes monopolies but never BUILDS houses, so it can't
 *      close games out — ~40% of its pairings stalemate to the 2000-turn cap (e.g.
 *      claude-v2 237–1 kyle-v2, 162/400 capped), turning every panel pairing into a
 *      multi-minute slog that swamps a ratings run for near-zero signal (it's plainly
 *      near the bottom). REVERSAL CONDITION: re-include `kyle-v` once a version adds
 *      build/develop logic so its games resolve before the cap. (kyle-v1, the rated
 *      all-defaults baseline, keeps the Kyle family present in the lobby; kyle-v2
 *      renders DEPRECATED alongside it until then.)
 *  A version with no rating renders DEPRECATED in the lobby (struck through, "??? "
 *  Elo, disabled) — see `bots/roles.ts`. This is the lone hand-maintained
 *  rating-policy knob, and it stays tiny. `dumb` is excluded separately (it's a
 *  null stub, not a real bot). */
export const RATING_EXCLUDED: ReadonlySet<string> = new Set([
  // claude-v44 — excluded for SUPERSESSION, not cost (the one non-cost member). It is
  // strictly dominated by its clean twin claude-v45: identical vector but for
  // `holderDenialFrac` (0.461 → 1.0), statistically EVEN in strength, but v44 carries
  // the held-completer hot-potato (game:review 2b6y55) that v45 fixes. Rating it would
  // keep it ~tied at the ladder top (it was +245.6 vs v45's +242.1) and thus the lobby
  // DEFAULT — shipping the defect. Deprecated so v45 is the player-facing Strongest; the
  // snapshot stays in VERSIONS, fully runnable, and is fielded explicitly via `--field`.
  // REVERSAL: drop this line (and restore it to RATING_PANEL) to re-rate it.
  "claude-v44",
  "claude-v1",
  "gemini-v1",
  "search-v1",
  // search-v2 / search-v3 — same COST exclusion as search-v1: truncated-rollout
  // search makes each game ~hundreds of times slower, dominating a ratings run's
  // wall-clock. Measured by direct SPRT vs their claude-v45 base instead. REVERSAL:
  // re-include search-v if a version posts a competitive Elo worth the rating cost.
  "search-v2",
  "search-v3",
  "kyle-v2",
  // kyle-v3 — same COST exclusion as kyle-v2: it adds trading but still never
  // builds houses, so its games stalemate to the turn cap. Re-include the
  // kyle-v lineage once a version develops property and its games resolve.
  "kyle-v3",
]);

/** The ANCHOR PANEL — the small fixed set of opponents that BOTH the rater and the
 *  crown gauntlet measure a new version against (see `bots/CLAUDE.md` "The ANCHOR
 *  PANEL" and EVOLUTION.md). It does two jobs:
 *    - `sim:ratings` (default) fits Elo over the panel GRAPH (panel round-robin +
 *      every other version vs the panel only) instead of a full O(N²) round-robin —
 *      making a new version O(k) to rate and the archive O(N·k).
 *    - `sim:gauntlet --panel` uses it as the crown-gate FIELD: a version is crowned
 *      only if it BEATS its base AND regresses against NO panel member — so a bot that
 *      merely COUNTERS the champion (non-transitively) can't steal the crown (see
 *      EVOLUTION.md "Non-transitivity & the crown" — the jane-v3 RPS cycle).
 *  The SECOND hand-maintained eval knob alongside `RATING_EXCLUDED`; keep it small and
 *  deliberate. Membership rule: span the Elo range AND the distinct strategies, not the
 *  dense middle of washed siblings. Current roster and why each earns its slot:
 *    - claude-v2   — the rating ANCHOR (Elo≡0) + field floor + baseline rival-threat
 *                    pricing. Mandatory: it defines the scale.
 *    - claude-v5   — the denial-MAXIMIZER (active trade-to-deny, DENY 0.6, ~46 Elo).
 *                    Guards against a new bot that quietly collapses vs heavy denial.
 *    - claude-v17  — a mid-ladder calibrator (reserve/liquidity axis, ~63). Fills the
 *                    46→84 Elo gap; without it the dense 50–80 band is poorly bracketed.
 *    - claude-v35  — upper-mid + the mature symmetric denial-pricing trade engine
 *                    (`denialPositionCost`, ~84).
 *    - jane-v2     — the reduced-denial 0.3 regime, near the top (~127). Also the bot
 *                    that beats jane-v3, so it's what catches that counter at the gate.
 *    - claude-v36  — the champion: lowest-denial 0.15 regime + the ceiling, and the
 *                    crown base, so ladder and crown stay consistent (~133).
 *  Must include the rating anchor `claude-v2` and contain no `RATING_EXCLUDED` member
 *  (both asserted by the tools). When you crown a new champion, add it here (and you
 *  may retire a now-redundant member) — that keeps the ceiling of the graph current. */
export const RATING_PANEL: readonly string[] = [
  "claude-v2",
  "claude-v5",
  "claude-v17",
  "claude-v35",
  "jane-v2",
  "claude-v36",
  // opt-v2 — the CHAMPION (crown base): the ES-optimized hyper-aggressive regime,
  // robust (beats the whole archive out-of-panel, no losses). Added per "when you
  // crown a champion, add it here." NOTE: opt-v3 SPRT-beat opt-v2 on the panel but
  // REGRESSES vs jane-v4 (38%) — a panel-overfit counter, NOT crowned; so opt-v2 is
  // the champion-in-panel.
  "opt-v2",
  // jane-v4 — added per the opt-v3 lesson (see EVOLUTION.md "opt-v3"): it is the
  // strong bot the maximin ES counter-overfit AGAINST when it was omitted. Putting
  // it in the panel both (a) makes the ladder price opt-v3's jane-v4 weakness and
  // (b) forces the next optimization (opt-v4) to keep beating jane-v4 — closing the
  // counter-overfit hole. It also spans a distinct strategy (the Jane trade-memory
  // line), which is exactly the panel's membership rule.
  "jane-v4",
  // opt-v4 — the PRIOR robust champion (now superseded by claude-v41). Maximin ES vs
  // this very (completed) panel: SPRT-beats opt-v2 AND jane-v4 on both streams with NO
  // panel OR out-of-panel regressions — the robust improvement opt-v3 wasn't. Kept as
  // the crown base claude-v41 was measured against and a strong distinct opt vector.
  "opt-v4",
  // claude-v41 — the PRIOR crowned champion (the base claude-v44 was measured
  // against). claude-v39 substrate (opt-v4 vector + restored denialPositionCost) +
  // Kyle's seller-side trade pricing (Refinement #3): rivalThreatFactor decoupled from
  // denyFactor to 0.4 + a 0.5 deployability discount on incoming set-handover cash.
  // CROWN GATE `--base opt-v4 --panel`, BOTH streams: SPRT BETTER vs opt-v4 (55.7%
  // train / 62.4% holdout) AND every panel member, ZERO regressions. Kept as a strong
  // distinct vector and the crown base of the current champion.
  "claude-v41",
  // claude-v45 and its better-tuned twin claude-v46 are deliberately NOT in the
  // panel: they are near-identical 31-param vectors (v46 is v45 re-optimized under
  // the same pinned lockstep), so each would add ~30 new vs-twin pairings for ~zero
  // new ranking signal. They join the panel at the next `--full` recalibration. For
  // the v46 and fable-v1 crown gates, claude-v45 was added to the field TRANSIENTLY
  // (the gauntlet needs the base in the field) and the gauntlet logs hold those
  // measurements.
  // fable-v1 — the CROWNED champion (2026-07-17): SPRT BETTER vs base claude-v45 on
  // BOTH streams (56.4% train / 61.1% holdout) AND vs every panel member
  // (55.2–71.7%), zero regressions, clean out-of-panel sweep (its one non-win in
  // the archive is a statistical tie with the champion's retuned twin claude-v46,
  // 48.2% @ 1500). Added per "when you crown a new champion, add it here" — the
  // first confident SPRT crown since claude-v41, and a structurally distinct
  // strategy (the flow/extraction paradigm; see fable-v1/PHILOSOPHY.md), which is
  // exactly the panel's membership rule.
  "fable-v1",
];

/** Resolve a version label to its policy, or throw with the known set listed —
 *  a typo on the CLI should fail loud, not silently field the wrong bot. */
export function versionBot(label: string): Bot {
  if (!(label in VERSIONS)) {
    throw new Error(
      `unknown bot version "${label}" (known: ${Object.keys(VERSIONS).join(", ")})`,
    );
  }
  return VERSIONS[label];
}

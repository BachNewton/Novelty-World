import type { Bot } from "../decision";
import { dumbBot } from "../dumb";
import { claudeV1Bot } from "./claude-v1";
import { claudeV2Bot } from "./claude-v2";
import { claudeV5Bot } from "./claude-v5";
import { claudeV17Bot } from "./claude-v17";
import { claudeV35Bot } from "./claude-v35";
import { claudeV36Bot } from "./claude-v36";
import { claudeV38Bot } from "./claude-v38";
import { claudeV41Bot } from "./claude-v41";
// claude-v45 — the COMBINED-SPACE maximin ES vector on the 31-param factory
// (claude-v38 base + claude-v41's three seller-side trade levers, every dim
// co-tuned jointly), with `holderDenialFrac` pinned to the 1.0 buyer/holder
// denial-pricing lockstep. The pin is what kills the held-completer hot-potato an
// unconstrained ES re-opens (caught live in game:review 2b6y55) — see
// bots/CLAUDE.md "Denial is a premium game". See its `index.ts` + EVOLUTION.md.
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
// Jane lineage — a bot family distinct from Claude (see METHOD.md "Bot
// lineages"). Every lineage is namespaced by label prefix — `claude-vN`,
// `jane-vN`, `gemini-vN`.
import { janeV2Bot } from "./jane-v2";
import { janeV4Bot } from "./jane-v4";
// jane-v6 — the Jane lineage's first bot on the Fable 47-param factory.
// Structural innovation: COLLATERALIZED DEVELOPMENT — mortgages non-monopoly
// singletons to fund house construction on monopolies. Fable's planBuild only
// builds from liquid cash, leaving capital stranded in idle singletons.
// See versions/jane-v6/index.ts.
import { janeV6Bot } from "./jane-v6";
// jane-v7 — jane-v6 + AUCTION DENIAL BIDDING: when a property at auction
// would complete an opponent's monopoly, amplify the deny premium (4x) so
// the bot either wins the blocking property or forces the completing
// opponent to overpay. See versions/jane-v7/index.ts.
import { janeV7Bot } from "./jane-v7";
// jane-v10 — jane-v6 + GREEDY MARGINAL-EV BUILD OPTIMIZER: replaces the static
// spread+push heuristic with a greedy optimizer that picks the highest
// expected-rent-per-dollar upgrade each step. Produces non-uniform final
// levels and allocates capital more efficiently. A structural change to the
// decision process, not a parameter tweak. See versions/jane-v10/index.ts.
import { janeV10Bot } from "./jane-v10";
// jane-v11 — jane-v10 + OPPONENT-AWARE EVALUATION: adds income flow (expected
// monopoly rent from actual opponent positions) and threat exposure (expected
// outgo on next roll) to positionValue — the core eval function that hasn't
// been touched since the lineage began. A structural change to the EVALUATION
// FUNCTION, not the decision process. See versions/jane-v11/index.ts.
import { janeV11Bot } from "./jane-v11";
// jane-v12 — jane-v6 + MONTE CARLO SEARCH at build and trade-accept/deny.
// The first architectural departure from the jane-v6 evaluation framework.
// Instead of heuristic-only decisions, MC forward-simulates candidate build
// plans and trade votes. Everything else uses jane-v6 unchanged. See
// versions/jane-v12/index.ts.
import { janeV12Bot } from "./jane-v12";
// jane-v13 — jane-v11 + INCOME AMORTIZATION HORIZON: the incomeFlow term
// (opponent-aware expected rent) is multiplied by a game-phase-aware horizon
// (1× early to 3× late game), correcting the single-turn undervaluation of
// developed monopolies. Fully deterministic, no MC. See
// versions/jane-v13/index.ts.
import { janeV13Bot } from "./jane-v13";
// jane-v14 — jane-v13 + THREAT EXPOSURE AMORTIZATION HORIZON: the symmetric
// counterpart to J5. threatExposure now scales by the same game-phase-aware
// horizon (1× early → 3× late), correctly modeling that being positioned near
// developed opponent monopolies is a persistent recurring threat in late game,
// not a one-time cost. See versions/jane-v14/index.ts.
import { janeV14Bot } from "./jane-v14";
// jane-v15 — jane-v13 + ASYMMETRIC AMORTIZATION: incomeHorizon at full
// strength (1.0) but threatHorizon at half (0.5). Threats are more volatile
// than guaranteed income — they're mitigable via trades/mortgages/dev.
// Captures v14's fable-v8 improvement without sacrificing aggression.
// See versions/jane-v15/index.ts.
import { janeV15Bot } from "./jane-v15";
// jane-v16 — BANKRUPTCY PRESSURE (J7): new evaluation axis on jane-v13
// substrate. Adds a positionValue bonus when opponents are in financial
// distress — they can't develop, will liquidate cheap, and I inherit their
// assets on bankruptcy. Completely orthogonal to horizon/amortization.
// See versions/jane-v16/index.ts.
import { janeV16Bot } from "./jane-v16";
// jane-v17 — RIVAL DEPLOYABILITY (J8): trade evaluation improvement on
// jane-v13 substrate. Scales rivalThreatCost by opponent's post-trade ability
// to develop the completed monopoly. NOT a positionValue change.
// See versions/jane-v17/index.ts.
import { janeV17Bot } from "./jane-v17";
// jane-v18 — SELF-DEPLOYABILITY DISCOUNT (J9): self-side mirror of J8 in trade
// evaluation. Discounts monopoly bonus when I complete a set but can't afford
// to develop it post-trade.
// See versions/jane-v18/index.ts.
import { janeV18Bot } from "./jane-v18";
// Gemini lineage — a third bot family, authored by Gemini. Labels namespaced
// `gemini-vN`.
import { geminiV1Bot } from "./gemini-v1";
// Trade lineage — the first PARADIGM-named family: namespaced by the SYSTEM its
// versions explore (an asymmetric-valuation TRADE engine), not by the authoring
// machine. A lineage prefix can mark either a machine (claude/jane/gemini) or an
// idea under exploration; see METHOD.md "Bot lineages". (trade-v1 was authored
// on Jane but lives under `trade-v` because the trade paradigm is what it's about.)
import { tradeV1Bot } from "./trade-v1";
// Search lineage — a PARADIGM-named family (like trade-v): namespaced by the
// SYSTEM its versions explore — TRUNCATED-ROLLOUT / lookahead search (the first
// non-greedy bot in the archive) — not by the authoring machine. Authored by
// Claude Code, filed under the paradigm. See METHOD.md "Bot lineages".
// search-v3 — the rollout-search machinery on the tuned claude-v45 base, extended
// to AUCTION & JAIL (the deferred-payoff decisions a 1-ply tuned eval is blind to).
// See search-v3/index.ts.
import { searchV3Bot } from "./search-v3";
// Opt lineage — a PARADIGM-named family (like trade-v / search-v): namespaced by
// the METHOD that produced it, not an authoring machine. An opt version is
// claude-v38's policy VERBATIM with its full 15-constant tuning vector JOINTLY
// optimized by an Evolutionary Strategy (SNES) — the breakout the hand-tuned
// archive never did (every prior version moved one or two constants at a time,
// SPRT-gated). The winning vector is baked back in as plain static numbers.
// opt-v2: the CROWN-ALIGNED MAXIMIN fitness (lift the WORST per-member matchup
// rather than aggregate win-share). See `versions/opt-v2/`.
import { optV2Bot } from "./opt-v2";
// opt-v4: maximin ES vs the COMPLETED 8-panel (adds jane-v4) — pressured to beat
// opt-v2 AND jane-v4, closing the counter-overfit hole a panel missing jane-v4
// leaves open (see EVOLUTION.md). See `versions/opt-v4/`.
import { optV4Bot } from "./opt-v4";
// Fable lineage — authored by Fable (Anthropic's flagship model, driving
// Claude Code). fable-v1 = the claude-v45 factory + vector borrowed wholesale,
// extended with the FLOW paradigm the archive lacks: exact 2d6 next-roll
// landing EV (danger-aware liquidity floor, EV jail rule, tempo build order),
// a trade-pricing overhaul (bounded survival credit, recipient-standing-scaled
// rival threat, rail/utility synergy threat, heads-up multiplier, liquidity
// guard), and a ring-proof transfer memory. See fable-v1/PHILOSOPHY.md.
import { fableV1Bot } from "./fable-v1";
// fable-v2 — the combined-space ES winner over the fable-v1 factory (all 47
// dims co-tuned jointly, warm-started from fable-v1, degenerate-behavior
// guards pinned). Re-prices the board for the extraction era. See its
// index.ts + EVOLUTION.md.
import { fableV2Bot } from "./fable-v2";
// fable-v3 — honest rail-network pricing on the fable-v2 substrate: a
// defect-removal version from real-game evidence (game:review 4q3y6i — two
// fable-v2 seats handed the human winner his 3rd/4th railroads for a ~31%-of-
// delta charge). Nets a 0.65 × synergy-delta handover charge + restores the
// ES-drifted railSynergy2 (≈3 → 70). EVEN across the sweep (the surface is
// invisible to mirror self-play — that's the finding). See its index.ts +
// EVOLUTION.md.
import { fableV3Bot } from "./fable-v3";
// fable-v4 — the voluntary-spend TAIL GUARD on the fable-v3 substrate (factory
// revision, one new dim `voluntaryTailFrac`): a discretionary build/redeploy
// spend must survive the worst single next-roll landing, uncapped. From
// game:review 4q3y6i T219→T222 — a fable-v2 seat spent $506 unmortgaging bare
// greens three turns before dying to a $118 charge behind a $447-capped flow
// floor that reserved a $950 tail at ~$134. See its index.ts + EVOLUTION.md.
import { fableV4Bot } from "./fable-v4";
// fable-v5 — AUCTION LIQUIDITY DISCIPLINE on the fable-v4 substrate: voluntary
// auction bids additionally capped at liquid capacity (cash + own mortgageable
// equity − flow floor), so winning never forces liquidating the prize. The
// first version motivated by a FABLE-PLAYED probe game (played-cli.ts): a
// fable-v2 seat at $166 cash ratcheted a lowball to face, won, and mortgaged
// the won lot to settle. Screen: +3.3 over the mirror null @ 1800 games. See
// its index.ts + EVOLUTION.md.
import { fableV5Bot } from "./fable-v5";
// fable-v6 — COMEBACK-EQUITY SURVIVAL on the fable-v5 substrate: the F2a
// survival credit is scaled by positionValue share vs the strongest live
// opponent, so a beaten seat stops fire-selling (the 4q3y6i $55 States
// handover; both probe games' distress rail sales at ~book+$50 — the distress
// bypass of fable-v3's rail charge). Peer-parity shedding stays protective.
// See its index.ts + EVOLUTION.md.
import { fableV6Bot } from "./fable-v6";
// fable-v7 — TRADE-OUTFLOW TAIL GUARD on the fable-v6 substrate: a voluntary
// trade spending cash must leave half the board's worst single hit, position-
// independent (F2e's danger-aware floor is next-roll-myopic while a trade's
// cash state persists). From the crown's own first probe game: a fable-v6
// seat paid a wallet-pegged $735 for a marginal 4th rail down to $38 under a
// 3-house board and died on the landing. Set-completion boldness exempt.
// See its index.ts + EVOLUTION.md.
import { fableV7Bot } from "./fable-v7";
// fable-v8 — TRANSFORMATIVE-TRADE RESERVE on the fable-v7 substrate: the F8
// set-completion exemption must still leave half the normal reserve. From
// probe game 4 (vs the crowned fable-v7): a seat paid $430 of a $442 wallet
// for a completer through the exemption, kept $7, never built on the set,
// and died. A floor on the price paid, never a discount on set value.
// See its index.ts + EVOLUTION.md.
import { fableV8Bot } from "./fable-v8";
// fable-v9 — RE-PITCH MINIMUM STEP on the fable-v8 substrate: a declined trade
// may be re-proposed only with ≥$50 more for the decliner (the old rule
// unblocked on any $1, and the ask constructor re-solves slightly different
// prices every turn — probe games logged 5 and 7 re-pitches of one identical
// swap with cosmetic repricing). See its index.ts + EVOLUTION.md.
import { fableV9Bot } from "./fable-v9";
// fable-v10 — PRICE-AWARE RESERVE on the fable-v8 substrate (branched from
// v8, not the rejected v9): required reserve = min(flat floor,
// spendReserveMult × cash spent). From probe game 5: the flat floor refused
// an $8 mutual-monopoly swap and a $60 completer, freezing bot-to-bot
// completer trades ~47 turns while a seat died set-less. Big drains still
// blocked. See its index.ts + EVOLUTION.md.
import { fableV10Bot } from "./fable-v10";
// fable-v11 — the HUMAN-COUNTERPARTY MODEL on the fable-v8 substrate: premium
// cash asks are not constructed against human seats (corpus: ~0% conversion,
// wallet-peg tell), and human-PROPOSED trades need a $75 margin instead of
// the ~$9 bar humans probe for. Fires ONLY when the modeled seat has
// botStrategy === null, so bot-vs-bot play — and the whole gauntlet/ratings
// apparatus — is unchanged by construction (identity pinned in its tests).
// See its index.ts + EVOLUTION.md.
import { fableV11Bot } from "./fable-v11";
// fable-v12 — the HUMAN THREAT MULTIPLIER on the fable-v11 substrate: the
// selfView rivalThreatCost doubles when the armed seat is human — humans
// convert handed sets/networks into wins far better than the bot-calibrated
// factor prices (corpus rails ~14× under-charged; probe-6 completers at
// 1.3–1.4× book returning 5×+). Human-gated; bot-vs-bot identical to v11.
// See its index.ts + EVOLUTION.md.
import { fableV12Bot } from "./fable-v12";
// fable-v14 — the AUCTION TRANSFORM-TAIL RESERVE on the fable-v12 substrate: the
// F9 completer guard, ported to the auction path. `auction()`'s F6 liquid cap
// guarantees a win is SETTLEABLE, not survivable — for a completer, its
// mortgageable equity counts the prize's OWN set-mates, so winning at the cap can
// force mortgaging them (complete-into-illiquidity; a human baited this 2/2). New
// dim `auctionTailFrac` (0.25) caps completer bids to leave a cash reserve against
// the worst board hit; NARROW — binds only on completers, so ordinary auctions
// are untouched (avoiding fable-v13's board-wide passivity). See its index.ts.
import { fableV14Bot } from "./fable-v14";
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
// head-to-head A/B (see METHOD.md "Coexistence & promotion"). Every entry is
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
  "claude-v5": claudeV5Bot,
  "claude-v17": claudeV17Bot,
  "claude-v35": claudeV35Bot,
  "claude-v36": claudeV36Bot,
  "claude-v38": claudeV38Bot,
  "claude-v41": claudeV41Bot,
  "claude-v45": claudeV45Bot,
  "claude-v46": claudeV46Bot,
  "claude-v47": claudeV47Bot,
  "jane-v2": janeV2Bot,
  "jane-v4": janeV4Bot,
  "jane-v6": janeV6Bot,
  "jane-v7": janeV7Bot,
  "jane-v10": janeV10Bot,
  "jane-v11": janeV11Bot,
  "jane-v12": janeV12Bot,
  "jane-v13": janeV13Bot,
  "jane-v14": janeV14Bot,
  "jane-v15": janeV15Bot,
  "jane-v16": janeV16Bot,
  "jane-v17": janeV17Bot,
  "jane-v18": janeV18Bot,
  "gemini-v1": geminiV1Bot,
  "trade-v1": tradeV1Bot,
  "search-v3": searchV3Bot,
  "opt-v2": optV2Bot,
  "opt-v4": optV4Bot,
  "fable-v1": fableV1Bot,
  "fable-v2": fableV2Bot,
  "fable-v3": fableV3Bot,
  "fable-v4": fableV4Bot,
  "fable-v5": fableV5Bot,
  "fable-v6": fableV6Bot,
  "fable-v7": fableV7Bot,
  "fable-v8": fableV8Bot,
  "fable-v9": fableV9Bot,
  "fable-v10": fableV10Bot,
  "fable-v11": fableV11Bot,
  "fable-v12": fableV12Bot,
  "fable-v14": fableV14Bot,
  "kyle-v1": kyleV1Bot,
  "kyle-v2": kyleV2Bot,
  "kyle-v3": kyleV3Bot,
  dumb: dumbBot,
};

/** Versions deliberately LEFT OUT of the Elo ladder — the rater skips them, so
 *  they never earn a rating, and the gauntlet drops them from its default field.
 *  Every member is a real, runnable snapshot kept for the archive; they're excluded
 *  purely as a COST optimization (see METHOD.md Decision 8 + the gemini-v1 note):
 *    - `claude-v1` — the original champion; its trade-veto deadlock caps too many
 *      games to the turn limit (slow + least-informative).
 *    - `gemini-v1` — the weakest bot by a wide margin (~ −150 Elo below the field)
 *      AND the capped-game bottleneck, so its pairings are ~6-min slogs that swamp
 *      any ratings/gauntlet run for near-zero signal. It is the sole Gemini version,
 *      so excluding it deprecates the whole Gemini family in the lobby (intended).
 *    - `search-v3` — NOT weak (a real, legal rollout/lookahead paradigm). Excluded
 *      purely for COST: it is the only non-greedy bot, so a single 400-game panel
 *      pairing runs truncated rollouts (R×horizon per decision) and takes MINUTES
 *      while every greedy pairing takes seconds — it dominated a ratings run's
 *      wall-clock. Measured by direct SPRT vs its claude-v45 base instead. It is the
 *      sole `search` version, so excluding it deprecates the whole `search` family in
 *      the lobby (intended). REVERSAL CONDITION: re-include `search-v` if a future
 *      version posts a competitive Elo — then the lookahead paradigm earns its rating
 *      cost. (Like the two above, it stays in `VERSIONS`, fully runnable; only its
 *      rating/default-field participation is dropped — field it explicitly via
 *      `--field` if ever needed.)
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
  "claude-v1",
  "gemini-v1",
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
 *      METHOD.md "Non-transitivity & the crown" — the jane-v3 RPS cycle).
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
  // opt-v2 — RETIRED from the panel 2026-07-18 (the first prune): opt-v4 is the
  // same paradigm's strictly-superseding vector (SPRT BETTER vs opt-v2 on both
  // streams at its own gate) and keeps the opt axis represented, so opt-v2's
  // column was paying k pairings per new version for near-duplicate signal.
  // Still registered + rated (a panel retiree keeps its Elo via its own column).
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
  // claude-v41 — RETIRED from the panel 2026-07-18 (the first prune): its
  // defining axis (seller-side trade pricing — decoupled rivalThreatFactor +
  // deployability discount) is embodied downstream in claude-v45 and the whole
  // fable line, so its column duplicated the mid-strong band claude-v45 already
  // brackets. Still registered + rated.
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
  // claude-v45 — added 2026-07-17 to REPRESENT THE SUMMIT TIER in the panel graph.
  // The 210–220 tier (claude-v45/claude-v46/fable-v2, all within ratings SE of each
  // other) decides the player-facing default, but with all of them non-panel, NONE
  // of the tier's internal pairings entered the fit — the ladder was ordering the
  // summit by TRANSITIVE inference while direct SPRT evidence existed (fable-v2
  // BETTER vs claude-v45 on both gauntlet streams). Adding claude-v45 (the tier's
  // longest-standing member and ex-champion) makes every rated version — including
  // fable-v2 and claude-v46 — carry a DIRECT column against it, so the summit
  // ordering is measured, not inferred. This is a measurement-quality fix under the
  // membership rule ("span the Elo range"), deliberately NOT contingent on which
  // bot it favors.
  "claude-v45",
  // fable-v6 — crowned-for-an-hour on 2026-07-18, RETIRED from the panel the
  // same day (the first prune): the fable defect-stack surface it represented
  // is fully spanned by fable-v7 (its strict-crown successor, one dim up) and
  // fable-v8 (one dim further), both panel members — a twin sandwich whose
  // middle column added ~zero ranking signal. Still registered + rated.
  // fable-v7 — the CROWNED champion (2026-07-18, superseding fable-v6 the same
  // night): the trade-outflow tail guard on the fable-v6 substrate, and a
  // STRICT crown — SPRT BETTER vs its own base on BOTH streams and BETTER in
  // all 32 pairings of the 16-member gate field, zero regressions. Added per
  // the crown rule. NOTE: the panel is now 15 members — pruning redundant
  // members (each costs k pairings per new version) is a flagged lead, left
  // for a session that can re-validate the graph after removal.
  "fable-v7",
  // fable-v8 — added 2026-07-18 as a MEASUREMENT-QUALITY fix (the claude-v45
  // precedent: summit representation, decided on principle rather than on whom
  // it favors). fable-v8 is the SUBSTRATE and the base fable-v9/v10 were
  // rejected against — without its column, fable-v10 topped the panel graph on
  // its counter-win over fable-v7 while its confirmed holdout deficit vs
  // fable-v8 was invisible to the fit, deriving a REJECTED version into the
  // lobby default. With the column, the summit ordering is measured. The panel
  // is now 16 members — the prune lead stands.
  "fable-v8",
  // jane-v6 — the CROWNED champion (2026-07-18, +18.8 Elo over fable-v8):
  // collateralized development on the fable-v8 factory. SPRT BETTER vs all 12
  // panel members, zero regressions. Added per the crown rule — structurally
  // distinct (capital reallocation via singleton mortgaging), and now the
  // summit of the ladder.
  "jane-v6",
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

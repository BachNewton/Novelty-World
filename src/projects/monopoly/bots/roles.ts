import { BOT_RATINGS } from "./ratings";
import { VERSIONS } from "./versions";

// ---------------------------------------------------------------------------
// The PLAYER-FACING lobby offering — ENTIRELY DERIVED, not hand-curated. This is
// the "which bot challenges me most right now?" view, and it has exactly ONE axis:
// a bot's measured Elo IS its strength. So the whole structure (the strongest bot,
// each family's best, every version, and which are deprecated) falls out of two
// inputs:
//   - `VERSIONS` — the archive (which versions exist, by label).
//   - `BOT_RATINGS` — the GENERATED Elo ladder (`ratings.ts`, written by
//     `npm run sim:ratings`; anchored `claude-v2 = 0`).
//
// Consequences:
//   - The STRONGEST (lobby default + the bot `addBot`/`freshGame` seat) is simply
//     the highest-Elo version across all families. NO confidence gate — it just
//     follows the top of the ladder, so if two bots are within noise the label may
//     flip between them (they're genuinely ~equally hard, so the player loses
//     nothing).
//   - Each FAMILY'S BEST is the highest-Elo version within that family.
//   - DEPRECATED ⇔ no Elo (e.g. `claude-v1`, excluded from rating). Rendered
//     struck-through with "???" Elo and disabled in the selector.
//
// NOT here — and deliberately so: the evolution "CHAMPION/crown" and "SUBSTRATE"
// (which version we evolve the next bot from). Those are a DIFFERENT audience (us,
// the authoring loop) and a DIFFERENT bar (SPRT-confirmed, not a higher Elo point
// estimate), so they live in EVOLUTION.md + dev tooling, never in the player UI.
// The only hand-maintained data in this file is `FAMILY_SPECS` (display name +
// label prefix). See `bots/CLAUDE.md` "Lobby strength ratings".
// ---------------------------------------------------------------------------

/** A bot FAMILY's display identity. Adding a family (ChatGPT, …) is one row here
 *  plus its snapshots under `versions/<prefix>N/` — nothing else. A prefix can
 *  namespace EITHER an authoring machine (`claude-v`, `jane-v`, `gemini-v`) OR a
 *  PARADIGM/system a line of versions explores (`trade-v` — an asymmetric-valuation
 *  trade engine), independent of who authored it. The label still self-documents
 *  what the lineage IS; for a paradigm family that's the idea, not the author. */
interface FamilySpec {
  /** Family name shown as the section heading. */
  name: string;
  /** Version-label prefix that namespaces this family (`claude-v`, `jane-v`). */
  prefix: string;
}

/** The bot families, in lobby display order. */
const FAMILY_SPECS: readonly FamilySpec[] = [
  { name: "Claude", prefix: "claude-v" },
  { name: "Jane", prefix: "jane-v" },
  { name: "Gemini", prefix: "gemini-v" },
  { name: "Trade", prefix: "trade-v" },
  { name: "Search", prefix: "search-v" },
  { name: "Opt", prefix: "opt-v" },
  { name: "Fable", prefix: "fable-v" },
  { name: "Kyle", prefix: "kyle-v" },
];

/** Display offset so the anchor (`claude-v2`, raw Elo 0) reads as a friendly,
 *  chess-like baseline rather than a discouraging "0" — only RELATIVE gaps between
 *  bots carry meaning, so any constant shift is purely cosmetic. */
export const RATING_DISPLAY_BASE = 1000;

/** The lobby strength number to show for a version: its measured Elo (from the
 *  generated `BOT_RATINGS`, anchored `claude-v2 = 0`) shifted by the display base
 *  and rounded. `null` when the version isn't in the ladder — either deliberately
 *  excluded (`RATING_EXCLUDED`) or not yet rated (a fresh version before the next
 *  `npm run sim:ratings`). A `null` rating is what marks a version DEPRECATED. */
export function ratingFor(version: string): number | null {
  const raw = BOT_RATINGS[version];
  return raw === undefined ? null : Math.round(RATING_DISPLAY_BASE + raw);
}

/** True iff `label` belongs to `prefix`'s family — the remainder after the prefix
 *  must be a bare number (`claude-v17`, `jane-v2`), so a prefix can't swallow a
 *  longer one (e.g. `claude-v` must not match a future `claude-va…` label). */
function versionIndex(label: string, prefix: string): number | null {
  if (!label.startsWith(prefix)) return null;
  const suffix = label.slice(prefix.length);
  if (suffix.length === 0 || !/^\d+$/.test(suffix)) return null;
  return Number(suffix);
}

/** A single selectable bot in the lobby — one concrete archive version. */
export interface BotOption {
  /** The version label, stored verbatim in `Player.botStrategy`. */
  version: string;
  /** Lobby strength (`ratingFor`), or `null` when deprecated. */
  rating: number | null;
  /** True when the version has no Elo: render struck-through + "???" + disabled.
   *  A deprecated option is never selectable, the overall/family best, or the
   *  default. */
  deprecated: boolean;
}

/** One bot family for display: its name, its strongest (highest-Elo) version, and
 *  every version it owns in chronological (ascending) order. */
export interface BotFamily {
  name: string;
  /** Highest-Elo version in the family, or `null` if none are rated yet. */
  best: BotOption | null;
  /** All versions, oldest → newest. Includes deprecated ones (disabled). */
  versions: readonly BotOption[];
}

/** The fully-derived lobby offering rendered by the seat-room selector. */
export interface LobbyBots {
  /** Highest-Elo version across ALL families — the default and the headline
   *  pick. `null` only in the degenerate pre-rating state (nothing rated yet). */
  overallBest: BotOption | null;
  /** Per-family sections, in `FAMILY_SPECS` order. */
  families: readonly BotFamily[];
}

function toOption(version: string): BotOption {
  const rating = ratingFor(version);
  return { version, rating, deprecated: rating === null };
}

/** Pick the highest-rated option, ignoring deprecated (unrated) ones. */
function strongest(options: readonly BotOption[]): BotOption | null {
  let best: BotOption | null = null;
  for (const o of options) {
    if (o.deprecated || o.rating === null) continue;
    if (best === null || best.rating === null || o.rating > best.rating) best = o;
  }
  return best;
}

function buildFamilies(): BotFamily[] {
  const labels = Object.keys(VERSIONS);
  return FAMILY_SPECS.map((spec) => {
    const versions = labels
      .map((label) => ({ label, index: versionIndex(label, spec.prefix) }))
      .filter((e): e is { label: string; index: number } => e.index !== null)
      .sort((a, b) => a.index - b.index)
      .map((e) => toOption(e.label));
    return { name: spec.name, best: strongest(versions), versions };
  });
}

/** The derived lobby offering. Computed once at module load from the static
 *  archive + generated ratings — pure data, safe to import anywhere. */
export const LOBBY_BOTS: LobbyBots = (() => {
  const families = buildFamilies();
  const overallBest = strongest(families.flatMap((f) => f.best ?? []));
  return { overallBest, families };
})();

/** The version a fresh bot seat plays by default (`addBot`, `freshGame`): the
 *  current overall best. Falls back to the newest registered version when nothing
 *  is rated yet (the transient pre-`sim:ratings` state), so a seat is ALWAYS a
 *  real, playable bot even before the ladder exists. */
export const DEFAULT_BOT_VERSION: string =
  LOBBY_BOTS.overallBest?.version ?? newestRegisteredVersion();

/** Newest version label by family order then index — the safety fallback for
 *  `DEFAULT_BOT_VERSION` before any ratings exist. */
function newestRegisteredVersion(): string {
  for (const family of LOBBY_BOTS.families) {
    const last = family.versions.at(-1);
    if (last) return last.version;
  }
  // Unreachable: the archive always has at least one registered version.
  throw new Error("no bot versions registered");
}

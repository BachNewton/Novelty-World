import type { BotStrategy } from "../types";
import { LIVE_VERSION } from "./live";
import { BOT_RATINGS } from "./ratings";
import { VERSIONS } from "./versions";

// ---------------------------------------------------------------------------
// The lobby-selectable bot ROLES, expressed as data and organized by LINEAGE
// (bot family — Claude, Jane, and any future Gemini/ChatGPT). Each role is a
// stable id (stored in `Player.botStrategy`) bound to a version POINTER; the
// seat-room UI renders one option per role and `registry.ts` resolves each id to
// a policy, so adding a lineage, retargeting a pointer, or registering a version
// never touches the UI — only the data here.
//
// The pointer scheme:
//   - champion          — the single STRONGEST version by measurement (highest
//                         gauntlet Elo) ACROSS ALL LINEAGES. Global, not per
//                         family: today a Claude version, tomorrow possibly a
//                         Jane or Gemini one. Re-pointed when the gauntlet crowns
//                         a new overall best (the code half of the acceptance
//                         ritual; the other half is the EVOLUTION.md log row).
//   - <lineage>         — that family's hand-picked / featured bot (`claude`,
//                         `jane`). For Claude this is the shipped LIVE pointer
//                         (`bots/live.ts` → LIVE_VERSION) — a human product call.
//   - <lineage>-latest  — that family's newest snapshot, DERIVED from VERSIONS by
//                         label prefix (never hand-edited: registering a version
//                         makes it that lineage's latest).
//
// "Live pointer" semantics: a seat stores its ROLE (e.g. "champion" / "jane"),
// not a frozen label, so it always resolves to whatever the pointer names in the
// deployed code; retargeting moves every seat using that role on the next deploy.
// ---------------------------------------------------------------------------

/** The strongest version by measurement (highest gauntlet Elo) ACROSS ALL
 *  LINEAGES. Bump when a new overall best is crowned — see EVOLUTION.md
 *  "Coexistence & promotion".
 *
 *  CHAMPION IS NOW A JANE-LINEAGE BOT (`jane-v2`) — the FIRST cross-lineage crown.
 *  jane-v2 is STRICTLY BETTER than the prior champion claude-v35, confirmed on BOTH
 *  seed streams with zero regressions: train 54.5% / +31.6 Elo, holdout 53.3% / +22.8
 *  Elo (gauntlet `jane-v2 --base claude-v35 --field claude-v35`, run on both `train`
 *  and `--prefix holdout`, 2026-06-21). Unlike claude-v35's promotion (a quality
 *  tiebreak at PARITY with claude-v29), this is a clean strictly-better result — it
 *  clears the normal
 *  "crown only on BETTER" bar outright, on both streams. jane-v2's own evolution
 *  journey lives in `versions/jane-v2/index.ts`; Jane is a separate lineage, so the
 *  Claude version log in EVOLUTION.md does not track it. `LIVE_VERSION` (the shipped
 *  `claude` bot) is unaffected — shipping is a Claude product call; only this
 *  cross-lineage measurement pointer moves. The next CLAUDE version still branches
 *  from the best Claude version (claude-v35), independent of this crown. */
export const CHAMPION_VERSION = "jane-v2";

/** Jane's hand-picked / featured version (the bare "Jane" lobby pointer) —
 *  Jane's analog of Claude's LIVE_VERSION, moved by a human. */
export const JANE_FEATURED_VERSION = "jane-v1";

/** Gemini's hand-picked / featured version (the bare "Gemini" lobby pointer). */
export const GEMINI_FEATURED_VERSION = "gemini-v1";

/** Newest label in a lineage, found by its version-label prefix. Derived, so
 *  registering a new `<prefix>N` snapshot makes it that lineage's latest with no
 *  other change. */
function latestForPrefix(prefix: string): string {
  let best: { label: string; index: number } | null = null;
  for (const label of Object.keys(VERSIONS)) {
    if (!label.startsWith(prefix)) continue;
    const suffix = label.slice(prefix.length);
    // The label belongs to this lineage only if the remainder is a bare number
    // (`claude-v17`, `jane-v1`) — guards a prefix from swallowing a longer one
    // (e.g. `claude-v` must not match a future `claude-va…` label).
    if (suffix.length === 0 || !/^\d+$/.test(suffix)) continue;
    const index = Number(suffix);
    if (best === null || index > best.index) best = { label, index };
  }
  if (best === null) {
    throw new Error(`no versions registered for lineage prefix "${prefix}"`);
  }
  return best.label;
}

/** A bot FAMILY: its display identity, label namespace, and two per-lineage
 *  pointers. Adding a family (Gemini, ChatGPT, …) is one row in `LINEAGES` + its
 *  two ids in `BOT_STRATEGIES` (`types.ts`) + its snapshots under
 *  `versions/<prefix>N/`. */
export interface BotLineage {
  /** Featured pointer id (the bare lineage name), stored in `Player.botStrategy`. */
  id: BotStrategy;
  /** Newest-snapshot pointer id (`<id>-latest`). */
  latestId: BotStrategy;
  /** Family name shown in the lobby. */
  displayName: string;
  /** Version-label prefix that namespaces this family (`claude-v`, `jane-v`). */
  versionPrefix: string;
  /** The hand-picked / featured version label. */
  featured: string;
  /** The newest version label in this family (derived from `versionPrefix`). */
  latest: string;
}

function makeLineage(
  spec: Omit<BotLineage, "latest">,
): BotLineage {
  return { ...spec, latest: latestForPrefix(spec.versionPrefix) };
}

/** The bot families, in lobby display order. Every family is namespaced by its
 *  label prefix (`claude-vN`, `jane-vN`, `gemini-vN`). */
export const LINEAGES: readonly BotLineage[] = [
  makeLineage({
    id: "claude",
    latestId: "claude-latest",
    displayName: "Claude",
    versionPrefix: "claude-v",
    featured: LIVE_VERSION,
  }),
  makeLineage({
    id: "jane",
    latestId: "jane-latest",
    displayName: "Jane",
    versionPrefix: "jane-v",
    featured: JANE_FEATURED_VERSION,
  }),
  makeLineage({
    id: "gemini",
    latestId: "gemini-latest",
    displayName: "Gemini",
    versionPrefix: "gemini-v",
    featured: GEMINI_FEATURED_VERSION,
  }),
];

/** Resolve a lineage by either of its pointer ids. Throws on an unknown id, so
 *  the registry's per-lineage lookups can't silently drift. */
export function lineageFor(id: BotStrategy): BotLineage {
  const lin = LINEAGES.find((l) => l.id === id || l.latestId === id);
  if (!lin) throw new Error(`no lineage owns bot strategy "${id}"`);
  return lin;
}

export interface BotRole {
  /** Registry key for this role; stored in `Player.botStrategy`. */
  id: BotStrategy;
  /** Full label shown in the lobby. */
  label: string;
  /** Short word for the compact per-seat selector. */
  short: string;
  /** The version this role currently resolves to — shown as a tag, and the
   *  reason two roles reading the same version is visible at a glance. */
  version: string;
  /** The lobby-facing strength number for this role's version (see `ratingFor`),
   *  or null if that version hasn't been rated yet. Lets a player compare bots at
   *  a glance — a bigger number is a stronger bot, and the gap is real. */
  rating: number | null;
  /** One-line description of what the role means. */
  hint: string;
}

/** Display offset so the anchor (`claude-v2`, raw Elo 0) reads as a friendly,
 *  chess-like baseline rather than a discouraging "0" — only RELATIVE gaps between
 *  bots carry meaning, so any constant shift is purely cosmetic. */
export const RATING_DISPLAY_BASE = 1000;

/** The lobby strength number to show for a version: its measured Elo (from the
 *  generated `BOT_RATINGS`, anchored `claude-v2 = 0`) shifted by the display base
 *  and rounded. `null` when the version isn't in the ladder yet (e.g. a freshly
 *  added lineage before the next `npm run sim:ratings`). */
export function ratingFor(version: string): number | null {
  const raw = BOT_RATINGS[version];
  return raw === undefined ? null : Math.round(RATING_DISPLAY_BASE + raw);
}

/** A display SECTION in the lobby selector: the standalone Champion (no heading)
 *  or one bot family (heading = its display name). The grouped shape lets the
 *  selector render family headers and scale to any number of lineages without
 *  the flat pill row breaking on a narrow screen. */
export interface BotRoleGroup {
  /** Section heading, or null for the headingless global Champion. */
  heading: string | null;
  roles: readonly BotRole[];
}

const CHAMPION_ROLE: BotRole = {
  id: "champion",
  label: "Champion Bot",
  short: "Champion",
  version: CHAMPION_VERSION,
  rating: ratingFor(CHAMPION_VERSION),
  hint: "The strongest bot found so far across all families (highest gauntlet Elo).",
};

/** The lobby-selectable roles GROUPED for display, in order: the global Champion
 *  first (no heading), then one section per lineage with its featured + latest.
 *  Generated from `LINEAGES`, so a new family appears automatically. `dumb` is
 *  intentionally absent — resolvable for the simulator/gauntlet but not offered
 *  in the lobby. */
export const BOT_ROLE_GROUPS: readonly BotRoleGroup[] = [
  { heading: null, roles: [CHAMPION_ROLE] },
  ...LINEAGES.map((lin): BotRoleGroup => ({
    heading: lin.displayName,
    roles: [
      {
        id: lin.id,
        label: `${lin.displayName} Bot`,
        short: lin.displayName,
        version: lin.featured,
        rating: ratingFor(lin.featured),
        hint: `The hand-picked ${lin.displayName} bot.`,
      },
      {
        id: lin.latestId,
        label: `${lin.displayName} Latest`,
        short: `${lin.displayName} Latest`,
        version: lin.latest,
        rating: ratingFor(lin.latest),
        hint: `The newest ${lin.displayName} version — bleeding edge, not yet proven best.`,
      },
    ],
  })),
];

/** Flat list of every lobby role, derived from `BOT_ROLE_GROUPS` so the two can
 *  never drift. Handy for "resolve a stored `botStrategy` to its role". */
export const BOT_ROLES: readonly BotRole[] = BOT_ROLE_GROUPS.flatMap(
  (g) => g.roles,
);

import type { BotStrategy } from "../types";
import { LIVE_VERSION } from "./live";
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
 *  LINEAGES. Bump when the loop crowns a new overall best — see EVOLUTION.md
 *  "Coexistence & promotion". (Jane's `jane-v1` only TIES this, so the overall
 *  champion stays a Claude version for now.) */
export const CHAMPION_VERSION = "v29";

/** Jane's hand-picked / featured version (the bare "Jane" lobby pointer) —
 *  Jane's analog of Claude's LIVE_VERSION, moved by a human. */
export const JANE_FEATURED_VERSION = "jane-v1";

/** Newest label in a lineage, found by its version-label prefix. Derived, so
 *  registering a new `<prefix>N` snapshot makes it that lineage's latest with no
 *  other change. */
function latestForPrefix(prefix: string): string {
  let best: { label: string; index: number } | null = null;
  for (const label of Object.keys(VERSIONS)) {
    if (!label.startsWith(prefix)) continue;
    const suffix = label.slice(prefix.length);
    // The label belongs to this lineage only if the remainder is a bare number
    // (`v17`, `jane-v1`) — guards `v` from matching a future `va…` label.
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
  /** Version-label prefix that namespaces this family (`v`, `jane-v`). */
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

/** The bot families, in lobby display order. Claude is unprefixed (`vN`) for
 *  historical continuity; later families are namespaced (`jane-vN`). */
export const LINEAGES: readonly BotLineage[] = [
  makeLineage({
    id: "claude",
    latestId: "claude-latest",
    displayName: "Claude",
    versionPrefix: "v",
    featured: LIVE_VERSION,
  }),
  makeLineage({
    id: "jane",
    latestId: "jane-latest",
    displayName: "Jane",
    versionPrefix: "jane-v",
    featured: JANE_FEATURED_VERSION,
  }),
];

// TODO — Adding a new bot family (e.g. Gemini or ChatGPT). It's four small,
// mechanical edits; the lobby UI and the gauntlet need ZERO changes (the UI
// renders from BOT_ROLES, and the gauntlet fields versions by opaque label).
//
//   1. `types.ts` → add the family's two ids to `BOT_STRATEGIES`:
//        "gemini", "gemini-latest"          (the route validator picks them up
//                                            automatically — it reads this list)
//   2. `versions/` → add the snapshots under the family's label prefix, e.g.
//        `versions/gemini-v1/`, `versions/gemini-v2/`, … and register each in
//        `versions/index.ts` ("gemini-v1": geminiV1Bot, …).
//   3. Here → add one row to `LINEAGES` (and a featured-pointer const like
//        `JANE_FEATURED_VERSION` if it isn't the latest):
//        makeLineage({
//          id: "gemini",
//          latestId: "gemini-latest",
//          displayName: "Gemini",
//          versionPrefix: "gemini-v",   // namespaces its labels; derives `latest`
//          featured: GEMINI_FEATURED_VERSION,
//        }),
//   4. `registry.ts` → add the two keys to the `BOTS` literal (the exhaustive
//        `Record<BotStrategy, Bot>` will fail to compile until you do):
//        gemini: versionBot(lineageFor("gemini").featured),
//        "gemini-latest": versionBot(lineageFor("gemini-latest").latest),
//
// That's it — "Gemini" and "Gemini Latest" then appear in the lobby, compete in
// the gauntlet (`npm run sim:gauntlet -- gemini-v1 --base v29`), and are eligible
// for the single global `champion` pointer like any other family.

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
  /** One-line description of what the role means. */
  hint: string;
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
        hint: `The hand-picked ${lin.displayName} bot.`,
      },
      {
        id: lin.latestId,
        label: `${lin.displayName} Latest`,
        short: `${lin.displayName} Latest`,
        version: lin.latest,
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

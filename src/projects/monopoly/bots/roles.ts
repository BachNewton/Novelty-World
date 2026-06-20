import type { BotStrategy } from "../types";
import { LIVE_VERSION } from "./live";
import { VERSIONS } from "./versions";

// ---------------------------------------------------------------------------
// The lobby-selectable bot ROLES, expressed as data. Each role is a stable id
// (stored in `Player.botStrategy`) bound to a version POINTER. The seat-room UI
// renders one option per entry and `registry.ts` resolves each id to a policy,
// so adding a role, retargeting a champion, or registering a new version never
// touches the UI — only the relevant pointer below.
//
// Three orthogonal pointers, distinguished by WHO moves each:
//   - claude  (LIVE)  — the hand-picked shipped bot. A product call, lives in
//                       `bots/live.ts` → `LIVE_VERSION` (a deliberate, rare,
//                       human green-light; see EVOLUTION.md "Coexistence").
//   - champion        — the best version by measurement. Re-pointed here when
//                       the gauntlet crowns a new champion — the code half of
//                       the acceptance ritual (the other half is the
//                       EVOLUTION.md version-log row).
//   - latest          — the newest snapshot. DERIVED from `VERSIONS`, never
//                       hand-edited: registering a version makes it the latest.
//
// "Live pointer" semantics: a seat stores its ROLE (e.g. "champion"), not a
// frozen version label, so it always resolves to whatever the pointer names in
// the deployed code. Crowning/promoting a version retargets every seat using
// that role on the next deploy — including mid-game, which is intended (a
// champion seat should always play the current best).
// ---------------------------------------------------------------------------

/** The strongest version by measurement (highest gauntlet Elo). Bump this when
 *  the loop crowns a new champion — see EVOLUTION.md "Coexistence & promotion". */
export const CHAMPION_VERSION = "v17";

/** The newest snapshot in the archive — derived, so registering a new version
 *  in `versions/index.ts` is the only action needed; this follows it. */
export const LATEST_VERSION: string = latestVersionLabel();

function latestVersionLabel(): string {
  const labels = Object.keys(VERSIONS).filter((k) => /^v\d+$/.test(k));
  return labels.reduce((a, b) => (Number(b.slice(1)) > Number(a.slice(1)) ? b : a));
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

/** The lobby-selectable bot roles, in display order. `dumb` is intentionally
 *  absent — it stays a resolvable strategy for the simulator/gauntlet but is no
 *  longer offered in the lobby UI. */
export const BOT_ROLES: readonly BotRole[] = [
  {
    id: "claude",
    label: "Claude Bot",
    short: "Claude",
    version: LIVE_VERSION,
    hint: "The shipped bot — hand-picked to play the live game.",
  },
  {
    id: "champion",
    label: "Champion Bot",
    short: "Champion",
    version: CHAMPION_VERSION,
    hint: "The strongest version found so far (highest gauntlet Elo).",
  },
  {
    id: "latest",
    label: "Latest Bot",
    short: "Latest",
    version: LATEST_VERSION,
    hint: "The newest version — bleeding edge, not yet proven best.",
  },
];

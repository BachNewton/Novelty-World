import type { Bot } from "../decision";
import { claudeBot as v1Bot } from "../claude";
import { dumbBot } from "../dumb";
import { v2Bot } from "./v2";

// ---------------------------------------------------------------------------
// The version archive. Every bot snapshot the simulator can field by name, for
// head-to-head A/B (see EVOLUTION.md "Coexistence & promotion"). `v1` is the
// LIVE production champion (`bots/claude.ts`) referenced directly — never a
// copy — so "v2 vs v1" pits the candidate against exactly what ships. Future
// champions append here; the previous champion's snapshot stays so we can
// always reconstruct and branch from it. `dumb` is the floor of the gauntlet.
// ---------------------------------------------------------------------------
export const VERSIONS: Readonly<Record<string, Bot>> = {
  v1: v1Bot,
  v2: v2Bot,
  dumb: dumbBot,
};

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

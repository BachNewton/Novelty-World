import type { Bot } from "../decision";
import { dumbBot } from "../dumb";
import { v1Bot } from "./v1";
import { v2Bot } from "./v2";
import { v3Bot } from "./v3";
import { v4Bot } from "./v4";

// ---------------------------------------------------------------------------
// The version archive. Every bot snapshot the simulator can field by name, for
// head-to-head A/B (see EVOLUTION.md "Coexistence & promotion"). Every entry is
// a self-contained frozen SNAPSHOT — including `v1`, the original champion and
// the gauntlet's FLOOR — so a label always means that exact version. This is
// deliberately DECOUPLED from what currently ships: the live bot is a pointer
// into this archive (`bots/live.ts` → `LIVE_VERSION`), so promoting a version
// to production never silently redefines the floor. `dumb` is a null reactive
// stub — never gauntleted; v1 is the real floor of the field.
// ---------------------------------------------------------------------------
export const VERSIONS: Readonly<Record<string, Bot>> = {
  v1: v1Bot,
  v2: v2Bot,
  v3: v3Bot,
  v4: v4Bot,
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

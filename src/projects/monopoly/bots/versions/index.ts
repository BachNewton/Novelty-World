import type { Bot } from "../decision";
import { dumbBot } from "../dumb";
import { v1Bot } from "./v1";
import { v2Bot } from "./v2";
import { v3Bot } from "./v3";
import { v4Bot } from "./v4";
import { v5Bot } from "./v5";
import { v6Bot } from "./v6";
import { v7Bot } from "./v7";
import { v8Bot } from "./v8";
import { v9Bot } from "./v9";
import { v10Bot } from "./v10";
import { v11Bot } from "./v11";
import { v12Bot } from "./v12";
import { v13Bot } from "./v13";
import { v14Bot } from "./v14";
import { v15Bot } from "./v15";
import { v16Bot } from "./v16";

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
  v5: v5Bot,
  v6: v6Bot,
  v7: v7Bot,
  v8: v8Bot,
  v9: v9Bot,
  v10: v10Bot,
  v11: v11Bot,
  v12: v12Bot,
  v13: v13Bot,
  v14: v14Bot,
  v15: v15Bot,
  v16: v16Bot,
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

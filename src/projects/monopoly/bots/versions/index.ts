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
import { v17Bot } from "./v17";
import { v18Bot } from "./v18";
import { v19Bot } from "./v19";
import { v20Bot } from "./v20";
import { v21Bot } from "./v21";
import { v22Bot } from "./v22";
import { v23Bot } from "./v23";
import { v24Bot } from "./v24";
import { v25Bot } from "./v25";
import { v26Bot } from "./v26";
import { v27Bot } from "./v27";
import { v28Bot } from "./v28";
import { v29Bot } from "./v29";
import { v30Bot } from "./v30";
import { v31Bot } from "./v31";
import { v32Bot } from "./v32";
// Jane lineage — a bot family distinct from Claude (see EVOLUTION.md "Bot
// lineages"). Labels are namespaced `jane-vN`; Claude stays unprefixed `vN`.
import { janeV1Bot } from "./jane-v1";
import { janeV2Bot } from "./jane-v2";
import { janeV3Bot } from "./jane-v3";
import { janeV4Bot } from "./jane-v4";
import { janeV5Bot } from "./jane-v5";
import { janeV6Bot } from "./jane-v6";
import { janeV7Bot } from "./jane-v7";

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
  v17: v17Bot,
  v18: v18Bot,
  v19: v19Bot,
  v20: v20Bot,
  v21: v21Bot,
  v22: v22Bot,
  v23: v23Bot,
  v24: v24Bot,
  v25: v25Bot,
  v26: v26Bot,
  v27: v27Bot,
  v28: v28Bot,
  v29: v29Bot,
  v30: v30Bot,
  v31: v31Bot,
  v32: v32Bot,
  "jane-v1": janeV1Bot,
  "jane-v2": janeV2Bot,
  "jane-v3": janeV3Bot,
  "jane-v4": janeV4Bot,
  "jane-v5": janeV5Bot,
  "jane-v6": janeV6Bot,
  "jane-v7": janeV7Bot,
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

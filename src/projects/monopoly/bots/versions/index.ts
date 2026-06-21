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

// ---------------------------------------------------------------------------
// The version archive. Every bot snapshot the simulator can field by name, for
// head-to-head A/B (see EVOLUTION.md "Coexistence & promotion"). Every entry is
// a self-contained frozen SNAPSHOT — so a label always means that exact version.
// This is deliberately DECOUPLED from what currently ships: the live bot is a
// pointer into this archive (`bots/live.ts` → `LIVE_VERSION`), so promoting a
// version to production never silently redefines the field. `dumb` is a null
// reactive stub — never gauntleted. The FLOOR of the default gauntlet field is
// `claude-v2`. `claude-v1` (the original champion) is archived/frozen but
// EXCLUDED by default: its bad logic stalls/caps too many games (slow and
// least-informative — see EVOLUTION.md Decision 8); it returns only for an
// explicit `--with-v1` audit.
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
  "jane-v1": janeV1Bot,
  "jane-v2": janeV2Bot,
  "jane-v3": janeV3Bot,
  "jane-v4": janeV4Bot,
  "gemini-v1": geminiV1Bot,
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

import type { BotStrategy } from "../types";
import type { Bot } from "./decision";
import { dumbBot } from "./dumb";
import { liveBot } from "./live";
import { CHAMPION_VERSION, lineageFor } from "./roles";
import { versionBot } from "./versions";

// The bot-decision contract lives in `decision.ts` (so policies can import it
// without a cycle through this registry). Re-exported here so existing call
// sites keep importing `Bot` / `BotDecision` / `move` from the registry.
export type { Bot, BotDecision } from "./decision";
export { move } from "./decision";

/** Every selectable bot policy, keyed by the seat's `botStrategy`. The pacer
 *  resolves a bot seat's policy through this map. Every key except `dumb` is a
 *  POINTER into the version archive (`bots/roles.ts`): `champion` is the global
 *  best by measurement, and each lineage (Claude, Jane, …) contributes a
 *  featured pointer + a derived `-latest` pointer. Crowning a champion,
 *  retargeting a featured pointer, or registering a version only moves the
 *  pointer — this file is unchanged. Keep the keys in lockstep with
 *  `BOT_STRATEGIES`/`LINEAGES` (the exhaustive `Record<BotStrategy, …>` check
 *  catches a missing one; `lineageFor` throws on an unknown id). */
export const BOTS: Record<BotStrategy, Bot> = {
  dumb: dumbBot,
  champion: versionBot(CHAMPION_VERSION), // global best by measurement (bots/roles.ts)
  claude: liveBot, // Claude featured = the shipped live pointer (bots/live.ts → LIVE_VERSION)
  "claude-latest": versionBot(lineageFor("claude-latest").latest),
  jane: versionBot(lineageFor("jane").featured),
  "jane-latest": versionBot(lineageFor("jane-latest").latest),
};

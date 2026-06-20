import type { BotStrategy } from "../types";
import type { Bot } from "./decision";
import { dumbBot } from "./dumb";
import { liveBot } from "./live";
import { CHAMPION_VERSION, LATEST_VERSION } from "./roles";
import { versionBot } from "./versions";

// The bot-decision contract lives in `decision.ts` (so policies can import it
// without a cycle through this registry). Re-exported here so existing call
// sites keep importing `Bot` / `BotDecision` / `move` from the registry.
export type { Bot, BotDecision } from "./decision";
export { move } from "./decision";

/** Every selectable bot policy, keyed by the seat's `botStrategy`. The pacer
 *  resolves a bot seat's policy through this map. The three Claude roles are
 *  pointers into the version archive (`bots/roles.ts` / `bots/live.ts`), so
 *  crowning a champion or registering a version never touches this file — only
 *  the pointer moves. Keep the keys in lockstep with `BOT_ROLES` (the exhaustive
 *  `Record<BotStrategy, …>` check below catches a missing one). */
export const BOTS: Record<BotStrategy, Bot> = {
  dumb: dumbBot,
  claude: liveBot, // hand-picked live pointer (bots/live.ts → LIVE_VERSION)
  champion: versionBot(CHAMPION_VERSION), // best by measurement (bots/roles.ts)
  latest: versionBot(LATEST_VERSION), // newest snapshot (derived from VERSIONS)
};

import type { BotStrategy } from "../types";
import type { Bot } from "./decision";
import { dumbBot } from "./dumb";
import { liveBot } from "./live";

// The bot-decision contract lives in `decision.ts` (so policies can import it
// without a cycle through this registry). Re-exported here so existing call
// sites keep importing `Bot` / `BotDecision` / `move` from the registry.
export type { Bot, BotDecision } from "./decision";
export { move } from "./decision";

/** Every selectable bot policy, keyed by the seat's `botStrategy`. The pacer
 *  resolves a bot seat's policy through this map; adding a strategy is a new
 *  union member in `BotStrategy` plus an entry here. The `claude` strategy is a
 *  pointer into the version archive — it ships whatever `bots/live.ts`'s
 *  `LIVE_VERSION` names (today v3), so promotion never touches this file. */
export const BOTS: Record<BotStrategy, Bot> = {
  dumb: dumbBot,
  claude: liveBot,
};

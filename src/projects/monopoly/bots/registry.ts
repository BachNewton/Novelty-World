import type { BotStrategy } from "../types";
import type { Bot } from "./decision";
import { dumbBot } from "./dumb";
import { versionBot } from "./versions";

// The bot-decision contract lives in `decision.ts` (so policies can import it
// without a cycle through this registry). Re-exported here so existing call
// sites keep importing `Bot` / `BotDecision` / `move` from the registry.
export type { Bot, BotDecision } from "./decision";
export { move } from "./decision";

/** Resolve a seat's `botStrategy` to its policy. The strategy is a CONCRETE
 *  archive identifier (see `types.ts` `BotStrategy`): the literal `"dumb"` maps to
 *  the reactive baseline, and everything else is a version label resolved straight
 *  out of the archive (`versionBot`, which throws loud on an unknown label). The
 *  lobby's overall-best / per-family-best highlights are just the highest-Elo
 *  labels (`bots/roles.ts`) — they resolve through the very same path, so there
 *  are no pointer indirections left to keep in lockstep. */
export function botFor(strategy: BotStrategy): Bot {
  return strategy === "dumb" ? dumbBot : versionBot(strategy);
}

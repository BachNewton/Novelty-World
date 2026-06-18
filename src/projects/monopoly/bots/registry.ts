import type { BotStrategy, GameState, Intent } from "../types";
import { claudeBot } from "./claude";
import { dumbBot } from "./dumb";

/** A bot policy: given the full game state (Monopoly is open-information) and
 *  the bot's seat id, the single intent that seat should submit right now, or
 *  null when it has nothing to do (the pacer then rolls / moves on). One pure
 *  function covers every phase a bot is consulted in:
 *  - the reactive decision phases (`buy-decision`, `auction`, `must-raise-cash`,
 *    `trade-pending`, `jail-decision`);
 *  - `pre-roll`, where it may return a `set-queue` arm to PROACTIVELY open a
 *    build / trade intermission, or null to just roll;
 *  - `managing` / `trade-building`, where it drives the intermission it armed to
 *    a `manage` / `propose-trade` commit (or a cancel).
 *
 *  The same shape works for the dumb baseline, a strong rule-based policy, and a
 *  future learned policy. See `monopoly/CLAUDE.md` "Bots". */
export type Bot = (state: GameState, playerId: string) => Intent | null;

/** Every selectable bot policy, keyed by the seat's `botStrategy`. The pacer
 *  resolves a bot seat's policy through this map; adding a strategy is a new
 *  union member in `BotStrategy` plus an entry here. */
export const BOTS: Record<BotStrategy, Bot> = {
  dumb: dumbBot,
  claude: claudeBot,
};

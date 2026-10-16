import type { Bot } from "../bots/bot";
import { greedyBot } from "../bots/greedy";
import { randomBot } from "../bots/random";
import { ruleV1Bot } from "../bots/rule-v1";

/** The ranks a seated bot is named by, weakest first. A bot takes the rung its measured
 *  strength earns, so the names climb with strength; the rungs above the strongest bot wait
 *  for bots to come. */
export const RANKS = [
  "Recruit",
  "Private",
  "Corporal",
  "Sergeant",
  "Staff Sergeant",
  "Sergeant First Class",
  "Master Sergeant",
  "Sergeant Major",
  "Warrant Officer",
  "Second Lieutenant",
  "First Lieutenant",
  "Captain",
  "Major",
  "Lieutenant Colonel",
  "Colonel",
  "Brigadier General",
  "Major General",
  "Lieutenant General",
  "General",
  "Field Marshal",
] as const;

export type Rank = (typeof RANKS)[number];

/** A bot a table can seat, by the id its row keeps. The bots themselves live in `bots/`, the
 *  one home of every Risk bot, measured or played. */
export type BotId = "random" | "greedy" | "rule-v1";

export interface SeatBot {
  rank: Rank;
  bot: Bot;
}

/** Each a rung above the one before: a bot is seated only once the gauntlet shows it beats
 *  the one below. */
export const SEAT_BOTS: Record<BotId, SeatBot> = {
  random: { rank: "Recruit", bot: randomBot },
  greedy: { rank: "Private", bot: greedyBot },
  "rule-v1": { rank: "Corporal", bot: ruleV1Bot },
};

const rung = (id: BotId) => RANKS.indexOf(SEAT_BOTS[id].rank);

/** The seatable bots, weakest first. */
export const BOT_IDS: readonly BotId[] = (Object.keys(SEAT_BOTS) as BotId[]).sort((a, b) => rung(a) - rung(b));

/** A new bot seat's bot: the strongest. */
export const DEFAULT_BOT: BotId = BOT_IDS[BOT_IDS.length - 1];

export function isBotId(id: string): id is BotId {
  return Object.hasOwn(SEAT_BOTS, id);
}

/** The bot a row's seat names. A row naming a bot no longer seated fails loudly: playing or
 *  showing another bot in its place would change the game behind its players' backs. */
export function seatBot(id: BotId): SeatBot {
  if (!isBotId(id)) throw new Error(`Risk has no seatable bot "${String(id)}" (seatable: ${BOT_IDS.join(", ")})`);
  return SEAT_BOTS[id];
}

/** How strong a bot is among those a table can seat: 1 for the weakest, up to `BOT_IDS.length`. */
export function strength(id: BotId): number {
  return BOT_IDS.indexOf(id) + 1;
}

/** The name players see for a bot seat. */
export const botName = (id: BotId) => `${seatBot(id).rank} (bot)`;

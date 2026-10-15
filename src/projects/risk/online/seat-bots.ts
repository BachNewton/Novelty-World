import type { Bot } from "../bots/bot";
import { randomBot } from "../bots/random";

/** A bot a table can seat, by the id its row keeps, with the name players see. The bots
 *  themselves live in `bots/`, the one home of every Risk bot, measured or played. */
export type BotId = "random";

export interface SeatBot {
  name: string;
  bot: Bot;
}

export const SEAT_BOTS: Record<BotId, SeatBot> = {
  random: { name: "Recruit", bot: randomBot },
};

export const DEFAULT_BOT: BotId = "random";

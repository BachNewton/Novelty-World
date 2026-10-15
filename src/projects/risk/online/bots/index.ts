import type { BotEntry, BotId } from "./bot";
import { randomBot } from "./random";

export const BOTS: Record<BotId, BotEntry> = {
  random: { name: "Recruit", bot: randomBot },
};

export const DEFAULT_BOT: BotId = "random";

export const isBotId = (value: unknown): value is BotId => typeof value === "string" && value in BOTS;

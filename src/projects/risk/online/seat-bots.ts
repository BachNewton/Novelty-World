import type { Bot } from "../bots/bot";
import { gdAggressiveBot, gdContinentalBot, gdDefensiveBot, gdStackerBot } from "../bots/gd";
import { greedyBot } from "../bots/greedy";
import { randomBot } from "../bots/random";
import RATINGS from "../bots/ratings.json";
import { ruleV1Bot } from "../bots/rule-v1";
import { ruleV2Bot } from "../bots/rule-v2";
import { ruleV3Bot } from "../bots/rule-v3";

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

/** A bot a table can seat, by the id its row keeps: the label the measuring harness seats it
 *  by. The bots themselves live in `bots/`, the one home of every Risk bot, measured or played. */
export type BotId = "random" | "greedy" | "rule-v1" | "rule-v2" | "rule-v3" | "gd-defensive" | "gd-continental" | "gd-aggressive" | "gd-stacker";

export interface SeatBot {
  /** What players call it, with its version beside it. */
  name: string;
  version: string;
  bot: Bot;
}

/** Every bot a table can seat. GD's four Expert personas stay seatable whatever they rank:
 *  they are the yardstick players know. */
export const SEAT_BOTS: Record<BotId, SeatBot> = {
  random: { name: "Random", version: "Baseline", bot: randomBot },
  greedy: { name: "Greedy", version: "Baseline", bot: greedyBot },
  "rule-v1": { name: "Rule", version: "v1", bot: ruleV1Bot },
  "rule-v2": { name: "Rule", version: "v2", bot: ruleV2Bot },
  "rule-v3": { name: "Rule", version: "v3", bot: ruleV3Bot },
  "gd-defensive": { name: "GD Defensive", version: "Expert", bot: gdDefensiveBot },
  "gd-continental": { name: "GD Continental", version: "Expert", bot: gdContinentalBot },
  "gd-aggressive": { name: "GD Aggressive", version: "Expert", bot: gdAggressiveBot },
  "gd-stacker": { name: "GD Stacker", version: "Expert", bot: gdStackerBot },
};

/** The bots' measured strength (`bots/ratings.json`, written by `risk:ratings -- --seatable`):
 *  each seatable bot's win Elo from one ratings run over all of them, greedy anchored at 1000.
 *  Random never wins, so it has none. */
export const ELO: Readonly<Partial<Record<BotId, number>>> = RATINGS.elo;

export function isBotId(id: string): id is BotId {
  return Object.hasOwn(SEAT_BOTS, id);
}

/** The seatable bots, weakest first: by measured Elo, the unrated below every rated bot. */
export const BOT_IDS: readonly BotId[] = (Object.keys(SEAT_BOTS) as BotId[]).sort(
  (a, b) => (ELO[a] ?? -Infinity) - (ELO[b] ?? -Infinity) || a.localeCompare(b),
);

/** A new bot seat's bot: the strongest. */
export const DEFAULT_BOT: BotId = BOT_IDS[BOT_IDS.length - 1];

/** The bot a row's seat names. A row naming a bot no longer seated fails loudly: playing or
 *  showing another bot in its place would change the game behind its players' backs. */
export function seatBot(id: BotId): SeatBot {
  if (!isBotId(id)) throw new Error(`Risk has no seatable bot "${String(id)}" (seatable: ${BOT_IDS.join(", ")})`);
  return SEAT_BOTS[id];
}

/** How strong a bot is among those a table can seat: 1 for the weakest, up to `BOT_IDS.length`. */
export function strength(id: BotId): number {
  seatBot(id);
  return BOT_IDS.indexOf(id) + 1;
}

/** The rank a bot's place in the Elo order earns. */
export function rankOf(id: BotId): Rank {
  return RANKS[strength(id) - 1];
}

/** Its measured Elo, or null for a bot that never wins. */
export function eloOf(id: BotId): number | null {
  seatBot(id);
  return ELO[id] ?? null;
}

/** "Rule v1": the name and version together. */
export function fullName(id: BotId): string {
  const { name, version } = seatBot(id);
  return `${name} ${version}`;
}

/** The name players see for a bot seat: its rank and name, "Sergeant · Rule v1". */
export const botName = (id: BotId) => `${rankOf(id)} · ${fullName(id)}`;

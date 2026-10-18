import RATINGS from "../bots/ratings.json";
import { SEAT_BOTS, type BotId, type SeatBot } from "./seat-roster";

export { SEAT_BOTS, type BotId, type SeatBot } from "./seat-roster";

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

/** The bots' measured strength (`bots/ratings.json`, written by `risk:ratings -- --seatable`):
 *  each seatable bot's win Elo from one ratings run over all of them, greedy anchored at 1000. */
export const ELO: Readonly<Partial<Record<BotId, number>>> = RATINGS.elo;

export function isBotId(id: string): id is BotId {
  return Object.hasOwn(SEAT_BOTS, id);
}

/** The seatable bots, weakest first, by measured Elo. */
export const BOT_IDS: readonly BotId[] = (Object.keys(SEAT_BOTS) as BotId[]).sort((a, b) => eloOf(a) - eloOf(b) || a.localeCompare(b));

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

/** Its measured Elo. A seatable bot without one fails loudly: its rank would be a guess. */
export function eloOf(id: BotId): number {
  const elo = ELO[id];
  if (elo === undefined) throw new Error(`Risk's seatable bot "${id}" has no measured Elo: run risk:ratings -- --seatable`);
  return elo;
}

/** "Rule v1": the name and version together. */
export function fullName(id: BotId): string {
  const { name, version } = seatBot(id);
  return `${name} ${version}`;
}

/** The name players see for a bot seat: its rank and name, "Sergeant · Rule v1". */
export const botName = (id: BotId) => `${rankOf(id)} · ${fullName(id)}`;

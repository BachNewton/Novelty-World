import RATINGS from "../bots/ratings.json";
import { RETIRED_BOTS, SEAT_BOTS, type BotId, type RetiredBotId, type RowBotId, type SeatBot } from "./seat-roster";

export { RETIRED_BOTS, SEAT_BOTS, type BotId, type RetiredBotId, type RowBotId, type SeatBot } from "./seat-roster";

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

export function isRetired(id: string): id is RetiredBotId {
  return Object.hasOwn(RETIRED_BOTS, id);
}

/** The seatable bots, weakest first, by measured Elo. */
export const BOT_IDS: readonly BotId[] = (Object.keys(SEAT_BOTS) as BotId[]).sort((a, b) => eloOf(a) - eloOf(b) || a.localeCompare(b));

/** A new bot seat's bot: the strongest. */
export const DEFAULT_BOT: BotId = BOT_IDS[BOT_IDS.length - 1];

/** A row's seat's bot as one a table can seat. A retired bot is in no game still to be played
 *  (its games in progress were deleted when it retired), and a row naming a bot that is neither
 *  fails loudly: playing or showing another bot in its place would change the game behind its
 *  players' backs. */
export function seatable(id: RowBotId): BotId {
  if (!isBotId(id)) throw new Error(`Risk has no seatable bot "${String(id)}"${isRetired(id) ? ": it is retired" : ""} (seatable: ${BOT_IDS.join(", ")})`);
  return id;
}

/** The bot that plays a row's seat. */
export const seatBot = (id: RowBotId): SeatBot => SEAT_BOTS[seatable(id)];

/** How strong a bot is among those a table can seat: 1 for the weakest, up to `BOT_IDS.length`. */
export function strength(id: BotId): number {
  seatBot(id);
  return BOT_IDS.indexOf(id) + 1;
}

/** The rank a bot's place in the Elo order earns. */
export function rankOf(id: BotId): Rank {
  return RANKS[strength(id) - 1];
}

/** Its measured Elo, or a retired bot's last. A seatable bot without one fails loudly: its rank
 *  would be a guess. */
export function eloOf(id: RowBotId): number {
  if (isRetired(id)) return RETIRED_BOTS[id].elo;
  const elo = ELO[seatable(id)];
  if (elo === undefined) throw new Error(`Risk's seatable bot "${id}" has no measured Elo: run risk:ratings -- --seatable`);
  return elo;
}

/** "Rule v1": the name and version together. */
export function fullName(id: RowBotId): string {
  const { name, version } = isRetired(id) ? RETIRED_BOTS[id] : seatBot(id);
  return `${name} ${version}`;
}

/** The name players see for a bot seat: its rank and name, "Sergeant · Rule v1", or "Retired ·
 *  Rule v6" for a bot no table seats any more, which holds no rank. */
export const botName = (id: RowBotId) => `${isRetired(id) ? "Retired" : rankOf(id)} · ${fullName(id)}`;

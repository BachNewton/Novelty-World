import type { Catalog } from "../types";
import { CARDS } from "./cards";
import { CHARACTERS } from "./characters";
import { BASE_CHART } from "./chart";
import { ROOMS } from "./rooms";
import { TOKENS } from "./tokens";

function byId<T extends { id: string }>(entries: T[]): Record<string, T> {
  const result: Record<string, T> = {};
  for (const entry of entries) {
    if (entry.id in result)
      throw new Error(`Duplicate catalogue id ${entry.id}`);
    result[entry.id] = entry;
  }
  return result;
}

export const CATALOG: Catalog = {
  rooms: byId(ROOMS),
  characters: byId(CHARACTERS),
  cards: byId(CARDS),
  tokens: byId(TOKENS),
  chart: BASE_CHART,
};

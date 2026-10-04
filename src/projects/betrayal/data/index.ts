import type { Catalog, Character, FigureDefinition } from "../types";
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

/** An explorer's figure definition, from its character card. */
function explorerDefinition(character: Character): FigureDefinition {
  return {
    id: character.id,
    name: character.name,
    kind: "explorer",
    traits: { kind: "tracks", tracks: character.tracks, start: character.start },
    token: `explorer-${character.card}`,
  };
}

export const CATALOG: Catalog = {
  rooms: byId(ROOMS),
  characters: byId(CHARACTERS),
  figures: byId(CHARACTERS.map(explorerDefinition)),
  cards: byId(CARDS),
  tokens: byId(TOKENS),
  chart: BASE_CHART,
};

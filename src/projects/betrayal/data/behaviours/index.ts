import type { Behaviour, Behaviours } from "../../engine/sources";
import { EVENTS } from "./events";
import { ITEMS } from "./items";
import { OMENS } from "./omens";
import { ROOM_BEHAVIOURS } from "./rooms";

function merge(
  ...groups: Record<string, Behaviour>[]
): Record<string, Behaviour> {
  const result: Record<string, Behaviour> = {};
  for (const group of groups) {
    for (const [id, behaviour] of Object.entries(group)) {
      if (id in result) throw new Error(`Two behaviours for ${id}`);
      result[id] = behaviour;
    }
  }
  return result;
}

/** What every card, room and token does, by id. */
export const BEHAVIOURS: Behaviours = {
  cards: merge(EVENTS, ITEMS, OMENS),
  rooms: ROOM_BEHAVIOURS,
  tokens: {},
};

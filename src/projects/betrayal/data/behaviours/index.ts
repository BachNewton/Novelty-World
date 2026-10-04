import type {
  Behaviour,
  BehaviourGroup,
  Behaviours,
} from "../../engine/sources";
import { EVENTS } from "./events";
import { EVENTS_A } from "./events-a";
import { EVENTS_B } from "./events-b";
import { ITEMS } from "./items";
import { OMENS } from "./omens";
import { ROOMS } from "./rooms";
import { RULEBOOK } from "./rulebook";

const GROUPS: BehaviourGroup[] = [
  EVENTS,
  EVENTS_A,
  EVENTS_B,
  ITEMS,
  OMENS,
  ROOMS,
  RULEBOOK,
];

function merge(kind: keyof BehaviourGroup): Record<string, Behaviour> {
  const result: Record<string, Behaviour> = {};
  for (const group of GROUPS) {
    for (const [id, behaviour] of Object.entries(group[kind] ?? {})) {
      if (id in result) throw new Error(`Two behaviours for ${kind} ${id}`);
      result[id] = behaviour;
    }
  }
  return result;
}

/** What every card, room and token does, by id. */
export const BEHAVIOURS: Behaviours = {
  rulebook: merge("rulebook"),
  cards: merge("cards"),
  rooms: merge("rooms"),
  tokens: merge("tokens"),
  statuses: merge("statuses"),
};

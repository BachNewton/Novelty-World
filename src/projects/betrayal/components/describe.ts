import type { GameEvent, GameState, Json, RuleRef } from "../types";
import type { Engine } from "../engine/step-loop";

// Debug-view wording for rule references and event data. The engine has no
// event describer yet, so ids are swapped for names and the rest shown raw.

export function seatLabel(
  engine: Engine,
  state: GameState,
  seat: number,
): string {
  const explorer = state.explorers.find((e) => e.seat === seat);
  const name = state.seats[seat].name;
  if (!explorer) return name;
  return `${name} (${engine.catalog.characters[explorer.character].name})`;
}

export function describeRule(engine: Engine, rule: RuleRef): string {
  switch (rule.source) {
    case "rulebook":
      return `rulebook p. ${rule.page}`;
    case "room":
      return `room: ${engine.catalog.rooms[rule.room].name}`;
    case "card":
      return `card: ${engine.catalog.cards[rule.card].name}`;
    case "token":
      return `token: ${engine.catalog.tokens[rule.token].name}`;
    case "haunt":
      return `haunt ${rule.haunt}, ${rule.section}`;
  }
}

const SEAT_KEYS = new Set(["seat", "from", "to", "with", "first", "revealer"]);
const ROOM_KEYS = new Set(["room", "tile"]);
const CARD_KEYS = new Set(["card", "omen", "give", "take"]);

function describeValue(
  engine: Engine,
  state: GameState,
  key: string,
  value: Json,
): string {
  const { rooms, cards } = engine.catalog;
  if (
    typeof value === "number" &&
    SEAT_KEYS.has(key) &&
    value >= 0 &&
    value < state.seats.length
  )
    return seatLabel(engine, state, value);
  // The keys are a naming convention, not a schema, so the id is checked.
  if (typeof value === "string" && ROOM_KEYS.has(key) && value in rooms)
    return rooms[value].name;
  if (typeof value === "string" && CARD_KEYS.has(key) && value in cards)
    return cards[value].name;
  return JSON.stringify(value);
}

export function describeData(
  engine: Engine,
  state: GameState,
  data: Json,
): string {
  if (data === null) return "";
  if (typeof data !== "object" || Array.isArray(data))
    return JSON.stringify(data);
  return Object.entries(data)
    .map(
      ([key, value]) => `${key}: ${describeValue(engine, state, key, value)}`,
    )
    .join(", ");
}

/** One log line, worded against the state the event was emitted into. */
export interface LogLine {
  event: GameEvent;
  text: string;
}

export function logLines(engine: Engine, state: GameState): LogLine[] {
  return state.lastEvents.map((event) => ({
    event,
    text: describeData(engine, state, event.data),
  }));
}

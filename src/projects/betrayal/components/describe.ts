import type { GameEvent, GameState } from "../types";
import { describeEvent } from "../engine/describe";
import type { Engine } from "../engine/step-loop";

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

/** One log line, worded against the state the event was emitted into. */
export interface LogLine {
  event: GameEvent;
  text: string;
}

export function logLines(engine: Engine, state: GameState): LogLine[] {
  return state.lastEvents.flatMap((event) => {
    const text = describeEvent(engine, state, event);
    return text === null ? [] : [{ event, text }];
  });
}

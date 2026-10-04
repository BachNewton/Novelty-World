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

/** A stretch of the log: the setup, one turn, or the haunt. */
export interface LogGroup {
  key: string;
  title: string;
  /** Whose turn it is, for a turn. */
  seat: number | null;
  lines: LogLine[];
}

const HAUNT_EVENTS = new Set(["haunt-revealed", "haunt-started"]);

/** The log by turn, so it reads as the game's story. */
export function logGroups(
  engine: Engine,
  state: GameState,
  lines: LogLine[],
): LogGroup[] {
  const groups: LogGroup[] = [
    { key: "setup", title: "Setup", seat: null, lines: [] },
  ];
  let turns = 0;
  for (const line of lines) {
    const { event } = line;
    if (event.type === "turn-started") {
      turns += 1;
      const seat = (event.data as { seat: number }).seat;
      groups.push({
        key: event.id,
        title: `Turn ${turns}: ${seatLabel(engine, state, seat)}`,
        seat,
        lines: [],
      });
    } else if (HAUNT_EVENTS.has(event.type)) {
      groups.push({ key: event.id, title: "The haunt", seat: null, lines: [] });
    }
    groups[groups.length - 1].lines.push(line);
  }
  return groups.filter((g) => g.lines.length > 0);
}

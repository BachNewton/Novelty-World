import type { GameEvent, GameState, TurnKind } from "../types";
import { describeEvent } from "../engine/describe";
import { explorerOf, figureName } from "../engine/figures";
import type { Engine } from "../engine/step-loop";

export function seatLabel(
  engine: Engine,
  state: GameState,
  seat: number,
): string {
  const explorer = explorerOf(state, seat);
  const name = state.seats[seat].name;
  if (explorer === null) return name;
  return `${name} (${figureName(engine.catalog, state, explorer)})`;
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

const KIND_TITLES: Record<TurnKind, string> = {
  explorer: "",
  traitor: " (traitor turn)",
  monster: " (monster turn)",
};

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
      const { seat, kind } = event.data as { seat: number; kind: TurnKind };
      groups.push({
        key: event.id,
        title: `Turn ${turns}: ${seatLabel(engine, state, seat)}${KIND_TITLES[kind]}`,
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

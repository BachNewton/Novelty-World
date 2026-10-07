import type { GameEvent, GameState } from "../../types";

/** Whether an AI seat's private reasoning also shows in the game log, under its
 *  public note. Off, it reaches only the browser console. Typed `boolean` so the
 *  checks against it read as real conditions whichever way it is set. */
export const SHOW_PRIVATE_NOTES_IN_LOG: boolean = true;

/** A line for the browser console: an AI seat's private reasoning, or why it
 *  failed. Kept off the board on purpose; players are trusted not to look. */
export interface AiConsoleLine {
  level: "info" | "error";
  text: string;
}

/** The console lines for the events `next` adds to `prev`'s log. The log only
 *  grows within a game, so the new events are the ones past `prev`'s count; a
 *  shorter log is a different game, which adds nothing. */
export function aiConsoleLines(prev: GameState, next: GameState): AiConsoleLine[] {
  const seen = countEvents(prev);
  const events = next.turns.flatMap((group) => group.events);
  if (events.length < seen) return [];
  const name = (id: string): string =>
    next.players.find((p) => p.id === id)?.name ?? id;
  return events.slice(seen).flatMap((event): AiConsoleLine[] => line(event, name));
}

function line(event: GameEvent, name: (id: string) => string): AiConsoleLine[] {
  if (event.kind === "bot-note" && event.privateText !== undefined) {
    return [{ level: "info", text: `[AI] ${name(event.playerId)}: ${event.privateText}${event.plan === undefined ? "" : ` Plan: ${event.plan}`}` }];
  }
  if (event.kind === "ai-failed") {
    return [
      {
        level: "error",
        text: `[AI] ${name(event.playerId)} failed its ${event.decision} decision: ${event.reason}`,
      },
    ];
  }
  return [];
}

function countEvents(state: GameState): number {
  return state.turns.reduce((sum, group) => sum + group.events.length, 0);
}

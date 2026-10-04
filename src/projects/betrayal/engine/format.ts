import type { GameState, Json } from "../types";

/** The saved state's format. Raise it with every change to the state's shape,
 *  and add the migration from the previous format, tested with a saved fixture. */
export const STATE_FORMAT = 3;

/** Migrations by the format they upgrade from, each to the next format. */
type Migration = (state: { [key: string]: Json }) => { [key: string]: Json };
const MIGRATIONS: Partial<Record<number, Migration>> = {
  // Format 2 adds marks on cards and turns that end early.
  1: (state) => {
    const turn = state.turn;
    return {
      ...state,
      cardMarks: {},
      turn:
        turn !== null && typeof turn === "object" && !Array.isArray(turn)
          ? { ...turn, over: false }
          : null,
    };
  },
  // Format 3 records whether the turn's attack has been made.
  2: (state) => {
    const turn = state.turn;
    return {
      ...state,
      turn:
        turn !== null && typeof turn === "object" && !Array.isArray(turn)
          ? { ...turn, attacked: false }
          : null,
    };
  },
};

/** Thrown for a state written by newer code than this bundle: the deploy has
 *  moved on, so the client reloads its code. */
export class NewerFormatError extends Error {
  constructor(readonly format: number) {
    super(`State format ${format} is newer than this code's ${STATE_FORMAT}`);
  }
}

export function migrate(saved: { [key: string]: Json }): GameState {
  let state = saved;
  let format = state.format;
  if (typeof format !== "number")
    throw new Error("Saved state has no format number");
  if (format > STATE_FORMAT) throw new NewerFormatError(format);
  while (format < STATE_FORMAT) {
    const step = MIGRATIONS[format];
    if (!step) throw new Error(`No migration from state format ${format}`);
    state = { ...step(state), format: format + 1 };
    format += 1;
  }
  return state as unknown as GameState;
}

import type { GameState, SetId } from "../types";
import { STATE_FORMAT } from "./format";

/** A game with nothing in it yet: setup fills it in. */
export function emptyState(
  gameId: string,
  seed: string,
  sets: SetId[],
): GameState {
  return {
    format: STATE_FORMAT,
    gameId,
    seed,
    sets,
    status: "exploring",
    seats: [],
    figures: {},
    board: { tiles: [], stack: [], discards: [] },
    decks: {
      omen: { draw: [], discard: [] },
      item: { draw: [], discard: [] },
      event: { draw: [], discard: [] },
    },
    piles: {},
    tokens: [],
    ongoing: [],
    aside: [],
    cardMarks: {},
    turn: null,
    omensDrawn: 0,
    haunt: null,
    memory: { deaths: [] },
    nextId: 0,
    work: [],
    pending: null,
    answered: [],
    lastEvents: [],
  };
}

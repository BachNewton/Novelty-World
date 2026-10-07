import type { AiSeat, GameState } from "../../types";

const EMPTY_SEAT: AiSeat = {
  plan: null,
  thinking: null,
  failure: null,
  auctionMax: null,
};

/** A seat's AI bookkeeping; a seat that hasn't been asked anything yet has none. */
export function aiSeat(state: GameState, playerId: string): AiSeat {
  return state.ai[playerId] ?? EMPTY_SEAT;
}

export function withAiSeat(
  state: GameState,
  playerId: string,
  patch: Partial<AiSeat>,
): GameState {
  return {
    ...state,
    ai: { ...state.ai, [playerId]: { ...aiSeat(state, playerId), ...patch } },
  };
}

/** Whether a model call is in flight for any seat. While one is, no client
 *  drives the game: the AI's answer is what the table is waiting on. */
export function anyAiThinking(state: GameState): boolean {
  return Object.values(state.ai).some(
    (seat) => seat !== undefined && seat.thinking !== null,
  );
}

/** The turn-group an auction is asked in, which keys the seat's auction maximum
 *  together with the lot (see `AiSeat.auctionMax`). */
export function currentTurnNumber(state: GameState): number {
  return state.turns.length;
}

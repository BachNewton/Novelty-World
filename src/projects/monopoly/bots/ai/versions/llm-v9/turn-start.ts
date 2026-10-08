import type { GameState } from "../../../../types";
import { aiSeat, currentTurnNumber } from "../../seat";

/** Whether the seat owes its turn-start question now: once in every
 *  turn-group, the window the engine gives every player to manage and to
 *  trade, whatever the board. llm-v8's gate skipped the call when the seat
 *  couldn't build or lift a mortgage and either shared no color set or faced
 *  a board unchanged since it was last asked; that saved slow local calls that
 *  mostly answered "roll", but it also kept the seat from ever looking for a
 *  play outside its own sets (buying a lot for cash, taking a rival's
 *  completer out of play) or saying anything that turn. Pure. */
export function turnStartOwed(state: GameState, seat: string): boolean {
  return aiSeat(state, seat).turnStart?.turn !== currentTurnNumber(state);
}

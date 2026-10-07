import type { GameEvent, GameState } from "../../types";

/** Whether an AI seat's note is still being held back: its version keeps the
 *  note it wrote about an auction off the board until that auction closes, so
 *  it can't give its maximum away. The auction runs inside the turn it started
 *  in, so only a note in the latest turn group can still be held. */
export function isNoteHeld(state: GameState, event: GameEvent, inLatestGroup: boolean): boolean {
  return (
    event.kind === "bot-note" &&
    event.heldForAuction !== undefined &&
    inLatestGroup &&
    state.turn.phase === "auction" &&
    state.turn.auction?.position === event.heldForAuction
  );
}

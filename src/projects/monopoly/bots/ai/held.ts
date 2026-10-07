import type { AiDecisionRef, GameEvent, GameState } from "../../types";

/** Whether an event is an AI seat's note about an auction: the answer it gave
 *  for its maximum. */
function isAuctionNote(event: GameEvent): event is Extract<GameEvent, { kind: "bot-note" }> {
  return event.kind === "bot-note" && event.ai?.decision === "auction" && event.text !== "";
}

/** Each closed auction's AI notes, by where they sit in a turn group's
 *  events: for every `auction` result's index, the indexes of the AI auction
 *  notes written since the group's previous result, in order. Auctions run one
 *  at a time and each ends in a result, so those notes are that auction's.
 *  Once it closes they are shown with its result: who won, the price, and each
 *  bidder's note, whether its version held the note until now or not. */
export function auctionNotesByResult(events: readonly GameEvent[]): Map<number, number[]> {
  const byResult = new Map<number, number[]>();
  let since: number[] = [];
  events.forEach((event, index) => {
    if (isAuctionNote(event)) since.push(index);
    if (event.kind !== "auction") return;
    if (since.length > 0) byResult.set(index, since);
    since = [];
  });
  return byResult;
}

/** The AI bidders' notes about the auction still running, as the game has
 *  released them so far: each seat's latest, by seat id, with its place in the
 *  log for a review. A version that holds its auction notes has released none
 *  yet (they show with the result); one that doesn't is shown live, beside
 *  the bidder. */
export function liveAuctionNotes(state: GameState): Map<string, { text: string; ref: AiDecisionRef }> {
  const notes = new Map<string, { text: string; ref: AiDecisionRef }>();
  if (state.turn.phase !== "auction") return notes;
  const group = state.turns[state.turns.length - 1];
  const start = group.events.findLastIndex((event) => event.kind === "auction") + 1;
  group.events.forEach((event, index) => {
    if (index < start || !isAuctionNote(event) || isNoteHeld(state, event, true)) return;
    notes.set(event.playerId, { text: event.text, ref: { turn: group.turn, index } });
  });
  return notes;
}

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

import type { GameView } from "../engine/view";

/*
 * Hot-seat: one device, passed round the table. The holder is the seat the
 * device is with, and the screen renders only that seat's view. In v1 the
 * holder follows whoever the game waits on, with no handover screen: ending
 * a turn is passing the device, and a question for another seat mid-turn
 * names that seat in its prompt.
 */

/** The seat the pending decision or ready wait is waiting on, or null when
 *  nothing is pending. Of several, the first in seat order that has yet to answer. */
export function due(view: GameView): number | null {
  const pending = view.pending;
  if (!pending) return null;
  if (pending.type === "ready") {
    const seat = pending.seats.at(0);
    if (seat === undefined) throw new Error(`Ready wait ${pending.id} waits on no seat`);
    return seat;
  }
  const seat = pending.seats.find((candidate) => !pending.answered.includes(candidate));
  if (seat === undefined)
    throw new Error(
      pending.unnamed
        ? `Decision ${pending.id} waits on a seat this view may not name, so hot-seat can't tell whom to pass the device to`
        : `Decision ${pending.id} has no seat left to answer it`,
    );
  return seat;
}

/** Who holds the device next: the seat the game waits on, or, with nothing pending, whoever holds it now. */
export function nextHolder(holder: number, view: GameView): number {
  return due(view) ?? holder;
}

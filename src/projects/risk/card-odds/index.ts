import type { GameEvent, GameView, Seat } from "../contract";
import { FULL_DECK } from "../cards";
import { estimateBelief } from "./estimate";
import { summarise, type CardOdds } from "./odds";
import { buildTimeline } from "./timeline";

export type { CardOdds, HandOdds } from "./odds";

/** The odds on every hand `viewer` can't see and on the next card drawn, from only what their
 *  seat may know: its view and its redacted history (`CARDS-2`). Null for a seat out of the
 *  game. Fast enough to ask once per decision in a game; how close it comes to the exact odds
 *  is measured against the sampler (`sample.ts`). */
export function cardOdds(viewer: Seat | null, view: GameView, history: readonly GameEvent[]): CardOdds | null {
  const timeline = buildTimeline({ players: view.seats.length, viewer, history, hand: view.cards.hand, deck: FULL_DECK });
  if (!timeline) return null;
  view.seats.forEach((seat, i) => {
    const known = i === viewer ? seat.handSize : 0;
    if (timeline.hidden[i] + known !== seat.handSize) {
      throw new Error(`seat ${i} holds ${seat.handSize} cards, its history says ${timeline.hidden[i] + known}`);
    }
  });
  return summarise(estimateBelief(timeline));
}

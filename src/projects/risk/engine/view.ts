import type { CardId, GameEvent, GameView, Seat, TerritoryView } from "../contract";
import type { TerritoryId } from "../map";
import { ownedBy, TERRITORY_IDS, type EngineState } from "./state";

/** What `viewer` may see (`CARDS-2`, note `public-cards`): everything public, and only their own
 *  hand. The deck's order, other hands and the random source stay out. */
export function view(s: EngineState, viewer: Seat | null): GameView {
  if (viewer !== null && !(Number.isInteger(viewer) && viewer >= 0 && viewer < s.players)) {
    throw new Error(`seat ${viewer} is not at this table`);
  }
  const territories = Object.fromEntries(
    TERRITORY_IDS.map((t) => [t, { owner: s.board[t].owner, armies: s.board[t].armies }]),
  ) as Record<TerritoryId, TerritoryView>;
  const o = s.occupying;
  return {
    viewer,
    turnOrder: [...s.turnOrder],
    seats: s.hands.map((hand, seat) => {
      const owned = ownedBy(s, seat);
      return {
        seat,
        eliminated: s.eliminated[seat],
        territories: owned.length,
        armies: owned.reduce((sum, t) => sum + s.board[t].armies, 0),
        handSize: hand.length,
      };
    }),
    territories,
    turn: s.turn,
    active: s.active,
    phase: s.phase,
    armiesToPlace: armiesToPlace(s),
    cards: {
      deck: s.deck.length,
      traded: s.trades.map((t) => ({ seat: t.seat, cards: [...t.cards] as [CardId, CardId, CardId] })),
      hand: viewer === null ? null : [...s.hands[viewer]],
    },
    occupying: o ? { from: o.from, to: o.to, min: o.min, max: o.max } : null,
    cardEarned: s.capturedThisTurn,
    winner: s.winner,
  };
}

/** In a reinforce phase, the armies still to place in it. */
function armiesToPlace(s: EngineState): number {
  return s.reinforce?.armiesToPlace ?? 0;
}

/** Events as `viewer` may see them: a card drawn by anyone else loses its face. */
export function redact(events: readonly GameEvent[], viewer: Seat | null): readonly GameEvent[] {
  return events.map((event) => {
    if (event.kind !== "card-drawn" || event.seat === viewer) return event;
    return { rule: event.rule, kind: event.kind, seat: event.seat };
  });
}

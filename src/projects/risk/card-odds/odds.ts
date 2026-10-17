import { bestSetValue, keyShape, type PerSymbol } from "./shape";

/** What one seat can know about the cards it can't see, as chances. */
export interface Belief {
  /** For each seat, the chance of each shape (by `shapeKey`) of the cards in its hand the
   *  viewer can't see. Null for the viewer's own seat and a seat out of the game. */
  hands: readonly (ReadonlyMap<number, number> | null)[];
  /** The symbol of the deck's top card: the next card anyone draws. */
  nextDraw: PerSymbol;
}

export interface HandOdds {
  /** Cards in the hand. */
  cards: number;
  /** The chance it holds a set it could trade. */
  holdsSet: number;
  /** The chance the best set it could trade is worth each number of armies (`CARDS-6`). */
  bestSet: ReadonlyMap<number, number>;
  /** The expected number of cards of each symbol in it. */
  symbols: PerSymbol;
}

export interface CardOdds {
  /** Each seat's hand; null for the viewer's own and a seat out of the game. */
  hands: readonly (HandOdds | null)[];
  nextDraw: PerSymbol;
}

export function summarise(belief: Belief): CardOdds {
  return {
    hands: belief.hands.map((shapes) => {
      if (!shapes) return null;
      let cards = 0;
      let holdsSet = 0;
      const bestSet = new Map<number, number>();
      const symbols = [0, 0, 0, 0];
      for (const [key, chance] of shapes) {
        const shape = keyShape(key);
        cards = shape[0] + shape[1] + shape[2] + shape[3];
        shape.forEach((n, symbol) => (symbols[symbol] += n * chance));
        const value = bestSetValue(shape);
        if (value === 0) continue;
        holdsSet += chance;
        bestSet.set(value, (bestSet.get(value) ?? 0) + chance);
      }
      return { cards, holdsSet, bestSet, symbols: [symbols[0], symbols[1], symbols[2], symbols[3]] };
    }),
    nextDraw: belief.nextDraw,
  };
}

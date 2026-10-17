import type { CardId, CardSymbol } from "../contract";
import { symbolOf } from "../cards";

// A hand as the odds see it: how many cards of each symbol, a wild counted apart
// (`DECK-2`). Under Fixed values (`CARDS-6`) the symbols alone decide which sets a hand
// holds and what they are worth; the territories matter only for the +2 (`CARDS-7`).

/** A number for each of [infantry, cavalry, artillery, wild]. */
export type PerSymbol = readonly [number, number, number, number];

/** A hand's count of each symbol. */
export type Shape = PerSymbol;

const SYMBOL_INDEX: Record<CardSymbol, number> = { infantry: 0, cavalry: 1, artillery: 2 };
const WILD = 3;
const THREE_OF = [4, 6, 8]; // CARDS-6, by symbol index
const ONE_OF_EACH = 10;

export function symbolIndex(card: CardId): number {
  const symbol = symbolOf(card);
  return symbol === null ? WILD : SYMBOL_INDEX[symbol];
}

/** A shape as one number, for keying maps: four counts of under 16. */
export function shapeKey(shape: Shape): number {
  return shape[0] | (shape[1] << 4) | (shape[2] << 8) | (shape[3] << 12);
}

export function keyShape(key: number): Shape {
  return [key & 15, (key >> 4) & 15, (key >> 8) & 15, (key >> 12) & 15];
}

/** The key of `key`'s shape with one more card of symbol `symbol`. */
export function addSymbol(key: number, symbol: number): number {
  return key + (1 << (symbol * 4));
}

/** The most a hand of this shape can trade one set for (`CARDS-3`, `CARDS-6`), or 0 when it
 *  holds no set. A wild stands for any symbol, so two wilds with any card are one of each. */
export function bestSetValue([infantry, cavalry, artillery, wilds]: Shape): number {
  const counts = [infantry, cavalry, artillery];
  const present = counts.filter((n) => n > 0).length;
  if (present === 3 || (wilds >= 1 && present >= 2) || (wilds >= 2 && present >= 1)) return ONE_OF_EACH;
  let best = 0;
  counts.forEach((n, symbol) => {
    if (n >= 3 || (n === 2 && wilds >= 1)) best = Math.max(best, THREE_OF[symbol]);
  });
  return best;
}

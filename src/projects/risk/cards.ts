import type { CardId, CardSymbol } from "./contract";
import { TERRITORIES, type TerritoryId } from "./map";

export const WILDS = ["wild-1", "wild-2"] as const satisfies readonly CardId[];

/** The 42 territory cards (`DECK-1`), in map order. */
export const TERRITORY_CARDS: readonly CardId[] = TERRITORIES.map((t) => t.id);

/** The whole 44-card deck (`DECK-1`), in a fixed order for shuffling. */
export const FULL_DECK: readonly CardId[] = [...TERRITORY_CARDS, ...WILDS];

const SYMBOL = new Map<CardId, CardSymbol>(TERRITORIES.map((t) => [t.id, t.symbol]));

export function isWild(card: CardId): card is (typeof WILDS)[number] {
  return card === "wild-1" || card === "wild-2";
}

/** The card's symbol (`DECK-2`), or null for a wild, which stands for any (`CARDS-3`). */
export function symbolOf(card: CardId): CardSymbol | null {
  return isWild(card) ? null : (SYMBOL.get(card) ?? null);
}

/** The territory a card pictures (`CARDS-7`); wilds picture none. */
export function territoryOf(card: CardId): TerritoryId | null {
  return isWild(card) ? null : card;
}

/** `CARDS-3`: three of a symbol, one of each, or any two plus a wild (note `two-wilds`: both wilds
 *  may be in one set). */
export function isValidSet(cards: readonly CardId[]): boolean {
  if (cards.length !== 3) return false;
  if (cards.some(isWild)) return true;
  const symbols = new Set(cards.map(symbolOf));
  return symbols.size === 1 || symbols.size === 3;
}

/** Every valid set in a hand, each once, its cards in hand order. */
export function setsIn(hand: readonly CardId[]): [CardId, CardId, CardId][] {
  const sets: [CardId, CardId, CardId][] = [];
  for (let i = 0; i < hand.length; i++) {
    for (let j = i + 1; j < hand.length; j++) {
      for (let k = j + 1; k < hand.length; k++) {
        const set: [CardId, CardId, CardId] = [hand[i], hand[j], hand[k]];
        if (isValidSet(set)) sets.push(set);
      }
    }
  }
  return sets;
}

const THREE_OF: Record<CardSymbol, number> = { infantry: 4, cavalry: 6, artillery: 8 };
const ONE_OF_EACH = 10;

/** `CARDS-6`: what a valid set is worth, fixed by its symbols, a wild counting as whichever symbol
 *  makes it worth most. */
export function setValue(cards: readonly CardId[]): number {
  const symbols = cards.map(symbolOf).filter((symbol) => symbol !== null);
  const distinct = new Set(symbols);
  const wilds = cards.length - symbols.length;
  if (distinct.size + wilds === 3 && (distinct.size > 1 || wilds > 1)) return ONE_OF_EACH;
  return THREE_OF[symbols[0]];
}

/** The most a set can be worth (`CARDS-6`). */
export const MAX_SET_VALUE = ONE_OF_EACH;

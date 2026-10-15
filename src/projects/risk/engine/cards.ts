import type { CardId, CardSymbol } from "../contract";
import { TERRITORIES, type TerritoryId } from "../map";

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

/** `CARDS-6`: what the n-th set traded in the game (1-based) is worth. */
export function setValue(n: number): number {
  const opening = [4, 6, 8, 10, 12, 15];
  return n <= opening.length ? opening[n - 1] : 15 + 5 * (n - 6);
}

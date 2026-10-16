import type { CardId, CardSymbol, Seat } from "../../contract";
import { isWild, symbolOf, territoryOf } from "../../cards";
import type { TerritoryId } from "../../map";

// GD's choice of set (`GameControlCards.GetBestCardMatch` with Fixed values, and
// `GetCardsFromArrayByType`): the most valuable pattern the hand can make, a wild spent on one of
// each (10) before a natural three of a kind; the cards taken first in hand order; then swapped
// so the set pictures exactly one territory the player owns, for its +2, where the hand allows.

/** GD's card types: A infantry, B cavalry, C artillery, W wild. */
type Kind = "A" | "B" | "C" | "W";

const KIND: Record<CardSymbol, Kind> = { infantry: "A", cavalry: "B", artillery: "C" };

function kindOf(card: CardId): Kind {
  const symbol = symbolOf(card);
  return symbol === null ? "W" : KIND[symbol];
}

/** The set GD's AI trades from `hand`, its cards in GD's order (the +2 goes to the first owned
 *  territory among them), or null when the hand holds no set. */
export function bestCardMatch(hand: readonly CardId[], owns: (t: TerritoryId) => boolean): CardId[] | null {
  if (hand.length < 3) return null;
  const count = (k: Kind) => hand.filter((c) => kindOf(c) === k).length;
  const [a, b, c, w] = [count("A"), count("B"), count("C"), count("W")];
  const kinds = (a > 0 ? 1 : 0) + (b > 0 ? 1 : 0) + (c > 0 ? 1 : 0);
  let pattern: Kind[] | null = null;
  let troops = 0;
  if (kinds === 3) {
    pattern = ["A", "B", "C"];
    troops = 10;
  } else if (kinds === 2 && w >= 1) {
    pattern = c === 0 ? ["A", "B", "W"] : b === 0 ? ["A", "W", "C"] : ["W", "B", "C"];
    troops = 10;
  } else if (kinds === 1 && w >= 2) {
    pattern = a > 0 ? ["A", "W", "W"] : b > 0 ? ["W", "B", "W"] : ["W", "W", "C"];
    troops = 10;
  } else if (w >= 3) {
    pattern = ["W", "W", "W"];
    troops = 10;
  }
  for (const [kind, value] of [["C", 8], ["B", 6], ["A", 4]] as const) {
    const n = count(kind);
    if (value > troops && (n >= 3 || (n === 2 && w >= 1) || (n === 1 && w >= 2) || w >= 3)) {
      troops = value;
      pattern = n >= 3 ? [kind, kind, kind] : n === 2 ? [kind, kind, "W"] : n === 1 ? [kind, "W", "W"] : ["W", "W", "W"];
    }
  }
  return pattern ? cardsByType(hand, pattern, owns) : null;
}

function ownedCard(card: CardId, owns: (t: TerritoryId) => boolean): boolean {
  const territory = territoryOf(card);
  return territory !== null && owns(territory);
}

/** `GetCardsFromArrayByType`. */
function cardsByType(hand: readonly CardId[], pattern: readonly Kind[], owns: (t: TerritoryId) => boolean): CardId[] {
  const set: CardId[] = [];
  let owned = 0;
  for (const kind of pattern) {
    const card = hand.find((x) => !set.includes(x) && kindOf(x) === kind);
    if (card === undefined) continue;
    set.push(card);
    if (kind !== "W" && ownedCard(card, owns)) owned++;
  }
  if (owned === 0) {
    for (const card of set) {
      if (isWild(card)) continue;
      const swap = hand.find((x) => !set.includes(x) && kindOf(x) === kindOf(card) && ownedCard(x, owns));
      if (swap !== undefined) {
        set.splice(set.indexOf(card), 1);
        set.push(swap);
        break;
      }
    }
  } else if (owned >= 2) {
    const removed: CardId[] = [];
    const added: CardId[] = [];
    for (const card of set) {
      if (owned === 1) break;
      if (isWild(card) || !ownedCard(card, owns)) continue;
      const swap = hand.find(
        (x) => !set.includes(x) && !added.includes(x) && !isWild(x) && kindOf(x) === kindOf(card) && !ownedCard(x, owns),
      );
      if (swap !== undefined) {
        added.push(swap);
        removed.push(card);
        owned--;
      }
    }
    for (const card of removed) set.splice(set.indexOf(card), 1);
    set.push(...added);
  }
  return set;
}

/** The territory GD gives a set's +2: the first card in the set's order picturing one the trader
 *  owns. */
export function bonusTerritoryOf(set: readonly CardId[], seat: Seat, ownerOf: (t: TerritoryId) => Seat): TerritoryId | null {
  for (const card of set) {
    const territory = territoryOf(card);
    if (territory !== null && ownerOf(territory) === seat) return territory;
  }
  return null;
}

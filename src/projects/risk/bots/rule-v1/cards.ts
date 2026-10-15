import type { CardId, CardSymbol } from "../../contract";
import { TERRITORIES } from "../../map";

// Hand math: set values (`CARDS-6`), valid sets (`CARDS-3`), and how likely a hand
// is to hold or make a set.

/** `CARDS-6`: what the n-th set traded in the game (1-based) is worth. */
export function setValue(n: number): number {
  const opening = [4, 6, 8, 10, 12, 15];
  return n <= opening.length ? opening[n - 1] : 15 + 5 * (n - 6);
}

const SYMBOL = new Map<CardId, CardSymbol>(TERRITORIES.map((t) => [t.id, t.symbol]));

export function isWild(card: CardId): boolean {
  return card === "wild-1" || card === "wild-2";
}

/** Symbol counts: [infantry, cavalry, artillery, wilds]. */
function shape(hand: readonly CardId[]): [number, number, number, number] {
  const s: [number, number, number, number] = [0, 0, 0, 0];
  for (const c of hand) {
    const sym = SYMBOL.get(c);
    if (sym === undefined) s[3]++;
    else s[sym === "infantry" ? 0 : sym === "cavalry" ? 1 : 2]++;
  }
  return s;
}

/** Whether cards of this shape hold a valid set. */
function shapeHasSet([i, c, a, w]: readonly number[]): boolean {
  const n = i + c + a + w;
  if (n < 3) return false;
  if (w >= 1) return true;
  return i >= 3 || c >= 3 || a >= 3 || (i >= 1 && c >= 1 && a >= 1);
}

export function hasSet(hand: readonly CardId[]): boolean {
  return shapeHasSet(shape(hand));
}

/** The chance this hand holds a set after drawing one more card, unseen and equally
 *  likely to be any symbol (wilds are rare enough to leave out). */
export function setChanceAfterDraw(hand: readonly CardId[]): number {
  const s = shape(hand);
  if (shapeHasSet(s)) return 1;
  let p = 0;
  for (let k = 0; k < 3; k++) {
    const next = [...s];
    next[k]++;
    if (shapeHasSet(next)) p += 1 / 3;
  }
  return p;
}

/** The chance a hand of `size` unseen cards holds a set (the design's 42% at 3 and
 *  82% at 4; `CARDS-4`: a hand of 5 always does). An objective estimate, not a
 *  preference: it models other players. */
export function setChance(size: number): number {
  if (size >= 5) return 1;
  if (size === 4) return 0.82;
  if (size === 3) return 0.42;
  return 0;
}

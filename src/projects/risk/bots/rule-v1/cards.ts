import type { CardId } from "../../contract";
import { symbolOf } from "../../cards";

// Hand math for Fixed set values (`CARDS-6`): a set is worth 4, 6, 8 or 10 by its
// symbols, the same all game, and traded cards go back into the deck (`CARDS-8`). A
// hand is worth the armies it will turn into, so it is valued by a small decision
// process over its symbols: each turn the holder may trade one set (must, at 5
// cards), and draws a card as the turn ends if it captured. Its value function says
// what a hand is worth in armies, and its policy says when to trade and which set.
// Every number here is objective: it models any player's cards, mine included.

/** Symbol counts: [infantry, cavalry, artillery, wilds]. */
export type Shape = readonly [number, number, number, number];

const DECK = [13, 14, 15, 2]; // `DECK-1`, `DECK-2`
const DECK_SIZE = 44;
/** What an army next turn is worth against one now. */
export const CARD_DISCOUNT = 0.9;
/** The chance a player captures, so draws a card, on a turn (`CARDS-1`). Balanced Blitz
 *  makes a capture from any stack of 4 beside a 1-army territory certain, so nearly
 *  every turn earns one. */
export const DRAW_CHANCE = 0.9;
/** The largest hand the decision process covers: 4 kept plus the card drawn. */
const MAX_HAND = 5;

export function shapeOf(hand: readonly CardId[]): Shape {
  const s: [number, number, number, number] = [0, 0, 0, 0];
  for (const c of hand) {
    const sym = symbolOf(c);
    s[sym === null ? 3 : sym === "infantry" ? 0 : sym === "cavalry" ? 1 : 2]++;
  }
  return s;
}

const size = (s: Shape) => s[0] + s[1] + s[2] + s[3];
const key = (s: Shape) => ((s[0] * 16 + s[1]) * 16 + s[2]) * 16 + s[3];
const add = (s: Shape, t: Shape): Shape => [s[0] + t[0], s[1] + t[1], s[2] + t[2], s[3] + t[3]];
/** The cards of `s` once those of `t` are gone. */
export const sub = (s: Shape, t: Shape): Shape => [s[0] - t[0], s[1] - t[1], s[2] - t[2], s[3] - t[3]];
const fits = (t: Shape, s: Shape) => t.every((n, i) => n <= s[i]);
const ONE: readonly Shape[] = [
  [1, 0, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 1],
];

/** Every valid set (`CARDS-3`) as a shape, with its worth (`CARDS-6`: a wild counts as
 *  whichever symbol makes the set worth most). */
const SETS: readonly { shape: Shape; value: number }[] = (() => {
  const out: { shape: Shape; value: number }[] = [];
  for (let i = 0; i <= 3; i++) {
    for (let c = 0; c <= 3 - i; c++) {
      for (let a = 0; a <= 3 - i - c; a++) {
        const w = 3 - i - c - a;
        if (w > 2) continue;
        const symbols = [i, c, a].filter((n) => n > 0).length;
        const sameKind = symbols === 1 && w === 0;
        const mixed = symbols + w === 3 && (symbols > 1 || w > 1);
        const valid = w >= 1 || sameKind || (i === 1 && c === 1 && a === 1);
        if (!valid) continue;
        const kind = i > 0 ? 4 : c > 0 ? 6 : 8;
        out.push({ shape: [i, c, a, w], value: mixed ? 10 : kind });
      }
    }
  }
  return out;
})();

export function setsOf(s: Shape): { shape: Shape; value: number }[] {
  return SETS.filter((set) => fits(set.shape, s));
}

/** Every shape of `n` cards, with the chance `n` cards drawn from those not `held` have it. */
function handsOf(n: number, held: Shape = [0, 0, 0, 0]): { shape: Shape; p: number }[] {
  const out: { shape: Shape; p: number }[] = [];
  const choose = (k: number, r: number) => {
    let x = 1;
    for (let j = 0; j < r; j++) x = (x * (k - j)) / (j + 1);
    return x;
  };
  const left = DECK.map((k, i) => k - held[i]);
  const total = choose(DECK_SIZE - size(held), n);
  for (let i = 0; i <= n; i++) {
    for (let c = 0; c <= n - i; c++) {
      for (let a = 0; a <= n - i - c; a++) {
        const w = n - i - c - a;
        const p = (choose(left[0], i) * choose(left[1], c) * choose(left[2], a) * choose(left[3], w)) / total;
        if (p > 0) out.push({ shape: [i, c, a, w], p });
      }
    }
  }
  return out;
}

// The decision process: V(h) is a hand's worth in armies at the start of its holder's
// turn, trading optimally from here on. Solved once, by value iteration, over every
// shape of up to 5 cards.
const ALL: Shape[] = [];
for (let n = 0; n <= MAX_HAND; n++) for (const { shape } of handsOf(n)) ALL.push(shape);
const V = new Map<number, number>();
const POLICY = new Map<number, { shape: Shape; value: number } | null>();
{
  for (const s of ALL) V.set(key(s), 0);
  const next = (h: Shape) => {
    if (size(h) >= MAX_HAND) return valueOf(h);
    let drawn = 0;
    for (let k = 0; k < 4; k++) {
      const p = drawChance(h, k);
      if (p > 0) drawn += p * valueOf(add(h, ONE[k]));
    }
    return DRAW_CHANCE * drawn + (1 - DRAW_CHANCE) * valueOf(h);
  };
  for (let iter = 0; iter < 400; iter++) {
    let change = 0;
    for (const h of ALL) {
      let best = size(h) < MAX_HAND ? CARD_DISCOUNT * next(h) : -Infinity;
      let choice: { shape: Shape; value: number } | null = null;
      for (const set of setsOf(h)) {
        const v = set.value + CARD_DISCOUNT * next(sub(h, set.shape));
        if (v > best + 1e-12) {
          best = v;
          choice = set;
        }
      }
      change = Math.max(change, Math.abs(best - valueOf(h)));
      V.set(key(h), best);
      POLICY.set(key(h), choice);
    }
    if (change < 1e-9) break;
  }
}

/** The chance the next card drawn has symbol `k`, from the cards not in this hand. */
function drawChance(h: Shape, k: number): number {
  return (DECK[k] - h[k]) / (DECK_SIZE - size(h));
}

function valueOf(h: Shape): number {
  const v = V.get(key(h));
  if (v === undefined) throw new Error(`no value for a hand of ${size(h)} cards`);
  return v;
}

/** The set the policy trades from a hand at the start of a turn, or null to hold. */
export function policyTrade(h: Shape): { shape: Shape; value: number } | null {
  if (size(h) > MAX_HAND) return bestForced(h).first;
  const p = POLICY.get(key(h));
  if (p === undefined) throw new Error(`no policy for a hand of ${size(h)} cards`);
  return p;
}

/** The trades that take a hand of more than 4 down to 4 (`CARDS-5`, `ELIM-3`): the sets
 *  that maximise their armies plus what the cards kept are worth. */
function bestForced(h: Shape): { armies: number; kept: Shape; first: { shape: Shape; value: number } | null } {
  if (size(h) <= 4) return { armies: 0, kept: h, first: null };
  let best = { armies: -Infinity, kept: h, first: null as { shape: Shape; value: number } | null };
  let bestTotal = -Infinity;
  for (const set of setsOf(h)) {
    const rest = bestForced(sub(h, set.shape));
    const total = set.value + rest.armies + CARD_DISCOUNT * valueOf(rest.kept);
    if (total > bestTotal) {
      bestTotal = total;
      best = { armies: set.value + rest.armies, kept: rest.kept, first: set };
    }
  }
  return best;
}

/** What `known` plus `unknown` unseen cards are worth at the start of the holder's next
 *  turn, after any trades a hand over 4 must make at once (their armies included). */
const worthMemo = new Map<string, number>();
export function handWorth(known: Shape, unknown: number): number {
  const id = `${key(known)}:${unknown}`;
  const memo = worthMemo.get(id);
  if (memo !== undefined) return memo;
  let total = 0;
  for (const { shape, p } of handsOf(unknown, known)) {
    const h = add(known, shape);
    if (size(h) <= MAX_HAND) total += p * valueOf(h);
    else {
      const f = bestForced(h);
      total += p * (f.armies + CARD_DISCOUNT * valueOf(f.kept));
    }
  }
  worthMemo.set(id, total);
  return total;
}

const EMPTY: Shape = [0, 0, 0, 0];

/** A hidden hand of `n` cards: its worth, the chance it holds a set, and the armies its
 *  holder is expected to trade on their next turn. */
export interface HiddenHand {
  worth: number;
  setChance: number;
  nextTrade: number;
}

const hidden: HiddenHand[] = [];
for (let n = 0; n <= 12; n++) {
  let setChance = 0;
  let nextTrade = 0;
  for (const { shape, p } of handsOf(n)) {
    if (setsOf(shape).length > 0) setChance += p;
    if (n > MAX_HAND) nextTrade += p * bestForced(shape).armies;
    else nextTrade += p * (policyTrade(shape)?.value ?? 0);
  }
  hidden.push({ worth: handWorth(EMPTY, n), setChance, nextTrade });
}

export function hiddenHand(n: number): HiddenHand {
  return hidden[Math.min(n, hidden.length - 1)];
}

/** The armies a forced trade turns a hand of `n` cards, mostly unseen, into at once, and
 *  the cards it keeps (`ELIM-3`). */
export function forcedTrade(n: number): { armies: number; kept: number } {
  if (n <= 4) return { armies: 0, kept: n };
  let armies = 0;
  for (const { shape, p } of handsOf(Math.min(n, 12))) armies += p * bestForced(shape).armies;
  return { armies, kept: n - 3 * Math.ceil((n - 4) / 3) };
}

/** What one card is worth in the long run: the armies a player trading by the policy
 *  makes per card drawn. */
export const CARD_WORTH: number = (() => {
  // Follow a hand drawing every turn from empty and average the armies traded.
  let dist = new Map<number, { shape: Shape; p: number }>([[key(EMPTY), { shape: EMPTY, p: 1 }]]);
  let armies = 0;
  const turns = 400;
  for (let t = 0; t < turns; t++) {
    const next = new Map<number, { shape: Shape; p: number }>();
    for (const { shape, p } of dist.values()) {
      const trade = policyTrade(shape);
      const kept = trade ? sub(shape, trade.shape) : shape;
      armies += p * (trade?.value ?? 0);
      for (let k = 0; k < 4; k++) {
        const q = drawChance(kept, k);
        if (q === 0) continue;
        const h = add(kept, ONE[k]);
        const e = next.get(key(h));
        if (e) e.p += p * q;
        else next.set(key(h), { shape: h, p: p * q });
      }
    }
    dist = next;
  }
  return armies / turns;
})();

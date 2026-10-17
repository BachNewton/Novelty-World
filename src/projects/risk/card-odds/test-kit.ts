import type { CardId, GameEvent, Seat } from "../contract";
import type { Belief, CardOdds } from "./odds";
import { addSymbol, shapeKey, symbolIndex } from "./shape";
import { QUEUE, type Timeline } from "./timeline";

// The odds by brute force, for the tests: every way the deck could have run, played card by
// card as the engine plays it (a draw takes the top card, a traded card goes in at a random
// place below the top 3), with no reasoning about bags or slots. Only small decks finish.
//
// The starting deck is a uniformly random order, so the card at a starting position is
// chosen only when it is drawn, uniformly from the starting cards not yet drawn: the same
// chances as shuffling it all first, with far fewer branches.

/** A history of only the card events, as `viewer` sees them, and the viewer's hand now. */
export interface Scenario {
  players: number;
  viewer: Seat | null;
  deck: readonly CardId[];
  history: readonly GameEvent[];
  hand: readonly CardId[] | null;
}

export function bruteForceBelief(scenario: Scenario): Belief {
  const { players, viewer, deck, history } = scenario;
  const hands = Array.from({ length: players }, (_, seat) =>
    seat === viewer ? null : new Map<number, number>(),
  );
  const nextDraw = [0, 0, 0, 0];
  let total = 0;
  const out: boolean[] = Array.from({ length: players }, () => false);

  // `null` in the deck is a starting card not yet drawn.
  const walk = (at: number, chance: number, order: (CardId | null)[], undrawn: CardId[], held: CardId[][]): void => {
    if (at === history.length) {
      if (viewer !== null && !sameCards(held[viewer], scenario.hand ?? [])) return;
      total += chance;
      held.forEach((cards, seat) => {
        if (seat === viewer || out[seat]) return;
        const key = cards.reduce((k, card) => addSymbol(k, symbolIndex(card)), 0);
        hands[seat]?.set(key, (hands[seat]?.get(key) ?? 0) + chance);
      });
      const top = order[0];
      if (top === null) for (const card of undrawn) nextDraw[symbolIndex(card)] += chance / undrawn.length;
      else nextDraw[symbolIndex(top)] += chance;
      return;
    }
    const event = history[at];
    switch (event.kind) {
      case "card-drawn": {
        const top = order[0];
        const draw = (card: CardId, left: CardId[], p: number) => {
          if (event.seat === viewer && event.card !== card) return;
          const next = held.map((cards) => [...cards]);
          next[event.seat].push(card);
          walk(at + 1, p, order.slice(1), left, next);
        };
        if (top !== null) draw(top, undrawn, chance);
        else for (const card of undrawn) draw(card, undrawn.filter((c) => c !== card), chance / undrawn.length);
        return;
      }
      case "traded": {
        if (!event.cards.every((card) => held[event.seat].includes(card))) return;
        const next = held.map((cards) => [...cards]);
        next[event.seat] = next[event.seat].filter((card) => !event.cards.includes(card));
        const insert = (i: number, deckNow: (CardId | null)[], p: number): void => {
          if (i === event.cards.length) return walk(at + 1, p, deckNow, undrawn, next);
          if (deckNow.length <= QUEUE) throw new Error("the brute force covers only decks of more than 3");
          const places = deckNow.length - QUEUE + 1;
          for (let place = QUEUE; place <= deckNow.length; place++) {
            insert(i + 1, [...deckNow.slice(0, place), event.cards[i], ...deckNow.slice(place)], p / places);
          }
        };
        insert(0, order, chance);
        return;
      }
      case "eliminated": {
        const next = held.map((cards) => [...cards]);
        next[event.by].push(...next[event.seat]);
        next[event.seat] = [];
        out[event.seat] = true;
        walk(at + 1, chance, order, undrawn, next);
        return;
      }
      default:
        walk(at + 1, chance, order, undrawn, held);
    }
  };
  walk(0, 1, deck.map(() => null), [...deck], Array.from({ length: players }, () => []));

  if (total === 0) throw new Error("no way the deck could have run fits the history");
  for (const shapes of hands) if (shapes) for (const [key, p] of shapes) shapes.set(key, p / total);
  return {
    hands: hands.map((shapes, seat) => (out[seat] ? null : shapes)),
    nextDraw: [nextDraw[0] / total, nextDraw[1] / total, nextDraw[2] / total, nextDraw[3] / total],
  };
}

function sameCards(a: readonly CardId[], b: readonly CardId[]): boolean {
  return a.length === b.length && a.every((card) => b.includes(card));
}

/** The largest gap between two beliefs' chances, over every hand shape and the next draw. */
export function beliefGap(a: Belief, b: Belief): number {
  let gap = 0;
  a.nextDraw.forEach((p, symbol) => (gap = Math.max(gap, Math.abs(p - b.nextDraw[symbol]))));
  a.hands.forEach((shapes, seat) => {
    const other = b.hands[seat];
    if (!shapes || !other) {
      if (shapes !== other) throw new Error(`seat ${seat} has a hand in one belief only`);
      return;
    }
    for (const key of new Set([...shapes.keys(), ...other.keys()])) {
      gap = Math.max(gap, Math.abs((shapes.get(key) ?? 0) - (other.get(key) ?? 0)));
    }
  });
  return gap;
}

/** The odds that ignore when cards were traded: every card the viewer can't see is equally
 *  likely to be anywhere they can't see (the "simple" model), for comparison. */
export function timelessBelief(timeline: Timeline): Belief {
  const pool = [0, 0, 0, 0];
  for (const stay of timeline.stays) if (!stay.seen) pool[symbolIndex(stay.card)]++;
  const size = pool.reduce((s, n) => s + n, 0);
  const choose = (n: number, k: number) => {
    let c = 1;
    for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
    return c;
  };
  const hands = Array.from({ length: timeline.players }, (_, seat) => {
    if (seat === timeline.viewer || timeline.out[seat]) return null;
    const h = timeline.hidden[seat];
    const shapes = new Map<number, number>();
    for (let a = 0; a <= h; a++) {
      for (let b = 0; a + b <= h; b++) {
        for (let c = 0; a + b + c <= h; c++) {
          const d = h - a - b - c;
          const p = (choose(pool[0], a) * choose(pool[1], b) * choose(pool[2], c) * choose(pool[3], d)) / choose(size, h);
          if (p > 0) shapes.set(shapeKey([a, b, c, d]), p);
        }
      }
    }
    return shapes;
  });
  return { hands, nextDraw: [pool[0] / size, pool[1] / size, pool[2] / size, pool[3] / size] };
}

/** The largest gaps between two sets of odds in what a decision reads: a hand's chance of
 *  holding a set, its chance of each best set, and the next draw's symbol. */
export function oddsGap(a: CardOdds, b: CardOdds): { holdsSet: number; bestSet: number; nextDraw: number } {
  let holdsSet = 0;
  let bestSet = 0;
  a.hands.forEach((hand, seat) => {
    const other = b.hands[seat];
    if (!hand || !other) return;
    holdsSet = Math.max(holdsSet, Math.abs(hand.holdsSet - other.holdsSet));
    for (const value of [4, 6, 8, 10]) {
      bestSet = Math.max(bestSet, Math.abs((hand.bestSet.get(value) ?? 0) - (other.bestSet.get(value) ?? 0)));
    }
  });
  const nextDraw = Math.max(...a.nextDraw.map((p, symbol) => Math.abs(p - b.nextDraw[symbol])));
  return { holdsSet, bestSet, nextDraw };
}

/** Card events, briefly: `d1` seat 1 draws, `d0:alaska` the viewer draws Alaska, `t1:a,b,c`
 *  seat 1 trades, `e2>1` seat 1 eliminates seat 2. */
export function events(script: string): GameEvent[] {
  return script.split(/\s+/).filter(Boolean).map((step): GameEvent => {
    const [head, ...rest] = step.split(":");
    const seat = Number(head.slice(1));
    switch (head[0]) {
      case "d":
        return rest.length === 0
          ? { rule: "CARDS-1", kind: "card-drawn", seat }
          : { rule: "CARDS-1", kind: "card-drawn", seat, card: rest[0] as CardId };
      case "t": {
        const cards = rest.join("").split(",") as CardId[];
        if (cards.length !== 3) throw new Error(`a trade is three cards: ${step}`);
        return { rule: "CARDS-5", kind: "traded", seat, cards: [cards[0], cards[1], cards[2]], armies: 0, bonus: null };
      }
      case "e": {
        const [victim, by] = head.slice(1).split(">").map(Number);
        return { rule: "ELIM-2", kind: "eliminated", seat: victim, by, cardsTaken: 0 };
      }
      default:
        throw new Error(`unknown step ${step}`);
    }
  });
}

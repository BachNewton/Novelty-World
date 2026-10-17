import type { Belief } from "./odds";
import { addSymbol, keyShape, symbolIndex } from "./shape";
import { holderNow, type Stay, type Timeline } from "./timeline";

// The odds by estimate: fast enough for a bot to ask on every decision, and measured
// against the sampler (`sample.ts`), which it approximates in three steps.
//
// 1. Which slots still hold a hidden card. A seen card used up one of the slots it could
//    have ended in; each seen card's group (a trade, a draw, an elimination's cards) is
//    spread over its slots in proportion to how likely each still is to hold a card.
// 2. Which unseen card is in which slot. Each unseen card is in one slot or still in the
//    bag, and can be in a slot only if it went into the bag before that slot's pick. The
//    chances are the most even ones that meet those totals (Sinkhorn scaling), the usual
//    stand-in for "every matching equally likely".
// 3. Each hand from its slots, taken as independent cards: a hand is the slots its seat
//    holds that still hold a card, as many as the hand's public size.

const SINKHORN_ROUNDS = 200;
const SINKHORN_TOLERANCE = 1e-6;

export function estimateBelief(timeline: Timeline): Belief {
  const live = liveness(timeline);
  const columns = slotChances(timeline, live);
  const unseen = timeline.stays.filter((stay) => !stay.seen);
  /** The unseen cards of each symbol that could be in slot `k`: those in the bag at its pick. */
  const pool = (k: number) => {
    const counts = [0, 0, 0, 0];
    for (const stay of unseen) if (stay.start < timeline.slots[k].picked) counts[symbolIndex(stay.card)]++;
    return counts;
  };
  const hands = Array.from({ length: timeline.players }, (_, seat) => {
    if (seat === timeline.viewer || timeline.out[seat]) return null;
    const held = timeline.slots.flatMap((slot, k) =>
      slot.drawn !== null && holderNow(slot) === seat && live[k] > 0 ? [k] : [],
    );
    return handShapes(
      held.map((k) => ({ live: live[k], symbols: columns.get(k) ?? [0, 0, 0, 0], pool: pool(k) })),
      timeline.hidden[seat],
    );
  });
  const top = columns.get(timeline.top);
  if (!top) throw new Error("the deck's top card has no chances");
  return { hands, nextDraw: [top[0], top[1], top[2], top[3]] };
}

/** Step 1: each slot's chance of still holding a hidden card, its holder's total held to the
 *  hand's public size. */
function liveness(timeline: Timeline): number[] {
  const live = timeline.slots.map(() => 1);
  const groups = new Map<number, Stay[]>();
  for (const stay of timeline.stays) {
    if (!stay.seen) continue;
    const group = groups.get(stay.seen.at) ?? [];
    group.push(stay);
    groups.set(stay.seen.at, group);
  }
  for (const at of [...groups.keys()].sort((a, b) => a - b)) {
    const group = groups.get(at) ?? [];
    const used = new Map<number, number>();
    let total = 0;
    const taken: number[] = [];
    const assign = (i: number, weight: number) => {
      if (i === group.length) {
        total += weight;
        for (const k of taken) used.set(k, (used.get(k) ?? 0) + weight);
        return;
      }
      for (const k of group[i].seen?.slots ?? []) {
        if (live[k] === 0 || taken.includes(k)) continue;
        taken.push(k);
        assign(i + 1, weight * live[k]);
        taken.pop();
      }
    };
    assign(0, 1);
    if (total === 0) throw new Error(`the cards seen at event ${at} fit no slot still holding a card`);
    for (const [k, w] of used) live[k] = Math.max(0, live[k] - w / total);
  }

  // Hold each seat's slots to its hand's size; nobody's but the viewer's slots hold none.
  for (let seat = 0; seat < timeline.players; seat++) {
    const held = timeline.slots.flatMap((slot, k) => (slot.drawn !== null && holderNow(slot) === seat ? [k] : []));
    const sum = held.reduce((s, k) => s + live[k], 0);
    const size = timeline.hidden[seat];
    if (size > 0 && sum === 0) throw new Error(`seat ${seat} holds ${size} hidden cards in no slot`);
    for (const k of held) live[k] = size === 0 ? 0 : (live[k] * size) / sum;
  }
  return live;
}

/** Step 2: for every slot that may hold an unseen card, the chance it holds each symbol. */
function slotChances(timeline: Timeline, live: number[]): Map<number, number[]> {
  // Unseen cards that went into the bag at the same moment are alike but for their symbol.
  const byStart = new Map<number, number[]>();
  for (const stay of timeline.stays) {
    if (stay.seen) continue;
    const counts = byStart.get(stay.start) ?? [0, 0, 0, 0];
    counts[symbolIndex(stay.card)]++;
    byStart.set(stay.start, counts);
  }
  const starts = [...byStart.keys()];
  const groups = starts.map((start) => byStart.get(start) ?? []);
  const sizes = groups.map((counts) => counts[0] + counts[1] + counts[2] + counts[3]);

  // Columns: each slot that may hold one, then the bag, which may hold any.
  const slots = timeline.slots.flatMap((slot, k) => (live[k] > 0 ? [k] : []));
  const mass = [...slots.map((k) => live[k]), timeline.bag];
  const fits = (g: number, column: number) =>
    column === slots.length || timeline.slots[slots[column]].picked > starts[g];
  const unseen = sizes.reduce((s, n) => s + n, 0);
  const placed = mass.reduce((s, m) => s + m, 0);
  if (Math.abs(unseen - placed) > 1e-6) throw new Error(`${unseen} unseen cards for ${placed} places`);

  const u = groups.map(() => 1);
  const v = mass.map(() => 1);
  for (let round = 0; round < SINKHORN_ROUNDS; round++) {
    for (let g = 0; g < groups.length; g++) {
      let s = 0;
      for (let c = 0; c < mass.length; c++) if (fits(g, c)) s += v[c];
      u[g] = 1 / s;
    }
    let worst = 0;
    for (let c = 0; c < mass.length; c++) {
      let s = 0;
      for (let g = 0; g < groups.length; g++) if (fits(g, c)) s += sizes[g] * u[g];
      worst = Math.max(worst, Math.abs(s * v[c] - mass[c]));
      v[c] = mass[c] / s;
    }
    if (worst < SINKHORN_TOLERANCE) break;
  }

  const chances = new Map<number, number[]>();
  slots.forEach((k, c) => {
    const symbols = [0, 0, 0, 0];
    groups.forEach((counts, g) => {
      if (!fits(g, c)) return;
      for (let symbol = 0; symbol < 4; symbol++) symbols[symbol] += (counts[symbol] * u[g] * v[c]) / mass[c];
    });
    chances.set(k, symbols);
  });
  return chances;
}

/** Step 3: the chance of each hand shape, from slots each holding a card with chance `live`.
 *  The cards come from one pool, so a symbol already in the hand is less likely again: each
 *  slot's chances are scaled by the share of that symbol's cards it could hold that aren't
 *  yet in the hand, which is exactly drawing without replacement when every slot could hold
 *  the same cards. */
function handShapes(
  slots: { live: number; symbols: number[]; pool: readonly number[] }[],
  size: number,
): Map<number, number> {
  // By how many cards are in, then by shape.
  let byCount: Map<number, number>[] = [new Map([[0, 1]])];
  const scaled = [0, 0, 0, 0];
  for (const slot of slots) {
    // Past `size` cards a hand can't be this one, so those counts aren't kept.
    const next: Map<number, number>[] = byCount.map(() => new Map());
    if (byCount.length <= size) next.push(new Map());
    byCount.forEach((shapes, n) => {
      for (const [key, p] of shapes) {
        const out = p * (1 - slot.live);
        if (out > 0) next[n].set(key, (next[n].get(key) ?? 0) + out);
        if (n === size) continue;
        const shape = keyShape(key);
        let total = 0;
        for (let symbol = 0; symbol < 4; symbol++) {
          const pool = slot.pool[symbol];
          scaled[symbol] = pool === 0 ? 0 : (slot.symbols[symbol] * Math.max(0, pool - shape[symbol])) / pool;
          total += scaled[symbol];
        }
        if (total === 0) continue;
        for (let symbol = 0; symbol < 4; symbol++) {
          const q = (p * slot.live * scaled[symbol]) / total;
          if (q === 0) continue;
          const added = addSymbol(key, symbol);
          next[n + 1].set(added, (next[n + 1].get(added) ?? 0) + q);
        }
      }
    });
    byCount = next;
  }
  const shapes = byCount[size] ?? new Map<number, number>();
  const total = [...shapes.values()].reduce((s, p) => s + p, 0);
  if (total === 0) throw new Error(`no hand of ${size} cards fits its slots`);
  for (const [key, p] of shapes) shapes.set(key, p / total);
  return shapes;
}

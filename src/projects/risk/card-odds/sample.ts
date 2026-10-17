import { createRng } from "@/shared/lib/seeded-random";
import type { Belief } from "./odds";
import { addSymbol, symbolIndex } from "./shape";
import { holderNow, type Timeline } from "./timeline";

// The odds by sampling: slow, and right by construction, so it is the yardstick the fast
// estimate is measured against.
//
// Every matching of stays to slots that fits what the viewer has seen is equally likely
// (`timeline.ts`). The sampler draws matchings by sequential importance sampling: the
// stays of seen cards first, each to one of the slots it can still take without leaving a
// later seen card with none, then every slot left to a card not seen since, earliest pick
// first, among the cards in the bag at that pick. Each sample is weighted by the number of
// choices it had at each step, which makes the weighted samples uniform over the matchings.

export interface Sampled {
  belief: Belief;
  /** How many equally weighted samples the weighted ones are worth (Kish's effective sample
   *  size): the sampling error shrinks as its square root. */
  effective: number;
}

export function sampleBelief(timeline: Timeline, samples: number, seed: string): Sampled {
  const rng = createRng(seed);
  const { slots, stays } = timeline;
  const seen = stays.filter((stay) => stay.seen !== null).sort((a, b) => seenAt(a) - seenAt(b));
  const candidates = seen.map((stay) => stay.seen?.slots ?? []);
  const unseen = stays.filter((stay) => stay.seen === null).sort((a, b) => a.start - b.start);
  const owners = slots.map((slot) => (slot.drawn === null ? null : holderNow(slot)));

  const start = matchAll(candidates, slots.length);
  if (!start) throw new Error("no matching of the seen cards to slots fits the history");

  // How many ways the unseen cards could fill the slots a matching leaves, as a log: earliest
  // pick first, each from the cards in the bag at its pick, less those already placed.
  const inBag = slots.map((slot) => unseen.filter((stay) => stay.start < slot.picked).length);
  const fillable = slots.map((_, k) => owners[k] === null || owners[k] !== timeline.viewer);
  const logFills = (slotSeen: readonly number[]) => {
    let log = 0;
    let placed = 0;
    for (let k = 0; k < slots.length; k++) {
      if (slotSeen[k] !== -1) continue;
      const ways = inBag[k] - placed++;
      if (ways <= 0 || !fillable[k]) return -Infinity;
      log += Math.log(ways);
    }
    return log;
  };

  const logWeights: number[] = [];
  const outcomes: { hands: number[]; top: number }[] = [];
  for (let n = 0; n < samples; n++) {
    let logWeight = 0;
    let m: Matching = { seenSlot: [...start.seenSlot], slotSeen: [...start.slotSeen] };
    let fixed = new Uint8Array(slots.length);

    // The seen cards' stays, each to a slot that leaves the rest still matchable, chosen in
    // proportion to the fills the matching it leaves allows, so the weights stay even. A
    // little of every option is kept, so no possible matching is ever ruled out.
    for (let i = 0; i < seen.length; i++) {
      const options = candidates[i].flatMap((k) => {
        if (fixed[k]) return [];
        const trial = { m: { seenSlot: [...m.seenSlot], slotSeen: [...m.slotSeen] }, fixed: Uint8Array.from(fixed) };
        return take(trial.m, candidates, trial.fixed, i, k) ? [{ ...trial, log: logFills(trial.m.slotSeen) }] : [];
      });
      const best = Math.max(...options.map((o) => o.log));
      const shares = options.map((o) => (best === -Infinity ? 1 : Math.exp(o.log - best)) + 1e-3);
      const sum = shares.reduce((s, x) => s + x, 0);
      let r = rng.next() * sum;
      let chosen = 0;
      while (chosen < options.length - 1 && r >= shares[chosen]) r -= shares[chosen++];
      logWeight += Math.log(sum / shares[chosen]);
      ({ m, fixed } = options[chosen]);
    }

    // Every other slot to a card not seen since, picked from those in the bag at its pick.
    const hands = Array.from({ length: timeline.players }, () => 0);
    let top = -1;
    const bag: number[] = [];
    let next = 0;
    for (let k = 0; k < slots.length && logWeight > -Infinity; k++) {
      if (fixed[k]) continue;
      while (next < unseen.length && unseen[next].start < slots[k].picked) bag.push(next++);
      const owner = owners[k];
      if (bag.length === 0 || (owner !== null && owner === timeline.viewer)) {
        logWeight = -Infinity;
        break;
      }
      logWeight += Math.log(bag.length);
      const at = Math.floor(rng.next() * bag.length);
      const symbol = symbolIndex(unseen[bag[at]].card);
      bag[at] = bag[bag.length - 1];
      bag.pop();
      if (owner !== null) hands[owner] = addSymbol(hands[owner], symbol);
      if (k === timeline.top) top = symbol;
    }
    logWeights.push(logWeight);
    outcomes.push({ hands, top });
  }

  const most = Math.max(...logWeights);
  if (most === -Infinity) throw new Error("every sample was impossible");
  const weights = logWeights.map((w) => Math.exp(w - most));
  const total = weights.reduce((sum, w) => sum + w, 0);
  const hands = Array.from({ length: timeline.players }, (_, seat) =>
    seat === timeline.viewer || timeline.out[seat] ? null : new Map<number, number>(),
  );
  const nextDraw = [0, 0, 0, 0];
  outcomes.forEach((outcome, n) => {
    const chance = weights[n] / total;
    if (chance === 0) return;
    hands.forEach((shapes, seat) => shapes?.set(outcome.hands[seat], (shapes.get(outcome.hands[seat]) ?? 0) + chance));
    nextDraw[outcome.top] += chance;
  });
  return {
    belief: { hands, nextDraw: [nextDraw[0], nextDraw[1], nextDraw[2], nextDraw[3]] },
    effective: total ** 2 / weights.reduce((sum, w) => sum + w * w, 0),
  };
}

function seenAt(stay: Timeline["stays"][number]): number {
  return stay.seen?.at ?? Infinity;
}

/** A matching of the seen cards' stays to slots: each stay's slot, and each slot's stay or -1. */
interface Matching {
  seenSlot: number[];
  slotSeen: number[];
}

function matchAll(candidates: readonly (readonly number[])[], slotCount: number): Matching | null {
  const m: Matching = { seenSlot: candidates.map(() => -1), slotSeen: Array.from({ length: slotCount }, () => -1) };
  const fixed = new Uint8Array(slotCount);
  for (let i = 0; i < candidates.length; i++) {
    if (!augment(m, candidates, fixed, i, new Uint8Array(slotCount))) return null;
  }
  return m;
}

/** Kuhn's augmenting path: finds stay `i` a slot, moving other stays along, never onto a fixed slot. */
function augment(m: Matching, candidates: readonly (readonly number[])[], fixed: Uint8Array, i: number, visited: Uint8Array): boolean {
  for (const k of candidates[i]) {
    if (fixed[k] || visited[k]) continue;
    visited[k] = 1;
    const other = m.slotSeen[k];
    if (other === -1 || augment(m, candidates, fixed, other, visited)) {
      m.seenSlot[i] = k;
      m.slotSeen[k] = i;
      return true;
    }
  }
  return false;
}

/** Fixes stay `i` on slot `k`, moving the stay that held `k` elsewhere. False when it can't move. */
function take(m: Matching, candidates: readonly (readonly number[])[], fixed: Uint8Array, i: number, k: number): boolean {
  const other = m.slotSeen[k];
  m.slotSeen[m.seenSlot[i]] = -1;
  m.seenSlot[i] = k;
  m.slotSeen[k] = i;
  fixed[k] = 1;
  if (other === -1 || other === i) return true;
  m.seenSlot[other] = -1;
  return augment(m, candidates, fixed, other, new Uint8Array(fixed.length));
}

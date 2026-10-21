import type { Seat } from "../../contract";
import { CONTINENT_MEMBERS, N, opponentsInOrder, type Board } from "../rule-v1/board";
import type { Breakdown } from "../rule-v6/evaluate";

// What v8's network reads of a board (`ideas/rule-bot-v8.md`): v6's breakdown of it, and the
// board itself as the seat to score sees it, its seats in turn order from that seat. This is
// the one definition of the features: the bot reads boards through it at play time, and the
// training export (`eval/features-cli.ts`) reads the recorded boards through it too.
//
// Seats are slots: the seat scored first, then the opponents still alive in turn order, so a
// seat's slot says only where it sits from the scored seat, never who it is, and a table with
// fewer seats alive looks like a five-player table with seats out. A board with more alive than
// there are slots has no features: the network never saw one.

/** Seats a board may have alive: the five of the games the network was trained on. */
export const SLOTS = 5;

const TERMS = 11;
const PER_SLOT = 7 + CONTINENT_MEMBERS.length;
const CARDS = 4;
const GLOBAL = 3;

/** The length of a feature vector. */
export const FEATURES = TERMS + SLOTS * N + SLOTS * PER_SLOT + CARDS + GLOBAL;

/** The seat scored and the opponents still alive, in turn order from it. */
export function slotsOf(b: Board, me: Seat): Seat[] {
  return [me, ...opponentsInOrder(b, me)];
}

/** The features of `b` for `me`, given v6's breakdown of the same board. */
export function features(b: Board, me: Seat, bd: Breakdown): Float32Array {
  const slots = slotsOf(b, me);
  if (slots.length > SLOTS) throw new Error(`v8's network reads boards of at most ${SLOTS.toString()} seats alive, not ${slots.length.toString()}`);
  const x = new Float32Array(FEATURES);
  const total = bd.total;
  const alive = slots.length;
  const ct = bd.commonThreat;

  let k = 0;
  x[k++] = bd.share;
  x[k++] = bd.share * bd.killExposure;
  x[k++] = bd.borderLoss / total;
  x[k++] = bd.opportunity / total;
  x[k++] = bd.idle / total;
  let gap = 0;
  if (ct !== null) {
    let next = 0;
    for (const s of slots) if (s !== ct) next = Math.max(next, bd.power[s]);
    gap = (bd.power[ct] - next) / total;
  }
  x[k++] = ct !== null && ct !== me ? 1 : 0;
  x[k++] = ct !== null && ct !== me ? gap : 0;
  x[k++] = ct === me ? 1 : 0;
  x[k++] = ct === me ? gap : 0;
  x[k++] = bd.value;
  x[k++] = 1 / alive;

  const slotOf = new Int8Array(b.players).fill(-1);
  slots.forEach((s, i) => (slotOf[s] = i));
  let armies = 0;
  for (let t = 0; t < N; t++) armies += b.armies[t];
  for (let t = 0; t < N; t++) {
    const slot = slotOf[b.owner[t]];
    if (slot >= 0) x[k + slot * N + t] = Math.log1p(b.armies[t]);
  }
  k += SLOTS * N;

  for (let i = 0; i < SLOTS; i++, k += PER_SLOT) {
    if (i >= slots.length) continue;
    const s = slots[i];
    let count = 0;
    let held = 0;
    let stack = 0;
    for (let t = 0; t < N; t++) {
      if (b.owner[t] !== s) continue;
      count++;
      held += b.armies[t];
      stack = Math.max(stack, b.armies[t]);
    }
    x[k] = 1;
    x[k + 1] = b.handSize[s] / 5;
    x[k + 2] = count / N;
    x[k + 3] = held / armies;
    x[k + 4] = stack / armies;
    x[k + 5] = bd.power[s] / total;
    x[k + 6] = bd.spared[s];
    CONTINENT_MEMBERS.forEach((members, c) => (x[k + 7 + c] = members.every((t) => b.owner[t] === s) ? 1 : 0));
  }

  x[k++] = b.known[0] / 3;
  x[k++] = b.known[1] / 3;
  x[k++] = b.known[2] / 3;
  x[k++] = b.known[3] / 2;

  x[k++] = b.turn / 200;
  x[k++] = b.cardEarned ? 1 : 0;
  x[k++] = alive / SLOTS;
  if (k !== FEATURES) throw new Error(`v8 wrote ${k.toString()} features, not ${FEATURES.toString()}`);
  return x;
}

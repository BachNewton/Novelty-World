import type { Perch } from "../engine/wildlife";

/*
 * A songbird's day, as rules: it sits on a perch (a rock, a bush, the edge
 * of a tree's crown), looking about and turning round on it; now and then it
 * flies down to the ground nearby to hop about and peck, or off to another
 * perch, in a bounding arc; Elliott coming close (closer still if they come
 * quietly) flushes it off to the perch furthest from them. When the birds
 * are hardly about (the night, the rain) it sits tight where it is. Its
 * choices are seeded, and it keeps to the perches of the ground round it.
 */

export type BirdMode = "perched" | "ground" | "flying";

interface Point {
  x: number;
  y: number;
  z: number;
}

export interface BirdState {
  x: number;
  y: number;
  z: number;
  /** The way it faces, radians from +z towards +x. */
  heading: number;
  mode: BirdMode;
  /** The perch it is on or flying to, as an index into the perches it keeps to. */
  perch: number;
  /** When it next thinks of doing something else. */
  until: number;
  picks: number;
  flight: { from: Point; to: Point; start: number; duration: number } | null;
  /** A hop on the ground: from where, and when it began. */
  hop: { from: Point; to: Point; start: number } | null;
  seed: number;
}

/** Where Elliott is, as a bird sees them. */
export interface Walker {
  x: number;
  z: number;
  /** Running, or in the air: either flushes a bird from further off. */
  hurried: boolean;
}

export const BIRD = {
  /** How near Elliott may come, walking and hurried, in metres. */
  flush: { calm: 3.2, hurried: 6.5 },
  /** How fast it flies, metres a second, and how far it will go for a perch, in metres. */
  speed: 6.5,
  range: 22,
  /** A hop on the ground: how long and how far, at most. */
  hop: { seconds: 0.22, reach: 0.25 },
} as const;

function hash(seed: number, n: number): number {
  let h = Math.imul(seed | 0, 0x27d4eb2d) ^ Math.imul(n | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function birdAt(perches: readonly Perch[], perch: number, seed: number): BirdState {
  const p = perches[perch];
  return { x: p.x, y: p.y, z: p.z, heading: hash(seed, 1) * Math.PI * 2, mode: p.kind === "ground" ? "ground" : "perched", perch, until: 0, picks: 0, flight: null, hop: null, seed };
}

/** A perch to fly to: within range, of a kind if asked, chosen by `score` (higher better); null if none. */
function choosePerch(perches: readonly Perch[], bird: BirdState, kind: "ground" | "sitting", score: (p: Perch, d: number) => number): number | null {
  let best: number | null = null;
  let bestScore = -Infinity;
  perches.forEach((p, i) => {
    if (i === bird.perch || (kind === "ground") !== (p.kind === "ground")) return;
    const d = Math.hypot(p.x - bird.x, p.z - bird.z);
    if (d > BIRD.range) return;
    const s = score(p, d);
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  });
  return best;
}

function flyTo(bird: BirdState, perches: readonly Perch[], perch: number, time: number): void {
  const to = perches[perch];
  const distance = Math.hypot(to.x - bird.x, to.y - bird.y, to.z - bird.z);
  bird.flight = { from: { x: bird.x, y: bird.y, z: bird.z }, to: { x: to.x, y: to.y, z: to.z }, start: time, duration: Math.max(0.5, distance / BIRD.speed) };
  bird.perch = perch;
  bird.mode = "flying";
  bird.hop = null;
}

/** How far through its flight a bird is, 0 to 1. */
export const flightProgress = (bird: BirdState, time: number) => (bird.flight ? Math.min(1, (time - bird.flight.start) / bird.flight.duration) : 1);

/** One step of a songbird among its perches: `about` is how busy the birds are now, 0 (roosting) to 1. */
export function stepBird(bird: BirdState, perches: readonly Perch[], walker: Walker, about: number, time: number): void {
  if (bird.mode === "flying" && bird.flight) {
    const { from, to } = bird.flight;
    const t = flightProgress(bird, time);
    const span = Math.hypot(to.x - from.x, to.z - from.z);
    // A bounding arc: up from the perch, over, and down onto the next.
    const lift = (0.4 + span * 0.1) * 4 * t * (1 - t);
    bird.x = from.x + (to.x - from.x) * t;
    bird.y = from.y + (to.y - from.y) * t + lift;
    bird.z = from.z + (to.z - from.z) * t;
    if (span > 0.05) bird.heading = Math.atan2(to.x - from.x, to.z - from.z);
    if (t >= 1) {
      bird.flight = null;
      bird.mode = perches[bird.perch].kind === "ground" ? "ground" : "perched";
      bird.until = time + 2 + hash(bird.seed, bird.picks + 7) * 4;
    }
    return;
  }

  const d = Math.hypot(bird.x - walker.x, bird.z - walker.z);
  if (d < (walker.hurried ? BIRD.flush.hurried : BIRD.flush.calm)) {
    const away = choosePerch(perches, bird, "sitting", (p) => Math.hypot(p.x - walker.x, p.z - walker.z) - Math.hypot(p.x - bird.x, p.z - bird.z) * 0.3);
    if (away !== null) {
      flyTo(bird, perches, away, time);
      return;
    }
  }

  if (bird.mode === "ground" && bird.hop) {
    const t = Math.min(1, (time - bird.hop.start) / BIRD.hop.seconds);
    bird.x = bird.hop.from.x + (bird.hop.to.x - bird.hop.from.x) * t;
    bird.z = bird.hop.from.z + (bird.hop.to.z - bird.hop.from.z) * t;
    bird.y = bird.hop.from.y + (bird.hop.to.y - bird.hop.from.y) * t + 0.06 * Math.sin(Math.PI * t);
    if (t >= 1) bird.hop = null;
    return;
  }

  if (time < bird.until) return;
  bird.picks++;
  const roll = hash(bird.seed, bird.picks * 3);
  const wait = (low: number, high: number) => low + (high - low) * hash(bird.seed, bird.picks * 3 + 1);
  // Hardly about: it sits tight a while longer.
  if (roll > about + 0.05) {
    bird.until = time + wait(6, 14);
    return;
  }
  if (bird.mode === "ground") {
    const choice = hash(bird.seed, bird.picks * 3 + 2);
    if (choice < 0.18) {
      const back = choosePerch(perches, bird, "sitting", (_, dist) => -dist);
      if (back !== null) {
        flyTo(bird, perches, back, time);
        return;
      }
    }
    // A hop or two about the ground, pecking between.
    const angle = bird.heading + (hash(bird.seed, bird.picks * 5) - 0.5) * 2.4;
    const reach = BIRD.hop.reach * (0.4 + 0.6 * hash(bird.seed, bird.picks * 5 + 1));
    const home = perches[bird.perch];
    // Never far from where it came down.
    const way = Math.hypot(bird.x - home.x, bird.z - home.z) > 1.2 ? Math.atan2(home.x - bird.x, home.z - bird.z) : angle;
    const to = { x: bird.x + Math.sin(way) * reach, y: home.y, z: bird.z + Math.cos(way) * reach };
    bird.heading = way;
    bird.hop = { from: { x: bird.x, y: bird.y, z: bird.z }, to, start: time };
    bird.until = time + wait(0.4, 1.6);
    return;
  }
  // Perched: down to the ground, off to another perch, or a turn about on this one.
  const choice = hash(bird.seed, bird.picks * 3 + 2);
  if (choice < 0.32) {
    const down = choosePerch(perches, bird, "ground", (_, dist) => -dist);
    if (down !== null) {
      flyTo(bird, perches, down, time);
      return;
    }
  }
  if (choice < 0.55) {
    const next = choosePerch(perches, bird, "sitting", (_, dist) => -Math.abs(dist - 8) + hash(bird.seed, bird.picks * 7) * 4);
    if (next !== null) {
      flyTo(bird, perches, next, time);
      return;
    }
  }
  bird.heading += (hash(bird.seed, bird.picks * 3 + 3) - 0.5) * 2.2;
  bird.until = time + wait(1.5, 5);
}

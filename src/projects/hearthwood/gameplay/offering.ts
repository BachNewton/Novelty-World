/*
 * What is offered to Elliott to use, whatever it is (a ripe berry, a cat to
 * pet): one rule for all of them, so they compete fairly. In first person
 * the thing nearest the middle of the view, within reach of the eyes and
 * looked at somewhere across its width; in third person the nearest thing
 * in front of Elliott, within reach of where they stand. Each kind of thing
 * scores its candidates by this, and the lowest score is offered.
 */

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** Where Elliott looks from: their eyes and the way they look (a unit vector) in first person, or where they stand and face in third. */
export type Viewer = { pointOfView: "first"; eye: Point3; look: Point3 } | { pointOfView: "third"; x: number; z: number; heading: number };

/** A thing that could be offered: where the eye aims at it, how wide it is to the eye, and how far it can be reached from in each view, in metres. */
export interface Offerable {
  heart: Point3;
  spread: number;
  reach: { first: number; third: number };
}

/** Looking within this angle of a thing's middle always looks at it, however far it is. */
const LOOK_SLACK = 0.1;
/** In third person, only things within this angle either side of the way Elliott faces are in front of them. */
const FRONT = 1.4;

/** The turn from one heading to another, the short way round, in radians. */
export function angleBetween(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/** How strongly a thing is offered, lower first, or null where it isn't offered at all (out of reach, or not looked at). */
export function offerScore(viewer: Viewer, { heart, spread, reach }: Offerable): number | null {
  if (viewer.pointOfView === "first") {
    const dx = heart.x - viewer.eye.x;
    const dy = heart.y - viewer.eye.y;
    const dz = heart.z - viewer.eye.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance > reach.first || distance === 0) return null;
    const along = (dx * viewer.look.x + dy * viewer.look.y + dz * viewer.look.z) / distance;
    const angle = Math.acos(Math.min(1, Math.max(-1, along)));
    if (angle > Math.max(LOOK_SLACK, Math.atan(spread / distance))) return null;
    return angle;
  }
  const dx = heart.x - viewer.x;
  const dz = heart.z - viewer.z;
  const distance = Math.hypot(dx, dz);
  if (distance > reach.third) return null;
  const off = distance === 0 ? 0 : Math.abs(angleBetween(viewer.heading, Math.atan2(dx, dz)));
  if (off > FRONT) return null;
  return distance * (1 + off);
}

/** The best offered of some candidates and its score, if any scores under `beat` (another kind's best). */
export function bestOffered<T>(candidates: Iterable<T>, viewer: Viewer, offerable: (candidate: T) => Offerable | null, beat = Infinity): { offered: T; score: number } | null {
  let best: { offered: T; score: number } | null = null;
  for (const candidate of candidates) {
    const thing = offerable(candidate);
    if (thing === null) continue;
    const score = offerScore(viewer, thing);
    if (score === null || score >= (best?.score ?? beat)) continue;
    best = { offered: candidate, score };
  }
  return best;
}

import { createRng, type Rng } from "@/shared/lib/seeded-random";
import { type Grid, sample, slopeAt } from "./grid";
import { flatten, ringMean, roughness } from "./fields";
import { ALTITUDE } from "./land";
import { type Lake, lakeDistance, type Stream } from "./water";

/*
 * Where camp is, and the places worth walking to: each a small reason to
 * leave camp. Each is chosen from a scatter of candidates by how well it
 * suits, with a little of the seed's chance, and the land levelled under it.
 */

export type PlaceKind = "stone-circle" | "waterfall" | "hilltop";

export interface Place {
  kind: PlaceKind;
  /** The thing itself. */
  x: number;
  z: number;
  /** Where its trail ends, to stand and look. */
  visitX: number;
  visitZ: number;
  /** Kept free of trees, in metres round the place. */
  clearing: number;
}

export interface Camp {
  x: number;
  z: number;
  /** The fire's ground height. */
  y: number;
  /** Kept free of trees, in metres round the fire. */
  clearing: number;
}

const CAMP_CLEARING = 15;
const CIRCLE_CLEARING = 11;
const HILLTOP_CLEARING = 7;
const WATERFALL_CLEARING = 10;

interface Candidate {
  x: number;
  z: number;
  score: number;
}

function bestOf(label: string, rng: Rng, step: number, reach: number, score: (x: number, z: number) => number | null): Candidate {
  let best: Candidate | null = null;
  for (let z = -reach; z <= reach; z += step) {
    for (let x = -reach; x <= reach; x += step) {
      const jx = x + (rng.next() - 0.5) * step;
      const jz = z + (rng.next() - 0.5) * step;
      const s = score(jx, jz);
      if (s === null) continue;
      const jittered = s + rng.next() * 3;
      if (best === null || jittered > best.score) best = { x: jx, z: jz, score: jittered };
    }
  }
  if (best === null) throw new Error(`No candidate suits (${label})`);
  return best;
}

export interface Surroundings {
  heights: Grid;
  lake: Lake;
  stream: Stream;
  streamDistance: Grid;
}

function shoreDistance(lake: Lake, x: number, z: number): number {
  return (lakeDistance(lake, x, z) - 1) * lake.radius;
}

export function placeCamp(seed: string, { heights, lake, streamDistance }: Surroundings): Camp {
  const rng = createRng(`${seed}/camp`);
  const spot = bestOf("camp", rng, 6, 150, (x, z) => {
    const h = sample(heights, x, z);
    if (h < 1.5 || h > 9) return null;
    const shore = shoreDistance(lake, x, z);
    if (shore < 16 || shore > 70) return null;
    if (sample(streamDistance, x, z) < 22) return null;
    const rough = roughness(heights, x, z, 10);
    if (rough > 2.2) return null;
    return -Math.abs(shore - 28) * 0.5 - 6 * rough;
  });
  const y = flatten(heights, spot.x, spot.z, 11, 9);
  return { x: spot.x, z: spot.z, y, clearing: CAMP_CLEARING };
}

function stoneCircle(rng: Rng, { heights, lake, streamDistance }: Surroundings, camp: Camp): Place {
  const spot = bestOf("stone circle", rng, 7, 200, (x, z) => {
    const h = sample(heights, x, z);
    if (h < 3 || h > 28) return null;
    const fromCamp = Math.hypot(x - camp.x, z - camp.z);
    if (fromCamp < 95 || fromCamp > 190) return null;
    if (sample(streamDistance, x, z) < 22 || shoreDistance(lake, x, z) < 25) return null;
    const rough = roughness(heights, x, z, 9);
    if (rough > 3.5) return null;
    return -Math.abs(fromCamp - 140) * 0.1 - 3 * rough;
  });
  flatten(heights, spot.x, spot.z, 8, 7);
  return { kind: "stone-circle", x: spot.x, z: spot.z, visitX: spot.x, visitZ: spot.z, clearing: CIRCLE_CLEARING };
}

function hilltop(rng: Rng, { heights, streamDistance }: Surroundings, camp: Camp, avoid: readonly Place[]): Place {
  const spot = bestOf("hilltop", rng, 6, 220, (x, z) => {
    const h = sample(heights, x, z);
    if (h < ALTITUDE.treeline - 8 || h > ALTITUDE.ceiling - 9) return null;
    if (Math.hypot(x - camp.x, z - camp.z) < 110) return null;
    if (sample(streamDistance, x, z) < 30) return null;
    if (avoid.some((p) => Math.hypot(x - p.x, z - p.z) < 90)) return null;
    if (slopeAt(heights, x, z) > 0.55) return null;
    const prominence = h - ringMean(heights, x, z, 22);
    return h * 0.4 + prominence * 3;
  });
  flatten(heights, spot.x, spot.z, 4, 6);
  return { kind: "hilltop", x: spot.x, z: spot.z, visitX: spot.x, visitZ: spot.z, clearing: HILLTOP_CLEARING };
}

/** The falls, seen from the gentlest bank a little way below them, where there is room to stand and look up at them. */
function waterfall({ heights, stream }: Surroundings): Place {
  const { points, waterfall: falls } = stream;
  let best: { x: number; z: number; slope: number } | null = null;
  for (let k = falls.index + 8; k <= Math.min(points.length - 3, falls.index + 22); k += 2) {
    const here = points[k];
    const ahead = points[k + 2];
    const dx = ahead.x - here.x;
    const dz = ahead.z - here.z;
    const length = Math.hypot(dx, dz);
    for (const side of [-1, 1]) {
      for (const out of [5, 7, 9]) {
        const x = here.x + (-dz / length) * out * side;
        const z = here.z + (dx / length) * out * side;
        const slope = slopeAt(heights, x, z);
        if (best === null || slope < best.slope) best = { x, z, slope };
      }
    }
  }
  if (best === null) throw new Error("The stream ends too soon below its falls");
  return { kind: "waterfall", x: falls.x, z: falls.z, visitX: best.x, visitZ: best.z, clearing: WATERFALL_CLEARING };
}

export function placePlaces(seed: string, surroundings: Surroundings, camp: Camp): Place[] {
  const rng = createRng(`${seed}/places`);
  const circle = stoneCircle(rng, surroundings, camp);
  const falls = waterfall(surroundings);
  const top = hilltop(rng, surroundings, camp, [circle, falls]);
  return [circle, falls, top];
}

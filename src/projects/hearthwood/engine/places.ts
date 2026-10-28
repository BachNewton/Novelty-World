import { createRng, type Rng } from "@/shared/lib/seeded-random";
import { ALTITUDE, emptySample, TERRACE, type Land, type LandSample } from "./land";
import { mainRegion, REGION_CHARACTER, type PlaceKind, type Regions } from "./regions";

/*
 * The land's own sights worth walking to. The world is cut into square cells,
 * and each cell holds at most one place, found from the cell's own seed and
 * its land alone, so a place is always where it was and nothing needs the
 * whole map. A waterfall is wherever a river drops from one terrace to the
 * next; the other kinds suit their region, and each is put where its kind
 * fits best among a scatter of candidates: a tor on a rise, a tarn in a
 * cirque's hollow, a cascade down the wall of a valley. Places keep well
 * inside their cell, so what they clear never reaches the next.
 */

/** The side of a place cell, in metres. */
export const PLACE_CELL = 192;
/** How far inside its cell's edge a place keeps, in metres. */
const CELL_MARGIN = 34;
/** The share of cells that hold a place. */
const PLACE_CHANCE = 0.8;

export interface Place {
  kind: PlaceKind;
  /** The cell it belongs to. */
  cellX: number;
  cellZ: number;
  x: number;
  z: number;
  /** The ground at its middle (for a waterfall, the water at its lip). */
  y: number;
  /** Its turn about the vertical, in radians (a waterfall faces the way its river flows). */
  turn: number;
  /** The seed its shape is drawn from. */
  seed: string;
  /** Kept free of trees, in metres round its middle. */
  clearing: number;
  /** A tarn's water: its level and the radius of its shore, inside a lip of moraine. */
  pool?: { level: number; radius: number };
  /** A cascade's fall: points (x, y, z each) down the steepest way from its lip until the ground levels out. */
  fall?: Float32Array;
}

export interface PlaceGround {
  land: Land;
  regions: Regions;
}

/** The highest less the lowest of the land at a point and on a ring round it. */
function roughness(land: Land, x: number, z: number, radius: number, scratch: LandSample): number {
  let low = Infinity;
  let high = -Infinity;
  for (let k = 0; k <= 6; k++) {
    const angle = (k / 6) * Math.PI * 2;
    const r = k === 6 ? 0 : radius;
    const h = land.sample(x + Math.cos(angle) * r, z + Math.sin(angle) * r, scratch).height;
    low = Math.min(low, h);
    high = Math.max(high, h);
  }
  return high - low;
}

function ringMean(land: Land, x: number, z: number, radius: number, scratch: LandSample): number {
  let sum = 0;
  for (let k = 0; k < 8; k++) {
    const angle = (k / 8) * Math.PI * 2;
    sum += land.sample(x + Math.cos(angle) * radius, z + Math.sin(angle) * radius, scratch).height;
  }
  return sum / 8;
}

function pickWeighted<K extends string>(rng: Rng, weights: Partial<Record<K, number>>): K | null {
  const entries = Object.entries(weights) as [K, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng.next() * total;
  for (const [kind, w] of entries) {
    roll -= w;
    if (roll < 0) return kind;
  }
  return entries.length > 0 ? entries[entries.length - 1][0] : null;
}

interface Fit {
  score: number;
  x: number;
  z: number;
}

/** How well a kind of place suits a spot, or null where it can't go. */
function suits(kind: Exclude<PlaceKind, "waterfall">, ground: PlaceGround, x: number, z: number, s: LandSample, scratch: LandSample): number | null {
  const { land } = ground;
  const dry = s.height - s.water;
  if (dry < 1.6 || s.river > 0.01) return null;
  switch (kind) {
    case "tor": {
      if (roughness(land, x, z, 4, scratch) > 3) return null;
      const prominence = s.height - ringMean(land, x, z, 30, scratch);
      return prominence > 2.5 ? prominence + s.height * 0.01 : null;
    }
    case "tarn": {
      // A hollow high up: a cirque's floor, lower than the ground all round it.
      if (s.height - s.bands < ALTITUDE.treeline - 60) return null;
      const hollow = ringMean(land, x, z, 40, scratch) - s.height;
      if (hollow < 3 || roughness(land, x, z, 10, scratch) > 9) return null;
      return hollow;
    }
    case "cascade": {
      // The top of a tall wall: steep ground falling a long way below.
      if (s.mountainous < 0.3) return null;
      const drop = s.height - ringMean(land, x, z, 60, scratch);
      const rough = roughness(land, x, z, 4, scratch);
      return drop > 25 && rough > 3 ? drop : null;
    }
  }
}

/** The way down from a point, following the steepest fall, until the ground levels out: x, y, z for each step. */
function fallLine(land: Land, x: number, z: number, scratch: LandSample): Float32Array {
  const points: number[] = [];
  const step = 2.5;
  let px = x;
  let pz = z;
  for (let k = 0; k < 120; k++) {
    const h = land.sample(px, pz, scratch).height;
    points.push(px, h, pz);
    const e = 2;
    const gx = land.sample(px + e, pz, scratch).height - land.sample(px - e, pz, scratch).height;
    const gz = land.sample(px, pz + e, scratch).height - land.sample(px, pz - e, scratch).height;
    const g = Math.hypot(gx, gz) / (2 * e);
    if (k > 6 && g < 0.25) break;
    const length = Math.hypot(gx, gz) || 1;
    px -= (gx / length) * step;
    pz -= (gz / length) * step;
  }
  return new Float32Array(points);
}

/** How far round each kind of place is kept free of trees, in metres. */
const CLEARING: Record<PlaceKind, number> = { tor: 9, tarn: 26, cascade: 8, waterfall: 8 };

/** A tarn's size: the radius of its shore, in metres. */
const TARN_RADIUS = 20;

/** Where a river crosses the edge of a terrace in a cell, as the lip of its falls, or null. */
function findFalls(ground: PlaceGround, x0: number, z0: number, scratch: LandSample, rng: Rng): Fit | null {
  const { land } = ground;
  const step = 5;
  let best: Fit | null = null;
  for (let z = z0 + CELL_MARGIN; z <= z0 + PLACE_CELL - CELL_MARGIN; z += step) {
    for (let x = x0 + CELL_MARGIN; x <= x0 + PLACE_CELL - CELL_MARGIN; x += step) {
      const { river, water } = land.sample(x, z, scratch);
      if (river < 0.5) continue;
      // A lip: the water here stands a terrace above the water a few metres downstream.
      const flow = land.flowAt(x, z);
      if (land.sample(x + flow.x * 6, z + flow.z * 6, scratch).water > water - TERRACE + 0.5) continue;
      const score = river + rng.next() * 0.1;
      if (best === null || score > best.score) best = { score, x, z };
    }
  }
  return best;
}

/** The place in a cell, or null when it has none. */
export function placeInCell(seed: string, ground: PlaceGround, cellX: number, cellZ: number): Place | null {
  const rng = createRng(`${seed}/place/${cellX},${cellZ}`);
  const scratch = emptySample();
  const s = emptySample();
  const x0 = cellX * PLACE_CELL;
  const z0 = cellZ * PLACE_CELL;
  const placeSeed = `${seed}/place/${cellX},${cellZ}/shape`;

  const falls = findFalls(ground, x0, z0, scratch, rng);
  if (falls !== null) {
    const flow = ground.land.flowAt(falls.x, falls.z);
    const lip = ground.land.sample(falls.x, falls.z, s);
    return { kind: "waterfall", cellX, cellZ, x: falls.x, z: falls.z, y: lip.water, turn: Math.atan2(flow.x, flow.z), seed: placeSeed, clearing: CLEARING.waterfall };
  }
  if (rng.next() > PLACE_CHANCE) return null;

  const middle = ground.land.sample(x0 + PLACE_CELL / 2, z0 + PLACE_CELL / 2, s);
  const region = mainRegion(ground.regions.weightsAt(x0 + PLACE_CELL / 2, z0 + PLACE_CELL / 2, middle));
  const kind = pickWeighted(rng, REGION_CHARACTER[region].places);
  if (kind === null) return null;

  let best: Fit | null = null;
  const tries = 7;
  const inner = PLACE_CELL - 2 * CELL_MARGIN;
  for (let j = 0; j < tries; j++) {
    for (let i = 0; i < tries; i++) {
      const x = x0 + CELL_MARGIN + ((i + rng.next()) / tries) * inner;
      const z = z0 + CELL_MARGIN + ((j + rng.next()) / tries) * inner;
      const score = suits(kind, ground, x, z, ground.land.sample(x, z, s), scratch);
      if (score === null) continue;
      const jittered = score + rng.next() * 0.5;
      if (best === null || jittered > best.score) best = { score: jittered, x, z };
    }
  }
  if (best === null) return null;
  const y = ground.land.sample(best.x, best.z, s).height;
  const place: Place = { kind, cellX, cellZ, x: best.x, z: best.z, y, turn: rng.next() * Math.PI * 2, seed: placeSeed, clearing: CLEARING[kind] };
  if (kind === "tarn") place.pool = { level: y + 1.4, radius: TARN_RADIUS };
  if (kind === "cascade") place.fall = fallLine(ground.land, best.x, best.z, scratch);
  return place;
}

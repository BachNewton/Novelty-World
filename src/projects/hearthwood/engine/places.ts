import { createRng, type Rng } from "@/shared/lib/seeded-random";
import { ALTITUDE, emptySample, TERRACE, type Land, type LandSample } from "./land";
import { mainRegion, REGION_CHARACTER, type PlaceKind, type Regions } from "./regions";

/*
 * Camp, and the places worth walking to. The world is cut into square cells,
 * and each cell holds at most one place, found from the cell's own seed and
 * its land alone, so a place is always where it was and nothing needs the
 * whole map. A waterfall is wherever a river drops from one terrace to the
 * next; the other kinds suit their region, and each is put where its kind
 * fits best among a scatter of candidates: a stone circle on level ground, a
 * cairn or tor on a rise, a fallen giant tree in the woods, a summer farm
 * (a seter) in a high green valley, a tarn in a cirque's hollow, a cascade
 * down the wall of a valley. Places keep well
 * inside their cell, so what they level and clear never reaches the next.
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
  /** The ground at its middle, once levelled (for a waterfall, the water at its lip). */
  y: number;
  /** Its turn about the vertical, in radians (a waterfall faces the way its river flows). */
  turn: number;
  /** The seed its shape is drawn from. */
  seed: string;
  /** Kept free of trees, in metres round its middle. */
  clearing: number;
  /** The land is levelled within this radius, easing back to the land as it was by `flatten + blend`; zero leaves it as it lies. */
  flatten: number;
  blend: number;
  /** A tarn's water: its level and the radius of its shore, inside a lip of moraine. */
  pool?: { level: number; radius: number };
  /** A cascade's fall: points (x, y, z each) down the steepest way from its lip until the ground levels out. */
  fall?: Float32Array;
}

export interface Camp {
  x: number;
  z: number;
  /** The fire's ground height. */
  y: number;
  /** Kept free of trees, in metres round the fire. */
  clearing: number;
  flatten: number;
  blend: number;
}

const CAMP_CLEARING = 15;

export interface PlaceGround {
  land: Land;
  regions: Regions;
  /** How thick the woods would grow at a point, 0 to 1. */
  woodland: (x: number, z: number, land: LandSample) => number;
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

/** The mean of the land over a disc, for the level a place is set at. */
function meanLevel(land: Land, x: number, z: number, radius: number, scratch: LandSample): number {
  let sum = 0;
  let count = 0;
  for (let r = 0; r <= radius; r += radius / 2) {
    const ring = r === 0 ? 1 : 8;
    for (let k = 0; k < ring; k++) {
      const angle = (k / ring) * Math.PI * 2;
      sum += land.sample(x + Math.cos(angle) * r, z + Math.sin(angle) * r, scratch).height;
      count++;
    }
  }
  return sum / count;
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
    case "stone-circle":
    case "fairy-ring": {
      const rough = roughness(land, x, z, kind === "stone-circle" ? 9 : 6, scratch);
      if (rough > (kind === "stone-circle" ? 3.2 : 2)) return null;
      const wood = ground.woodland(x, z, s);
      if (kind === "fairy-ring") return wood > 0.05 && wood < 0.7 ? -rough - Math.abs(wood - 0.35) * 2 : null;
      return -rough;
    }
    case "cairn":
    case "tor": {
      if (roughness(land, x, z, 4, scratch) > 3) return null;
      const prominence = s.height - ringMean(land, x, z, 30, scratch);
      return prominence > 2.5 ? prominence + s.height * 0.01 : null;
    }
    case "shrine": {
      const rough = roughness(land, x, z, 3.5, scratch);
      if (rough > 1.6) return null;
      return -rough - Math.abs(ground.woodland(x, z, s) - 0.4) * 2;
    }
    case "fallen-tree": {
      const wood = ground.woodland(x, z, s);
      if (wood < 0.3) return null;
      const rough = roughness(land, x, z, 8, scratch);
      return rough > 4 ? null : wood - rough * 0.2;
    }
    case "seter": {
      // A high green valley: level ground among the mountains, below the treeline.
      if (s.mountainous < 0.25 || s.height > ALTITUDE.treeline - 5 || s.height < ALTITUDE.treeline - 190) return null;
      const rough = roughness(land, x, z, 12, scratch);
      return rough > 4 ? null : s.mountainous * 3 - rough + s.height * 0.004;
    }
    case "tarn": {
      // A hollow high up: a cirque's floor, lower than the ground all round it.
      if (s.height < ALTITUDE.treeline - 40) return null;
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

const SHAPE: Record<PlaceKind, { clearing: number; flatten: number; blend: number }> = {
  "stone-circle": { clearing: 11, flatten: 8.5, blend: 7 },
  cairn: { clearing: 7, flatten: 3.5, blend: 5 },
  tor: { clearing: 9, flatten: 0, blend: 0 },
  shrine: { clearing: 6, flatten: 2.5, blend: 3 },
  "fallen-tree": { clearing: 9, flatten: 0, blend: 0 },
  "fairy-ring": { clearing: 7, flatten: 5, blend: 4 },
  seter: { clearing: 18, flatten: 11, blend: 9 },
  tarn: { clearing: 26, flatten: 0, blend: 0 },
  cascade: { clearing: 8, flatten: 0, blend: 0 },
  waterfall: { clearing: 8, flatten: 0, blend: 0 },
};

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
export function placeInCell(seed: string, ground: PlaceGround, cellX: number, cellZ: number, camp: { x: number; z: number }): Place | null {
  const rng = createRng(`${seed}/place/${cellX},${cellZ}`);
  const scratch = emptySample();
  const s = emptySample();
  const x0 = cellX * PLACE_CELL;
  const z0 = cellZ * PLACE_CELL;
  const placeSeed = `${seed}/place/${cellX},${cellZ}/shape`;
  const nearCamp = (x: number, z: number) => Math.hypot(x - camp.x, z - camp.z) < 70;

  const falls = findFalls(ground, x0, z0, scratch, rng);
  if (falls !== null && !nearCamp(falls.x, falls.z)) {
    const flow = ground.land.flowAt(falls.x, falls.z);
    const lip = ground.land.sample(falls.x, falls.z, s);
    return { kind: "waterfall", cellX, cellZ, x: falls.x, z: falls.z, y: lip.water, turn: Math.atan2(flow.x, flow.z), seed: placeSeed, ...SHAPE.waterfall };
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
      if (nearCamp(x, z)) continue;
      const score = suits(kind, ground, x, z, ground.land.sample(x, z, s), scratch);
      if (score === null) continue;
      const jittered = score + rng.next() * 0.5;
      if (best === null || jittered > best.score) best = { score: jittered, x, z };
    }
  }
  if (best === null) return null;
  const shape = SHAPE[kind];
  const y = shape.flatten > 0 ? meanLevel(ground.land, best.x, best.z, shape.flatten, scratch) : ground.land.sample(best.x, best.z, s).height;
  const place: Place = { kind, cellX, cellZ, x: best.x, z: best.z, y, turn: rng.next() * Math.PI * 2, seed: placeSeed, ...shape };
  if (kind === "tarn") place.pool = { level: y + 1.4, radius: TARN_RADIUS };
  if (kind === "cascade") place.fall = fallLine(ground.land, best.x, best.z, scratch);
  return place;
}

/** Camp: a level, dry clearing on the greenwood's meadow, a short walk from the world's origin. */
export function placeCamp(seed: string, ground: PlaceGround): Camp {
  const rng = createRng(`${seed}/camp`);
  const s = emptySample();
  const scratch = emptySample();
  let best: Fit | null = null;
  const reach = 150;
  const step = 10;
  for (let z = -reach; z <= reach; z += step) {
    for (let x = -reach; x <= reach; x += step) {
      const jx = x + (rng.next() - 0.5) * step;
      const jz = z + (rng.next() - 0.5) * step;
      const here = ground.land.sample(jx, jz, s);
      if (here.height - here.water < 2.2) continue;
      if (ground.land.sample(jx, jz, scratch).river > 0) continue;
      let wet = false;
      for (let k = 0; k < 8 && !wet; k++) {
        const angle = (k / 8) * Math.PI * 2;
        const around = ground.land.sample(jx + Math.cos(angle) * 20, jz + Math.sin(angle) * 20, scratch);
        wet = around.river > 0 || around.height - around.water < 0.8;
      }
      if (wet) continue;
      const rough = roughness(ground.land, jx, jz, 11, scratch);
      if (rough > 2.5) continue;
      const score = -4 * rough - Math.hypot(jx, jz) / 30 + rng.next();
      if (best === null || score > best.score) best = { score, x: jx, z: jz };
    }
  }
  if (best === null) throw new Error("No level, dry meadow near the world's origin for camp");
  const flatten = 11;
  return { x: best.x, z: best.z, y: meanLevel(ground.land, best.x, best.z, flatten, scratch), clearing: CAMP_CLEARING, flatten, blend: 9 };
}

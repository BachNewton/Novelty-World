import { createRng, uniform, type Rng } from "@/shared/lib/seeded-random";
import { ALTITUDE, emptySample, type LandSample } from "./land";
import { fbm, gradientNoise, smoothstep } from "./noise";
import { REGION_CHARACTER, REGIONS, type PlantKind, type Region, type RegionWeights, type TreeKind } from "./regions";

/*
 * What grows where: how thick the woods are at each point, and the plants
 * and stones of one square chunk of the world, scattered from the chunk's own
 * seed so a chunk always grows the same. Each region has its own woods and
 * its own undergrowth; the woods stand in groves, open into glades, thin out
 * up to the treeline and keep back from water, camp and the places.
 */

/** The side of a plant chunk, in metres. */
export const PLANT_CHUNK = 64;
/** How many shapes each kind comes in. */
export const PLANT_VARIANTS = 3;
const SCATTER_SPACING = 3.2;

export interface Plant {
  kind: PlantKind;
  x: number;
  /** The ground under it. */
  y: number;
  z: number;
  /** Its overall size, in metres for trees (height) and roughly so for the rest. */
  size: number;
  /** How much taller than wide it grows than its kind usually does, about 1. */
  stretch: number;
  /** Its turn about the vertical, in radians. */
  turn: number;
  /** How far it leans, in radians, and towards which way. */
  lean: number;
  leanToward: number;
  /** Its shift from its kind's colour, -1 to 1. */
  tint: number;
  /** Which of its kind's shapes it is. */
  variant: number;
}

export interface PlantChunk {
  chunkX: number;
  chunkZ: number;
  plants: Plant[];
  /** Where fireflies hover over its meadows at night: x, y, z for each. */
  fireflies: Float32Array;
}

/** What the scatter asks of the world. */
export interface LifeGround {
  seed: string;
  sampleAt: (x: number, z: number, out?: LandSample) => LandSample;
  regionAt: (x: number, z: number, land: LandSample, out?: RegionWeights) => RegionWeights;
  /** How open a point is kept by camp and the places: 1 is untouched, 0 is a clearing. */
  openness: (x: number, z: number) => number;
  woodland: (x: number, z: number, land: LandSample, weights: RegionWeights, slope: number) => number;
}

/** How the band edges wander up and down the slopes, in metres. */
const BAND_WOBBLE = 30;

export function makeWoodland(seed: string) {
  const groves = gradientNoise(`${seed}/groves`);
  const glades = gradientNoise(`${seed}/glades`);
  const wobble = gradientNoise(`${seed}/bands`);
  return {
    bandWobble: (x: number, z: number) => BAND_WOBBLE * fbm(wobble, x / 140, z / 140, 3),
    /** How thick the woods grow at a point, 0 (open) to 1, before clearings. */
    density(x: number, z: number, land: LandSample, weights: RegionWeights, slope: number): number {
      let cover = 0;
      for (let i = 0; i < REGIONS.length; i++) cover += weights[i] * REGION_CHARACTER[REGIONS[i]].woods;
      const g = 0.5 + 0.5 * fbm(groves, x / 80, z / 80, 3);
      // A cover of c leaves about a share c of the land wooded: the grove field's spread puts its median near 0.5.
      let d = smoothstep(1 - cover - 0.12, 1 - cover + 0.12, g);
      d *= 1 - 0.85 * smoothstep(0.2, 0.45, fbm(glades, x / 48, z / 48, 2));
      const w = BAND_WOBBLE * fbm(wobble, x / 140, z / 140, 3);
      d *= 1 - smoothstep(ALTITUDE.treeline - 30 + w, ALTITUDE.treeline + 6 + w, land.height - land.bands);
      d *= 1 - smoothstep(0.75, 1.05, slope);
      d *= smoothstep(0.6, 2.4, land.height - land.water) * (1 - land.river);
      return d;
    },
  };
}

function pickWeighted<K extends string>(rng: Rng, weights: Partial<Record<K, number>>): K | null {
  const entries = Object.entries(weights) as [K, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) return null;
  let roll = rng.next() * total;
  for (const [kind, w] of entries) {
    roll -= w;
    if (roll < 0) return kind;
  }
  return entries[entries.length - 1][0];
}

function pickRegion(rng: Rng, weights: RegionWeights): Region {
  let roll = rng.next();
  for (let i = 0; i < REGIONS.length; i++) {
    roll -= weights[i];
    if (roll < 0) return REGIONS[i];
  }
  return REGIONS[REGIONS.length - 1];
}

const TREE_SIZE: Record<TreeKind, [number, number]> = {
  conifer: [8, 15],
  pine: [9, 16],
  broadleaf: [6.5, 10.5],
  birch: [7, 11.5],
  aspen: [8, 12.5],
  maple: [6.5, 10.5],
};

const SMALL_SIZE: Record<Exclude<PlantKind, TreeKind>, [number, number]> = {
  bush: [0.8, 1.7],
  heather: [0.9, 1.7],
  fern: [0.6, 1.15],
  mushroom: [0.7, 1.1],
  flowers: [0.8, 1.3],
  rock: [0.5, 1.4],
};

function makePlant(kind: PlantKind, x: number, y: number, z: number, size: number, variant: number, rng: Rng): Plant {
  const next = () => rng.next();
  const upright = kind === "rock" || kind === "flowers" || kind === "mushroom" || kind === "heather";
  return {
    kind,
    x,
    y,
    z,
    size,
    stretch: 0.85 + 0.3 * next(),
    turn: next() * Math.PI * 2,
    lean: upright ? 0 : 0.07 * next() * next(),
    leanToward: next() * Math.PI * 2,
    tint: next() * 2 - 1,
    variant,
  };
}

/** The coarse grid a chunk's scatter reads the land from, every COARSE metres. */
const COARSE = 8;

interface Coarse {
  side: number;
  heights: Float32Array;
}

function coarseGrid(ground: LifeGround, x0: number, z0: number): Coarse {
  const side = PLANT_CHUNK / COARSE + 3;
  const heights = new Float32Array(side * side);
  const s = emptySample();
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) heights[j * side + i] = ground.sampleAt(x0 + (i - 1) * COARSE, z0 + (j - 1) * COARSE, s).height;
  }
  return { side, heights };
}

/** The steepness at a point of a chunk, from its coarse grid. */
function coarseSlope(c: Coarse, x0: number, z0: number, x: number, z: number): number {
  const fx = (x - x0) / COARSE + 1;
  const fz = (z - z0) / COARSE + 1;
  const i = Math.min(c.side - 2, Math.max(1, Math.round(fx)));
  const j = Math.min(c.side - 2, Math.max(1, Math.round(fz)));
  const h = (a: number, b: number) => c.heights[b * c.side + a];
  return Math.hypot(h(i + 1, j) - h(i - 1, j), h(i, j + 1) - h(i, j - 1)) / (2 * COARSE);
}

export function scatterChunk(ground: LifeGround, chunkX: number, chunkZ: number): PlantChunk {
  const rng = createRng(`${ground.seed}/life/${chunkX},${chunkZ}`);
  const x0 = chunkX * PLANT_CHUNK;
  const z0 = chunkZ * PLANT_CHUNK;
  const coarse = coarseGrid(ground, x0, z0);
  const s = emptySample();
  const weights = new Float32Array(REGIONS.length);
  const plants: Plant[] = [];
  const meadows: number[] = [];
  const across = Math.round(PLANT_CHUNK / SCATTER_SPACING);

  for (let j = 0; j < across; j++) {
    for (let i = 0; i < across; i++) {
      const x = x0 + (i + 0.5 + (rng.next() - 0.5) * 0.9) * SCATTER_SPACING;
      const z = z0 + (j + 0.5 + (rng.next() - 0.5) * 0.9) * SCATTER_SPACING;
      const roll = rng.next();
      const pick = rng.next();
      const land = ground.sampleAt(x, z, s);
      const { height: h } = land;
      if (h < land.water + 0.3 || land.river > 0.02) continue;
      // How high it grows against the bands where it is.
      const banded = h - land.bands;
      if (banded > ALTITUDE.snow + 20) continue;
      const open = ground.openness(x, z);
      if (open < 0.4) continue;
      const slope = coarseSlope(coarse, x0, z0, x, z);
      ground.regionAt(x, z, land, weights);
      const d = ground.woodland(x, z, land, weights, slope) * open;
      const character = REGION_CHARACTER[pickRegion(rng, weights)];
      const variant = Math.floor(rng.next() * PLANT_VARIANTS);

      if (roll < d * 0.78) {
        const high = smoothstep(ALTITUDE.treeline - 120, ALTITUDE.treeline - 15, banded);
        const kinds = rng.next() < high ? character.highTrees : character.trees;
        const kind = pickWeighted(rng, kinds) ?? "conifer";
        const shrink = 1 - 0.4 * smoothstep(ALTITUDE.treeline - 45, ALTITUDE.treeline + 6, banded);
        const [low, top] = TREE_SIZE[kind];
        plants.push(makePlant(kind, x, h, z, uniform(rng, low, top) * shrink, variant, rng));
        continue;
      }
      if (d < 0.3 && slope < 0.45 && banded < ALTITUDE.treeline) meadows.push(x, h, z);
      const alpine = smoothstep(ALTITUDE.treeline - 10, ALTITUDE.rock, banded);
      const chances = d > 0.35 ? character.underTrees : character.open;
      let left = pick;
      let chosen: Exclude<PlantKind, TreeKind> | null = null;
      for (const [kind, chance] of Object.entries(chances) as [Exclude<PlantKind, TreeKind>, number][]) {
        const scaled = kind === "rock" ? chance + 0.1 * alpine + 0.08 * smoothstep(0.6, 1, slope) : chance * (1 - alpine);
        left -= scaled;
        if (left < 0) {
          chosen = kind;
          break;
        }
      }
      if (chosen === null && pick < 0.1 * alpine) chosen = "rock";
      if (chosen === null) continue;
      const [low, top] = SMALL_SIZE[chosen];
      const size = uniform(rng, low, top) + (chosen === "rock" ? 1.8 * alpine * rng.next() : 0);
      const flowerVariant = character.flowers[Math.floor(rng.next() * character.flowers.length)];
      plants.push(makePlant(chosen, x, h, z, size, chosen === "flowers" ? flowerVariant : variant, rng));
    }
  }

  let count = 0;
  for (let i = 0; i < REGIONS.length; i++) count += weights[i] * REGION_CHARACTER[REGIONS[i]].fireflies;
  const spots = Math.min(Math.round(count), meadows.length / 3);
  const fireflies = new Float32Array(spots * 3);
  for (let f = 0; f < spots; f++) {
    const at = Math.floor(rng.next() * (meadows.length / 3)) * 3;
    fireflies.set([meadows[at] + uniform(rng, -1.5, 1.5), meadows[at + 1] + uniform(rng, 0.5, 2.2), meadows[at + 2] + uniform(rng, -1.5, 1.5)], f * 3);
  }
  return { chunkX, chunkZ, plants, fireflies };
}


import { createRng, uniform, type Rng } from "@/shared/lib/seeded-random";
import { ALTITUDE, emptySample, type LandSample } from "./land";
import { PLANT_CHUNK } from "./life";
import { clamp, fbm, gradientNoise, smoothstep, type Noise2 } from "./noise";
import { FORAGE_KINDS, REGION_CHARACTER, REGIONS, type ForageKind, type PlantKind, type RegionWeights } from "./regions";
import { remembered, type World } from "./world";

/*
 * What there is to pick, and where: berries and mushrooms in patches, each
 * kind where it really grows. A plant chunk's forage is scattered from its own
 * seed, reading the land, the woods' density, how wet the ground is, the
 * region and the trees the chunk grows round each patch, so a spot always
 * grows the same thing and a patch of bilberries is under pines and spruce,
 * a ring of fly agarics under birches, cloudberries out on the wet open bog.
 * Some country is richer in a kind than the rest, so a good bilberry slope
 * or a chanterelle spot is worth remembering. Each spot has an id that never
 * changes (its chunk and its place in the chunk's list), which is all that
 * picking has to remember of it.
 *
 * When each kind is ripe follows the real year, by the day of the year
 * (0 is the first of January): nothing in winter, the first wild
 * strawberries in early summer, the berries through high summer, the
 * mushrooms from late summer through autumn, the funnel chanterelles last.
 */

export type ForageForm = "berry" | "mushroom";

export const FORAGE_FORM: Record<ForageKind, ForageForm> = {
  bilberry: "berry",
  lingonberry: "berry",
  "wild-strawberry": "berry",
  raspberry: "berry",
  cloudberry: "berry",
  chanterelle: "mushroom",
  porcini: "mushroom",
  "funnel-chanterelle": "mushroom",
  "fly-agaric": "mushroom",
};

/** The days of the year each kind is ripe, first to last, before a spot's own shift. */
export const SEASONS: Record<ForageKind, readonly [number, number]> = {
  "wild-strawberry": [172, 218],
  cloudberry: [190, 222],
  bilberry: [192, 248],
  raspberry: [200, 250],
  lingonberry: [228, 292],
  chanterelle: [188, 278],
  porcini: [212, 276],
  "fly-agaric": [222, 292],
  "funnel-chanterelle": [250, 325],
};

/** How many days a spot's season comes early or late, at most, so a season begins and ends spot by spot. */
export const SEASON_SHIFT = 6;
export const DAYS_IN_YEAR = 365;

/** The day of the year a running count of days falls on. */
export function dayOfYear(day: number): number {
  return ((Math.floor(day) % DAYS_IN_YEAR) + DAYS_IN_YEAR) % DAYS_IN_YEAR;
}

/** Whether a kind is ripe on a day of the year, for a spot whose season is shifted by `shift` days. */
export function inSeason(kind: ForageKind, day: number, shift = 0): boolean {
  const [first, last] = SEASONS[kind];
  const d = dayOfYear(day);
  return d >= first + shift && d <= last + shift;
}

/** How many shapes each kind comes in. */
export const FORAGE_VARIANTS = 2;

export interface ForageSpot {
  /** Its chunk and its place in the chunk's list: never changes. */
  id: string;
  kind: ForageKind;
  x: number;
  /** The ground under it. */
  y: number;
  z: number;
  /** Its size against its kind's usual, about 1. */
  size: number;
  /** Its turn about the vertical, in radians. */
  turn: number;
  variant: number;
  /** How many days its season comes late (or early, below 0). */
  shift: number;
}

export interface ForageChunk {
  chunkX: number;
  chunkZ: number;
  spots: ForageSpot[];
}

/** What forage reads from the world. */
export type ForageGround = Pick<World, "seed" | "sampleAt" | "regionAt" | "woodlandAt" | "plantsIn">;

/** The ground a patch grows on, each 0 to 1. */
export interface Habitat {
  /** How thick the woods are. */
  woods: number;
  /** The shares of the trees round about: spruce and fir, Scots pine, birch and aspen, and the broadleaves. */
  spruce: number;
  pine: number;
  birch: number;
  broadleaf: number;
  wet: number;
  /** Wet, open, low-lying ground just above the water: a bog. */
  bog: number;
  /** Above the treeline. */
  alpine: number;
}

const TREE_GROUP: Partial<Record<PlantKind, "spruce" | "pine" | "birch" | "broadleaf">> = {
  conifer: "spruce",
  pine: "pine",
  birch: "birch",
  aspen: "birch",
  broadleaf: "broadleaf",
  maple: "broadleaf",
};

/** How well a kind's ground suits it, 0 to about 1. */
export function suitability(kind: ForageKind, h: Habitat): number {
  const conifer = h.spruce + h.pine;
  const open = 1 - h.woods;
  // Sunny edges: the margin of a wood and the clearings in it, best halfway between open and closed.
  const edge = clamp(4 * h.woods * (1 - h.woods), 0, 1) * (1 - h.alpine);
  switch (kind) {
    case "bilberry":
      return h.woods * conifer * (1 - 0.6 * h.bog);
    case "lingonberry":
      return (1 - h.wet) * (0.75 * h.woods * h.pine + 0.22 * open * (1 - h.bog)) * (1 - 0.5 * h.alpine);
    case "wild-strawberry":
      return edge * (1 - 0.7 * h.wet);
    case "raspberry":
      return edge * (1 - 0.4 * h.wet) * (1 - h.bog);
    case "cloudberry":
      return open * h.bog * 1.6;
    case "chanterelle":
      return h.woods * Math.min(1, 1.3 * (h.birch + h.spruce)) * (1 - 0.5 * h.bog);
    case "porcini":
      // Mixed woods: conifers and broadleaves or birch together.
      return h.woods * Math.min(1, 2.5 * Math.min(conifer, h.birch + h.broadleaf)) * (1 - h.bog);
    case "funnel-chanterelle":
      return 1.6 * h.woods * smoothstep(0.3, 0.75, h.spruce) * smoothstep(0.25, 0.55, h.wet);
    case "fly-agaric":
      return h.woods * smoothstep(0.2, 0.7, h.birch);
  }
}

interface PatchShape {
  /** How far the patch spreads from its middle, in metres. */
  radius: number;
  /** How many grow in a rich patch and a thin one. */
  count: readonly [number, number];
  /** How close two may grow, in metres. */
  spacing: number;
}

const PATCH: Record<ForageKind, PatchShape> = {
  bilberry: { radius: 7, count: [10, 26], spacing: 0.7 },
  lingonberry: { radius: 6, count: [8, 20], spacing: 0.55 },
  "wild-strawberry": { radius: 2.8, count: [4, 9], spacing: 0.4 },
  raspberry: { radius: 3.2, count: [3, 7], spacing: 0.8 },
  cloudberry: { radius: 5, count: [5, 12], spacing: 0.5 },
  chanterelle: { radius: 3.5, count: [3, 8], spacing: 0.45 },
  porcini: { radius: 3.5, count: [2, 5], spacing: 0.7 },
  "funnel-chanterelle": { radius: 3, count: [4, 9], spacing: 0.4 },
  "fly-agaric": { radius: 4.5, count: [2, 6], spacing: 0.7 },
};

/** How far a patch can reach beyond its chunk, in metres. */
export const PATCH_REACH = Math.max(...Object.values(PATCH).map((p) => p.radius));

/** Where a patch might grow, per chunk: each takes the kind its ground suits best, or nothing. */
const PATCH_TRIES = 12;
/** How readily a suitable spot holds a patch. */
const PATCH_RATE = 1.5;
/** Trees within this many metres of a patch's middle say what wood it is in. */
const TREE_REACH = 10;
/** Nothing grows this close to a trunk. */
const TRUNK_CLEAR = 0.6;

interface Tree {
  x: number;
  z: number;
  group: "spruce" | "pine" | "birch" | "broadleaf";
}

/** A rock or bush already standing there, which nothing grows inside: where it is and how far it reaches. */
interface Obstacle {
  x: number;
  z: number;
  reach: number;
}

/** How far a rock or bush of size 1 reaches, in metres. */
const OBSTACLE_REACH: Partial<Record<PlantKind, number>> = { rock: 0.6, bush: 0.5, heather: 0.4 };

function treesRound(ground: ForageGround, chunkX: number, chunkZ: number): { trees: Tree[]; obstacles: Obstacle[] } {
  const out: Tree[] = [];
  const obstacles: Obstacle[] = [];
  const margin = TREE_REACH + PATCH_REACH;
  const x0 = chunkX * PLANT_CHUNK - margin;
  const x1 = (chunkX + 1) * PLANT_CHUNK + margin;
  const z0 = chunkZ * PLANT_CHUNK - margin;
  const z1 = (chunkZ + 1) * PLANT_CHUNK + margin;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      for (const p of ground.plantsIn(chunkX + dx, chunkZ + dz).plants) {
        const group = TREE_GROUP[p.kind];
        if (p.x < x0 || p.x > x1 || p.z < z0 || p.z > z1) continue;
        if (group) out.push({ x: p.x, z: p.z, group });
        const reach = OBSTACLE_REACH[p.kind];
        if (reach !== undefined) obstacles.push({ x: p.x, z: p.z, reach: reach * p.size });
      }
    }
  }
  return { trees: out, obstacles };
}

const slopeSample = emptySample();

/** The steepness of the ground at a point. */
function slopeAt(ground: ForageGround, x: number, z: number): number {
  const e = 2;
  const s = slopeSample;
  const hx = ground.sampleAt(x + e, z, s).height - ground.sampleAt(x - e, z, s).height;
  const hz = ground.sampleAt(x, z + e, s).height - ground.sampleAt(x, z - e, s).height;
  return Math.hypot(hx, hz) / (2 * e);
}

/** Whether anything to pick can grow on the ground at a point: dry land below the bare rock, not too steep. */
function growable(land: LandSample, slope: number): boolean {
  return land.height > land.water + 0.15 && land.river < 0.02 && land.height - land.bands < ALTITUDE.rock && slope < 0.7;
}

function habitatAt(ground: ForageGround, x: number, z: number, land: LandSample, weights: RegionWeights, slope: number, trees: readonly Tree[]): Habitat {
  const shares = { spruce: 0, pine: 0, birch: 0, broadleaf: 0 };
  let total = 0;
  for (const t of trees) {
    const d = Math.hypot(t.x - x, t.z - z);
    if (d > TREE_REACH) continue;
    const w = 1 - d / TREE_REACH;
    shares[t.group] += w;
    total += w;
  }
  if (total > 0) for (const g of ["spruce", "pine", "birch", "broadleaf"] as const) shares[g] /= total;
  const woods = ground.woodlandAt(x, z, land, weights, slope);
  const wet = land.wetness;
  const low = 1 - smoothstep(1, 6, land.height - land.water);
  return {
    woods,
    ...shares,
    wet,
    bog: smoothstep(0.45, 0.8, wet) * low * (1 - smoothstep(0.15, 0.4, slope)),
    alpine: smoothstep(ALTITUDE.treeline - 10, ALTITUDE.treeline + 30, land.height - land.bands),
  };
}

/** Which of some weighted choices a roll from 0 to 1 lands on. */
function weightedPick(roll01: number, scores: readonly number[]): number {
  const total = scores.reduce((a, b) => a + b, 0);
  let roll = roll01 * total;
  for (let i = 0; i < scores.length; i++) {
    roll -= scores[i];
    if (roll < 0) return i;
  }
  return scores.length - 1;
}

export interface Forage {
  /** What grows in a plant chunk to be picked. */
  spotsIn: (chunkX: number, chunkZ: number) => ForageChunk;
  /** Every spot within `radius` metres of a point (along the ground). */
  spotsNear: (x: number, z: number, radius: number) => ForageSpot[];
}

/** How many chunks' forage is kept once worked out. */
const KEPT_CHUNKS = 512;

export function makeForage(ground: ForageGround): Forage {
  const richness: Record<ForageKind, Noise2> = Object.fromEntries(FORAGE_KINDS.map((k) => [k, gradientNoise(`${ground.seed}/forage/${k}`)])) as Record<ForageKind, Noise2>;
  const chunkOf = remembered(KEPT_CHUNKS, (key) => {
    const [cx, cz] = key.split(",").map(Number);
    return scatterForage(ground, richness, cx, cz);
  });
  const spotsIn = (chunkX: number, chunkZ: number) => chunkOf(`${chunkX},${chunkZ}`);
  return {
    spotsIn,
    spotsNear(x, z, radius) {
      const out: ForageSpot[] = [];
      const reach = radius + PATCH_REACH;
      for (let cz = Math.floor((z - reach) / PLANT_CHUNK); cz <= Math.floor((z + reach) / PLANT_CHUNK); cz++) {
        for (let cx = Math.floor((x - reach) / PLANT_CHUNK); cx <= Math.floor((x + reach) / PLANT_CHUNK); cx++) {
          for (const spot of spotsIn(cx, cz).spots) if (Math.hypot(spot.x - x, spot.z - z) <= radius) out.push(spot);
        }
      }
      return out;
    },
  };
}

/** Some country is richer in a kind than the rest: about 0.2 to 1.8 times the usual. */
function richnessAt(noise: Noise2, x: number, z: number): number {
  return 0.2 + 1.6 * smoothstep(-0.45, 0.45, fbm(noise, x / 260, z / 260, 2));
}

export function scatterForage(ground: ForageGround, richness: Record<ForageKind, Noise2>, chunkX: number, chunkZ: number): ForageChunk {
  const rng = createRng(`${ground.seed}/forage/${chunkX},${chunkZ}`);
  const { trees, obstacles } = treesRound(ground, chunkX, chunkZ);
  const s = emptySample();
  const weights = new Float32Array(REGIONS.length);
  const spots: ForageSpot[] = [];
  const scores = new Array<number>(FORAGE_KINDS.length);

  for (let t = 0; t < PATCH_TRIES; t++) {
    const cx = (chunkX + rng.next()) * PLANT_CHUNK;
    const cz = (chunkZ + rng.next()) * PLANT_CHUNK;
    const accept = rng.next();
    const choice = rng.next();
    const patchSeed = rng.next();
    const land = ground.sampleAt(cx, cz, s);
    const slope = slopeAt(ground, cx, cz);
    if (!growable(land, slope)) continue;
    ground.regionAt(cx, cz, land, weights);
    const habitat = habitatAt(ground, cx, cz, land, weights, slope, trees);
    FORAGE_KINDS.forEach((kind, k) => {
      let plenty = 0;
      for (let r = 0; r < REGIONS.length; r++) plenty += weights[r] * (REGION_CHARACTER[REGIONS[r]].forage[kind] ?? 0);
      scores[k] = suitability(kind, habitat) * plenty * richnessAt(richness[kind], cx, cz);
    });
    if (scores.every((score) => score <= 0)) continue;
    const kind = FORAGE_KINDS[weightedPick(choice, scores)];
    const score = scores[FORAGE_KINDS.indexOf(kind)];
    if (accept >= Math.min(0.95, score * PATCH_RATE)) continue;
    growPatch(ground, createRng(`${ground.seed}/forage/${chunkX},${chunkZ}/${t}/${patchSeed}`), kind, cx, cz, Math.min(1, score), trees, obstacles, spots, chunkX, chunkZ);
  }
  return { chunkX, chunkZ, spots };
}

function growPatch(ground: ForageGround, rng: Rng, kind: ForageKind, cx: number, cz: number, plenty: number, trees: readonly Tree[], obstacles: readonly Obstacle[], spots: ForageSpot[], chunkX: number, chunkZ: number): void {
  const shape = PATCH[kind];
  const near = trees.filter((t) => Math.hypot(t.x - cx, t.z - cz) < shape.radius + TRUNK_CLEAR);
  const inTheWay = obstacles.filter((o) => Math.hypot(o.x - cx, o.z - cz) < shape.radius + o.reach + 0.3);
  const [few, many] = shape.count;
  const wanted = Math.round(few + (many - few) * plenty * rng.next() ** 0.5);
  const s = emptySample();
  const mine: ForageSpot[] = [];
  const shift = Math.round(uniform(rng, -SEASON_SHIFT, SEASON_SHIFT));
  for (let tries = 0; tries < wanted * 3 && mine.length < wanted; tries++) {
    // Thicker towards the middle, as a patch is.
    const angle = rng.next() * Math.PI * 2;
    const out = shape.radius * Math.sqrt(rng.next()) * (0.4 + 0.6 * rng.next());
    const x = cx + Math.cos(angle) * out;
    const z = cz + Math.sin(angle) * out;
    const size = uniform(rng, 0.8, 1.2);
    const turn = rng.next() * Math.PI * 2;
    const variant = Math.floor(rng.next() * FORAGE_VARIANTS);
    const dayShift = clamp(shift + Math.round(uniform(rng, -2, 2)), -SEASON_SHIFT, SEASON_SHIFT);
    if (near.some((t) => Math.hypot(t.x - x, t.z - z) < TRUNK_CLEAR)) continue;
    if (inTheWay.some((o) => Math.hypot(o.x - x, o.z - z) < o.reach + 0.3)) continue;
    if (mine.some((o) => Math.hypot(o.x - x, o.z - z) < shape.spacing)) continue;
    const land = ground.sampleAt(x, z, s);
    if (!growable(land, slopeAt(ground, x, z))) continue;
    mine.push({ id: `${chunkX},${chunkZ}/${spots.length + mine.length}`, kind, x, y: land.height, z, size, turn, variant, shift: dayShift });
  }
  spots.push(...mine);
}

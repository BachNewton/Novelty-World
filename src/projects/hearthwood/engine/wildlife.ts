import { createRng, type Rng } from "@/shared/lib/seeded-random";
import { emptySample, type LandSample } from "./land";
import { PLANT_CHUNK, type Plant } from "./life";
import { PLACE_CELL } from "./places";
import { REGIONS, type PlantKind } from "./regions";
import { curveAt, type Curve } from "./seasons";
import type { World } from "./world";

/*
 * The forest's wild animals by area, and the times of day and year they
 * keep. Like the strays, each of the places' cells holds a few forest
 * friends or none, from its own seed and its land alone, each where its
 * kind really lives: red squirrels in the conifer woods, each with the tree
 * it runs up; mountain hares out on the heath and the open fells; roe deer
 * at the woods' edges, with a meadow to graze at dawn and dusk and a bed in
 * the trees for the day, sometimes a doe with a second deer. The songbirds
 * perch in the trees and on the rocks round a point, and butterflies dance
 * over the flowers of each plant chunk, by the same seeds. Pure, and knowing
 * nothing of how any of it looks.
 */

export const FRIEND_SPECIES = ["squirrel", "hare", "deer"] as const;
/** The forest friends: they stay home, but come to know Elliott. */
export type FriendSpecies = (typeof FRIEND_SPECIES)[number];

/** The trunk a squirrel runs up: where it stands, how wide it is at the foot, and how tall the tree is. */
export interface Trunk {
  x: number;
  z: number;
  /** The ground at its foot. */
  y: number;
  radius: number;
  height: number;
  /** How far up its trunk is bare of branches, in metres: as high as a squirrel climbs. */
  bare: number;
}

export interface Friend {
  /** Its cell and place in it, what Elliott's knowing it is kept under. */
  id: string;
  species: FriendSpecies;
  seed: string;
  home: { x: number; z: number };
  roam: number;
  /** A squirrel's tree. */
  trunk: Trunk | null;
  /** A deer's bed in the woods, where it lies up through the day. */
  bed: { x: number; z: number } | null;
}

/** What finding the forest's animals asks of the world. */
export type WildGround = Pick<World, "seed" | "sampleAt" | "regionAt" | "woodlandAt" | "plantsIn">;

export const FRIEND_CELL = PLACE_CELL;

const HEATH = REGIONS.indexOf("heath");
const HIGHLANDS = REGIONS.indexOf("highlands");

/** How thick a tree's trunk is at its foot and how far up it is bare, as shares of its height, for the trees a squirrel climbs. */
const CLIMBABLE: Partial<Record<PlantKind, { radius: number; bare: number; liking: number }>> = {
  pine: { radius: 0.035, bare: 0.62, liking: 1 },
  birch: { radius: 0.03, bare: 0.4, liking: 0.55 },
  aspen: { radius: 0.03, bare: 0.4, liking: 0.5 },
  broadleaf: { radius: 0.05, bare: 0.3, liking: 0.45 },
  maple: { radius: 0.05, bare: 0.28, liking: 0.4 },
  conifer: { radius: 0.04, bare: 0.18, liking: 0.15 },
};

interface Spot {
  wood: number;
  open: number;
  heath: number;
  conifer: number;
  high: boolean;
}

/** What a point is like to a wild animal; null on water, cliffs or bare rock. */
function spotAt(ground: WildGround, x: number, z: number, s: LandSample, scratch: LandSample): Spot | null {
  ground.sampleAt(x, z, s);
  if (s.height - s.water < 0.5 || s.river > 0.05) return null;
  const e = 1.5;
  const dx = ground.sampleAt(x + e, z, scratch).height - ground.sampleAt(x - e, z, scratch).height;
  const dz = ground.sampleAt(x, z + e, scratch).height - ground.sampleAt(x, z - e, scratch).height;
  const slope = Math.hypot(dx, dz) / (2 * e);
  if (slope > 0.55) return null;
  const weights = ground.regionAt(x, z, s);
  const wood = ground.woodlandAt(x, z, s, weights, slope);
  return { wood, open: 1 - wood, heath: weights[HEATH], conifer: weights[HIGHLANDS] + 0.5 * weights[REGIONS.indexOf("birchvale")], high: s.mountainous > 0.45 && wood < 0.1 };
}

/** The best spot in a cell for a liking, from a scatter of tries. */
function bestSpot(ground: WildGround, rng: Rng, x0: number, z0: number, liking: (spot: Spot) => number): { x: number; z: number; score: number } | null {
  const s = emptySample();
  const scratch = emptySample();
  let best: { x: number; z: number; score: number } | null = null;
  for (let k = 0; k < 12; k++) {
    const x = x0 + 18 + rng.next() * (FRIEND_CELL - 36);
    const z = z0 + 18 + rng.next() * (FRIEND_CELL - 36);
    const spot = spotAt(ground, x, z, s, scratch);
    if (!spot) continue;
    const score = liking(spot) + rng.next() * 0.15;
    if (best === null || score > best.score) best = { x, z, score };
  }
  return best;
}

/** The likeliest tree for a squirrel near a spot: a pine above all, with its trunk. */
function trunkNear(ground: WildGround, x: number, z: number): Trunk | null {
  let best: { plant: Plant; score: number } | null = null;
  for (let cz = Math.floor((z - 30) / PLANT_CHUNK); cz <= Math.floor((z + 30) / PLANT_CHUNK); cz++) {
    for (let cx = Math.floor((x - 30) / PLANT_CHUNK); cx <= Math.floor((x + 30) / PLANT_CHUNK); cx++) {
      for (const plant of ground.plantsIn(cx, cz).plants) {
        const kind = CLIMBABLE[plant.kind];
        if (!kind || plant.size < 6) continue;
        const d = Math.hypot(plant.x - x, plant.z - z);
        if (d > 30) continue;
        const score = kind.liking - d / 40;
        if (best === null || score > best.score) best = { plant, score };
      }
    }
  }
  if (!best) return null;
  const { plant } = best;
  const kind = CLIMBABLE[plant.kind];
  if (!kind) return null;
  const height = plant.size * plant.stretch;
  return { x: plant.x, z: plant.z, y: plant.y, radius: kind.radius * plant.size / Math.sqrt(plant.stretch), height, bare: Math.max(2, height * kind.bare * 0.85) };
}

/** A deer's bed: the thickest woods within a short walk of its meadow. */
function bedNear(ground: WildGround, rng: Rng, x: number, z: number): { x: number; z: number } {
  const s = emptySample();
  const scratch = emptySample();
  let best = { x, z, wood: -1 };
  for (let k = 0; k < 10; k++) {
    const angle = rng.next() * Math.PI * 2;
    const r = 18 + rng.next() * 25;
    const bx = x + Math.cos(angle) * r;
    const bz = z + Math.sin(angle) * r;
    const spot = spotAt(ground, bx, bz, s, scratch);
    if (spot && spot.wood > best.wood) best = { x: bx, z: bz, wood: spot.wood };
  }
  return { x: best.x, z: best.z };
}

/** How likely a cell is to hold each friend. */
const CHANCE: Record<FriendSpecies, number> = { squirrel: 0.55, hare: 0.45, deer: 0.4 };

/** The forest friends of one cell, each where its kind lives: none, one or a few. */
export function friendsInCell(ground: WildGround, cellX: number, cellZ: number): Friend[] {
  const rng = createRng(`${ground.seed}/friends/${cellX},${cellZ}`);
  const x0 = cellX * FRIEND_CELL;
  const z0 = cellZ * FRIEND_CELL;
  const out: Friend[] = [];
  const id = (n: number) => `${cellX},${cellZ}/f${n}`;
  const seed = (n: number) => `${ground.seed}/friend/${cellX},${cellZ}/${n}`;

  // A red squirrel where the woods are thick and coniferous, at the foot of its tree.
  if (rng.next() < CHANCE.squirrel) {
    const spot = bestSpot(ground, rng, x0, z0, (s) => s.wood * (0.4 + s.conifer));
    const trunk = spot && spot.score > 0.45 ? trunkNear(ground, spot.x, spot.z) : null;
    if (trunk) out.push({ id: id(0), species: "squirrel", seed: seed(0), home: { x: trunk.x, z: trunk.z }, roam: 7, trunk, bed: null });
  }
  // A mountain hare out in the open: the heath, or the bare fells above the trees.
  if (rng.next() < CHANCE.hare) {
    const spot = bestSpot(ground, rng, x0, z0, (s) => s.open * (0.2 + s.heath + (s.high ? 0.9 : 0)) - s.wood);
    if (spot && spot.score > 0.35) out.push({ id: id(1), species: "hare", seed: seed(1), home: { x: spot.x, z: spot.z }, roam: 16, trunk: null, bed: null });
  }
  // Roe deer at a meadow by the woods' edge, with a bed back in the trees; a doe now and then with a second deer.
  if (rng.next() < CHANCE.deer) {
    const spot = bestSpot(ground, rng, x0, z0, (s) => 1 - Math.abs(s.wood - 0.18) * 3);
    if (spot && spot.score > 0.4) {
      const bed = bedNear(ground, rng, spot.x, spot.z);
      out.push({ id: id(2), species: "deer", seed: seed(2), home: { x: spot.x, z: spot.z }, roam: 22, trunk: null, bed });
      if (rng.next() < 0.4) out.push({ id: id(3), species: "deer", seed: seed(3), home: { x: spot.x + 4, z: spot.z + 3 }, roam: 22, trunk: null, bed: { x: bed.x + 3, z: bed.z - 2 } });
    }
  }
  return out;
}

/** Every forest friend whose home is within `radius` of a point. */
export function friendsNear(ground: WildGround, x: number, z: number, radius: number, inCell: (cellX: number, cellZ: number) => Friend[] = (cx, cz) => friendsInCell(ground, cx, cz)): Friend[] {
  const out: Friend[] = [];
  for (let cz = Math.floor((z - radius) / FRIEND_CELL); cz <= Math.floor((z + radius) / FRIEND_CELL); cz++) {
    for (let cx = Math.floor((x - radius) / FRIEND_CELL); cx <= Math.floor((x + radius) / FRIEND_CELL); cx++) {
      for (const friend of inCell(cx, cz)) if (Math.hypot(friend.home.x - x, friend.home.z - z) <= radius) out.push(friend);
    }
  }
  return out;
}

const d = (month: number, day: number) => {
  const starts = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return starts[month - 1] + day - 1;
};

/** How white a mountain hare is through the year: white all winter, browning through April and May, whitening again from late October. */
const HARE_WHITE: Curve = [
  [d(1, 1), 1],
  [d(3, 25), 1],
  [d(5, 10), 0],
  [d(10, 15), 0],
  [d(11, 25), 1],
];
/** How far into its winter coat a squirrel or a roe deer is: moulting to summer's red in May, back to winter's grey-brown through October. */
const WINTER_COAT: Curve = [
  [d(1, 1), 1],
  [d(4, 15), 1],
  [d(5, 25), 0],
  [d(9, 20), 0],
  [d(10, 30), 1],
];

/** The coats the season gives on a real day of the year. */
export function coatSeason(realDayOfYear: number): { winter: number; white: number } {
  return { winter: curveAt(WINTER_COAT, realDayOfYear), white: curveAt(HARE_WHITE, realDayOfYear) };
}

/** How much roe deer are out grazing, 0 (bedded in the woods) to 1: round dawn and dusk, by the sun's height in degrees. */
export function deerAbroad(sunElevation: number): number {
  // Out from a little before sunrise until the sun is well up, and again as it sinks until the dark.
  const twilight = 1 - Math.min(1, Math.abs(sunElevation - 2) / 12);
  return Math.max(0, twilight);
}

/** How much the songbirds are about, 0 (roosting) to 1: the dawn chorus loudest, quiet through the night and in the rain. */
export function birdsAbout(sunElevation: number, precipitation: number): number {
  const day = Math.min(1, Math.max(0, (sunElevation + 6) / 8));
  const chorus = 0.3 * Math.max(0, 1 - Math.abs(sunElevation - 4) / 10);
  return Math.min(1, day * 0.8 + chorus) * (1 - 0.75 * Math.min(1, precipitation * 1.5));
}

/** How many butterflies are on the wing, 0 to 1: summer's warm, dry, bright days only. */
export function butterfliesAbout(realDayOfYear: number, sunElevation: number, temperature: number, precipitation: number, cloud: number): number {
  const season = Math.max(0, 1 - Math.abs(realDayOfYear - d(7, 10)) / 55);
  const sun = Math.min(1, Math.max(0, (sunElevation - 12) / 15));
  const warm = Math.min(1, Math.max(0, (temperature - 13) / 6));
  return Math.min(1, season * 1.4) * sun * warm * (1 - Math.min(1, precipitation * 3)) * (1 - 0.6 * cloud);
}

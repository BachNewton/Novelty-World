import { CAST, heightOf } from "./cast";
import { POLY_MODELS, type PolyModel } from "./models/poly-models";
import type { Point } from "./types";

/**
 * The island, laid out once from a seed, pure: the same for every player.
 * Three areas: a storm-wrecked beach round the shore and the south, grandpa's
 * backyard in the middle, a wizard's castle courtyard in the north. The big
 * landmarks are placed by hand; every other piece of junk is used once,
 * heaped up in its area (a few strays wash up anywhere). Each pair's home
 * stands in one of three villages, one per area, and the animals hide
 * against the junk.
 */

export type Area = "beach" | "yard" | "castle";

/** The island is an ellipse this wide and deep, in metres from its middle. */
export const ISLAND = { rx: 95, rz: 82 } as const;

export const SPAWN: Point = { x: 0, z: 16 };

export function onIsland(p: Point, margin = 0): boolean {
  return (p.x / (ISLAND.rx - margin)) ** 2 + (p.z / (ISLAND.rz - margin)) ** 2 <= 1;
}

/** Which area a point is in. The borders wander, so the areas meet like country, not like a map's grid. */
export function areaAt(p: Point): Area {
  const wander = Math.sin(p.x / 9) * 3 + Math.sin(p.x / 23 + 1) * 4;
  if (p.z > 30 + wander || (p.x / ISLAND.rx) ** 2 + (p.z / ISLAND.rz) ** 2 > 0.7 + wander / 100) return "beach";
  if (p.z < -26 + wander) return "castle";
  return "yard";
}

/** A piece of junk where it stands. `radius` is what a player bumps into; 0 walks through. */
export interface Placed {
  model: string;
  x: number;
  z: number;
  turn: number;
  height: number;
  /** Half its widest side, for keeping things apart. */
  reach: number;
  radius: number;
}

/** A pair's home: a basket with the pair's picture beside it, facing `turn`. */
export interface Home {
  species: string;
  x: number;
  z: number;
  turn: number;
}

/** How far from its middle a home takes an animal put down there. */
export const HOME_RADIUS = 0.9;
/** What a home's basket blocks. */
export const BASKET_RADIUS = 0.55;

interface Village {
  area: Area;
  centre: Point;
}

const VILLAGES: readonly Village[] = [
  { area: "beach", centre: { x: 0, z: 50 } },
  { area: "yard", centre: { x: 0, z: -2 } },
  { area: "castle", centre: { x: 12, z: -48 } },
];
const VILLAGE_COLUMNS = 10;
const HOME_SPACING = { x: 2.6, z: 3 } as const;

const LANDMARKS: readonly { model: string; x: number; z: number; turn: number }[] = [
  { model: "aeuJiuWdknv", x: -36, z: -52, turn: 0.4 }, // Castle
  { model: "bk72ChfpGo-", x: 66, z: 44, turn: 0 }, // Lighthouse
  { model: "0QTh_KUZRYE", x: -32, z: -2, turn: 1.2 }, // Barn
  { model: "4MomdpI0Jx6", x: -42, z: 8, turn: 0 }, // Silo
  { model: "ctIRaIM3zXu", x: 34, z: -6, turn: -0.6 }, // Windmill
];

/** Which area each kind of junk lives in; the rest go anywhere. */
const CATEGORY_AREA: Partial<Record<string, Area>> = {
  "vehicles & wrecks": "beach",
  "food & giant snacks": "beach",
  "toys, games & sport": "beach",
  "hats & wearables": "beach",
  "farm & yard": "yard",
  "fences & gates": "yard",
  "furniture & household": "yard",
  "odd household": "yard",
  "street & signs": "yard",
  "music & electronics": "yard",
  "fantasy & curiosities": "castle",
  "space & sci-fi": "castle",
  "structures & rooms": "castle",
};
/** The share of junk that washes up in some other area, for surprises. */
const STRAY_SHARE = 0.2;
const HEAPS_PER_AREA = 16;

/** mulberry32: a small seeded generator, so the island is the same everywhere. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function placed(model: PolyModel, x: number, z: number, turn: number): Placed {
  const height = heightOf(model.id);
  const reach = 0.5 * Math.max(model.footprint.x, model.footprint.z) * height;
  // Low things are stepped over; anything knee-high or more is in the way.
  return { model: model.id, x, z, turn, height, reach, radius: height >= 0.45 ? reach * 0.75 : 0 };
}

function modelById(id: string): PolyModel {
  const model = POLY_MODELS.find((m) => m.id === id);
  if (model === undefined) throw new Error(`whisker hollow: no model ${id}`);
  return model;
}

/**
 * Kinds of animal, in the order their homes stand: each kind's homes side by
 * side in its area's village, so all the dogs live down one lane. A pair is the
 * kind whose word in its name is longest ("squirrel monkey" before "squirrel").
 */
const KINDS: readonly { area: Area; words: readonly string[] }[] = [
  { area: "beach", words: ["crab", "lobster", "crawfish", "crayfish", "starfish", "seahorse", "urchin", "clam", "octopus", "squid", "cuttlefish", "jellyfish"] },
  { area: "beach", words: ["fish", "goldfish", "pufferfish", "piranha", "eel", "trout", "kingfish", "halibut"] },
  { area: "beach", words: ["turtle", "frog", "salamander", "otter", "beaver", "snail", "slug"] },
  { area: "beach", words: ["gull", "seagull", "penguin", "duck", "duckling", "goose", "loon", "stilt"] },
  { area: "yard", words: ["cat", "kitten", "wildcat"] },
  { area: "yard", words: ["dog", "beagle", "poodle", "puppy", "shiba inu", "fox"] },
  { area: "yard", words: ["mouse", "rat", "woodrat", "hamster", "gerbil", "jerboa", "shrew", "gopher", "chipmunk", "squirrel"] },
  { area: "yard", words: ["rabbit", "jackrabbit"] },
  { area: "yard", words: ["hen", "rooster", "chick", "quail", "turkey", "pheasant", "pig"] },
  { area: "yard", words: ["bird", "sparrow", "dove", "hummingbird", "bluebird", "wren", "swallow", "cliffswallow", "thrasher", "woodpecker"] },
  { area: "yard", words: ["raccoon", "skunk", "hedgehog", "badger", "weasel", "ferret", "bear cub"] },
  { area: "castle", words: ["owl"] },
  { area: "castle", words: ["bat"] },
  { area: "castle", words: ["hawk", "goshawk", "harrier", "roadrunner", "raven", "crow"] },
  { area: "castle", words: ["snake", "scorpion", "centipede", "earthworm", "caterpillar"] },
  { area: "castle", words: ["ant", "bee", "bumblebee", "wasp", "hornet", "fly", "cockroach", "beetle", "ladybug", "lady bug", "butterfly", "dragonfly", "grasshopper"] },
  { area: "castle", words: ["monkey", "capuchin", "squirrel monkey", "macaw", "parrot", "armadillo", "porcupine", "koala", "coati", "ocelot", "ring tailed cat"] },
];

function kindOf(name: string): number {
  const words = name.toLowerCase().split(/[^a-z]+/).join(" ");
  let best = -1;
  let bestLength = 0;
  KINDS.forEach((kind, i) => {
    for (const word of kind.words) {
      if (word.length > bestLength && ` ${words} `.includes(` ${word} `)) {
        best = i;
        bestLength = word.length;
      }
    }
  });
  if (best < 0) throw new Error(`whisker hollow: ${name} is no kind of animal the villages know`);
  return best;
}

function buildHomes(): Home[] {
  const sorted = CAST.map((pair) => ({ pair, kind: kindOf(pair.name) })).sort(
    (a, b) => a.kind - b.kind || a.pair.name.localeCompare(b.pair.name),
  );
  return VILLAGES.flatMap((village) => {
    const residents = sorted.filter((r) => KINDS[r.kind].area === village.area);
    const rows = Math.ceil(residents.length / VILLAGE_COLUMNS);
    return residents.map(({ pair }, slot) => {
      const col = slot % VILLAGE_COLUMNS;
      const row = Math.floor(slot / VILLAGE_COLUMNS);
      return {
        species: pair.id,
        x: village.centre.x + (col - (VILLAGE_COLUMNS - 1) / 2) * HOME_SPACING.x,
        z: village.centre.z + (row - (rows - 1) / 2) * HOME_SPACING.z,
        // Rows face alternately up and down the village, so every lane between them is lined with pictures.
        turn: row % 2 === 0 ? 0 : Math.PI,
      };
    });
  });
}

/** The villages' ground, kept clear of junk: each village's rectangle and a margin. */
function inVillage(p: Point, margin: number): boolean {
  return VILLAGE_BOUNDS.some(
    (v) => Math.abs(p.x - v.x) <= v.halfWidth + margin && Math.abs(p.z - v.z) <= v.halfDepth + margin,
  );
}

function randomPointIn(area: Area | null, random: () => number): Point {
  for (;;) {
    const p = { x: (random() * 2 - 1) * ISLAND.rx, z: (random() * 2 - 1) * ISLAND.rz };
    if (onIsland(p, 3) && (area === null || areaAt(p) === area)) return p;
  }
}

function clear(props: readonly Placed[], p: Point, reach: number): boolean {
  if (!onIsland(p, reach + 2) || inVillage(p, reach + 1.5) || Math.hypot(p.x - SPAWN.x, p.z - SPAWN.z) < reach + 4) return false;
  return props.every((o) => Math.hypot(o.x - p.x, o.z - p.z) >= o.reach + reach + 0.5);
}

function buildJunk(random: () => number): Placed[] {
  const props = LANDMARKS.map((l) => placed(modelById(l.model), l.x, l.z, l.turn));
  const landmarkIds = new Set(LANDMARKS.map((l) => l.model));
  const heaps: Record<Area, Point[]> = { beach: [], yard: [], castle: [] };
  for (const area of ["beach", "yard", "castle"] as const) {
    for (let i = 0; i < HEAPS_PER_AREA; i++) heaps[area].push(randomPointIn(area, random));
  }
  const junk = POLY_MODELS.filter((m) => m.kind === "junk" && !landmarkIds.has(m.id))
    .map((m) => ({ model: m, item: placed(m, 0, 0, 0) }))
    // The biggest first, while there is room for them.
    .sort((a, b) => b.item.reach - a.item.reach);
  for (const { model, item } of junk) {
    const home = CATEGORY_AREA[model.category];
    const area = home === undefined || random() < STRAY_SHARE ? (["beach", "yard", "castle"] as const)[Math.floor(random() * 3)] : home;
    // Big things stand on their own, wherever there is room; small things gather in heaps.
    const big = item.reach > 2.5;
    let spot: Point | null = null;
    for (let attempt = 0; attempt < 400 && spot === null; attempt++) {
      let p: Point;
      if (big) {
        p = randomPointIn(null, random);
      } else {
        const heap = heaps[area][Math.floor(random() * HEAPS_PER_AREA)];
        const angle = random() * Math.PI * 2;
        const distance = 1 + random() * 7;
        p = { x: heap.x + Math.cos(angle) * distance, z: heap.z + Math.sin(angle) * distance };
      }
      if (clear(props, p, item.reach)) spot = p;
    }
    if (spot === null) throw new Error(`whisker hollow: no room on the island for ${model.title} (${model.id})`);
    props.push({ ...item, x: spot.x, z: spot.z, turn: random() * Math.PI * 2 });
  }
  return props;
}

/** Spots tucked in against the junk, outside what it blocks and where a player can reach. */
function buildHidingSpots(props: readonly Placed[], random: () => number): Point[] {
  const spots: Point[] = [];
  for (const prop of props) {
    if (prop.height < 0.3) continue;
    const count = prop.reach > 2 ? 3 : prop.reach > 0.8 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2;
      const out = Math.max(prop.radius, prop.reach * 0.6) + 0.35;
      const p = { x: prop.x + Math.cos(angle) * out, z: prop.z + Math.sin(angle) * out };
      const free =
        onIsland(p, 1.5) &&
        !inVillage(p, 1) &&
        props.every((o) => Math.hypot(o.x - p.x, o.z - p.z) >= o.radius + 0.25) &&
        spots.every((s) => Math.hypot(s.x - p.x, s.z - p.z) >= 1.2);
      if (free) spots.push(p);
    }
  }
  return spots;
}

const HOMES = buildHomes();

/** Each village's middle and half its size, from the homes it holds. */
const VILLAGE_BOUNDS = VILLAGES.map((village) => {
  const rows = Math.ceil(HOMES.filter((h) => areaAt(h) === village.area).length / VILLAGE_COLUMNS);
  return { ...village.centre, halfWidth: (VILLAGE_COLUMNS * HOME_SPACING.x) / 2, halfDepth: (rows * HOME_SPACING.z) / 2 };
});

function build() {
  const random = seeded(2026);
  const homes = HOMES;
  const props = buildJunk(random);
  const spots = buildHidingSpots(props, random);
  return { homes, props, spots };
}

export const LEVEL: { readonly homes: readonly Home[]; readonly props: readonly Placed[]; readonly spots: readonly Point[] } = build();

export function homeOf(species: string): Home {
  const home = LEVEL.homes.find((h) => h.species === species);
  if (home === undefined) throw new Error(`whisker hollow: no home for ${species}`);
  return home;
}

/** The home a point is on, if any. */
export function homeAt(p: Point): Home | undefined {
  return LEVEL.homes.find((h) => Math.hypot(h.x - p.x, h.z - p.z) <= HOME_RADIUS);
}

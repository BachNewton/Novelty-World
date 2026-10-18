import type { PlantKind } from "../engine/regions";
import { TREE_KINDS } from "../engine/regions";
import { PLANT_CHUNK } from "../engine/life";
import type { World } from "../engine/world";

/*
 * Camp, the place Elliott's fire is: where it is pitched, or that it is on
 * their back, packed up. Every world has a home camp of its own (the
 * clearing the world made near its origin), where a new walk starts; from
 * there camp goes where Elliott goes. Packed up, it is carried as a bedroll
 * on their pack; anywhere on dry, gentle, open ground they can pitch it
 * again, the fire a few steps in front of them and laid out round it as the
 * home camp is, turned so they stand where they would at home. Ground too
 * wet, too steep or too cluttered (a tree, a rock, a bush, a patch of
 * berries, someone's home, a place) simply doesn't offer. Small ground
 * plants (flowers, heather, ferns) are no trouble: the scene parts them.
 *
 * Kept on the device under a versioned key of its own, one camp for each
 * world's seed, since a camp only means something in its own world.
 */

/** Where a camp stands: its fire's middle and ground, and how its things are turned round the fire (0 is the home camp's layout). */
export interface CampSite {
  x: number;
  y: number;
  z: number;
  turn: number;
}

/** Camp: where it stands, or, carried, where it was packed up from (where its resting companions wait). */
export interface Camp {
  site: CampSite;
  carried: boolean;
}

/** How far out from the fire a camp's things reach, in metres: the blanket's far end. */
export const CAMP_REACH = 4.6;
/** Where Elliott stands to the fire at a camp, as the home camp has it: round from the fire (cos to x, sin to z) and how far. */
export const BESIDE = { angle: Math.atan2(1.5, 3.4), out: Math.hypot(3.4, 1.5) } as const;

/** The most the ground may rise and fall across a camp, in metres: gentle enough to sit and sleep on. */
const MOST_SPREAD = 1.0;
/** Dry: the ground this far above the water everywhere under a camp, in metres, and no river. */
const ABOVE_WATER = 0.25;
/** Room kept round the camp's things from a tree's trunk (its crown), a rock's or a bush's middle (beyond its own size), and from anyone's home, in metres. */
const ROOM = { tree: 2.6, rock: 0.4, bush: 0.4, folk: 6, forage: 0.5 } as const;

const isTree = (kind: PlantKind) => (TREE_KINDS as readonly PlantKind[]).includes(kind);
/** The ground plants the scene parts round a camp. */
const PARTED: ReadonlySet<PlantKind> = new Set(["flowers", "heather", "fern"]);

/** The home camp, as a camp pitched where the world made it. */
export function homeCamp(world: Pick<World, "home">): Camp {
  const { home } = world;
  return { site: { x: home.x, y: home.y, z: home.z, turn: 0 }, carried: false };
}

/** Where Elliott stands beside a camp, facing its fire: where a walk starts. */
export function besideCamp(site: CampSite): { x: number; z: number; heading: number } {
  const a = BESIDE.angle + site.turn;
  const x = site.x + Math.cos(a) * BESIDE.out;
  const z = site.z + Math.sin(a) * BESIDE.out;
  return { x, z, heading: Math.atan2(site.x - x, site.z - z) };
}

/** Where camp would go if pitched now: its fire a few steps in front of Elliott, turned so they stand beside it as at home. The ground's height is the scene's to give. */
export function siteAhead(walker: { x: number; z: number; heading: number }): Omit<CampSite, "y"> {
  const x = walker.x + Math.sin(walker.heading) * BESIDE.out;
  const z = walker.z + Math.cos(walker.heading) * BESIDE.out;
  const elliott = Math.atan2(walker.z - z, walker.x - x);
  return { x, z, turn: elliott - BESIDE.angle };
}

export function packUp(camp: Camp): Camp {
  if (camp.carried) throw new Error("Camp is already packed up");
  return { site: camp.site, carried: true };
}

export function pitch(camp: Camp, site: CampSite): Camp {
  if (!camp.carried) throw new Error("Camp is pitched already: it has to be packed up first");
  return { site, carried: false };
}

/** What pitching asks of the world and the walk: the land, its plants and places, and whether forage or anyone's home stands near. */
export interface PitchGround {
  sampleAt: World["sampleAt"];
  plantsIn: World["plantsIn"];
  placesNear: World["placesNear"];
  /** Whether anything to pick lies within `radius` of a point. */
  forageNear: (x: number, z: number, radius: number) => boolean;
  /** Whether anyone stands, or has their home, within `radius` of a point. */
  folkNear: (x: number, z: number, radius: number) => boolean;
}

export type PitchTrouble = "wet" | "steep" | "cluttered";

/** The points a camp's ground is read at: the fire, and two rings out to its things' far reach. */
function groundPoints(x: number, z: number): { x: number; z: number }[] {
  const out = [{ x, z }];
  for (const [r, n] of [
    [2.4, 6],
    [CAMP_REACH - 0.2, 10],
  ] as const) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      out.push({ x: x + Math.cos(a) * r, z: z + Math.sin(a) * r });
    }
  }
  return out;
}

/** What, if anything, keeps camp from being pitched with its fire at a point; null where it can be. */
export function pitchTrouble(ground: PitchGround, x: number, z: number): PitchTrouble | null {
  let low = Infinity;
  let high = -Infinity;
  for (const p of groundPoints(x, z)) {
    const land = ground.sampleAt(p.x, p.z);
    if (land.height < land.water + ABOVE_WATER || land.river > 0.02) return "wet";
    low = Math.min(low, land.height);
    high = Math.max(high, land.height);
  }
  if (high - low > MOST_SPREAD) return "steep";

  const reach = CAMP_REACH + ROOM.tree;
  for (let cz = Math.floor((z - reach) / PLANT_CHUNK); cz <= Math.floor((z + reach) / PLANT_CHUNK); cz++) {
    for (let cx = Math.floor((x - reach) / PLANT_CHUNK); cx <= Math.floor((x + reach) / PLANT_CHUNK); cx++) {
      for (const plant of ground.plantsIn(cx, cz).plants) {
        if (PARTED.has(plant.kind)) continue;
        const room = isTree(plant.kind) ? ROOM.tree : plant.kind === "rock" ? ROOM.rock + plant.size * 0.6 : ROOM.bush + plant.size * 0.5;
        if (Math.hypot(plant.x - x, plant.z - z) < CAMP_REACH + room) return "cluttered";
      }
    }
  }
  for (const place of ground.placesNear(x, z, 120)) if (Math.hypot(place.x - x, place.z - z) < place.clearing + CAMP_REACH) return "cluttered";
  if (ground.forageNear(x, z, CAMP_REACH + ROOM.forage) || ground.folkNear(x, z, CAMP_REACH + ROOM.folk)) return "cluttered";
  return null;
}

/** Whether the scene parts a plant: a ground plant within a pitched camp's things. */
export function partedBy(site: { x: number; z: number }, plant: { kind: PlantKind; x: number; z: number }): boolean {
  return PARTED.has(plant.kind) && Math.hypot(plant.x - site.x, plant.z - site.z) < CAMP_REACH + 0.4;
}

export const CAMP_KEY = "hearthwood/camp/v1";

/** A camp as kept: its ground's height is the world's to give back. */
interface KeptCamp {
  x: number;
  z: number;
  turn: number;
  carried: boolean;
}

/** Every world's camp as kept, by its seed. */
export type KeptCamps = Record<string, KeptCamp>;

export function serializeCamps(camps: KeptCamps): string {
  return JSON.stringify(camps);
}

/** A kept record read back. Anything but the shape this key holds is a bug in what wrote it, and says so. */
export function parseCamps(text: string): KeptCamps {
  const data = JSON.parse(text) as unknown;
  if (typeof data !== "object" || data === null || Array.isArray(data)) throw new Error(`The kept camps under ${CAMP_KEY} aren't a camp for each world: ${text}`);
  const out: KeptCamps = {};
  for (const [seed, camp] of Object.entries(data)) {
    const { x, z, turn, carried } = (camp ?? {}) as Record<string, unknown>;
    if (typeof x !== "number" || typeof z !== "number" || typeof turn !== "number" || typeof carried !== "boolean" || ![x, z, turn].every(Number.isFinite)) {
      throw new Error(`The kept camp of world ${seed} isn't one: ${JSON.stringify(camp)}`);
    }
    out[seed] = { x, z, turn, carried };
  }
  return out;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readKept(): KeptCamps {
  let text: string | null = null;
  try {
    text = storage()?.getItem(CAMP_KEY) ?? null;
  } catch {
    // Storage that throws on reading keeps nothing: camp starts at home.
    return {};
  }
  return text === null ? {} : parseCamps(text);
}

/** A world's camp as kept on this device, or its home camp where nothing was. */
export function loadCamp(world: Pick<World, "seed" | "home" | "heightAt">): Camp {
  const kept = readKept()[world.seed] as KeptCamp | undefined;
  if (kept === undefined) return homeCamp(world);
  return { site: { x: kept.x, y: world.heightAt(kept.x, kept.z), z: kept.z, turn: kept.turn }, carried: kept.carried };
}

/** Keeps a world's camp on this device, beside every other world's. */
export function saveCamp(seed: string, camp: Camp | null): void {
  const kept = readKept();
  try {
    if (camp === null) delete kept[seed];
    else kept[seed] = { x: camp.site.x, z: camp.site.z, turn: camp.site.turn, carried: camp.carried };
    storage()?.setItem(CAMP_KEY, serializeCamps(kept));
  } catch {
    // A full or refused storage keeps nothing; camp stays where it is for this visit.
  }
}

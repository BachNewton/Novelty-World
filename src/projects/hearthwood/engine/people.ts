import { createRng, type Rng } from "@/shared/lib/seeded-random";
import { FIRST_STORY, STORIES, storyOf } from "../stories/library";
import type { FoundClue, MysteryStory, Story } from "../stories/story";
import { ALTITUDE, emptySample, type LandSample } from "./land";
import { PLANT_CHUNK } from "./life";
import { PLACE_CELL, type Place } from "./places";
import { TREE_KINDS, type PlaceKind, type PlantKind } from "./regions";
import type { Species } from "./strays";
import type { World } from "./world";

/*
 * The people of the land, by area. The world is cut into the places' cells,
 * and now and then a cell has someone in it, found from the cell's own seed
 * and its land alone, so a person is always where they were: a shepherd by a
 * seter, a traveller resting at a cairn or keeping a shrine's candle, a
 * fisher at a tarn or a lake shore, a sauna keeper by their hut on the
 * shore, a reindeer herder up on the fells by their tent, a beekeeper by
 * the hives at a meadow's edge, an old cottager at their cottage, a hiker
 * sat on a stone. About one cell in five has someone, more near camp, and
 * the cell camp is in always has its neighbour, a cottager a short walk
 * off, so the first walk out meets someone.
 *
 * Each person carries a story from the library, chosen by who they are and
 * where they stand, and whatever the story needs is placed with them: a lost
 * cat or dog somewhere round them (a stray of the person's own, found and
 * befriended like any other), the friend a note is carried to, a few
 * hundred metres off, or a mystery's clues, lying round them and their
 * homes on open, gentle ground. Who a person is to look at, and their name, come from
 * their seed in the gameplay and the art; this says only where they are.
 */

export const ROLES = ["shepherd", "beekeeper", "fisher", "herder", "sauna-keeper", "cottager", "traveller", "hiker"] as const;
export type Role = (typeof ROLES)[number];

/** What a person keeps by them: a few sheep, hives, a rowing boat, a sauna hut, a cottage, a tent, a stone to sit on. */
export const HOME_KINDS = ["sheep", "hives", "boat", "sauna", "cottage", "lavvu", "stone"] as const;
export type HomeKind = (typeof HOME_KINDS)[number];

export interface Home {
  kind: HomeKind;
  x: number;
  z: number;
  /** Its turn about the vertical: its front, local +z, faces this heading. */
  turn: number;
}

/** A person's lost cat or dog: a stray of their own, with a home it wanders round until it is found. */
export interface LostPet {
  id: string;
  species: Species;
  seed: string;
  home: { x: number; z: number };
  roam: number;
}

/** A mystery's clue as the world placed it, by the clue's id in its story. */
export interface PlacedClue {
  id: string;
  x: number;
  z: number;
  /** Its turn about the vertical. */
  turn: number;
}

export interface Person {
  /** Their cell and their place in it: what Elliott's acquaintance with them is kept under. */
  id: string;
  role: Role;
  seed: string;
  /** The story they carry, by its id in the library. */
  story: string;
  x: number;
  z: number;
  /** The way they face at rest (0 faces +z, as the walker's heading does). */
  heading: number;
  /** Seated this high above the ground (a bench, a stone), or null standing. */
  seat: number | null;
  homes: Home[];
  pet: LostPet | null;
  /** The other one of a carried note: where they stand, and their seed for their name. */
  partner: { id: string; seed: string; x: number; z: number } | null;
  /** Their mystery's clues that lie in the world, or none. */
  clues: PlacedClue[];
}

/** Who stands by each kind of place that has its own people. */
export const PLACE_PEOPLE: Partial<Record<PlaceKind, Role>> = { seter: "shepherd", cairn: "traveller", shrine: "traveller", tarn: "fisher" };
/** The roles met away from the places, wherever their ground is. */
export const GROUND_ROLES: readonly Role[] = ["fisher", "sauna-keeper", "herder", "beekeeper", "cottager", "hiker"];

/** What finding people asks of the world. */
export type PeopleGround = Pick<World, "seed" | "camp" | "sampleAt" | "regionAt" | "woodlandAt" | "placeIn" | "plantsIn">;

export const PEOPLE_CELL = PLACE_CELL;
/** How far from their own cell's people anything a cell places can be (a note's friend, camp's neighbour), in metres. */
export const PEOPLE_REACH = 520;

/** How far inside its cell a person keeps, in metres, so what they keep stays in the cell too. */
const MARGIN = 26;
/** How likely a cell is to hold each role, where its ground suits them. */
const CHANCE = {
  seter: 0.65,
  waypost: 0.32,
  tarn: 0.3,
  fisher: 0.16,
  sauna: 0.1,
  herder: 0.25,
  beekeeper: 0.08,
  cottager: 0.08,
  hiker: 0.02,
} as const;
/** Cells this near camp hold people this much more often, so the first walks meet someone. */
const NEAR_CAMP = { within: 900, boost: 2 } as const;
/** A note's giver, a hiker, is in this share of cells, before their ground is looked at. */
const GIVER_CHANCE = 0.07;
/** The note's friend stands this far from the giver, in metres. */
const PARTNER_RANGE = { near: 220, far: 480 } as const;
/** Camp's neighbour lives this far from the fire, in metres. */
const NEIGHBOUR = { near: 110, far: 190 } as const;
/** A lost animal wanders this far from its person, in metres. */
const LOST_RANGE = { near: 45, far: 100 } as const;
/** How much room each thing kept needs clear of trees, rocks and bushes, in metres. */
const ROOM: Record<HomeKind, number> = { sheep: 0.8, hives: 0.9, boat: 2.4, sauna: 3.4, cottage: 5, lavvu: 2.6, stone: 0.8 };
/** Small plants a person or a home can stand among. */
const UNDERFOOT: ReadonlySet<PlantKind> = new Set(["flowers", "heather", "fern"]);

interface Spot {
  x: number;
  z: number;
  land: LandSample;
  slope: number;
  /** The height above the land's bands, for the treeline and the rock. */
  banded: number;
  wood: number;
}

type SpotKind = "shore" | "fell" | "edge" | "open";

/** A spot as a scan found it: with the way to the water beside it, if any, and whether that is a lake (a river otherwise). */
interface Found extends Spot {
  toWater: number | null;
  lake: boolean;
}

const ahead = (heading: number, distance: number) => ({ x: Math.sin(heading) * distance, z: Math.cos(heading) * distance });

function slopeAt(ground: PeopleGround, x: number, z: number, scratch: LandSample): number {
  const e = 1.5;
  const dx = ground.sampleAt(x + e, z, scratch).height - ground.sampleAt(x - e, z, scratch).height;
  const dz = ground.sampleAt(x, z + e, scratch).height - ground.sampleAt(x, z - e, scratch).height;
  return Math.hypot(dx, dz) / (2 * e);
}

/** The ground at a point, or null on water or in a river. */
function read(ground: PeopleGround, x: number, z: number): Spot | null {
  const land = ground.sampleAt(x, z, emptySample());
  if (land.height - land.water < 0.25 || land.river > 0.05) return null;
  const slope = slopeAt(ground, x, z, emptySample());
  const wood = ground.woodlandAt(x, z, land, ground.regionAt(x, z, land), slope);
  return { x, z, land, slope, banded: land.height - land.bands, wood };
}

/** Whether a disc is clear of trees, rocks and bushes (a tree's crown reaching further than its trunk). */
function clearOfPlants(ground: PeopleGround, x: number, z: number, radius: number): boolean {
  const reach = radius + 2;
  for (let cz = Math.floor((z - reach) / PLANT_CHUNK); cz <= Math.floor((z + reach) / PLANT_CHUNK); cz++) {
    for (let cx = Math.floor((x - reach) / PLANT_CHUNK); cx <= Math.floor((x + reach) / PLANT_CHUNK); cx++) {
      for (const plant of ground.plantsIn(cx, cz).plants) {
        if (UNDERFOOT.has(plant.kind)) continue;
        const room = (TREE_KINDS as readonly PlantKind[]).includes(plant.kind) ? radius + 1.6 : radius + 0.35 * plant.size;
        if (Math.hypot(plant.x - x, plant.z - z) < room) return false;
      }
    }
  }
  return true;
}

/** Whether a person can stand at a point: dry, gentle and clear underfoot. */
function standable(ground: PeopleGround, x: number, z: number): boolean {
  const spot = read(ground, x, z);
  return spot !== null && spot.land.height - spot.land.water > 0.3 && spot.slope < 0.45 && clearOfPlants(ground, x, z, 0.7);
}

/** Whether a building can stand on a point: dry and level enough all round its footing, and clear. */
function buildable(ground: PeopleGround, x: number, z: number, radius: number): boolean {
  const s = emptySample();
  let low = Infinity;
  let high = -Infinity;
  for (let k = 0; k <= 8; k++) {
    const angle = (k / 8) * Math.PI * 2;
    const r = k === 8 ? 0 : radius * 0.8;
    const land = ground.sampleAt(x + Math.cos(angle) * r, z + Math.sin(angle) * r, s);
    if (land.height - land.water < 0.45 || land.river > 0.02) return false;
    low = Math.min(low, land.height);
    high = Math.max(high, land.height);
  }
  return high - low < 1.4 && clearOfPlants(ground, x, z, radius);
}

/** Whether a spot keeps clear of camp and of its cell's place. */
function apart(ground: PeopleGround, x: number, z: number, place: Place | null): boolean {
  if (Math.hypot(x - ground.camp.x, z - ground.camp.z) < ground.camp.clearing + 22) return false;
  return place === null || Math.hypot(x - place.x, z - place.z) > place.clearing + place.blend + 6;
}

/** Which way from a dry spot the water lies, if a lake (or, with `rivers`, a river) is right beside it. */
function waterBeside(ground: PeopleGround, spot: Spot, rivers: boolean): number | null {
  const dry = spot.land.height - spot.land.water;
  if (dry < 0.25 || dry > 1.8 || spot.slope > 0.35 || spot.land.river > 0.01) return null;
  const s = emptySample();
  const wet = (land: LandSample, deep: number) => land.water - land.height > (land.river > 0.05 ? 0.25 : deep) && (rivers || land.river < 0.05);
  for (let k = 0; k < 8; k++) {
    const heading = (k / 8) * Math.PI * 2;
    const near = ahead(heading, 6);
    const far = ahead(heading, 12);
    if (!wet(ground.sampleAt(spot.x + near.x, spot.z + near.z, s), 0.5)) continue;
    if (wet(ground.sampleAt(spot.x + far.x, spot.z + far.z, s), 0.8)) return heading;
  }
  return null;
}

/** The kinds of ground a spot is, for the roles that stand there. */
function kindsOf(ground: PeopleGround, spot: Spot): { kinds: SpotKind[]; toWater: number | null; lake: boolean } {
  const kinds: SpotKind[] = [];
  const lakeward = waterBeside(ground, spot, false);
  const toWater = lakeward ?? waterBeside(ground, spot, true);
  if (toWater !== null) kinds.push("shore");
  const { banded, slope, wood, land } = spot;
  if (banded > ALTITUDE.treeline + 15 && banded < ALTITUDE.rock - 40 && land.bands < -150 && slope < 0.3) kinds.push("fell");
  if (banded < ALTITUDE.treeline - 30 && slope < 0.22 && wood > 0.06 && wood < 0.4 && land.mountainous < 0.5) kinds.push("edge");
  if (banded < ALTITUDE.treeline - 10 && slope < 0.35) kinds.push("open");
  return { kinds, toWater, lake: lakeward !== null };
}

/** A scatter of spots over a cell, sorted into the kinds of ground they are. */
function scanCell(ground: PeopleGround, rng: Rng, cellX: number, cellZ: number, place: Place | null): Record<SpotKind, Found[]> {
  const found: Record<SpotKind, Found[]> = { shore: [], fell: [], edge: [], open: [] };
  const across = 6;
  const inner = PEOPLE_CELL - 2 * MARGIN;
  for (let j = 0; j < across; j++) {
    for (let i = 0; i < across; i++) {
      const x = cellX * PEOPLE_CELL + MARGIN + ((i + rng.next()) / across) * inner;
      const z = cellZ * PEOPLE_CELL + MARGIN + ((j + rng.next()) / across) * inner;
      if (!apart(ground, x, z, place)) continue;
      const spot = read(ground, x, z);
      if (spot === null) continue;
      const { kinds, toWater, lake } = kindsOf(ground, spot);
      for (const kind of kinds) found[kind].push({ ...spot, toWater, lake });
    }
  }
  return found;
}

function pickWeighted<T>(rng: Rng, options: readonly T[], weight: (option: T) => number): T | null {
  const total = options.reduce((sum, o) => sum + weight(o), 0);
  if (total <= 0) return null;
  let roll = rng.next() * total;
  for (const option of options) {
    roll -= weight(option);
    if (roll < 0) return option;
  }
  return options[options.length - 1];
}

/** The stories a role can carry by a place (or none), leaving out those that need a partner placed. */
function storiesFor(role: Role, at: PlaceKind | null): Story[] {
  return STORIES.filter((s) => s.roles.includes(role) && (s.weight ?? 1) > 0 && (s.places === undefined || (at !== null && s.places.includes(at))) && !(s.kind === "help" && s.request.kind === "carry"));
}

/** A lost cat or dog's home round its person: dry, gentle ground below the rock, a cat's at a wood's edge and a dog's out in the open. */
function lostPet(ground: PeopleGround, rng: Rng, person: { id: string; x: number; z: number }, species: Species): LostPet | null {
  let best: { x: number; z: number; score: number } | null = null;
  for (let k = 0; k < 12; k++) {
    const angle = rng.next() * Math.PI * 2;
    const r = LOST_RANGE.near + rng.next() * (LOST_RANGE.far - LOST_RANGE.near);
    const x = person.x + Math.cos(angle) * r;
    const z = person.z + Math.sin(angle) * r;
    const spot = read(ground, x, z);
    if (spot === null || spot.land.height - spot.land.water < 0.6 || spot.slope > 0.5 || spot.banded > ALTITUDE.rock) continue;
    const score = (species === "cat" ? 1 - Math.abs(spot.wood - 0.45) * 2 : 1 - spot.wood) + rng.next() * 0.2;
    if (best === null || score > best.score) best = { x, z, score };
  }
  if (best === null) return null;
  return { id: `lost/${person.id}`, species, seed: `${ground.seed}/lost/${person.id}`, home: { x: best.x, z: best.z }, roam: 5 };
}

/** How far a clue keeps from a home's middle beyond the room the home needs, from the person, and from another clue, in metres. */
const CLUE_CLEAR = { home: 0.6, person: 1.6, clue: 2.4 } as const;

/** A mystery's clues round its person and their homes, each on open, gentle, dry ground: null if one can't be placed. */
function placeClues(ground: PeopleGround, rng: Rng, person: Person, story: MysteryStory): PlacedClue[] | null {
  const placed: PlacedClue[] = [];
  for (const clue of story.mystery.clues.filter((c): c is FoundClue => c.kind === "found")) {
    const { from, near, far } = clue.at;
    const anchor = from === "person" ? person : person.homes.find((h) => h.kind === from);
    if (!anchor) return null;
    let spot: PlacedClue | null = null;
    for (let k = 0; k < 20 && spot === null; k++) {
      const angle = rng.next() * Math.PI * 2;
      const r = near + rng.next() * (far - near);
      const x = anchor.x + Math.cos(angle) * r;
      const z = anchor.z + Math.sin(angle) * r;
      if (Math.hypot(x - person.x, z - person.z) < CLUE_CLEAR.person) continue;
      if (person.homes.some((h) => Math.hypot(x - h.x, z - h.z) < ROOM[h.kind] + CLUE_CLEAR.home)) continue;
      if (placed.some((p) => Math.hypot(x - p.x, z - p.z) < CLUE_CLEAR.clue)) continue;
      const at = read(ground, x, z);
      if (at === null || at.land.height - at.land.water < 0.2 || at.slope > 0.3 || !clearOfPlants(ground, x, z, 0.45)) continue;
      spot = { id: clue.id, x, z, turn: rng.next() * Math.PI * 2 };
    }
    if (spot === null) return null;
    placed.push(spot);
  }
  return placed;
}

interface Draft {
  id: string;
  role: Role;
  x: number;
  z: number;
  heading: number;
  seat: number | null;
  homes: Home[];
}

/** A drafted person given their story, and whatever their story needs placed: null if it can't be. */
function finish(ground: PeopleGround, rng: Rng, draft: Draft, story: Story): Person | null {
  const person: Person = { ...draft, seed: `${ground.seed}/person/${draft.id}`, story: story.id, pet: null, partner: null, clues: [] };
  if (story.kind === "help" && story.request.kind === "pet") {
    person.pet = lostPet(ground, rng, person, story.request.species);
    if (person.pet === null) return null;
  }
  if (story.kind === "mystery") {
    const clues = placeClues(ground, rng, person, story);
    if (clues === null) return null;
    person.clues = clues;
  }
  return person;
}

/** Someone of a role at a spot, with what they keep beside them, or null where it won't fit. */
function draftAt(ground: PeopleGround, rng: Rng, id: string, role: Role, spot: Found): Draft | null {
  const base = { id, role, seat: null, homes: [] as Home[] };
  switch (role) {
    case "fisher": {
      if (spot.toWater === null || !standable(ground, spot.x, spot.z)) return null;
      const side = ahead(spot.toWater + Math.PI / 2, rng.next() < 0.5 ? 3.2 : -3.2);
      const homes: Home[] = [];
      const boat = { x: spot.x + side.x, z: spot.z + side.z };
      if (read(ground, boat.x, boat.z) !== null && clearOfPlants(ground, boat.x, boat.z, ROOM.boat)) homes.push({ kind: "boat", ...boat, turn: spot.toWater + (rng.next() - 0.5) * 0.4 });
      return { ...base, x: spot.x, z: spot.z, heading: spot.toWater, homes };
    }
    case "sauna-keeper": {
      // A sauna stands by a lake, to cool off in.
      if (spot.toWater === null || !spot.lake) return null;
      const back = ahead(spot.toWater, -6.5);
      const hut = { x: spot.x + back.x, z: spot.z + back.z };
      if (!buildable(ground, hut.x, hut.z, ROOM.sauna)) return null;
      const stand = ahead(spot.toWater, -2.2);
      const aside = ahead(spot.toWater + Math.PI / 2, 1.4);
      const x = spot.x + stand.x + aside.x;
      const z = spot.z + stand.z + aside.z;
      if (!standable(ground, x, z)) return null;
      return { ...base, x, z, heading: spot.toWater + 0.6, homes: [{ kind: "sauna", ...hut, turn: spot.toWater }] };
    }
    case "herder": {
      if (!standable(ground, spot.x, spot.z)) return null;
      const heading = rng.next() * Math.PI * 2;
      // The tent goes on the most level ground beside them, if there is any.
      const homes: Home[] = [];
      for (let k = 0; k < 6 && homes.length === 0; k++) {
        const off = ahead(heading + 1.6 + k * 0.5, 4.4);
        const tent = { x: spot.x + off.x, z: spot.z + off.z };
        if (buildable(ground, tent.x, tent.z, ROOM.lavvu)) homes.push({ kind: "lavvu", ...tent, turn: heading + 1.6 + k * 0.5 + Math.PI });
      }
      return { ...base, x: spot.x, z: spot.z, heading, homes };
    }
    case "beekeeper": {
      if (!standable(ground, spot.x, spot.z)) return null;
      const heading = rng.next() * Math.PI * 2;
      const homes: Home[] = [];
      for (const across of [-1.4, 0, 1.4]) {
        const back = ahead(heading, -2.3);
        const aside = ahead(heading + Math.PI / 2, across);
        const hive = { x: spot.x + back.x + aside.x, z: spot.z + back.z + aside.z };
        if (read(ground, hive.x, hive.z) !== null && clearOfPlants(ground, hive.x, hive.z, ROOM.hives)) homes.push({ kind: "hives", ...hive, turn: heading });
      }
      return homes.length >= 2 ? { ...base, x: spot.x, z: spot.z, heading, homes } : null;
    }
    case "cottager": {
      if (!buildable(ground, spot.x, spot.z, ROOM.cottage)) return null;
      const turn = rng.next() * Math.PI * 2;
      const front = ahead(turn, 4.2);
      const x = spot.x + front.x;
      const z = spot.z + front.z;
      if (!standable(ground, x, z)) return null;
      return { ...base, x, z, heading: turn + 0.35, homes: [{ kind: "cottage", x: spot.x, z: spot.z, turn }] };
    }
    case "hiker": {
      if (!clearOfPlants(ground, spot.x, spot.z, ROOM.stone + 0.4)) return null;
      const heading = rng.next() * Math.PI * 2;
      return { ...base, x: spot.x, z: spot.z, heading, seat: 0.42, homes: [{ kind: "stone", x: spot.x, z: spot.z, turn: heading }] };
    }
    case "shepherd":
    case "traveller":
      return null;
  }
}

/** Someone at their cell's place: a shepherd at a seter, a traveller at a cairn's bench or a shrine, a fisher at a tarn. */
function draftAtPlace(ground: PeopleGround, rng: Rng, id: string, place: Place): Draft | null {
  switch (place.kind) {
    case "seter": {
      const angle = place.turn - 0.15;
      const x = place.x + Math.cos(angle) * 7;
      const z = place.z + Math.sin(angle) * 7;
      if (!standable(ground, x, z)) return null;
      const heading = Math.atan2(Math.cos(angle), Math.sin(angle)) + 0.4;
      const homes: Home[] = [];
      // The flock grazes beside and behind them, so whoever comes to talk sees it past them.
      for (let k = 0; k < 6; k++) {
        const a = heading + Math.PI + (rng.next() - 0.5) * 3.4;
        const r = 2.6 + rng.next() * 4.5;
        const sheep = { x: x + Math.sin(a) * r, z: z + Math.cos(a) * r };
        if (Math.hypot(sheep.x - place.x, sheep.z - place.z) < 5) continue;
        if (homes.some((h) => Math.hypot(h.x - sheep.x, h.z - sheep.z) < 1.4)) continue;
        if (standable(ground, sheep.x, sheep.z)) homes.push({ kind: "sheep", ...sheep, turn: rng.next() * Math.PI * 2 });
      }
      return { id, role: "shepherd", x, z, heading, seat: null, homes };
    }
    case "cairn": {
      // On the cairn's bench, looking out from the rise.
      const x = place.x + Math.cos(place.turn) * 2.6;
      const z = place.z + Math.sin(place.turn) * 2.6;
      return { id, role: "traveller", x, z, heading: Math.atan2(Math.cos(place.turn), Math.sin(place.turn)), seat: 0.42, homes: [] };
    }
    case "shrine": {
      // Beside the shrine, a little in front of it.
      const c = Math.cos(place.turn);
      const s = Math.sin(place.turn);
      const local = { x: 1.9, z: 2.1 };
      const x = place.x + local.x * c + local.z * s;
      const z = place.z - local.x * s + local.z * c;
      if (!standable(ground, x, z)) return null;
      return { id, role: "traveller", x, z, heading: place.turn + 0.7, seat: null, homes: [] };
    }
    case "tarn": {
      const radius = (place.pool?.radius ?? 20) + 3;
      for (let k = 0; k < 6; k++) {
        const a = rng.next() * Math.PI * 2;
        const x = place.x + Math.cos(a) * radius;
        const z = place.z + Math.sin(a) * radius;
        if (standable(ground, x, z)) return { id, role: "fisher", x, z, heading: Math.atan2(place.x - x, place.z - z), seat: null, homes: [] };
      }
      return null;
    }
    default:
      return null;
  }
}

/** The water's edge (a lake's or a river's) along a heading from a point, between two distances: the last dry spot before the water. */
function shoreAlong(ground: PeopleGround, from: { x: number; z: number }, heading: number, near: number, far: number): Found | null {
  const s = emptySample();
  let lastDry: { x: number; z: number } | null = null;
  for (let r = near; r <= far; r += 5) {
    const at = ahead(heading, r);
    const x = from.x + at.x;
    const z = from.z + at.z;
    const land = ground.sampleAt(x, z, s);
    const wet = land.water - land.height > 0.25;
    if (!wet) {
      lastDry = land.height - land.water > 0.3 && land.river < 0.02 ? { x, z } : null;
      continue;
    }
    if (lastDry === null) continue;
    const spot = read(ground, lastDry.x, lastDry.z);
    if (spot === null) return null;
    const lake = waterBeside(ground, spot, false);
    const toWater = lake ?? waterBeside(ground, spot, true);
    return toWater === null ? null : { ...spot, toWater, lake: lake !== null };
  }
  return null;
}

/** Whether a cell holds a note's giver, which is known from its seed alone, before its ground is looked at. */
export function isGiverCell(seed: string, cellX: number, cellZ: number): boolean {
  return createRng(`${seed}/people/${cellX},${cellZ}/giver`).next() < GIVER_CHANCE;
}

/** A note's giver and the friend it is carried to, if the cell has open ground for one and a lake shore within reach for the other. */
function giverAndPartner(ground: PeopleGround, rng: Rng, cellX: number, cellZ: number, place: Place | null): Person[] | null {
  const carrying = STORIES.filter((s) => s.kind === "help" && s.request.kind === "carry");
  const story = pickWeighted(rng, carrying, (s) => s.weight ?? 1);
  if (story?.kind !== "help" || story.request.kind !== "carry") return null;
  const to = storyOf(story.request.to);
  const role = story.roles[0];
  const spots = scanCell(ground, rng, cellX, cellZ, place).open;
  for (const spot of spots.slice(0, 6)) {
    const draft = draftAt(ground, rng, `${cellX},${cellZ}/0`, role, spot);
    if (draft === null) continue;
    for (let k = 0; k < 16; k++) {
      const heading = ((k + rng.next() * 0.5) / 16) * Math.PI * 2;
      const shore = shoreAlong(ground, draft, heading, PARTNER_RANGE.near, PARTNER_RANGE.far);
      if (shore === null) continue;
      const friend = draftAt(ground, rng, `${cellX},${cellZ}/1`, to.roles[0], shore);
      if (friend === null) continue;
      const giver = finish(ground, rng, draft, story);
      const partner = finish(ground, rng, friend, to);
      if (giver === null || partner === null) continue;
      giver.partner = { id: partner.id, seed: partner.seed, x: partner.x, z: partner.z };
      partner.partner = { id: giver.id, seed: giver.seed, x: giver.x, z: giver.z };
      return [giver, partner];
    }
  }
  return null;
}

/** Camp's neighbour: a cottager a short walk from the fire, at a cottage on open, gentle ground, carrying the first story. */
function neighbour(ground: PeopleGround, rng: Rng, cellX: number, cellZ: number): Person | null {
  const { camp } = ground;
  let best: { spot: Spot; score: number } | null = null;
  for (let k = 0; k < 36; k++) {
    const angle = rng.next() * Math.PI * 2;
    const r = NEIGHBOUR.near + rng.next() * (NEIGHBOUR.far - NEIGHBOUR.near);
    const x = camp.x + Math.cos(angle) * r;
    const z = camp.z + Math.sin(angle) * r;
    const place = ground.placeIn(Math.floor(x / PLACE_CELL), Math.floor(z / PLACE_CELL));
    if (!apart(ground, x, z, place)) continue;
    const spot = read(ground, x, z);
    if (spot === null || spot.slope > 0.2 || spot.land.height - spot.land.water < 0.8) continue;
    const score = -Math.abs(spot.wood - 0.2) - Math.abs(r - 140) / 400 + rng.next() * 0.15;
    if (best !== null && score <= best.score) continue;
    if (!buildable(ground, x, z, ROOM.cottage)) continue;
    best = { spot, score };
  }
  if (best === null) return null;
  const draft = draftAt(ground, rng, `${cellX},${cellZ}/0`, "cottager", { ...best.spot, toWater: null, lake: false });
  return draft && finish(ground, rng, draft, storyOf(FIRST_STORY));
}

/** The people of one cell: nobody, someone, or (for a note's giver) someone and the friend they write to. */
export function peopleInCell(ground: PeopleGround, cellX: number, cellZ: number): Person[] {
  const rng = createRng(`${ground.seed}/people/${cellX},${cellZ}`);
  const { camp } = ground;
  if (Math.floor(camp.x / PEOPLE_CELL) === cellX && Math.floor(camp.z / PEOPLE_CELL) === cellZ) {
    const first = neighbour(ground, rng, cellX, cellZ);
    return first ? [first] : [];
  }
  const place = ground.placeIn(cellX, cellZ);
  if (isGiverCell(ground.seed, cellX, cellZ)) {
    const pair = giverAndPartner(ground, rng, cellX, cellZ, place);
    if (pair) return pair;
  }
  const middle = { x: (cellX + 0.5) * PEOPLE_CELL, z: (cellZ + 0.5) * PEOPLE_CELL };
  const boost = Math.hypot(middle.x - camp.x, middle.z - camp.z) < NEAR_CAMP.within ? NEAR_CAMP.boost : 1;
  const id = `${cellX},${cellZ}/0`;
  const roll = rng.next() / boost;

  // A place has its own people first.
  const placed = place ? PLACE_PEOPLE[place.kind] : undefined;
  const atPlace = placed === undefined ? 0 : placed === "shepherd" ? CHANCE.seter : placed === "traveller" ? CHANCE.waypost : CHANCE.tarn;
  if (place && roll < atPlace) {
    const draft = draftAtPlace(ground, rng, id, place);
    if (draft === null) return [];
    const story = pickWeighted(rng, storiesFor(draft.role, place.kind), (s) => s.weight ?? 1);
    const person = story && finish(ground, rng, draft, story);
    return person ? [person] : [];
  }

  // Otherwise whoever the cell's ground suits, if anyone.
  const spots = scanCell(ground, rng, cellX, cellZ, place);
  const options: { role: Role; kind: SpotKind; chance: number }[] = [];
  if (spots.shore.length > 0) options.push({ role: "fisher", kind: "shore", chance: CHANCE.fisher }, { role: "sauna-keeper", kind: "shore", chance: CHANCE.sauna });
  if (spots.fell.length > 0) options.push({ role: "herder", kind: "fell", chance: CHANCE.herder });
  if (spots.edge.length > 0) options.push({ role: "beekeeper", kind: "edge", chance: CHANCE.beekeeper }, { role: "cottager", kind: "edge", chance: CHANCE.cottager });
  if (spots.open.length > 0) options.push({ role: "hiker", kind: "open", chance: CHANCE.hiker });
  let left = roll - atPlace;
  const chosen = options.find((o) => {
    left -= o.chance;
    return left < 0;
  });
  if (!chosen) return [];
  const story = pickWeighted(rng, storiesFor(chosen.role, null), (s) => s.weight ?? 1);
  if (story === null) return [];
  for (const spot of spots[chosen.kind]) {
    const draft = draftAt(ground, rng, id, chosen.role, spot);
    if (draft === null) continue;
    const person = finish(ground, rng, draft, story);
    if (person) return [person];
  }
  return [];
}

/** Everyone within `radius` metres of a point, asking only the cells that could place someone there. */
export function peopleNear(ground: PeopleGround, x: number, z: number, radius: number, inCell: (cellX: number, cellZ: number) => Person[] = (cx, cz) => peopleInCell(ground, cx, cz)): Person[] {
  const out: Person[] = [];
  const reach = radius + PEOPLE_REACH;
  const campCell = { x: Math.floor(ground.camp.x / PEOPLE_CELL), z: Math.floor(ground.camp.z / PEOPLE_CELL) };
  for (let cz = Math.floor((z - reach) / PEOPLE_CELL); cz <= Math.floor((z + reach) / PEOPLE_CELL); cz++) {
    for (let cx = Math.floor((x - reach) / PEOPLE_CELL); cx <= Math.floor((x + reach) / PEOPLE_CELL); cx++) {
      const own = cx >= Math.floor((x - radius) / PEOPLE_CELL) && cx <= Math.floor((x + radius) / PEOPLE_CELL) && cz >= Math.floor((z - radius) / PEOPLE_CELL) && cz <= Math.floor((z + radius) / PEOPLE_CELL);
      if (!own && !(cx === campCell.x && cz === campCell.z) && !isGiverCell(ground.seed, cx, cz)) continue;
      for (const person of inCell(cx, cz)) if (Math.hypot(person.x - x, person.z - z) <= radius) out.push(person);
    }
  }
  return out;
}

/** The compass way from one point to another, as "the north-east" (north is -z, east +x). */
export function wayTo(from: { x: number; z: number }, to: { x: number; z: number }): string {
  const names = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  const bearing = Math.atan2(to.x - from.x, -(to.z - from.z));
  const index = ((Math.round(bearing / (Math.PI / 4)) % 8) + 8) % 8;
  return `the ${names[index]}`;
}

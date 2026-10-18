import { createRng, type Rng } from "@/shared/lib/seeded-random";
import { ALTITUDE, emptySample, type LandSample } from "./land";
import { PLACE_CELL, type Place } from "./places";
import type { PlaceKind } from "./regions";
import type { World } from "./world";

/*
 * The stray cats and dogs, and the wild foxes and hedgehogs who can be won
 * over the same way, by area. The world is cut into the places' cells,
 * and each cell has a few strays or none, found from the cell's own seed and
 * its land alone, so a stray is always where it was. Cats are commoner by
 * the places people keep (a seter's barn, a shrine, a stone circle) and at
 * the edges of the woods; dogs by a seter and out in open country. Each
 * stray is a cat or a dog generated from its own seed, with a home spot it
 * wanders round. Foxes are rarer, at the woods' edges; hedgehogs by the
 * places people keep (a seter's garden above all) and the edges of the
 * meadows; they are found from a stream of the cell's own, so finding them
 * never moves a cat or a dog. Who a stray is (its coat, build and
 * personality) is its species' own generation; this only says where they are.
 */

/** Every kind of animal that can be won over to follow Elliott. */
export const SPECIES = ["cat", "dog", "fox", "hedgehog"] as const;
export type Species = (typeof SPECIES)[number];
/** The wild ones among them, found after the cats and dogs. */
type WildSpecies = Extract<Species, "fox" | "hedgehog">;

export interface Stray {
  /** Its cell and its place in the cell's list: what befriending it is kept under. */
  id: string;
  species: Species;
  /** The seed its cat or dog is generated from. */
  seed: string;
  /** Where it lives, and how far from there it wanders, in metres. */
  home: { x: number; z: number };
  roam: number;
}

/** What finding strays asks of the world. */
export type StrayGround = Pick<World, "seed" | "camp" | "sampleAt" | "regionAt" | "woodlandAt" | "placeIn">;

/** The side of a stray cell, in metres: the places' cell, so a stray can live by its cell's place. */
export const STRAY_CELL = PLACE_CELL;

/** How likely a cell is to hold a cat and a dog, before what is in it is counted. */
const BASE = { cat: 0.34, dog: 0.26 } as const;
/** How much more likely each kind of place makes them, added to the base. */
const BY_PLACE: Partial<Record<PlaceKind, { cat: number; dog: number }>> = {
  seter: { cat: 0.55, dog: 0.5 },
  shrine: { cat: 0.4, dog: 0.05 },
  "stone-circle": { cat: 0.35, dog: 0 },
  cairn: { cat: 0.05, dog: 0.12 },
  "fairy-ring": { cat: 0.15, dog: 0 },
  "fallen-tree": { cat: 0.1, dog: 0.05 },
};
/** How likely a cell is to hold a fox and a hedgehog, before its place is counted, and how much each kind of place adds. */
const WILD_BASE: Record<WildSpecies, number> = { fox: 0.07, hedgehog: 0.05 };
const WILD_BY_PLACE: Partial<Record<PlaceKind, Record<WildSpecies, number>>> = {
  seter: { fox: 0.04, hedgehog: 0.4 },
  shrine: { fox: 0, hedgehog: 0.12 },
  "stone-circle": { fox: 0.03, hedgehog: 0.06 },
  "fallen-tree": { fox: 0.06, hedgehog: 0.1 },
  "fairy-ring": { fox: 0.05, hedgehog: 0.08 },
};
/** A seter keeps a second cat now and then: a barn's cats. */
const SECOND_CAT_AT_SETER = 0.35;
/** How many spots each stray looks at for its home. */
const HOME_TRIES = 10;
/** How far inside its cell a home keeps, in metres. */
const MARGIN = 16;
/** A stray by its cell's place lives this far from the place's middle, in metres. */
const BY_PLACE_REACH = { near: 9, far: 26 } as const;
/** The cat that lives near camp, so the first walk out meets one: how far from the fire, in metres. */
const CAMP_CAT = { near: 26, far: 48 } as const;

/** How open and gentle a spot is: null where a stray can't live (water, cliffs, the snow). */
function homeGround(ground: StrayGround, x: number, z: number, s: LandSample, scratch: LandSample): { wood: number; open: number } | null {
  ground.sampleAt(x, z, s);
  if (s.height - s.water < 0.6 || s.river > 0.05 || s.height > ALTITUDE.rock) return null;
  const e = 1.5;
  const dx = ground.sampleAt(x + e, z, scratch).height - ground.sampleAt(x - e, z, scratch).height;
  const dz = ground.sampleAt(x, z + e, scratch).height - ground.sampleAt(x, z - e, scratch).height;
  const slope = Math.hypot(dx, dz) / (2 * e);
  if (slope > 0.6) return null;
  const wood = ground.woodlandAt(x, z, s, ground.regionAt(x, z, s), slope);
  return { wood, open: (1 - wood) * (1 - Math.min(1, s.mountainous * 1.4)) };
}

/** How well a spot suits a species' home: a cat the edge of the woods, a dog open country, a fox the very edge of the trees, a hedgehog the meadow's edge. */
function suits(species: Species, at: { wood: number; open: number }): number {
  switch (species) {
    case "cat":
      return 1 - Math.abs(at.wood - 0.45) * 2;
    case "dog":
      return at.open;
    case "fox":
      return 1 - Math.abs(at.wood - 0.3) * 2.2;
    case "hedgehog":
      return 1 - Math.abs(at.wood - 0.15) * 2.5 - (1 - at.open - at.wood) * 0.5;
  }
}

interface Found {
  x: number;
  z: number;
  score: number;
}

/** The best home for a species among a scatter of spots, either round a point (a place, camp) or anywhere in the cell. */
function findHome(ground: StrayGround, species: Species, rng: Rng, around: { x: number; z: number; near: number; far: number } | null, x0: number, z0: number): Found | null {
  const s = emptySample();
  const scratch = emptySample();
  let best: Found | null = null;
  for (let k = 0; k < HOME_TRIES; k++) {
    let x: number;
    let z: number;
    if (around) {
      const angle = rng.next() * Math.PI * 2;
      const r = around.near + rng.next() * (around.far - around.near);
      x = around.x + Math.cos(angle) * r;
      z = around.z + Math.sin(angle) * r;
    } else {
      x = x0 + MARGIN + rng.next() * (STRAY_CELL - 2 * MARGIN);
      z = z0 + MARGIN + rng.next() * (STRAY_CELL - 2 * MARGIN);
    }
    const at = homeGround(ground, x, z, s, scratch);
    if (at === null) continue;
    const score = suits(species, at) + rng.next() * 0.2;
    if (best === null || score > best.score) best = { x, z, score };
  }
  return best;
}

/** How much a cell's land favours each species: open country for dogs, the woods' edges for cats. */
function cellLeaning(ground: StrayGround, x0: number, z0: number): { cat: number; dog: number } {
  const s = emptySample();
  const scratch = emptySample();
  let cat = 0;
  let dog = 0;
  let count = 0;
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      const at = homeGround(ground, x0 + ((i + 0.5) / 3) * STRAY_CELL, z0 + ((j + 0.5) / 3) * STRAY_CELL, s, scratch);
      if (at === null) continue;
      cat += suits("cat", at);
      dog += at.open;
      count++;
    }
  }
  if (count === 0) return { cat: -1, dog: -1 };
  return { cat: (cat / count) * 0.2, dog: (dog / count) * 0.3 };
}

function strayAt(ground: StrayGround, species: Species, cellX: number, cellZ: number, index: number, home: Found, roam: number): Stray {
  return { id: `${cellX},${cellZ}/${index}`, species, seed: `${ground.seed}/stray/${cellX},${cellZ}/${index}`, home: { x: home.x, z: home.z }, roam };
}

/** The strays of one cell, each with its home: none, one or a few. */
export function straysInCell(ground: StrayGround, cellX: number, cellZ: number): Stray[] {
  const rng = createRng(`${ground.seed}/strays/${cellX},${cellZ}`);
  const x0 = cellX * STRAY_CELL;
  const z0 = cellZ * STRAY_CELL;
  const place: Place | null = ground.placeIn(cellX, cellZ);
  const byPlace = place ? BY_PLACE[place.kind] : undefined;
  const leaning = cellLeaning(ground, x0, z0);
  const { camp } = ground;
  const hasCamp = Math.floor(camp.x / STRAY_CELL) === cellX && Math.floor(camp.z / STRAY_CELL) === cellZ;

  const wanted: { species: Species; around: { x: number; z: number; near: number; far: number } | null }[] = [];
  const around = place && byPlace ? { x: place.x, z: place.z, near: Math.max(BY_PLACE_REACH.near, place.flatten + place.blend), far: BY_PLACE_REACH.far + place.clearing } : null;
  if (hasCamp) wanted.push({ species: "cat", around: { x: camp.x, z: camp.z, ...CAMP_CAT } });
  if (leaning.cat >= 0 && rng.next() < BASE.cat + leaning.cat + (byPlace?.cat ?? 0)) wanted.push({ species: "cat", around: byPlace && byPlace.cat > 0 ? around : null });
  if (place?.kind === "seter" && rng.next() < SECOND_CAT_AT_SETER) wanted.push({ species: "cat", around });
  if (leaning.dog >= 0 && rng.next() < BASE.dog + leaning.dog + (byPlace?.dog ?? 0)) wanted.push({ species: "dog", around: byPlace && byPlace.dog > 0 ? around : null });

  const strays: Stray[] = [];
  wanted.forEach(({ species, around: near }, index) => {
    const home = findHome(ground, species, rng, near, x0, z0) ?? (near ? findHome(ground, species, rng, null, x0, z0) : null);
    if (home === null) return;
    const roam = species === "cat" ? 6 + rng.next() * 6 : 10 + rng.next() * 10;
    strays.push(strayAt(ground, species, cellX, cellZ, index, home, roam));
  });
  return [...strays, ...wildInCell(ground, cellX, cellZ, place, leaning.cat >= 0)];
}

/** The foxes and hedgehogs of a cell, from a stream of its own, numbered after anything the cats' and dogs' stream could give. */
function wildInCell(ground: StrayGround, cellX: number, cellZ: number, place: Place | null, livable: boolean): Stray[] {
  if (!livable) return [];
  const rng = createRng(`${ground.seed}/wild/${cellX},${cellZ}`);
  const x0 = cellX * STRAY_CELL;
  const z0 = cellZ * STRAY_CELL;
  const byPlace = place ? WILD_BY_PLACE[place.kind] : undefined;
  const around = place && byPlace ? { x: place.x, z: place.z, near: Math.max(BY_PLACE_REACH.near, place.flatten + place.blend), far: BY_PLACE_REACH.far + place.clearing } : null;
  const out: Stray[] = [];
  (["fox", "hedgehog"] as const).forEach((species, i) => {
    if (rng.next() >= WILD_BASE[species] + (byPlace?.[species] ?? 0)) return;
    const near = byPlace && byPlace[species] > 0 ? around : null;
    const home = findHome(ground, species, rng, near, x0, z0) ?? (near ? findHome(ground, species, rng, null, x0, z0) : null);
    if (home === null) return;
    const roam = species === "fox" ? 14 + rng.next() * 12 : 5 + rng.next() * 4;
    out.push(strayAt(ground, species, cellX, cellZ, 10 + i, home, roam));
  });
  return out;
}

/** Every stray whose home is within `radius` metres of a point. */
export function straysNear(ground: StrayGround, x: number, z: number, radius: number, inCell: (cellX: number, cellZ: number) => Stray[] = (cx, cz) => straysInCell(ground, cx, cz)): Stray[] {
  const out: Stray[] = [];
  for (let cz = Math.floor((z - radius) / STRAY_CELL); cz <= Math.floor((z + radius) / STRAY_CELL); cz++) {
    for (let cx = Math.floor((x - radius) / STRAY_CELL); cx <= Math.floor((x + radius) / STRAY_CELL); cx++) {
      for (const stray of inCell(cx, cz)) if (Math.hypot(stray.home.x - x, stray.home.z - z) <= radius) out.push(stray);
    }
  }
  return out;
}

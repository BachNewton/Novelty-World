import { createBuilder, type LandmarkMesh } from "../landmarks/kit";
import { makePlate, merged, onBearing, plateTint, type Painter } from "./paint";

/*
 * Two small models with a name on them. Each is its own mesh in the walls' vertex format, because a name is in a vertex's
 * tint, so they merge into a tile's cells like a landmark. +x runs along the canopy or front, +z towards the street.
 */

/**
 * A station with a canopy in the 2025 orthophoto, surveyed there (`fuel-stations.json`): OSM's `amenity=fuel` across the
 * island, read against the photo, keeps only these. The rest are a pump or two with no canopy, boat fuel at a marina, or
 * a depot. Every one kept has its own shop, an NLS building that stays, so the model is the canopy, its pumps and the
 * price pylon.
 */
export interface FuelStation {
  /** The canopy's middle. */
  east: number;
  north: number;
  /** The way the canopy's long side, the model's +x, points; its +z, on the right, faces the street the pylon stands by. */
  bearing: number;
  longM: number;
  deepM: number;
  word: string;
  osm: string;
  tile: string;
}

type Rectangle = readonly [number, number, number, number];

const UNDER_M = 4.6;
const TOP_M = 5.3;
const ISLAND_EVERY_M = 8;
const ISLAND_LONG_M = 6.2;
const ISLAND_DEEP_M = 1.1;
const PYLON_OUT_M = [5, 4.05] as const;

/** Each pump island's middle along the canopy: one to every 8 m of it, evenly. */
function islandsAlong(longM: number): number[] {
  const count = Math.max(1, Math.round(longM / ISLAND_EVERY_M));
  return Array.from({ length: count }, (_, index) => (index + 0.5 - count / 2) * (longM / count));
}

const islandLong = (longM: number) => Math.min(ISLAND_LONG_M, longM / islandsAlong(longM).length - 1.4);

/**
 * What of a station the car can't pass, in its own frame before its bearing turns it (west, south, east, north as x and
 * z): the pump islands, which hold the canopy's columns, and the price pylon. The canopy itself is overhead.
 */
export function fuelFootprints({ longM, deepM }: Pick<FuelStation, "longM" | "deepM">): Rectangle[] {
  const half = islandLong(longM) / 2;
  const islands = islandsAlong(longM).map((x): Rectangle => [x - half, -ISLAND_DEEP_M / 2, x + half, ISLAND_DEEP_M / 2]);
  const [pylonX, pylonZ] = [longM / 2 + PYLON_OUT_M[0], deepM / 2 + PYLON_OUT_M[1]];
  return [...islands, [pylonX - 1.05, pylonZ - 0.2, pylonX + 1.05, pylonZ + 0.2]];
}

/** A station's seed, from its OSM id, so its sign keeps its colours however the list is ordered. */
export function fuelSeed({ osm }: Pick<FuelStation, "osm">): number {
  return [...osm].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 251, 7);
}

/** A canopy on columns over its islands of pumps, and a price pylon out by the street. */
export function fuelStation(paint: Painter, { word, bearing, longM, deepM, osm }: Pick<FuelStation, "word" | "bearing" | "longM" | "deepM" | "osm">): LandmarkMesh {
  const mesh = createBuilder(onBearing(bearing));
  const canopy = paint("fuel-canopy");
  const [halfLong, halfDeep] = [longM / 2, deepM / 2];
  const outline: [number, number][] = [
    [-halfLong, -halfDeep],
    [halfLong, -halfDeep],
    [halfLong, halfDeep],
    [-halfLong, halfDeep],
  ];
  mesh.extrude(outline, UNDER_M, TOP_M, paint("fuel-band"), canopy);
  mesh.cap(outline, UNDER_M, paint("fuel-canopy", 0.9));
  const pumps = paint("fuel-pump");
  const island = islandLong(longM);
  for (const x of islandsAlong(longM)) {
    mesh.box([x, UNDER_M / 2, 0], [0.34, UNDER_M, 0.34], paint("fuel-canopy", 0.95));
    mesh.box([x, 0.1, 0], [island, 0.2, ISLAND_DEEP_M], paint("fuel-island"));
    for (const along of [-island / 4, island / 4]) {
      mesh.box([x + along, 1, 0], [0.75, 1.65, 0.5], pumps);
      mesh.wall([x + along - 0.25, 0.26], [x + along + 0.25, 0.26], 1.2, 1.62, paint("fuel-glass"));
    }
  }
  const [pylonX, pylonZ] = [halfLong + PYLON_OUT_M[0], halfDeep + PYLON_OUT_M[1]];
  mesh.box([pylonX, 2.6, pylonZ], [2.1, 5.2, 0.4], paint("fuel-ink"));
  for (const row of [0, 1, 2]) mesh.wall([pylonX - 0.75, pylonZ + 0.22], [pylonX + 0.75, pylonZ + 0.22], 2.3 + row * 0.75, 2.78 + row * 0.75, paint(row === 2 ? "front-sun" : "fuel-pump"));
  const plates = createBuilder(onBearing(bearing));
  const front = halfDeep + 0.03;
  const fasciaTall = TOP_M - UNDER_M - 0.12;
  const plate = Math.min(10, longM - 4);
  plates.wall([-plate / 2, front], [plate / 2, front], UNDER_M + 0.06, TOP_M - 0.06, paint("fuel-canopy"));
  plates.wall([plate / 2, -front], [-plate / 2, -front], UNDER_M + 0.06, TOP_M - 0.06, paint("fuel-canopy"));
  plates.wall([pylonX - 1.2, pylonZ + 0.25], [pylonX + 1.2, pylonZ + 0.25], 5.1, 6.3, paint("fuel-canopy"));
  const lettered = plates.done();
  const tint = plateTint(word, fuelSeed({ osm }));
  makePlate(lettered, 0, plate, fasciaTall, tint);
  makePlate(lettered, 4, plate, fasciaTall, tint);
  makePlate(lettered, 8, 2.4, 1.2, tint);
  return merged(mesh.done(), lettered);
}

/** A supermarket's entrance: a canopy out from the wall, and a name on a tall plate standing by the car park unless `pylon` is false. */
export function supermarketEntrance(paint: Painter, word: string, seed: number, pylon = true): LandmarkMesh {
  const mesh = createBuilder();
  // Under the big shop's name, which the facade paints from 2.9 m up at its lowest (`art/surfaces/shopfront.ts`).
  const [half, deep, under, top] = [5, 3.2, 2.55, 2.9];
  const outline: [number, number][] = [
    [-half, 0],
    [half, 0],
    [half, deep],
    [-half, deep],
  ];
  mesh.extrude(outline, under, top, paint("fuel-canopy"), paint("wall-grey", 0.85));
  mesh.cap(outline, under, paint("fuel-canopy", 0.86));
  for (const x of [-half + 0.3, 0, half - 0.3]) mesh.box([x, under / 2, deep - 0.25], [0.26, under, 0.26], paint("fuel-canopy", 0.95));
  if (!pylon) return mesh.done();
  mesh.box([half + 7, 0.05, 6], [0.7, 0.1, 2.6], paint("fuel-island"));
  mesh.box([half + 7, 2.3, 6], [0.3, 4.6, 0.9], paint("fuel-ink"));
  const plates = createBuilder();
  plates.wall([half + 6.82, 7.8], [half + 6.82, 4.2], 4.4, 5.7, paint("fuel-canopy"));
  plates.wall([half + 7.18, 4.2], [half + 7.18, 7.8], 4.4, 5.7, paint("fuel-canopy"));
  const lettered = plates.done();
  const tint = plateTint(word, seed);
  makePlate(lettered, 0, 3.6, 1.3, tint);
  makePlate(lettered, 4, 3.6, 1.3, tint);
  return merged(mesh.done(), lettered);
}

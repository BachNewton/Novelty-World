import { createBuilder, type LandmarkMesh } from "../landmarks/kit";
import { makePlate, merged, onBearing, plateTint, type Painter } from "./paint";

/*
 * Two small models with a name on them. Each is its own mesh in the walls' vertex format, because a name is in a vertex's
 * tint, so they merge into a tile's cell like a landmark. +x runs along the forecourt or front, +z towards the road.
 */

/** From the road's middle to the middle of the canopy. */
const FORECOURT_M = 13;

export interface FuelStation {
  east: number;
  north: number;
  /** The way the model's +x points, with the road on its right. */
  bearing: number;
  /** How far OSM's point is from the road's middle. */
  roadM: number;
  word: string;
  osm: string;
  tile: string;
  /** NLS solids within 16 m of it, with their areas. */
  solids: [string, number][];
}

/** Where the model's origin goes: back from the road, if OSM's point is nearer than the forecourt needs. */
export function fuelOrigin({ east, north, bearing, roadM }: FuelStation): { east: number; north: number } {
  const back = Math.max(0, FORECOURT_M - roadM);
  const turn = (bearing * Math.PI) / 180;
  return { east: east - Math.cos(turn) * back, north: north + Math.sin(turn) * back };
}

/** A canopy on two columns, two islands of pumps, a kiosk behind and a price pylon by the road. */
export function fuelStation(paint: Painter, word: string, seed: number, bearingDeg = 0): LandmarkMesh {
  const mesh = createBuilder(onBearing(bearingDeg));
  const canopy = paint("fuel-canopy");
  const [halfLong, halfDeep, under, top] = [8, 4.2, 4.6, 5.3];
  const outline: [number, number][] = [
    [-halfLong, -halfDeep],
    [halfLong, -halfDeep],
    [halfLong, halfDeep],
    [-halfLong, halfDeep],
  ];
  mesh.extrude(outline, under, top, paint("fuel-band"), canopy);
  mesh.cap(outline, under, paint("fuel-canopy", 0.9));
  const pumps = paint("fuel-pump");
  for (const x of [-4, 4]) {
    mesh.box([x, 2.3, 0], [0.34, 4.6, 0.34], paint("fuel-canopy", 0.95));
    mesh.box([x, 0.1, 0], [6.2, 0.2, 1.1], paint("fuel-island"));
    for (const along of [-1.6, 1.6]) {
      mesh.box([x + along, 1, 0], [0.75, 1.65, 0.5], pumps);
      mesh.wall([x + along - 0.25, 0.26], [x + along + 0.25, 0.26], 1.2, 1.62, paint("fuel-glass"));
    }
  }
  const kiosk = -10;
  mesh.box([0, 1.75, kiosk], [13, 3.5, 6], paint("clad-white"), 0, paint("wall-grey", 0.85));
  mesh.wall([-5.5, kiosk + 3.02], [3, kiosk + 3.02], 0.3, 2.7, paint("fuel-glass"));
  mesh.wall([4, kiosk + 3.02], [5.4, kiosk + 3.02], 0, 2.4, paint("fuel-glass", 1.2));
  mesh.box([halfLong + 5, 2.6, halfDeep + 4.05], [2.1, 5.2, 0.4], paint("fuel-ink"));
  for (const row of [0, 1, 2]) mesh.wall([halfLong + 4.25, halfDeep + 4.27], [halfLong + 5.75, halfDeep + 4.27], 2.3 + row * 0.75, 2.78 + row * 0.75, paint(row === 2 ? "front-sun" : "fuel-pump"));
  const plates = createBuilder(onBearing(bearingDeg));
  const front = halfDeep + 0.03;
  const fasciaTall = top - under - 0.12;
  plates.wall([-5, front], [5, front], under + 0.06, top - 0.06, paint("fuel-canopy"));
  plates.wall([5, -front], [-5, -front], under + 0.06, top - 0.06, paint("fuel-canopy"));
  plates.wall([halfLong + 3.8, halfDeep + 4.3], [halfLong + 6.2, halfDeep + 4.3], 5.1, 6.3, paint("fuel-canopy"));
  const lettered = plates.done();
  const tint = plateTint(word, seed);
  makePlate(lettered, 0, 10, fasciaTall, tint);
  makePlate(lettered, 4, 10, fasciaTall, tint);
  makePlate(lettered, 8, 2.4, 1.2, tint);
  return merged(mesh.done(), lettered);
}

/** A supermarket's entrance: a canopy out from the wall and a name on a tall plate standing by the car park. */
export function supermarketEntrance(paint: Painter, word: string, seed: number): LandmarkMesh {
  const mesh = createBuilder();
  const [half, deep, under, top] = [5, 3.2, 3.2, 3.75];
  const outline: [number, number][] = [
    [-half, 0],
    [half, 0],
    [half, deep],
    [-half, deep],
  ];
  mesh.extrude(outline, under, top, paint("fuel-canopy"), paint("wall-grey", 0.85));
  mesh.cap(outline, under, paint("fuel-canopy", 0.86));
  for (const x of [-half + 0.3, 0, half - 0.3]) mesh.box([x, under / 2, deep - 0.25], [0.26, under, 0.26], paint("fuel-canopy", 0.95));
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

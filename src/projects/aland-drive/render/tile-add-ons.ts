import { addOnWalls, ADD_ON_FOOTPRINTS, cornersOf, doorFacades, ENTRANCE_CANOPY, ENTRANCE_PYLON, supermarketEntrances, villaAddOns, type AddOn, type Entrance, type Rectangle } from "../art/facades/add-on-places";
import type { SolidsCell } from "./solids";
import { RING_POINTS, type LandmarkPlace, type RoadSurface } from "./tile";

/*
 * What stands off a tile's walls, worked out in its worker: the villas' porches, verandas, bays and frontons and the
 * supermarkets' entrances, read from the building cells (`art/facades/add-on-places.ts`), less any that would stand on
 * the road surface, roads and paths alike: a building pushes a road only half a metre clear of its wall, and a porch
 * reaches two. The page draws what's kept, and the car meets the same places' walls.
 */

export interface TileAddOns {
  villas: AddOn[];
  entrances: Entrance[];
  /** The tile's terminal and fuel stations, as `tile.json` lists them. */
  nearSites: LandmarkPlace[];
}

const EDGE_LEFT = 1;
const CENTRE = 2;
const BUCKET_M = 20;
/** Points across a footprint tested against the roads, each way. */
const SAMPLES = 4;

/** How far a point is outside the nearest road's carriageway, below zero on it. */
function roadClearance(surface: RoadSurface): (x: number, z: number) => number {
  const buckets = new Map<string, number[]>();
  const key = (column: number, row: number) => `${column},${row}`;
  const segments: number[] = [];
  for (const chain of surface.chains) {
    for (let section = chain.first; section + 1 < chain.first + chain.sections; section++) {
      const at = (index: number, point: number) => (index * RING_POINTS + point) * 3;
      const [ax, az, bx, bz] = [surface.rings[at(section, CENTRE)], surface.rings[at(section, CENTRE) + 2], surface.rings[at(section + 1, CENTRE)], surface.rings[at(section + 1, CENTRE) + 2]];
      const half = Math.hypot(surface.rings[at(section, EDGE_LEFT)] - ax, surface.rings[at(section, EDGE_LEFT) + 2] - az);
      const index = segments.push(ax, az, bx, bz, half) - 5;
      const reach = half + BUCKET_M;
      for (let column = Math.floor((Math.min(ax, bx) - reach) / BUCKET_M); column <= Math.floor((Math.max(ax, bx) + reach) / BUCKET_M); column++) {
        for (let row = Math.floor((Math.min(az, bz) - reach) / BUCKET_M); row <= Math.floor((Math.max(az, bz) + reach) / BUCKET_M); row++) {
          const list = buckets.get(key(column, row));
          if (list) list.push(index);
          else buckets.set(key(column, row), [index]);
        }
      }
    }
  }
  return (x, z) => {
    let nearest = Infinity;
    for (const at of buckets.get(key(Math.floor(x / BUCKET_M), Math.floor(z / BUCKET_M))) ?? []) {
      const [ax, az, bx, bz, half] = segments.slice(at, at + 5);
      const [dx, dz] = [bx - ax, bz - az];
      const share = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      nearest = Math.min(nearest, Math.hypot(x - ax - dx * share, z - az - dz * share) - half);
    }
    return nearest;
  };
}

/** Whether no point across a footprint lies on a road. */
function offRoads(clearance: (x: number, z: number) => number, footprint: Rectangle, x: number, z: number, yaw: number, stretch = 1): boolean {
  const [a, b, , d] = cornersOf(footprint, x, z, yaw, stretch);
  for (let along = 0; along <= SAMPLES; along++) {
    for (let out = 0; out <= SAMPLES; out++) {
      const [u, v] = [along / SAMPLES, out / SAMPLES];
      if (clearance(a[0] + (b[0] - a[0]) * u + (d[0] - a[0]) * v, a[1] + (b[1] - a[1]) * u + (d[1] - a[1]) * v) < 0) return false;
    }
  }
  return true;
}

/** The tile's add-ons and entrances clear of its roads, and the walls they stand for the car. */
export function tileAddOns(cells: SolidsCell[], surface: RoadSurface, nearSites: LandmarkPlace[] = []): TileAddOns & { walls: Float32Array } {
  const clearance = roadClearance(surface);
  const doors = doorFacades(cells);
  const villas = villaAddOns(doors).filter(({ kind, x, z, outX, outZ, scale }) => {
    const footprint = ADD_ON_FOOTPRINTS[kind];
    return footprint === null || offRoads(clearance, footprint, x, z, Math.atan2(outX, outZ), scale);
  });
  const entrances = supermarketEntrances(doors)
    .filter(({ x, z, yaw }) => offRoads(clearance, ENTRANCE_CANOPY, x, z, yaw))
    .map((entrance) => ({ ...entrance, pylon: offRoads(clearance, ENTRANCE_PYLON, entrance.x, entrance.z, entrance.yaw) }));
  return { villas, entrances, nearSites, walls: addOnWalls(villas, entrances) };
}

import type { HeightGrid, TileManifest, WorldManifest } from "../render/tile";
import type { RoadPoint } from "./road-net";
import { SURFACES, type Surface } from "./surfaces";
import { tileDetail, World } from "./world";

/*
 * A test pad: one tile of flat, dry ground, walled at its edges as any tile
 * with nothing beyond it is. What a car does on it is the car and nothing of the
 * land, which is what measuring a car needs. It is laid with straight roads
 * flush with the ground, east to west, so that a car is never far from one: the
 * drive looks for the nearest road every step, and on land with none that
 * search runs out across the whole world. The whole pad, roads and ground, is
 * one surface, so a car's limits on it are that surface's.
 */

const TILE_M = 6000;
const NODES = 1501;
const STEP_M = 4;
const FAR_NODES = 376;
const FAR_STEP_M = 16;
const DRY_LEVEL_M = -300;
const GROUND_M = 10;
const ROADS_APART_M = 240;
const SECTION_M = 20;
/** A road's five points across, from its left edge to its right: the half-width of a two-lane road. */
const ACROSS_M = [4.5, 3, 0, -3, -4.5];

const NAME = "PAD";

const manifest = {
  version: "pad",
  tileM: TILE_M,
  worldOrigin: { east: 0, north: 0 },
  tiles: [{ name: NAME, west: 0, north: TILE_M }],
  start: { tile: NAME, chain: 0 },
  heights: { file: "", nodes: NODES, stepM: STEP_M, unitM: 0.01 },
  far: { heightsFile: "", nodes: FAR_NODES, stepM: FAR_STEP_M, shadeFile: "", shadePixels: 750 },
  shade: { file: "", pixels: 3000, gamma: 2.2 },
  mask: { file: "", pixels: 1500 },
  ground: { file: "", pixels: 3000, farFile: "", farPixels: 750 },
  canopy: { file: "", pixels: 1500, unitM: 0.25 },
  clearing: { file: "", pixels: 1500, unitM: 0.125, zero: 64 },
  stands: { file: "", pixels: 125 },
  water: { levelsFile: "", farLevelsFile: "", shoreFile: "", farShoreFile: "", dryLevel: DRY_LEVEL_M },
  overview: { west: 0, north: TILE_M, columns: 1, rows: 1, stepM: 80, unitM: 0.01, heightsFile: "", imageFile: "", imageWidth: 1, imageHeight: 1 },
  map: { file: "" },
  sun: { azimuthDeg: 215, elevationDeg: 30 },
  attribution: [],
} satisfies WorldManifest;

const ROADS = TILE_M / ROADS_APART_M;
const SECTIONS = TILE_M / SECTION_M + 1;

const tile: TileManifest = {
  tile: NAME,
  bounds: { west: 0, east: TILE_M, south: 0, north: TILE_M },
  roadSurface: { file: "", chains: Array.from({ length: ROADS }, () => ({ sections: SECTIONS, kind: "primary", motor: true })) },
  solids: { file: "", unitM: 0.02, cells: [], walls: 0 },
};

/** The roads as a tile's surface file has them: each section's points across as east, north and height, then a byte a section. */
function roadBytes(): ArrayBuffer {
  const floats = new Float32Array(ROADS * SECTIONS * ACROSS_M.length * 3);
  for (let road = 0; road < ROADS; road++) {
    const north = (road + 0.5) * ROADS_APART_M;
    for (let section = 0; section < SECTIONS; section++) {
      ACROSS_M.forEach((across, point) => {
        floats.set([section * SECTION_M, north + across, GROUND_M], ((road * SECTIONS + section) * ACROSS_M.length + point) * 3);
      });
    }
  }
  const bytes = new Uint8Array(floats.byteLength + ROADS * SECTIONS);
  bytes.set(new Uint8Array(floats.buffer));
  return bytes.buffer;
}

const grid = (nodes: number, stepM: number, value: number): HeightGrid => ({ nodes, stepM, west: 0, north: TILE_M, heights: Float32Array.from({ length: nodes * nodes }, (_, at) => value + (value > 0 ? 0.001 * (at % 2) : 0)) });

/** The pad spans x from 0 to its size and z from minus its size to 0, as the scene has it: east +x, north -z. */
export const PAD_M = TILE_M;

/** A world whose ground is all one surface. */
class Pad extends World {
  constructor(private readonly surface: Surface) {
    super(manifest);
  }

  override groundSurface(): Surface {
    return this.surface;
  }
}

export function testPad(surface: Surface = "asphalt"): World {
  const world = new Pad(surface);
  world.addFar(NAME, grid(FAR_NODES, FAR_STEP_M, GROUND_M), grid(FAR_NODES, FAR_STEP_M, DRY_LEVEL_M), grid(FAR_NODES, FAR_STEP_M, DRY_LEVEL_M));
  const detail = tileDetail(tile, grid(NODES, STEP_M, GROUND_M), roadBytes(), grid(NODES, STEP_M, DRY_LEVEL_M), grid(NODES, STEP_M, DRY_LEVEL_M), TILE_M);
  detail.ribbonSurfaces.fill(SURFACES.indexOf(surface));
  world.addDetail(detail);
  return world;
}

/** A place on the pad, facing east, the long way across it. */
export const padPoint = (x: number, z: number): RoadPoint => ({ x, y: GROUND_M, z, heading: -Math.PI / 2, along: 0, distance: 0 });

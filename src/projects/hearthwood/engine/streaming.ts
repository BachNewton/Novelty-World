import type { PlantReach, Quality } from "../quality";
import { PLANT_CHUNK } from "./life";
import type { PlantKind } from "./regions";

/*
 * What of the endless world is drawn from where the camera is, and in how
 * much detail. The land is a quadtree of square tiles: the coarsest cover the
 * whole view, and each splits into four finer ones as the camera comes near,
 * so every tile has the same number of vertices and the land is finest under
 * the walker's feet. Plants come in square chunks, each drawn near or far by
 * its distance. Everything here is pure, so what is wanted is always the
 * same for the same camera.
 */

/** The finest tile's width, in metres, and the vertices along each tile's side. */
export const TILE_SIZE = 64;
export const TILE_VERTICES = 33;
/** The coarsest level a tile is ever drawn at. */
const TOP_LEVEL = 11;

export interface TileKey {
  level: number;
  /** The tile's place on its level's grid. */
  i: number;
  j: number;
}

export function tileWidth(level: number): number {
  return TILE_SIZE * 2 ** level;
}

export function tileId({ level, i, j }: TileKey): string {
  return `${level}:${i}:${j}`;
}

/** The ground distance from a point to the nearest point of a square. */
export function distanceToSquare(x: number, z: number, minX: number, minZ: number, size: number): number {
  const dx = Math.max(minX - x, 0, x - (minX + size));
  const dz = Math.max(minZ - z, 0, z - (minZ + size));
  return Math.hypot(dx, dz);
}

export interface Eye {
  x: number;
  /** Its height above the ground beneath it. */
  y: number;
  z: number;
}

/** The tiles that cover the view from a camera, coarse far off and fine near by. */
export function wantedTiles(eye: Eye, quality: Pick<Quality, "viewDistance" | "tileSplit">): TileKey[] {
  const out: TileKey[] = [];
  const top = tileWidth(TOP_LEVEL);
  const lift = Math.max(0, eye.y - 60);
  const visit = (level: number, i: number, j: number) => {
    const size = tileWidth(level);
    const distance = Math.hypot(distanceToSquare(eye.x, eye.z, i * size, j * size, size), lift);
    if (distance > quality.viewDistance) return;
    if (level > 0 && distance < size * quality.tileSplit) {
      for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) visit(level - 1, i * 2 + di, j * 2 + dj);
      return;
    }
    out.push({ level, i, j });
  };
  const reach = Math.ceil(quality.viewDistance / top);
  const ci = Math.floor(eye.x / top);
  const cj = Math.floor(eye.z / top);
  for (let j = cj - reach; j <= cj + reach; j++) for (let i = ci - reach; i <= ci + reach; i++) visit(TOP_LEVEL, i, j);
  return out;
}

export type Detail = "near" | "far";

export type PlantClass = "trees" | "shrubs" | "small";

export const PLANT_CLASS: Record<PlantKind, PlantClass> = {
  conifer: "trees",
  pine: "trees",
  broadleaf: "trees",
  birch: "trees",
  aspen: "trees",
  maple: "trees",
  bush: "shrubs",
  heather: "shrubs",
  rock: "shrubs",
  fern: "small",
  mushroom: "small",
  flowers: "small",
};

export interface ChunkDetail {
  detail: Detail;
  /** The share of the chunk's copies drawn. */
  keep: number;
}

/** How a chunk this far away (its nearest point, in metres) draws a kind, or null when it doesn't. */
export function chunkDetail(reach: PlantReach, distance: number): ChunkDetail | null {
  if (distance > reach.far) return null;
  return { detail: distance <= reach.near ? "near" : "far", keep: distance > reach.thinFrom ? reach.keep : 1 };
}

export interface ChunkKey {
  chunkX: number;
  chunkZ: number;
}

/** The plant chunks within `reach` metres of a point, nearest first. */
export function wantedChunks(x: number, z: number, reach: number): ChunkKey[] {
  const out: (ChunkKey & { distance: number })[] = [];
  const c0 = Math.floor((x - reach) / PLANT_CHUNK);
  const c1 = Math.floor((x + reach) / PLANT_CHUNK);
  const r0 = Math.floor((z - reach) / PLANT_CHUNK);
  const r1 = Math.floor((z + reach) / PLANT_CHUNK);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const distance = distanceToSquare(x, z, c * PLANT_CHUNK, r * PLANT_CHUNK, PLANT_CHUNK);
      if (distance <= reach) out.push({ chunkX: c, chunkZ: r, distance });
    }
  }
  return out.sort((a, b) => a.distance - b.distance).map(({ chunkX, chunkZ }) => ({ chunkX, chunkZ }));
}

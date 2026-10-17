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

/** The ground distance from a point to the nearest point of a rectangle. */
function distanceToRect(x: number, z: number, minX: number, minZ: number, maxX: number, maxZ: number): number {
  return Math.hypot(Math.max(minX - x, 0, x - maxX), Math.max(minZ - z, 0, z - maxZ));
}

/** The ground distance from a point to the nearest point of a square. */
export function distanceToSquare(x: number, z: number, minX: number, minZ: number, size: number): number {
  return distanceToRect(x, z, minX, minZ, minX + size, minZ + size);
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

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** A box, as its least and greatest corners. */
export interface Bounds {
  min: Point3;
  max: Point3;
}

/** One side of a view: a point is inside where its dot with the normal plus the constant is not below zero (three's frustum planes are these). */
export interface ViewPlane {
  normal: Point3;
  constant: number;
}

/** How far the land may fall away below a chunk and still catch its shadows, in metres: past that, its shadows are taken to have reached the ground. */
const SHADOW_FALL = 60;

/** Whether a box is at least partly inside every side of a view. */
function boxInView(min: Point3, max: Point3, view: readonly ViewPlane[]): boolean {
  return view.every(({ normal: n, constant }) => n.x * (n.x > 0 ? max.x : min.x) + n.y * (n.y > 0 ? max.y : min.y) + n.z * (n.z > 0 ? max.z : min.z) + constant >= 0);
}

/**
 * Whether a chunk of plants shows in the view or casts a shadow into it, out
 * to `reach` metres from the eye (where the shadows end). Its box is swept
 * away from the light (`toLight` points towards it) in pieces, each the box
 * over one stretch of the way, until the sweep has sunk its own height and
 * the land's fall below the chunk, or has passed beyond the reach; the chunk
 * casts into the view if a piece within the reach lies in it. So a low sun
 * behind the camera brings in the woods behind it whose long shadows fall
 * forward into the view, and a high one only the chunks just beside it.
 */
export function castsIntoView(box: Bounds, eye: { x: number; z: number }, view: readonly ViewPlane[], toLight: Point3, reach: number): boolean {
  const width = Math.min(box.max.x - box.min.x, box.max.z - box.min.z);
  const length = Math.hypot(toLight.x, toLight.y, toLight.z);
  if (toLight.y <= 0) return false;
  const away = { x: -toLight.x / length, y: -toLight.y / length, z: -toLight.z / length };
  const across = Math.hypot(away.x, away.z);
  const height = Math.max(1, box.max.y - box.min.y);
  const end = Math.min((height + SHADOW_FALL) / -away.y, across > 0 ? (2 * reach + width) / across : Infinity);
  const step = Math.min(across > 0 ? width / across : Infinity, height / -away.y);
  const min = { x: 0, y: 0, z: 0 };
  const max = { x: 0, y: 0, z: 0 };
  for (let t = 0; t < end; t += step) {
    const t1 = Math.min(t + step, end);
    for (const axis of ["x", "y", "z"] as const) {
      const a = away[axis] * t;
      const b = away[axis] * t1;
      min[axis] = box.min[axis] + Math.min(a, b);
      max[axis] = box.max[axis] + Math.max(a, b);
    }
    if (distanceToRect(eye.x, eye.z, min.x, min.z, max.x, max.z) <= reach && boxInView(min, max, view)) return true;
  }
  return false;
}

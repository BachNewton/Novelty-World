import type { PlantKind } from "../../world/life";
import type { Detail } from "./plant-shapes";

/*
 * How each kind of plant is drawn with distance from the camera: in full
 * near by, in its far shape further out, thinned to a share of its copies
 * where the haze hides the gaps, and not at all past its reach. The valley is
 * cut into square chunks, and a whole chunk is drawn one way.
 */

export const CHUNK_SIZE = 32;

export interface ChunkDetail {
  detail: Detail;
  /** The share of the chunk's copies drawn. */
  keep: number;
}

interface Reach {
  /** Drawn in full within this many metres. */
  near: number;
  /** Drawn at all within this many; Infinity for everywhere. */
  far: number;
  /** Thinned to this share beyond `thinFrom` metres. */
  thinFrom: number;
  thinTo: number;
}

const TREE: Reach = { near: 52, far: Infinity, thinFrom: 150, thinTo: 0.55 };

const REACH: Record<PlantKind, Reach> = {
  conifer: TREE,
  broadleaf: TREE,
  birch: TREE,
  bush: { near: 44, far: 170, thinFrom: 110, thinTo: 0.5 },
  rock: { near: 36, far: 260, thinFrom: 140, thinTo: 0.5 },
  flowers: { near: 44, far: 44, thinFrom: 30, thinTo: 0.6 },
};

/** How a chunk this far away (its nearest point, in metres) draws a kind, or null when it doesn't. */
export function chunkDetail(kind: PlantKind, distance: number): ChunkDetail | null {
  const reach = REACH[kind];
  if (distance > reach.far) return null;
  const keep = distance > reach.thinFrom ? reach.thinTo : 1;
  return { detail: distance <= reach.near ? "near" : "far", keep };
}

/** The distance on the ground from a point to the nearest point of a chunk's square. */
export function distanceToChunk(x: number, z: number, minX: number, minZ: number): number {
  const dx = Math.max(minX - x, 0, x - (minX + CHUNK_SIZE));
  const dz = Math.max(minZ - z, 0, z - (minZ + CHUNK_SIZE));
  return Math.hypot(dx, dz);
}

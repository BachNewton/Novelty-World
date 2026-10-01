import { TUNING } from "../tuning";
import type { WorldPaint } from "./paints";

// The world is laid out in the game scene's axes: x across the road, one unit
// per lane, with lane k centred on x = k; y up from the road's surface; and
// z = -depth, so the road runs away from the camera toward -z. Depth is
// measured along the course from its start, and the road runs on forever in
// both directions.

export const ROAD_LEFT = -0.5;
export const ROAD_RIGHT = TUNING.corridorCols - 0.5;

// Beyond each road edge: a gravel shoulder, then a low kerb.
export const SHOULDER_WIDTH = 0.6;
export const KERB_WIDTH = 0.2;
export const KERB_HEIGHT = 0.08;
export const VERGE = SHOULDER_WIDTH + KERB_WIDTH;
// The road is a slab this thick, sitting on the land.
export const GROUND_DROP = 0.15;

// Near the road, everything stays low, so nothing ever hides a lane or the
// frog from the camera, or draws the eye away from them. Anything taller
// keeps its whole footprint at least the tall offset beyond the road's edge.
export const NEAR_HEIGHT_LIMIT = 0.7;
export const TALL_OFFSET = 5;

export type Side = "left" | "right";

export type Vec3 = readonly [number, number, number];

// One box of the world, in the scene's axes. It is turned by `roll` about z
// first and then by `yaw` about y, as Three applies an Euler of (0, yaw, roll).
export interface WorldBox {
  center: Vec3;
  size: Vec3;
  yaw: number;
  roll: number;
  paint: WorldPaint;
}

// Where a box is and how it is turned, whatever it is painted.
export type Placement = Omit<WorldBox, "paint">;

export function box(center: Vec3, size: Vec3, paint: WorldPaint, roll = 0, yaw = 0): WorldBox {
  return { center, size, yaw, roll, paint };
}

// A box standing on the ground, from its footprint's middle and depth.
export function block(x: number, depth: number, width: number, height: number, length: number, paint: WorldPaint, yaw = 0): WorldBox {
  return box([x, height / 2, -depth], [width, height, length], paint, 0, yaw);
}

// An axis-aligned patch of ground: across the road and along the course.
export interface Area {
  minX: number;
  maxX: number;
  minDepth: number;
  maxDepth: number;
}

export function overlaps(a: Area, b: Area): boolean {
  return a.minX < b.maxX && b.minX < a.maxX && a.minDepth < b.maxDepth && b.minDepth < a.maxDepth;
}

// A point given in a box's own axes, about its centre, placed in the world.
export function boxPoint(b: Placement, [x0, y0, z0]: Vec3): Vec3 {
  const [cr, sr] = [Math.cos(b.roll), Math.sin(b.roll)];
  const [cy, sy] = [Math.cos(b.yaw), Math.sin(b.yaw)];
  const [x1, y1] = [x0 * cr - y0 * sr, x0 * sr + y0 * cr];
  const [x2, z2] = [x1 * cy + z0 * sy, -x1 * sy + z0 * cy];
  return [b.center[0] + x2, b.center[1] + y1, b.center[2] + z2];
}

function corners(b: WorldBox): Vec3[] {
  const [w, h, d] = b.size;
  const result: Vec3[] = [];
  for (const x0 of [-w / 2, w / 2]) {
    for (const y0 of [-h / 2, h / 2]) {
      for (const z0 of [-d / 2, d / 2]) result.push(boxPoint(b, [x0, y0, z0]));
    }
  }
  return result;
}

// The ground a box covers.
export function boxArea(b: WorldBox): Area {
  const points = corners(b);
  const xs = points.map((p) => p[0]);
  const depths = points.map((p) => -p[2]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minDepth: Math.min(...depths), maxDepth: Math.max(...depths) };
}

export function boxTop(b: WorldBox): number {
  return Math.max(...corners(b).map((p) => p[1]));
}

export function boxBottom(b: WorldBox): number {
  return Math.min(...corners(b).map((p) => p[1]));
}

// x at `offset` beyond the road's edge on `side`.
export function sideX(side: Side, offset: number): number {
  return side === "left" ? ROAD_LEFT - offset : ROAD_RIGHT + offset;
}

// How far beyond the nearer road edge an area starts; negative when it
// reaches onto the road.
export function offsetFromRoad(area: Area): number {
  if (area.maxX <= ROAD_LEFT) return ROAD_LEFT - area.maxX;
  if (area.minX >= ROAD_RIGHT) return area.minX - ROAD_RIGHT;
  return -1;
}

// Everything on the ground between two offsets beyond the road edge on one
// side, over a stretch of the course.
export function sideArea(side: Side, from: number, to: number, near: number, far: number): Area {
  const [a, b] = [sideX(side, from), sideX(side, to)];
  return { minX: Math.min(a, b), maxX: Math.max(a, b), minDepth: near, maxDepth: far };
}

// The road itself, lanes, shoulders and kerbs, over a stretch of the course.
export function roadArea(near: number, far: number): Area {
  return { minX: ROAD_LEFT - VERGE, maxX: ROAD_RIGHT + VERGE, minDepth: near, maxDepth: far };
}

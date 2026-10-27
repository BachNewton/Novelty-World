import { BASKET_RADIUS, ISLAND, LEVEL } from "./level";
import type { Point } from "./types";

/** Walking round the island, pure: speed, bumping into things, and the spot in front of a player. */

export const WALK_SPEED = 4;
export const PLAYER_RADIUS = 0.35;
/** How far in front of a player they put an animal down. */
export const PUT_DOWN_REACH = 0.9;
/** How far up the beach the sea comes: players keep their feet dry. */
const SHORE = 2;

interface Circle {
  x: number;
  z: number;
  r: number;
}

const COLLIDERS: readonly Circle[] = [
  ...LEVEL.props.filter((p) => p.radius > 0).map((p) => ({ x: p.x, z: p.z, r: p.radius })),
  ...LEVEL.homes.map((h) => ({ x: h.x, z: h.z, r: BASKET_RADIUS })),
];

/** Move by `velocity` for `dt` seconds, sliding round anything in the way and staying on the island. */
export function walk(from: Point, velocity: Point, dt: number): Point {
  let x = from.x + velocity.x * dt;
  let z = from.z + velocity.z * dt;
  for (const c of COLLIDERS) {
    const dx = x - c.x;
    const dz = z - c.z;
    const d = Math.hypot(dx, dz);
    const min = c.r + PLAYER_RADIUS;
    if (d < min && d > 1e-6) {
      x = c.x + (dx / d) * min;
      z = c.z + (dz / d) * min;
    }
  }
  // Past the shore, pull back along the way out from the middle.
  const rx = ISLAND.rx - SHORE;
  const rz = ISLAND.rz - SHORE;
  const out = Math.hypot(x / rx, z / rz);
  if (out > 1) {
    x /= out;
    z /= out;
  }
  return { x, z };
}

/** The point `reach` in front of someone at `at` facing `heading` (0 faces +z). */
export function inFront(at: Point, heading: number, reach: number): Point {
  return { x: at.x + Math.sin(heading) * reach, z: at.z + Math.cos(heading) * reach };
}

/** Turn `from` toward `to` by at most `maxStep` radians, the short way round. */
export function turnToward(from: number, to: number, maxStep: number): number {
  const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + Math.max(-maxStep, Math.min(maxStep, diff));
}

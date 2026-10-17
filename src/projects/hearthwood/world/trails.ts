import { type Grid, forEachNear, nearestVertex, sample, vertexPosition } from "./grid";
import { lerp } from "./noise";
import { cheapestRoute, resampleLine, routePoints, smoothLine, type Point2 } from "./paths";
import type { Camp, Place, PlaceKind } from "./places";
import { WALK_LIMITS } from "./walking";

/*
 * Trails from camp to each place, along the land's easy lines: they climb
 * gently, keep off cliffs and out of the lake, cross the stream where they
 * must, and share their way where two go the same direction.
 */

export interface Trail {
  to: PlaceKind;
  points: Point2[];
}

/** Where a trail fords the stream, on stepping stones laid across it. */
export interface Crossing {
  x: number;
  z: number;
  /** The trail's heading there, in radians from +x towards +z. */
  heading: number;
}

/** How much less a step along a trail already laid costs, so trails join up. */
const SHARED_WAY = 0.4;
const STREAM_FORD = 30;

export function layTrails(heights: Grid, streamDistance: Grid, camp: Camp, places: readonly Place[]): Trail[] {
  const onTrail = new Uint8Array(heights.side * heights.side);
  const start = nearestVertex(heights, camp.x, camp.z);
  const byDistance = [...places].sort((a, b) => Math.hypot(a.visitX - camp.x, a.visitZ - camp.z) - Math.hypot(b.visitX - camp.x, b.visitZ - camp.z));
  const trails: Trail[] = [];
  for (const place of byDistance) {
    const goal = nearestVertex(heights, place.visitX, place.visitZ);
    const target = vertexPosition(heights, goal);
    const route = cheapestRoute(
      heights,
      start,
      (i) => i === goal,
      (from, to, length) => {
        const h = heights.values[to];
        if (h < 0.4 || h > WALK_LIMITS.ceiling) return Infinity;
        const slope = Math.abs(h - heights.values[from]) / length;
        if (slope > WALK_LIMITS.steepest * 0.8) return Infinity;
        const ford = streamDistance.values[to] < 2.5 ? STREAM_FORD : 0;
        const easy = length * (1 + 30 * slope * slope) + ford;
        return onTrail[to] ? easy * SHARED_WAY : easy;
      },
      (i) => {
        const p = vertexPosition(heights, i);
        return Math.hypot(p.x - target.x, p.z - target.z) * SHARED_WAY;
      },
    );
    if (route === null) throw new Error(`No trail reaches the ${place.kind}`);
    for (const i of route) onTrail[i] = 1;
    trails.push({ to: place.kind, points: resampleLine(smoothLine(routePoints(heights, route), 3), 1.5) });
  }
  return trails;
}

/** Eases the land across each trail level, so it is a worn way rather than a line painted on the slope. */
export function wearTrails(heights: Grid, streamDistance: Grid, trails: readonly Trail[]): void {
  for (const trail of trails) {
    for (const p of resampleLine(trail.points, 1)) {
      if (sample(streamDistance, p.x, p.z) < 4) continue;
      const level = sample(heights, p.x, p.z);
      forEachNear(heights, p.x, p.z, 2.6, (i, distance) => {
        heights.values[i] = lerp(heights.values[i], level, 0.5 * (1 - distance / 2.6));
      });
    }
  }
}

export function findCrossings(streamDistance: Grid, trails: readonly Trail[]): Crossing[] {
  const crossings: Crossing[] = [];
  for (const trail of trails) {
    const line = resampleLine(trail.points, 0.5);
    let k = 0;
    while (k < line.length) {
      if (sample(streamDistance, line[k].x, line[k].z) > 1.2) {
        k++;
        continue;
      }
      let end = k;
      while (end + 1 < line.length && sample(streamDistance, line[end + 1].x, line[end + 1].z) <= 1.2) end++;
      const middle = line[Math.floor((k + end) / 2)];
      const before = line[Math.max(0, k - 2)];
      const after = line[Math.min(line.length - 1, end + 2)];
      if (!crossings.some((c) => Math.hypot(c.x - middle.x, c.z - middle.z) < 4)) {
        crossings.push({ x: middle.x, z: middle.z, heading: Math.atan2(after.z - before.z, after.x - before.x) });
      }
      k = end + 1;
    }
  }
  return crossings;
}

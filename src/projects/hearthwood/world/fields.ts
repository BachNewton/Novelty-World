import { type Grid, forEachNear, makeGrid, sample } from "./grid";
import { lerp } from "./noise";
import { resampleLine, type Point2 } from "./paths";

/** How far each vertex lies from the nearest of some lines, up to `cap` metres. */
export function distanceField(like: Grid, lines: readonly (readonly Point2[])[], cap: number): Grid {
  const field = makeGrid(like.side, like.spacing, cap);
  for (const line of lines) {
    for (const p of resampleLine(line, 0.75)) {
      forEachNear(field, p.x, p.z, cap, (i, distance) => {
        if (distance < field.values[i]) field.values[i] = distance;
      });
    }
  }
  return field;
}

/** Levels the land within `radius` of a point to its mean there, easing back to the land as it was by `radius + blend`. */
export function flatten(heights: Grid, x: number, z: number, radius: number, blend: number): number {
  let sum = 0;
  let count = 0;
  forEachNear(heights, x, z, radius, (i) => {
    sum += heights.values[i];
    count++;
  });
  const level = sum / count;
  forEachNear(heights, x, z, radius + blend, (i, distance) => {
    const t = distance <= radius ? 1 : 1 - (distance - radius) / blend;
    heights.values[i] = lerp(heights.values[i], level, t * t * (3 - 2 * t));
  });
  return level;
}

/** How uneven the land is within `radius` of a point: its highest less its lowest. */
export function roughness(heights: Grid, x: number, z: number, radius: number): number {
  let low = Infinity;
  let high = -Infinity;
  forEachNear(heights, x, z, radius, (i) => {
    low = Math.min(low, heights.values[i]);
    high = Math.max(high, heights.values[i]);
  });
  return high - low;
}

/** The land's mean height on a ring round a point, for how far the point stands above its surroundings. */
export function ringMean(heights: Grid, x: number, z: number, radius: number): number {
  let sum = 0;
  const steps = 16;
  for (let k = 0; k < steps; k++) {
    const angle = (k / steps) * Math.PI * 2;
    sum += sample(heights, x + Math.cos(angle) * radius, z + Math.sin(angle) * radius);
  }
  return sum / steps;
}

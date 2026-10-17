import { slopeAt, vertexPosition, sample } from "./grid";
import { ALTITUDE } from "./land";
import { bandWobble } from "./life";
import { fbm, gradientNoise, smoothstep } from "./noise";
import { lakeDistance, WATER_LEVEL } from "./water";
import type { Valley } from "./valley";

/*
 * The valley's biomes, set by altitude and water, and what covers the ground
 * at each vertex as a blend of a few grounds, which the drawing colours.
 */

export type Biome = "lake" | "stream" | "shore" | "meadow" | "forest" | "alpine" | "rock" | "snow";

/** The grounds the land is painted with, in the order of a vertex's weights. */
export const GROUNDS = ["meadow", "forest", "alpine", "rock", "snow", "shore", "path"] as const;
export type Ground = (typeof GROUNDS)[number];

export function biomeAt(valley: Valley, x: number, z: number): Biome {
  const h = sample(valley.heights, x, z);
  const lake = lakeDistance(valley.lake, x, z);
  if (lake < 1 && h < WATER_LEVEL) return "lake";
  if (sample(valley.streamDistance, x, z) < 1.2) return "stream";
  if (lake < 1.4 && h < 1) return "shore";
  const w = bandWobble(valley.bandNoise, x, z);
  if (h > ALTITUDE.snow + w && slopeAt(valley.heights, x, z) < 0.7) return "snow";
  if (h > ALTITUDE.rock + w || slopeAt(valley.heights, x, z) > 1.2) return "rock";
  if (h > ALTITUDE.treeline + w) return "alpine";
  return sample(valley.woodland, x, z) > 0.45 ? "forest" : "meadow";
}

/**
 * Each vertex's blend of GROUNDS, as weights summing to 1 (GROUNDS.length per
 * vertex), with how lush it looks (-1 to 1) for a little variety within one ground.
 */
export function groundCover(valley: Valley): { weights: Float32Array; lushness: Float32Array } {
  const { heights } = valley;
  const count = heights.side * heights.side;
  const weights = new Float32Array(count * GROUNDS.length);
  const lushness = new Float32Array(count);
  const lush = gradientNoise(`${valley.seed}/lush`);
  const w = new Float32Array(GROUNDS.length);
  const paint = (ground: number, amount: number) => {
    if (amount <= 0) return;
    for (let g = 0; g < GROUNDS.length; g++) w[g] *= 1 - amount;
    w[ground] += amount;
  };
  for (let i = 0; i < count; i++) {
    const { x, z } = vertexPosition(heights, i);
    const h = heights.values[i];
    const slope = slopeAt(heights, x, z);
    const wobble = bandWobble(valley.bandNoise, x, z);
    w.fill(0);
    w[0] = 1;
    paint(1, smoothstep(0.15, 0.7, valley.woodland.values[i]));
    paint(2, smoothstep(ALTITUDE.treeline - 4 + wobble, ALTITUDE.treeline + 7 + wobble, h));
    paint(3, Math.max(smoothstep(ALTITUDE.rock - 5 + wobble, ALTITUDE.rock + 5 + wobble, h), smoothstep(1.15, 1.7, slope)));
    paint(4, smoothstep(ALTITUDE.snow - 8 + wobble, ALTITUDE.snow + 4 + wobble, h) * (1 - smoothstep(0.55, 0.85, slope)));
    const shore = (1 - smoothstep(0.5, 1.6, h)) * (1 - smoothstep(1.3, 1.8, lakeDistance(valley.lake, x, z)));
    paint(5, Math.max(shore, 0.85 * (1 - smoothstep(1.2, 2.6, valley.streamDistance.values[i]))));
    const fromFire = Math.hypot(x - valley.camp.x, z - valley.camp.z);
    paint(6, Math.max(0.85 * (1 - smoothstep(1.1, 2.8, valley.trailDistance.values[i])), 0.9 * (1 - smoothstep(3, 6.5, fromFire))));
    weights.set(w, i * GROUNDS.length);
    lushness[i] = fbm(lush, x / 30, z / 30, 3);
  }
  return { weights, lushness };
}

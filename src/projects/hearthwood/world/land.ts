import { createRng, uniform } from "@/shared/lib/seeded-random";
import { type Grid, makeGrid, worldX } from "./grid";
import { fbm, gradientNoise, ridged, smoothstep } from "./noise";

/*
 * The land before water and people shape it: a bowl of meadow floor ringed
 * by mountains. Heights are metres above the lake's surface, which is the
 * valley's lowest water.
 */

/** Vertices along each side of the valley's grid. */
export const VALLEY_SIDE = 257;
/** Metres between grid vertices: the valley is 512 m square. */
export const VALLEY_SPACING = 2;
/** How far from the middle the mountains have fully risen, in metres. */
export const RIM_RADIUS = 225;
/** Half the valley's width. */
const VALLEY_EXTENT = ((VALLEY_SIDE - 1) * VALLEY_SPACING) / 2;
/** The height the land rises to at the grid's edge, at least. */
const EDGE_RISE = 110;

/** The heights the bands of the valley sit at, before each band's own wobble. */
export const ALTITUDE = {
  /** Meadow floor gives way to forest. */
  forest: 10,
  /** The trees thin out to alpine grass. */
  treeline: 50,
  /** The highest the walker climbs: the alpine grass goes on a little above. */
  ceiling: 72,
  /** Grass gives way to bare rock. */
  rock: 100,
  /** Snow lies on whatever is flat enough to hold it. */
  snow: 126,
} as const;

/** How the bowl's middle and its rim are placed, drawn from the seed. */
export interface LandShape {
  /** The bowl's stretch along its long axis and the axis's angle. */
  stretch: number;
  angle: number;
  /** The direction of the pass: a saddle in the rim, the way over into the next valley. */
  pass: number;
}

/** How wide the pass is, in radians round the rim, and how far it pulls the rim in. */
const PASS_WIDTH = 0.3;
const PASS_DEPTH = 0.13;

export function landShape(seed: string): LandShape {
  const rng = createRng(`${seed}/land-shape`);
  return { stretch: uniform(rng, 0.85, 1.15), angle: uniform(rng, 0, Math.PI), pass: uniform(rng, -Math.PI, Math.PI) };
}

/** How much of the pass's saddle lies in a direction from the valley's middle, 0 to 1. */
export function passShare(shape: LandShape, x: number, z: number): number {
  const off = Math.atan2(Math.sin(Math.atan2(z, x) - shape.pass), Math.cos(Math.atan2(z, x) - shape.pass));
  return Math.exp(-((off / PASS_WIDTH) ** 2));
}

/** How far a point is out towards the rim: 0 in the middle, 1 where the mountains have risen. */
export function rimDistance(shape: LandShape, warp: number, x: number, z: number): number {
  const cos = Math.cos(shape.angle);
  const sin = Math.sin(shape.angle);
  const along = (x * cos + z * sin) / shape.stretch;
  const across = (-x * sin + z * cos) * shape.stretch;
  return Math.hypot(along, across) / RIM_RADIUS + warp;
}

/** The mountains' rise with distance out towards the rim: [distance, height] in order, eased between. */
const RIM_PROFILE: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.42, 1],
  [0.56, 7],
  [0.7, 20],
  [0.82, 38],
  [0.9, 54],
  [0.97, 76],
  [1.05, 112],
  [1.25, 150],
];

export function rimProfile(d: number): number {
  for (let k = 1; k < RIM_PROFILE.length; k++) {
    const [d1, h1] = RIM_PROFILE[k];
    if (d <= d1) {
      const [d0, h0] = RIM_PROFILE[k - 1];
      return h0 + (h1 - h0) * smoothstep(d0, d1, d) ;
    }
  }
  return RIM_PROFILE[RIM_PROFILE.length - 1][1];
}

export function buildLand(seed: string, shape: LandShape): Grid {
  const heights = makeGrid(VALLEY_SIDE, VALLEY_SPACING);
  const hills = gradientNoise(`${seed}/hills`);
  const peakNoise = gradientNoise(`${seed}/peaks`);
  const warp = gradientNoise(`${seed}/warp`);
  const detail = gradientNoise(`${seed}/detail`);
  for (let row = 0; row < heights.side; row++) {
    const z = worldX(heights, row);
    for (let column = 0; column < heights.side; column++) {
      const x = worldX(heights, column);
      const d = rimDistance(shape, 0.17 * fbm(warp, x / 170, z / 170, 3) - PASS_DEPTH * passShare(shape, x, z), x, z);
      const floor = 4 + 2.6 * fbm(hills, x / 90, z / 90, 3) + 0.5 * fbm(detail, x / 22, z / 22, 2);
      const foothills = 7 * smoothstep(0.3, 0.7, d) * (0.5 + 0.5 * fbm(hills, x / 55 + 40, z / 55, 3));
      const peaks = 48 * smoothstep(0.6, 1.1, d) * ridged(peakNoise, x / 110, z / 110, 5);
      const crags = 12 * smoothstep(0.5, 1, d) * fbm(detail, x / 45, z / 45, 4);
      // Near the grid's edge the mountains always rise past the walker's reach, whatever the bowl's shape, so the land never ends in view.
      const edge = EDGE_RISE * smoothstep(VALLEY_EXTENT - 70, VALLEY_EXTENT - 10, Math.max(Math.abs(x), Math.abs(z)));
      const height = floor + foothills + Math.max(rimProfile(d), edge) + peaks + crags;
      heights.values[row * heights.side + column] = height;
    }
  }
  return heights;
}

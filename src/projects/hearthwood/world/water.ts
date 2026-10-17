import { createRng, uniform } from "@/shared/lib/seeded-random";
import { type Grid, forEachNear, nearestVertex, sample, slopeAt, vertexPosition } from "./grid";
import { fbm, gradientNoise, lerp, smoothstep, type Noise2 } from "./noise";
import { cheapestRoute, resampleLine, routePoints, smoothLine, type Point2 } from "./paths";

/*
 * The valley's water: a lake on the floor, and a stream that rises high on
 * the far side, runs always downhill, drops over a waterfall in the forest
 * and feeds the lake. The lake's surface is height 0.
 */

export const WATER_LEVEL = 0;
/** The depth of water in the stream's channel. */
export const STREAM_DEPTH = 0.3;

export interface Lake {
  x: number;
  z: number;
  /** The shore's mean distance from the lake's middle; the shore wobbles round it. */
  radius: number;
  /** How far the shore reaches in each direction, as a share of the radius. */
  shoreAt: (angle: number) => number;
}

export interface StreamPoint {
  x: number;
  z: number;
  /** The water's surface. */
  surface: number;
  /** Half the channel's width. */
  halfWidth: number;
}

export interface Waterfall {
  /** The point along the stream the water drops from. */
  index: number;
  x: number;
  z: number;
  top: number;
  bottom: number;
}

export interface Stream {
  points: StreamPoint[];
  waterfall: Waterfall;
}

const LAKE_DEPTH = 3.4;
const WATERFALL_DROP = 6.5;
const SPRING_HEIGHT = 54;
/** The pool the falls drop into, in metres across its middle. */
const POOL_RADIUS = 3.5;

function shoreFunction(noise: Noise2): (angle: number) => number {
  return (angle) => 1 + 0.24 * noise(Math.cos(angle) * 1.3 + 5, Math.sin(angle) * 1.3 + 5) + 0.08 * noise(Math.cos(angle) * 3.1, Math.sin(angle) * 3.1);
}

/** How far a point lies from the lake's middle, as a share of the shore's reach in its direction: under 1 is water. */
export function lakeDistance(lake: Lake, x: number, z: number): number {
  const dx = x - lake.x;
  const dz = z - lake.z;
  return Math.hypot(dx, dz) / (lake.radius * lake.shoreAt(Math.atan2(dz, dx)));
}

export function placeLake(seed: string): Lake {
  const rng = createRng(`${seed}/lake`);
  const angle = uniform(rng, 0, Math.PI * 2);
  const distance = uniform(rng, 40, 72);
  return {
    x: Math.cos(angle) * distance,
    z: Math.sin(angle) * distance,
    radius: uniform(rng, 30, 40),
    shoreAt: shoreFunction(gradientNoise(`${seed}/shore`)),
  };
}

export function carveLake(heights: Grid, lake: Lake): void {
  forEachNear(heights, lake.x, lake.z, lake.radius * 2.6, (i) => {
    const { x, z } = vertexPosition(heights, i);
    const q = lakeDistance(lake, x, z);
    const bowl = q < 1 ? -LAKE_DEPTH * (1 - q * q) : (q - 1) * 3;
    const h = heights.values[i];
    heights.values[i] = lerp(Math.min(h, bowl), h, smoothstep(0.9, 2.2, q));
  });
}

/** The stream's source: up the slope on the far side of the valley from the lake. */
function findSpring(heights: Grid, lake: Lake, seed: string): Point2 {
  const rng = createRng(`${seed}/spring`);
  const angle = Math.atan2(lake.z, lake.x) + Math.PI + uniform(rng, -0.7, 0.7);
  for (let r = 0; r < 300; r += 2) {
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    if (sample(heights, x, z) >= SPRING_HEIGHT) return { x, z };
  }
  throw new Error("No slope rises high enough for a spring");
}

/** Raises a shelf on the stream's way, so it falls over a cliff of WATERFALL_DROP there. */
function raiseLedge(heights: Grid, line: readonly Point2[], at: number): void {
  const here = line[at];
  const ahead = line[Math.min(line.length - 1, at + 4)];
  const length = Math.hypot(ahead.x - here.x, ahead.z - here.z);
  const dx = (ahead.x - here.x) / length;
  const dz = (ahead.z - here.z) / length;
  forEachNear(heights, here.x, here.z, 40, (i) => {
    const { x, z } = vertexPosition(heights, i);
    const upstream = -((x - here.x) * dx + (z - here.z) * dz);
    const lateral = Math.abs(-(x - here.x) * dz + (z - here.z) * dx);
    const shelf = smoothstep(-0.6, 1.4, upstream) * (1 - smoothstep(9, 22, lateral)) * (1 - smoothstep(16, 36, upstream));
    heights.values[i] += WATERFALL_DROP * shelf;
  });
}

/** Where the falls go: the steepest stretch of the stream inside the forest band. */
function waterfallSite(heights: Grid, line: readonly Point2[]): number {
  let best = -1;
  let bestDrop = -Infinity;
  for (let k = 10; k < line.length - 12; k++) {
    const h = sample(heights, line[k].x, line[k].z);
    if (h < 16 || h > 36) continue;
    const drop = h - sample(heights, line[k + 8].x, line[k + 8].z);
    if (drop > bestDrop) {
      bestDrop = drop;
      best = k;
    }
  }
  if (best === -1) throw new Error("The stream never passes through the forest band");
  return best;
}

/** Lets the stream swing from side to side where the land is flat enough for it to wander, as streams do across a meadow. */
function meanderAcrossFlats(heights: Grid, line: readonly Point2[], seed: string): Point2[] {
  const bends = gradientNoise(`${seed}/bends`);
  const bent = line.map((p, k) => {
    const ahead = line[Math.min(line.length - 1, k + 2)];
    const behind = line[Math.max(0, k - 2)];
    const dx = ahead.x - behind.x;
    const dz = ahead.z - behind.z;
    const length = Math.hypot(dx, dz) || 1;
    const flat = 1 - smoothstep(0.06, 0.2, slopeAt(heights, p.x, p.z));
    const ends = smoothstep(0, 25, k) * smoothstep(0, 25, line.length - 1 - k);
    const swing = 18 * flat * ends * fbm(bends, k / 30, 0.5, 2);
    return { x: p.x - (dz / length) * swing, z: p.z + (dx / length) * swing };
  });
  return resampleLine(smoothLine(bent, 2), 1);
}

/**
 * Cuts the stream's channel: each vertex near the stream is cut down to the
 * bed of the stream point nearest it, with banks rising away from the water.
 * Only the nearest point counts, so a low pool below the falls never eats
 * back into the cliff above it.
 */
function carveChannel(heights: Grid, points: readonly StreamPoint[]): void {
  const nearest = new Map<number, { distance: number; point: StreamPoint }>();
  for (const p of points) {
    forEachNear(heights, p.x, p.z, p.halfWidth * 3 + 2, (i, distance) => {
      const seen = nearest.get(i);
      if (seen === undefined || distance < seen.distance) nearest.set(i, { distance, point: p });
    });
  }
  for (const [i, { distance, point }] of nearest) {
    // The bed is at least about a grid cell wide, so the land between vertices never rises through the water.
    const t = distance / Math.max(point.halfWidth, heights.spacing * 0.8);
    const target = point.surface - STREAM_DEPTH + (t < 1 ? 0 : (t - 1) * 0.9);
    if (target < heights.values[i]) heights.values[i] = target;
  }
}

export function runStream(heights: Grid, lake: Lake, seed: string): Stream {
  const spring = findSpring(heights, lake, seed);
  const start = nearestVertex(heights, spring.x, spring.z);
  const inLake = (i: number) => {
    const { x, z } = vertexPosition(heights, i);
    return lakeDistance(lake, x, z) < 0.75;
  };
  const meander = gradientNoise(`${seed}/meander`);
  const route = cheapestRoute(
    heights,
    start,
    inLake,
    (from, to, length) => {
      const { x, z } = vertexPosition(heights, to);
      const wander = 1 + 1.6 * (0.5 + 0.5 * fbm(meander, x / 35, z / 35, 2));
      return length * wander + 40 * Math.max(0, heights.values[to] - heights.values[from]);
    },
    (i) => {
      const { x, z } = vertexPosition(heights, i);
      return Math.max(0, Math.hypot(x - lake.x, z - lake.z) - lake.radius * 1.4);
    },
  );
  if (route === null) throw new Error("The stream can't reach the lake");
  const line = meanderAcrossFlats(heights, resampleLine(smoothLine(routePoints(heights, route), 3), 1), seed);
  const fallsAt = waterfallSite(heights, line);
  raiseLedge(heights, line, fallsAt);

  const points: StreamPoint[] = [];
  let surface = Infinity;
  for (let k = 0; k < line.length; k++) {
    const { x, z } = line[k];
    surface = Math.max(WATER_LEVEL, Math.min(surface - 0.012, sample(heights, x, z) - 0.4));
    points.push({ x, z, surface, halfWidth: 0.7 + 1.1 * (k / line.length) });
  }
  carveChannel(heights, points);

  let index = fallsAt;
  for (let k = Math.max(0, fallsAt - 6); k < Math.min(points.length - 1, fallsAt + 6); k++) {
    if (points[k].surface - points[k + 1].surface > points[index].surface - points[index + 1].surface) index = k;
  }
  const pool = points[Math.min(points.length - 1, index + Math.ceil(POOL_RADIUS) + 2)];
  forEachNear(heights, pool.x, pool.z, POOL_RADIUS, (i, distance) => {
    const target = pool.surface - STREAM_DEPTH - 1.1 * (1 - (distance / POOL_RADIUS) ** 2);
    if (target < heights.values[i]) heights.values[i] = target;
  });
  const top = points[index];
  return {
    points,
    waterfall: { index, x: top.x, z: top.z, top: top.surface, bottom: points[Math.min(points.length - 1, index + 2)].surface },
  };
}

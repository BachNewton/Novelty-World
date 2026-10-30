import { surfaceHeight, type HeightGrid, type Road } from "./tile";

/*
 * Roads as flat ribbons laid on the terrain: a little above the surface at
 * their left edge, middle and right edge, every few metres along the line.
 */

const STATION_SPACING_M = 4;
const LIFT_M = 0.2;

/** Ribbon widths in metres by OSM highway kind. OSM rarely tags a width here, so these are typical sizes. */
const WIDTH_M: Partial<Record<string, number>> = { primary: 7.5, secondary: 7, tertiary: 6, unclassified: 4.5, residential: 4.5, service: 3.5, track: 2.5 };
const OTHER_WIDTH_M = 2;

export type RoadTier = "main" | "minor" | "track";

const tierOf = (kind: string): RoadTier => {
  if (kind === "primary" || kind === "secondary" || kind === "tertiary") return "main";
  if (kind === "unclassified" || kind === "residential" || kind === "service") return "minor";
  return "track";
};

export interface RibbonMesh {
  positions: Float32Array;
  /** Each vertex's tier, as an index into `RoadTier` order. */
  tiers: Float32Array;
  indices: Uint32Array;
}

export const ROAD_TIERS: readonly RoadTier[] = ["main", "minor", "track"];

function stations(line: Road["line"]): [number, number][] {
  const points: [number, number][] = [];
  for (let index = 1; index < line.length; index++) {
    const [fromEast, fromNorth] = line[index - 1];
    const [toEast, toNorth] = line[index];
    const steps = Math.max(1, Math.ceil(Math.hypot(toEast - fromEast, toNorth - fromNorth) / STATION_SPACING_M));
    for (let step = 0; step < steps; step++) {
      const part = step / steps;
      points.push([fromEast + part * (toEast - fromEast), fromNorth + part * (toNorth - fromNorth)]);
    }
  }
  points.push(line[line.length - 1]);
  return points;
}

export function buildRibbons(roads: readonly Road[], grid: HeightGrid): RibbonMesh {
  const positions: number[] = [];
  const tiers: number[] = [];
  const indices: number[] = [];
  for (const road of roads) {
    const halfWidth = (WIDTH_M[road.kind] ?? OTHER_WIDTH_M) / 2;
    const tier = ROAD_TIERS.indexOf(tierOf(road.kind));
    const points = stations(road.line);
    const first = positions.length / 3;
    points.forEach(([east, north], index) => {
      const [beforeEast, beforeNorth] = points[Math.max(index - 1, 0)];
      const [afterEast, afterNorth] = points[Math.min(index + 1, points.length - 1)];
      const length = Math.hypot(afterEast - beforeEast, afterNorth - beforeNorth);
      const leftEast = (-(afterNorth - beforeNorth) / length) * halfWidth;
      const leftNorth = ((afterEast - beforeEast) / length) * halfWidth;
      for (const side of [1, 0, -1]) {
        const pointEast = east + side * leftEast;
        const pointNorth = north + side * leftNorth;
        positions.push(pointEast, surfaceHeight(grid, pointEast, pointNorth) + LIFT_M, -pointNorth);
        tiers.push(tier);
      }
    });
    for (let station = 0; station < points.length - 1; station++) {
      for (let lane = 0; lane < 2; lane++) {
        const here = first + station * 3 + lane;
        const next = here + 3;
        indices.push(here, here + 1, next, next, here + 1, next + 1);
      }
    }
  }
  return { positions: Float32Array.from(positions), tiers: Float32Array.from(tiers), indices: Uint32Array.from(indices) };
}

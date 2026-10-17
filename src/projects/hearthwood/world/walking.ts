import { type Grid, extent, sample, slopeAt } from "./grid";
import { ALTITUDE } from "./land";
import { WATER_LEVEL } from "./water";

/*
 * Where a walker may go: anywhere on the land up to where the grass gives way
 * to bare rock, never up a cliff, and no deeper into the lake than a paddle.
 * The mountains round the rim rise past that limit, so they keep the walker
 * in the valley without a wall.
 */

export const WALK_LIMITS = {
  /** The highest ground a walker reaches. */
  ceiling: ALTITUDE.ceiling,
  /** The steepest ground a walker stands on or climbs, as rise over run (about 45°). */
  steepest: 1,
  /** The deepest water a walker wades into. */
  wade: 0.45,
  /** How far inside the grid's edge a walker stays, in metres. */
  margin: 8,
} as const;

/** The longest piece a move is checked in, in metres, so no move steps over a cliff's edge. */
const PIECE = 0.5;

export interface Spot {
  x: number;
  z: number;
}

export function canStand(heights: Grid, x: number, z: number): boolean {
  const reach = extent(heights) - WALK_LIMITS.margin;
  if (Math.abs(x) > reach || Math.abs(z) > reach) return false;
  const h = sample(heights, x, z);
  if (h > WALK_LIMITS.ceiling || h < WATER_LEVEL - WALK_LIMITS.wade) return false;
  return slopeAt(heights, x, z) <= WALK_LIMITS.steepest;
}

function canStep(heights: Grid, from: Spot, to: Spot): boolean {
  if (!canStand(heights, to.x, to.z)) return false;
  const run = Math.hypot(to.x - from.x, to.z - from.z);
  if (run === 0) return true;
  return (sample(heights, to.x, to.z) - sample(heights, from.x, from.z)) / run <= WALK_LIMITS.steepest;
}

/**
 * Where a walker ends up after trying to move by (dx, dz) metres: as far as it
 * can, sliding along whatever stops it rather than sticking to it. A walker
 * somewhere it couldn't stand (put there from outside) may walk off it freely.
 */
export function walk(heights: Grid, from: Spot, dx: number, dz: number): Spot {
  const pieces = Math.max(1, Math.ceil(Math.hypot(dx, dz) / PIECE));
  let at = from;
  for (let k = 0; k < pieces; k++) {
    const sx = dx / pieces;
    const sz = dz / pieces;
    const free = !canStand(heights, at.x, at.z);
    const tries: Spot[] = [
      { x: at.x + sx, z: at.z + sz },
      { x: at.x + sx, z: at.z },
      { x: at.x, z: at.z + sz },
    ];
    const next = tries.find((spot) => free || canStep(heights, at, spot));
    if (next === undefined) break;
    at = next;
  }
  return at;
}

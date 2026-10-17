/*
 * Where a walker may go: anywhere on the land that isn't a cliff, and no
 * deeper into water than a paddle. Rivers are always shallow enough to wade,
 * so only lakes and cliffs turn a walker aside; the world has no edge.
 */

/** What walking needs to know of the world. */
export interface WalkGround {
  heightAt: (x: number, z: number) => number;
  /** The water table: water lies wherever it is above the ground. */
  waterAt: (x: number, z: number) => number;
}

export const WALK_LIMITS = {
  /** The steepest ground a walker stands on or climbs, as rise over run (about 45°). */
  steepest: 1,
  /** The deepest water a walker wades into. */
  wade: 0.45,
} as const;

/** The longest piece a move is checked in, in metres, so no move steps over a cliff's edge. */
const PIECE = 0.5;
/** How far either side the land's steepness is read over, in metres. */
const SLOPE_REACH = 0.6;

export interface Spot {
  x: number;
  z: number;
}

function slopeAt(ground: WalkGround, x: number, z: number): number {
  const e = SLOPE_REACH;
  const dx = ground.heightAt(x + e, z) - ground.heightAt(x - e, z);
  const dz = ground.heightAt(x, z + e) - ground.heightAt(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

export function canStand(ground: WalkGround, x: number, z: number): boolean {
  if (ground.heightAt(x, z) < ground.waterAt(x, z) - WALK_LIMITS.wade) return false;
  return slopeAt(ground, x, z) <= WALK_LIMITS.steepest;
}

function canStep(ground: WalkGround, from: Spot, to: Spot): boolean {
  if (!canStand(ground, to.x, to.z)) return false;
  const run = Math.hypot(to.x - from.x, to.z - from.z);
  if (run === 0) return true;
  return (ground.heightAt(to.x, to.z) - ground.heightAt(from.x, from.z)) / run <= WALK_LIMITS.steepest;
}

/**
 * Where a walker ends up after trying to move by (dx, dz) metres: as far as it
 * can, sliding along whatever stops it rather than sticking to it. A walker
 * somewhere it couldn't stand (put there from outside) may walk off it freely.
 */
export function walk(ground: WalkGround, from: Spot, dx: number, dz: number): Spot {
  const pieces = Math.max(1, Math.ceil(Math.hypot(dx, dz) / PIECE));
  let at = from;
  for (let k = 0; k < pieces; k++) {
    const sx = dx / pieces;
    const sz = dz / pieces;
    const free = !canStand(ground, at.x, at.z);
    const tries: Spot[] = [
      { x: at.x + sx, z: at.z + sz },
      { x: at.x + sx, z: at.z },
      { x: at.x, z: at.z + sz },
    ];
    const next = tries.find((spot) => free || canStep(ground, at, spot));
    if (next === undefined) break;
    at = next;
  }
  return at;
}

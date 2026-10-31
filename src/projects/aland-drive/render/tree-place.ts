/*
 * Where a tree stands, as numbers: the lattice, its jitter and the rolls, shared by
 * the forest's shader (`forest.ts`) and what checks it from outside a browser
 * (`tools/tree-check.ts`). A shader's floats are 32-bit, so the rolls here are too.
 */

export const NEAR_STEP_M = 6;
export const FAR_STEP_M = 12;
/** How far a tree moves off its lattice place, as a share of a near cell. */
export const JITTER = 0.8;
export const SHORTEST_M = 3;
export const JITTER_ROLLS: [x: [number, number], z: [number, number]] = [
  [12.9898, 78.233],
  [39.346, 11.135],
];
export const HEIGHT_ROLL: [number, number] = [93.989, 67.345];
export const HEIGHT_RANGE: [number, number] = [0.78, 1.02];
/** The widest a crown spreads, as a share of the tree's height, with a ring's swell. */
export const WIDEST_CROWN = 0.21 * 1.16;

/** The level of the road mask a tree keeps off, and how much road there is too much. At 8 m it reaches further than the 4 m canopy image blurs. */
export const ROAD_MASK_MIP = 1;
export const ROAD_COVERAGE = 0.008;
/** Within this of a tile's edge a tree reads the road mask this far over it too: a neighbour's roads aren't in a tile's own mask. */
export const ROAD_LOOK_M = 8;

const f = Math.fround;

export function rollAt(column: number, row: number, [a, b]: [number, number]): number {
  const dot = f(f(f(column) * f(a)) + f(f(row) * f(b)));
  const value = f(f(Math.sin(dot)) * f(43758.5453));
  return f(value - Math.floor(value));
}

/** Bilinear, as the GPU reads a clamped image with pixels `metres` across, at a place in metres from its corner. */
export function readImage(image: ArrayLike<number>, size: number, stride: number, channel: number, metres: number, x: number, z: number): number {
  const at = (column: number, row: number) => image[(Math.max(0, Math.min(size - 1, row)) * size + Math.max(0, Math.min(size - 1, column))) * stride + channel];
  const u = x / metres - 0.5;
  const v = z / metres - 0.5;
  const [column, row] = [Math.floor(u), Math.floor(v)];
  const [s, t] = [u - column, v - row];
  return (at(column, row) * (1 - s) + at(column + 1, row) * s) * (1 - t) + (at(column, row + 1) * (1 - s) + at(column + 1, row + 1) * s) * t;
}

/** The road mask's level a tree reads, as shares, main and lesser added: `size` pixels of `stride` bytes, green and blue the roads. */
export function roadLevel(mask: ArrayLike<number>, size: number, stride: number): Float32Array {
  const half = size >> ROAD_MASK_MIP;
  const roads = new Float32Array(half * half);
  for (let row = 0; row < half; row++) {
    for (let column = 0; column < half; column++) {
      const here = (row * 2 * size + column * 2) * stride;
      const below = here + size * stride;
      const channel = (from: number) => (mask[here + from] + mask[here + stride + from] + mask[below + from] + mask[below + stride + from] + 2) >> 2;
      roads[row * half + column] = (channel(1) + channel(2)) / 255;
    }
  }
  return roads;
}

/** A cell's place in the scene's x and z. */
export function treePlace(column: number, row: number): [x: number, z: number] {
  const reach = JITTER * NEAR_STEP_M;
  return [column * NEAR_STEP_M + (rollAt(column, row, JITTER_ROLLS[0]) - 0.5) * reach, row * NEAR_STEP_M + (rollAt(column, row, JITTER_ROLLS[1]) - 0.5) * reach];
}

/** The canopy image's height at a place becomes this tree's height. */
export function treeHeight(column: number, row: number, canopyM: number): number {
  const [low, high] = HEIGHT_RANGE;
  return canopyM * (low + (high - low) * rollAt(column, row, HEIGHT_ROLL));
}

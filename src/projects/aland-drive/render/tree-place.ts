/*
 * Where a tree stands, as numbers: the lattice, its jitter and the rolls, shared by
 * the forest's shader (`forest.ts`) and what checks it from outside a browser
 * (`tools/tree-check.ts`).
 */
import { seedOfWhole, unitOfSeed } from "../art/hash";

import { CROWN_REACH } from "./tree-shapes";

export const NEAR_STEP_M = 6;
export const FAR_STEP_M = 12;
/** How far a tree moves off its lattice place, as a share of a near cell. */
export const JITTER = 0.8;
export const SHORTEST_M = 3;
/** The salts of a place's rolls (`art/hash.ts`): its jitter east and south, its height and whether it stands. */
export const JITTER_ROLLS: [x: number, z: number] = [1, 2];
export const HEIGHT_ROLL = 3;
export const STAND_ROLL = 4;
/** The salts of a tree's season, rolled from its place as its list carries it: which species of its shape, when its leaves go, and how much snow it holds. */
export const SPECIES_ROLL = 15;
export const LEAF_ROLL = 16;
export const SNOW_ROLL = 17;
/** A tree's height over the canopy image's. A place reads the canopy's surface from a 2013 scan, not a treetop today, and MS-NFI 2023's mean height is 1.2 times that. */
export const HEIGHT_RANGE: [number, number] = [1.05, 1.35];
/** What the forest averages over the canopy image, for whatever stands in for its trees. */
export const MEAN_HEIGHT = (HEIGHT_RANGE[0] + HEIGHT_RANGE[1]) / 2;

/** The level of the road mask a tree keeps off, and how much road there is too much. At 8 m it reaches further than the 4 m canopy image blurs. */
export const ROAD_MASK_MIP = 1;
export const ROAD_COVERAGE = 0.008;
/** Within this of a tile's edge a tree reads the road mask this far over it too: a neighbour's roads aren't in a tile's own mask. */
export const ROAD_LOOK_M = 8;

/**
 * What a read of the clearing round buildings (`pipeline/clearing.py`) may be off by, from the 1 m raster it's measured
 * on and its 4 m pixels round a building's corners: every tree and plant keeps this much further off than its spread.
 */
export const CLEARING_SLACK_M = 1.5;

/** The tallest a tree may be at a place this far from a building, for its crown to clear it however it spreads and leans. */
export function tallestClear(clearanceM: number): number {
  return (clearanceM - CLEARING_SLACK_M) / CROWN_REACH;
}

/** A lattice place's roll, as the forest's compute pass makes it: the same bits on every GPU. */
export function rollAt(column: number, row: number, salt: number): number {
  return unitOfSeed(seedOfWhole(column, row), salt);
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

/** Whether a place holds a tree, at a stand's density: the share of its places that do. */
export function treeStands(column: number, row: number, density: number): boolean {
  return rollAt(column, row, STAND_ROLL) < density;
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

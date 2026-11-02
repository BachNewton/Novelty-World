import { surfaceHeight, type HeightGrid } from "./tile";

/*
 * A tile's dry-stone walls (`pipeline/walls.py` writes them in `walls.json`): lines
 * on the ground, laid here as a chain of straight sections, each from the drawn
 * ground at one end to the drawn ground at the other, so a wall follows its ground
 * whatever the build. Kept apart from what draws them, so the tile worker reads them
 * without the art, and the car hits the same sections that are drawn.
 */

/** A section's two ends on the ground, `SECTION_FLOATS` to a section: x, y, z, then x, y, z, in the scene. */
export type WallSections = Float32Array;
export const SECTION_FLOATS = 6;
/** About as long as the kit's section (`STONE_WALL_M`), so its stones keep their size; a line's sections share its length evenly. */
export const SECTION_M = 2.4;

/** The kit's wall to the car: as wide as its stones reach (`buildStoneWall`, which a test holds this to). */
export const STONE_WALL_HALF_WIDE_M = 0.3;

export interface WallsFile {
  /** Each wall's line, as [x, z] points in the scene. */
  walls: [number, number][][];
}

/** A tile's buildings' outlines and its stone walls' faces, as one list for the simulation. */
export function withWalls(outlines: Float32Array, faces: Float32Array): Float32Array {
  const all = new Float32Array(outlines.length + faces.length);
  all.set(outlines);
  all.set(faces, outlines.length);
  return all;
}

/** Every wall's sections, each line cut into equal lengths near `SECTION_M` and stood on the grid's surface. */
export function wallSections(file: WallsFile, grid: HeightGrid): WallSections {
  const ends: number[] = [];
  for (const line of file.walls) {
    const along = [0];
    for (let at = 1; at < line.length; at++) along.push(along[at - 1] + Math.hypot(line[at][0] - line[at - 1][0], line[at][1] - line[at - 1][1]));
    const length = along[along.length - 1];
    const sections = Math.max(1, Math.round(length / SECTION_M));
    let leg = 1;
    const pointAt = (distance: number): [number, number, number] => {
      while (leg < line.length - 1 && along[leg] < distance) leg++;
      const share = (distance - along[leg - 1]) / Math.max(along[leg] - along[leg - 1], 1e-9);
      const x = line[leg - 1][0] + (line[leg][0] - line[leg - 1][0]) * share;
      const z = line[leg - 1][1] + (line[leg][1] - line[leg - 1][1]) * share;
      return [x, surfaceHeight(grid, x, -z), z];
    };
    let from = pointAt(0);
    for (let section = 1; section <= sections; section++) {
      const to = pointAt((length * section) / sections);
      ends.push(...from, ...to);
      from = to;
    }
  }
  return Float32Array.from(ends);
}

/**
 * What the car can't pass, as a building's outline is (two ends to a wall, x and z): both faces of every section,
 * standing on the ground as tall as an outline's walls. The car's box rides 0.4 m off the ground, so a wall only as tall
 * as its stones would overlap it by a hand's width, and at speed the solver lifts the car over it rather than stopping
 * it; a test drives into one flat out.
 */
export function wallFaces(sections: WallSections): Float32Array {
  const count = sections.length / SECTION_FLOATS;
  const faces = new Float32Array(count * 2 * 4);
  for (let section = 0; section < count; section++) {
    const [x1, , z1, x2, , z2] = sections.subarray(section * SECTION_FLOATS, (section + 1) * SECTION_FLOATS);
    const length = Math.max(Math.hypot(x2 - x1, z2 - z1), 1e-6);
    const [acrossX, acrossZ] = [(-(z2 - z1) / length) * STONE_WALL_HALF_WIDE_M, ((x2 - x1) / length) * STONE_WALL_HALF_WIDE_M];
    for (const [side, way] of [[0, 1], [1, -1]] as const) faces.set([x1 + acrossX * way, z1 + acrossZ * way, x2 + acrossX * way, z2 + acrossZ * way], (section * 2 + side) * 4);
  }
  return faces;
}

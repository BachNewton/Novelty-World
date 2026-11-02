/*
 * A tile's placed models (`pipeline/outbuildings.py` writes them in `models.json`,
 * `pipeline/docks.py` in `docks.json`):
 * kept apart from what draws them, so the tile worker reads them without the art.
 */

/** A tile's places by model: x, y, z, yaw, width, length, `PLACE_FLOATS` to a place, in the scene. */
export type TileModels = Record<string, Float32Array>;
export const PLACE_FLOATS = 6;

export interface ModelsFile {
  models: Record<string, number[][]>;
}

export function decodeModels(file: ModelsFile): TileModels {
  return Object.fromEntries(Object.entries(file.models).map(([name, places]) => [name, Float32Array.from(places.flat())]));
}

export interface DocksFile extends ModelsFile {
  /** Each dock's outline, as walls the car can't pass: x and z at both ends. */
  walls: number[][];
}

/** A building's outlines and a tile's docks' as one list of walls, four numbers each. */
export function withDockWalls(walls: Float32Array, docks: DocksFile | null): Float32Array {
  if (docks === null || docks.walls.length === 0) return walls;
  const joined = new Float32Array(walls.length + docks.walls.length * 4);
  joined.set(walls);
  joined.set(docks.walls.flat(), walls.length);
  return joined;
}

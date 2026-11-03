/*
 * A tile's placed models (`pipeline/outbuildings.py` writes them in `models.json`) and roadside objects:
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

/** A tile's roadside objects (`pipeline/roadside.py` writes them in `roadside.json`), in the scene. */
export interface TileRoadside {
  /** Places by model: x, y, z, yaw, stretch, shear, `ROADSIDE_FLOATS` to a place. */
  models: Record<string, Float32Array>;
  /** Sign posts by the sign on them: x, y, z, yaw, `SIGN_FLOATS` to a post. */
  signs: Record<string, Float32Array>;
  /** Each span of wire: a pole's foot and yaw at either end, `WIRE_FLOATS` to a span. */
  wires: Float32Array;
  /** What the car can't pass, as the solids' walls are: x and z at either end. */
  walls: Float32Array;
}
export const ROADSIDE_FLOATS = 6;
export const SIGN_FLOATS = 4;
export const WIRE_FLOATS = 8;

export interface RoadsideFile {
  models: Record<string, number[][]>;
  signs: Record<string, number[][]>;
  wires: number[][];
  walls: number[][];
}

export const NO_ROADSIDE: RoadsideFile = { models: {}, signs: {}, wires: [], walls: [] };

const columns = (lists: Record<string, number[][]>) => Object.fromEntries(Object.entries(lists).map(([name, places]) => [name, Float32Array.from(places.flat())]));

export function decodeRoadside(file: RoadsideFile): TileRoadside {
  return { models: columns(file.models), signs: columns(file.signs), wires: Float32Array.from(file.wires.flat()), walls: Float32Array.from(file.walls.flat()) };
}

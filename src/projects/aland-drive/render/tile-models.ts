/*
 * A tile's placed models (`pipeline/outbuildings.py` and `pipeline/rocks.py` write
 * them in `models.json`): kept apart from what draws them, so the tile worker reads
 * them without the art.
 */

/** A tile's places by model: x, y, z, yaw, width, length, `PLACE_FLOATS` to a place, in the scene. */
export type TileModels = Record<string, Float32Array>;
export const PLACE_FLOATS = 6;

/** The rural kit's boulders, one model to each of its rock seeds. A boulder's width is across its foot. */
export const BOULDER_MODELS = ["boulder-3", "boulder-11", "boulder-24", "boulder-37"] as const;
/** A boulder's wall stands this share of its width in from its widest, so a car meets the stone rather than the air round it. */
const BOULDER_WALL_INSET = 0.75;
const BOULDER_WALL_SIDES = 8;

export interface ModelsFile {
  models: Record<string, number[][]>;
}

export function decodeModels(file: ModelsFile): TileModels {
  return Object.fromEntries(Object.entries(file.models).map(([name, places]) => [name, Float32Array.from(places.flat())]));
}

/** Every boulder as a ring of walls round its foot, laid out as a building's outline is (x and z at each end), standing on the ground: a boulder stops the car. */
export function boulderWalls(models: TileModels): Float32Array {
  const walls: number[] = [];
  const boulders = new Set<string>(BOULDER_MODELS);
  for (const [name, places] of Object.entries(models)) {
    if (!boulders.has(name)) continue;
    for (let at = 0; at < places.length; at += PLACE_FLOATS) {
      const [x, , z, yaw, width] = places.subarray(at, at + PLACE_FLOATS);
      const radius = (width / 2) * BOULDER_WALL_INSET;
      const corner = (side: number) => [x + radius * Math.sin(yaw + (side * 2 * Math.PI) / BOULDER_WALL_SIDES), z + radius * Math.cos(yaw + (side * 2 * Math.PI) / BOULDER_WALL_SIDES)];
      for (let side = 0; side < BOULDER_WALL_SIDES; side++) walls.push(...corner(side), ...corner(side + 1));
    }
  }
  return Float32Array.from(walls);
}

/*
 * A tile's placed models (`pipeline/outbuildings.py` and `pipeline/rocks.py` write them in `models.json`,
 * `pipeline/docks.py` in `docks.json`) and roadside objects:
 * kept apart from what draws them, so the tile worker reads them without the art.
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

export interface DocksFile extends ModelsFile {
  /** Each dock's outline, as walls the car can't pass: x and z at both ends. */
  walls: number[][];
}

/** A tile's docks' outlines, as walls: four numbers each. */
export function dockWalls(docks: DocksFile | null): Float32Array {
  return Float32Array.from(docks?.walls.flat() ?? []);
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
  /** Each traffic light's start in its cycle, 0 to 1, in the order of the `traffic-light` places. */
  signalPhases: Float32Array;
  /** Each street-name post's two blades, in the order of the `name-post` places. */
  streetNames: StreetBlade[][];
  /** Each village sign's name, in the order of the `village-sign` places. */
  villageNames: string[];
}
/** A street's blade on a name post: the yaw that lays it along its street, and the street's name. */
export interface StreetBlade {
  yaw: number;
  name: string;
}
export const ROADSIDE_FLOATS = 6;
export const SIGN_FLOATS = 4;
export const WIRE_FLOATS = 8;

export interface RoadsideFile {
  models: Record<string, number[][]>;
  signs: Record<string, number[][]>;
  wires: number[][];
  walls: number[][];
  /** A tile baked before the town's signals and names were placed has none of them. */
  signalPhases?: number[];
  /** A post's blades as yaw and name, then yaw and name. */
  streetNames?: [number, string, number, string][];
  villageNames?: string[];
}

export const NO_ROADSIDE: RoadsideFile = { models: {}, signs: {}, wires: [], walls: [] };

/** A list of places by model: x, y, z, yaw, stretch, shear. */
export function roadsidePlaces(floats: Float32Array) {
  const places: { x: number; y: number; z: number; yaw: number; stretch: number; shear: number }[] = [];
  for (let at = 0; at < floats.length; at += ROADSIDE_FLOATS) {
    const [x, y, z, yaw, stretch, shear] = floats.subarray(at, at + ROADSIDE_FLOATS);
    places.push({ x, y, z, yaw, stretch, shear });
  }
  return places;
}

const columns = (lists: Record<string, number[][]>) => Object.fromEntries(Object.entries(lists).map(([name, places]) => [name, Float32Array.from(places.flat())]));

/** The town's lists beside their places, one for one: a file whose two disagree is broken. */
function alongside<T>(file: RoadsideFile, model: string, values: readonly T[]): readonly T[] {
  const places = model in file.models ? file.models[model].length : 0;
  if (values.length !== places) throw new Error(`the roadside has ${places} ${model} places and ${values.length} to go with them`);
  return values;
}

export function decodeRoadside(file: RoadsideFile): TileRoadside {
  return {
    models: columns(file.models),
    signs: columns(file.signs),
    wires: Float32Array.from(file.wires.flat()),
    walls: Float32Array.from(file.walls.flat()),
    signalPhases: Float32Array.from(alongside(file, "traffic-light", file.signalPhases ?? [])),
    streetNames: alongside(file, "name-post", file.streetNames ?? []).map(([yaw, name, crossingYaw, crossing]) => [{ yaw, name }, { yaw: crossingYaw, name: crossing }]),
    villageNames: [...alongside(file, "village-sign", file.villageNames ?? [])],
  };
}

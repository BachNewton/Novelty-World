/*
 * A tile's placed models (`pipeline/outbuildings.py`, `pipeline/rocks.py` and `pipeline/farm.py` write them in `models.json`,
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

/**
 * The farm's props (`pipeline/farm.py`), whose places carry the kit's scale where a boulder's carry its width. A sheep
 * stops no car: nothing in the game can knock one over or shove it aside, and one stopping the car dead at speed
 * would read worse than one passed through, as a mailbox would. It grazes away from the roads in any case.
 */
export const FARM_MODELS = ["bale-wrapped", "bale-hay", "tractor", "sheep-grazing", "sheep-standing", "cow-grazing", "cow-standing", "cow-lying"] as const;
/** A cow's foot, as the kit's `COW` has it (the worker has no art, so a test holds the two equal). A cow is the size and weight of a small car, so like a parked car it stops the car. */
export const COW_BOX = [-0.36, -0.95, 0.36, 1.52] as const;
/** What the car can't pass of each prop that stops it: its foot as a box in the kit's metres, x and z from and to. */
const PROP_BOXES: Record<string, readonly [number, number, number, number]> = {
  "bale-wrapped": [-0.6, -0.72, 0.6, 0.72],
  "bale-hay": [-0.6, -0.72, 0.6, 0.72],
  tractor: [-1.12, -1.75, 1.12, 1.62],
  "cow-grazing": COW_BOX,
  "cow-standing": COW_BOX,
  "cow-lying": COW_BOX,
};

/** A windmill's place in `tile.json` (`pipeline/farm.py`): x, y, z, yaw, then its body's outline across and along. */
export type WindmillPlace = [x: number, y: number, z: number, yaw: number, width: number, length: number];
/** The kit's mill body is this long, front to back, at scale 1, and a mill is scaled to its outline within this. */
export const MILL_BODY_M = 4.5;
const MILL_SCALE = [0.8, 1.15] as const;
export const millScale = (length: number) => Math.min(Math.max(length / MILL_BODY_M, MILL_SCALE[0]), MILL_SCALE[1]);
/** A mill's trestle as a ring round its post, out to its stone pads, and its steps as a line from the body to their foot. */
const MILL_TRESTLE_M = 3.3;
const MILL_STEPS_M = [-3.3, -9.9] as const;

/** The scene's place of a point in a model's own metres, as the kit's material turns it. */
const turned = (x: number, z: number, yaw: number, scale: number, along: number, across: number) => [x + (across * Math.cos(yaw) + along * Math.sin(yaw)) * scale, z + (along * Math.cos(yaw) - across * Math.sin(yaw)) * scale];

/**
 * What the car can't pass among the placed models, laid out as a building's outline is (x and z at each end), standing
 * on the ground: every boulder as a ring of walls round its foot, each prop that stops the car as the box of its foot,
 * and every windmill as a ring round its trestle and a wall along its steps.
 */
export function modelWalls(models: TileModels, windmills: readonly WindmillPlace[] = []): Float32Array {
  const walls: number[] = [];
  const boulders = new Set<string>(BOULDER_MODELS);
  const ring = (x: number, z: number, yaw: number, radius: number) => {
    const corner = (side: number) => [x + radius * Math.sin(yaw + (side * 2 * Math.PI) / BOULDER_WALL_SIDES), z + radius * Math.cos(yaw + (side * 2 * Math.PI) / BOULDER_WALL_SIDES)];
    for (let side = 0; side < BOULDER_WALL_SIDES; side++) walls.push(...corner(side), ...corner(side + 1));
  };
  for (const [name, places] of Object.entries(models)) {
    const box = PROP_BOXES[name] as (typeof PROP_BOXES)[string] | undefined;
    if (!boulders.has(name) && !box) continue;
    for (let at = 0; at < places.length; at += PLACE_FLOATS) {
      const [x, , z, yaw, width] = places.subarray(at, at + PLACE_FLOATS);
      if (!box) {
        ring(x, z, yaw, (width / 2) * BOULDER_WALL_INSET);
        continue;
      }
      const [x0, z0, x1, z1] = box;
      const corners = [turned(x, z, yaw, width, z0, x0), turned(x, z, yaw, width, z0, x1), turned(x, z, yaw, width, z1, x1), turned(x, z, yaw, width, z1, x0)];
      for (let side = 0; side < 4; side++) walls.push(...corners[side], ...corners[(side + 1) % 4]);
    }
  }
  for (const [x, , z, yaw, , length] of windmills) {
    const scale = millScale(length);
    ring(x, z, yaw, MILL_TRESTLE_M * scale);
    walls.push(...turned(x, z, yaw, scale, MILL_STEPS_M[0], 0), ...turned(x, z, yaw, scale, MILL_STEPS_M[1], 0));
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
  /**
   * Where a person would sit on the furniture (`pipeline/furniture.py`), by the
   * `art/people` pose that fits the seat: x, y, z, yaw, `SEAT_FLOATS` to a seat.
   * x, y and z are the pose's origin, the seat's footprint on the drawn ground, and
   * yaw turns the person's +z, the way they face, towards (sin yaw, cos yaw), as a
   * placed model's does. Every bench has two `sit-bench` seats, every café table
   * two `sit-cafe` chairs facing each other across it. Nobody sits on them yet.
   */
  seats: Partial<Record<SeatPose, Float32Array>>;
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
export const SEAT_FLOATS = 4;
/** The poses a seat is for, by name in `art/people`'s `POSES`. */
export const SEAT_POSES = ["sit-bench", "sit-cafe"] as const;
export type SeatPose = (typeof SEAT_POSES)[number];
export const SIGN_FLOATS = 4;
export const WIRE_FLOATS = 8;

export interface RoadsideFile {
  models: Record<string, number[][]>;
  signs: Record<string, number[][]>;
  wires: number[][];
  walls: number[][];
  /** Absent from a tile baked before the furniture. */
  seats?: Partial<Record<SeatPose, number[][]>>;
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
    seats: columns(file.seats ?? {}),
  };
}

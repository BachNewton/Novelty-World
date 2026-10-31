import { buildCarParts, groundY, SAG_M, type CarSpec } from "../cars/build";
import { CARS } from "../cars/specs";
import type { CarState } from "../../sim/car-state";

/*
 * How many cars a garage really holds, worked out from the built cars rather than
 * from a guess: each car's length and width are read off its own body, and a bay
 * must take the longest and the widest of them with a door's width beside it.
 */

/** Beside a car: room to open a door, and to walk past the wall. */
const BAY_SIDE_GAP_M = 0.75;
/** Before and behind the longest car: the door's clearance and a walkway. */
const LENGTH_GAP_M = 1.3;

export interface CarSize {
  name: string;
  lengthM: number;
  widthM: number;
}

export function carSize(spec: CarSpec): CarSize {
  const { positions } = buildCarParts(spec, "far").body;
  let [lowX, highX, lowZ, highZ] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    lowX = Math.min(lowX, positions[index]);
    highX = Math.max(highX, positions[index]);
    lowZ = Math.min(lowZ, positions[index + 2]);
    highZ = Math.max(highZ, positions[index + 2]);
  }
  return { name: spec.name, lengthM: highZ - lowZ, widthM: highX - lowX };
}

export const carSizes = () => CARS.map(carSize);

export interface CarSlot {
  x: number;
  z: number;
  /** Turns the car's nose, which is -z, about y. A half turn has it facing the door. */
  yaw: number;
}

export interface GarageFit {
  /** Cars of any kind in the game, side by side, at once. */
  cars: number;
  slots: CarSlot[];
  /** The room each bay leaves, for the record. */
  bayWideM: number;
  longestCarM: number;
  widestCarM: number;
}

/** The bays of a garage whose door is on its +z wall, and a walled-off `backM` at its -z end for benches. */
export function fitCars(wide: number, deep: number, backM: number): GarageFit {
  const sizes = carSizes();
  const longestCarM = Math.max(...sizes.map(({ lengthM }) => lengthM));
  const widestCarM = Math.max(...sizes.map(({ widthM }) => widthM));
  const bayWideM = widestCarM + BAY_SIDE_GAP_M;
  const cars = longestCarM + LENGTH_GAP_M + backM > deep ? 0 : Math.floor((wide - BAY_SIDE_GAP_M) / bayWideM);
  const z = backM / 2;
  const slots = Array.from({ length: cars }, (_, index): CarSlot => ({ x: ((index - (cars - 1) / 2) * wide) / cars, z, yaw: Math.PI }));
  return { cars, slots, bayWideM, longestCarM, widestCarM };
}

/** A car at rest in a slot, to give `createCarModel`'s `draw`. `floorY` is the floor's height where the room stands. */
export function parkedState(spec: CarSpec, { x, z, yaw }: CarSlot, floorY = 0): CarState {
  return {
    position: [x, floorY - groundY(spec.wheel.radiusM), z],
    rotation: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)],
    velocity: [0, 0, 0],
    spin: [0, 0, 0],
    steer: 0,
    suspension: [SAG_M, SAG_M, SAG_M, SAG_M],
    roll: 0,
  };
}

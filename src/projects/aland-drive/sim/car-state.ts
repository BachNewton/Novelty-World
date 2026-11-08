/*
 * The whole of a car as other players will need it: one small record that goes
 * through JSON unchanged. The car is drawn from this and nothing else, so a car
 * heard over the network will draw the same as the one being driven.
 */

import type { CarId } from "./cars";

export type Vector3 = [x: number, y: number, z: number];
export type Rotation = [x: number, y: number, z: number, w: number];
type PerWheel = [frontLeft: number, frontRight: number, rearLeft: number, rearRight: number];

/** The lamps other players see lit. */
export interface CarLamps {
  /** Dipped headlamps and the tail lamps with them: Finnish and Åland law has them on whenever a car is driven. */
  head: boolean;
  brake: boolean;
  reverse: boolean;
}

export const LAMPS_OFF: CarLamps = { head: false, brake: false, reverse: false };

export interface CarState {
  position: Vector3;
  rotation: Rotation;
  velocity: Vector3;
  spin: Vector3;
  /** Which car this is: its looks, wheels and sound follow from the id. */
  car: CarId;
  /** The front wheels' angle, positive to the right. */
  steer: number;
  /** How far each wheel has risen into its arch. */
  suspension: PerWheel;
  /** How far each wheel has turned, in radians: a spinning or locked wheel turns apart from the road. */
  roll: PerWheel;
  lamps: CarLamps;
  /**
   * The paint its driver chose, by its index in the car's list of paints (`art/cars/paints.ts`); the car's default when
   * left out, as a version of the game from before paints sends it.
   */
  paint?: number;
}

const lerp = (a: number, b: number, share: number) => a + (b - a) * share;

/** A state between two steps, for drawing between the simulation's ticks. */
export function blendCarStates(from: CarState, to: CarState, share: number): CarState {
  const sign = from.rotation.reduce((sum, value, index) => sum + value * to.rotation[index], 0) < 0 ? -1 : 1;
  const mixed = from.rotation.map((value, index) => lerp(value, sign * to.rotation[index], share));
  const length = Math.hypot(...mixed);
  return {
    position: [lerp(from.position[0], to.position[0], share), lerp(from.position[1], to.position[1], share), lerp(from.position[2], to.position[2], share)],
    rotation: [mixed[0] / length, mixed[1] / length, mixed[2] / length, mixed[3] / length],
    velocity: to.velocity,
    spin: to.spin,
    car: to.car,
    steer: lerp(from.steer, to.steer, share),
    suspension: [
      lerp(from.suspension[0], to.suspension[0], share),
      lerp(from.suspension[1], to.suspension[1], share),
      lerp(from.suspension[2], to.suspension[2], share),
      lerp(from.suspension[3], to.suspension[3], share),
    ],
    roll: [lerp(from.roll[0], to.roll[0], share), lerp(from.roll[1], to.roll[1], share), lerp(from.roll[2], to.roll[2], share), lerp(from.roll[3], to.roll[3], share)],
    lamps: to.lamps,
    paint: to.paint,
  };
}

export const speedOf = (state: CarState) => Math.hypot(...state.velocity);

/** The way a car's nose points on the ground: radians anticlockwise from north. */
export function headingOf([x, y, z, w]: Rotation): number {
  return Math.atan2(2 * (x * z + w * y), 1 - 2 * (x * x + y * y));
}

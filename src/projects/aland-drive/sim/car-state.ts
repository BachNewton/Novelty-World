/*
 * The whole of a car as other players will need it: one small record that goes
 * through JSON unchanged. The car is drawn from this and nothing else, so a car
 * heard over the network will draw the same as the one being driven.
 */

export type Vector3 = [x: number, y: number, z: number];
export type Rotation = [x: number, y: number, z: number, w: number];
type PerWheel = [frontLeft: number, frontRight: number, rearLeft: number, rearRight: number];

export interface CarState {
  position: Vector3;
  rotation: Rotation;
  velocity: Vector3;
  spin: Vector3;
  /** The front wheels' angle, positive to the right. */
  steer: number;
  /** How far each wheel has risen into its arch. */
  suspension: PerWheel;
  /** How far the wheels have rolled, in radians. */
  roll: number;
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
    steer: lerp(from.steer, to.steer, share),
    suspension: [
      lerp(from.suspension[0], to.suspension[0], share),
      lerp(from.suspension[1], to.suspension[1], share),
      lerp(from.suspension[2], to.suspension[2], share),
      lerp(from.suspension[3], to.suspension[3], share),
    ],
    roll: lerp(from.roll, to.roll, share),
  };
}

export const speedOf = (state: CarState) => Math.hypot(...state.velocity);

/** The way a car's nose points on the ground: radians anticlockwise from north. */
export function headingOf([x, y, z, w]: Rotation): number {
  return Math.atan2(2 * (x * z + w * y), 1 - 2 * (x * x + y * y));
}

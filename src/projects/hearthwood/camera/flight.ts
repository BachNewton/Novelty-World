import { clampPitch, lookDirection, turnLook, type Look } from "./first-person-camera";
import type { Point3 } from "./follow-camera";

/*
 * The debug free camera's maths: a camera flown anywhere, Elliott left
 * standing where they were. It moves the way it looks (pitch included, so
 * looking down and pushing ahead dives), sideways along the level, and
 * straight up and down; it never goes below the ground, so the land is
 * always seen from above.
 */

export interface Flight extends Look {
  x: number;
  y: number;
  z: number;
}

export interface FlyInput {
  /** x to the right, y ahead, each -1 to 1. */
  move: { x: number; y: number };
  /** Up (1) to down (-1). */
  rise: number;
  /** Metres per second at a full push. */
  speed: number;
  /** A turn dragged since the last frame, and one held at a rate per second, as first person reads them. */
  turn: { yaw: number; pitch: number };
  turnRate: { yaw: number; pitch: number };
}

/** How close above the ground the camera may come, in metres. */
export const FLY_CLEARANCE = 0.5;

/** A flight taken up from wherever a camera is and the way it looks. */
export function flightFrom(position: Point3, ahead: Point3): Flight {
  const level = Math.hypot(ahead.x, ahead.z);
  return { x: position.x, y: position.y, z: position.z, yaw: Math.atan2(ahead.x, ahead.z), pitch: clampPitch(Math.atan2(ahead.y, level)) };
}

/** One frame of flying, held above the ground at `groundAt`. */
export function stepFlight(flight: Flight, input: FlyInput, groundAt: (x: number, z: number) => number, seconds: number): Flight {
  const look = turnLook(flight, input.turn, input.turnRate, seconds);
  const ahead = lookDirection(look);
  // Their right, looking along yaw from +z towards +x, is -x at yaw 0.
  const right = { x: -Math.cos(look.yaw), z: Math.sin(look.yaw) };
  const reach = input.speed * seconds;
  const x = flight.x + (ahead.x * input.move.y + right.x * input.move.x) * reach;
  const z = flight.z + (ahead.z * input.move.y + right.z * input.move.x) * reach;
  const y = flight.y + (ahead.y * input.move.y + input.rise) * reach;
  return { ...look, x, z, y: Math.max(y, groundAt(x, z) + FLY_CLEARANCE) };
}

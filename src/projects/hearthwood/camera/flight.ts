/*
 * The free camera's maths: a camera flown anywhere over the world. It looks
 * where the player turns it (yaw round, pitch up and down short of
 * straight), moves the way it looks (pitch included, so looking down and
 * pushing ahead dives), sideways along the level, and straight up and down;
 * it never goes below the ground, so the land is always seen from above.
 */

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface Look {
  /** Radians from +z towards +x: the way it looks. */
  yaw: number;
  /** Radians above level. */
  pitch: number;
}

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
  /** A turn dragged since the last frame, and one held at a rate per second. Both read right and down as positive, as a screen does. */
  turn: { yaw: number; pitch: number };
  turnRate: { yaw: number; pitch: number };
}

/** The camera's field of view, in degrees. */
export const FIELD_OF_VIEW = 72;
/** The furthest it looks up or down, in radians from level. */
export const PITCH_LIMIT = 1.45;
/** How close above the ground the camera may come, in metres. */
export const FLY_CLEARANCE = 0.5;

export function clampPitch(pitch: number): number {
  return Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, pitch));
}

/** A look turned by a drag since the last frame plus a turn held at a rate: turning right lowers the yaw, pushing down looks down. */
export function turnLook(look: Look, dragged: { yaw: number; pitch: number }, rate: { yaw: number; pitch: number }, seconds: number): Look {
  return {
    yaw: look.yaw - dragged.yaw - rate.yaw * seconds,
    pitch: clampPitch(look.pitch - dragged.pitch - rate.pitch * seconds),
  };
}

/** The way a look points, as a unit direction. */
export function lookDirection(look: Look): Point3 {
  const level = Math.cos(look.pitch);
  return { x: Math.sin(look.yaw) * level, y: Math.sin(look.pitch), z: Math.cos(look.yaw) * level };
}

/** One frame of flying, held above the ground at `groundAt`. */
export function stepFlight(flight: Flight, input: FlyInput, groundAt: (x: number, z: number) => number, seconds: number): Flight {
  const look = turnLook(flight, input.turn, input.turnRate, seconds);
  const ahead = lookDirection(look);
  // The right, looking along yaw from +z towards +x, is -x at yaw 0.
  const right = { x: -Math.cos(look.yaw), z: Math.sin(look.yaw) };
  const reach = input.speed * seconds;
  const x = flight.x + (ahead.x * input.move.y + right.x * input.move.x) * reach;
  const z = flight.z + (ahead.z * input.move.y + right.z * input.move.x) * reach;
  const y = flight.y + (ahead.y * input.move.y + input.rise) * reach;
  return { ...look, x, z, y: Math.max(y, groundAt(x, z) + FLY_CLEARANCE) };
}

import type { Point3 } from "./follow-camera";

/*
 * The first-person camera's maths: the witch's eyes, looking where the
 * player turns them (yaw round, pitch up and down within a neck's reach),
 * with a gentle bob as she walks.
 */

/** How high above her feet the witch's eyes are, in metres. */
export const EYE_HEIGHT = 1.4;

/** The camera's field of view, in degrees: wider through her eyes, where nothing of her frames the view. */
export const FIELD_OF_VIEW = { first: 72, third: 55 } as const;

/** The furthest she looks up or down, in radians from level. */
export const PITCH_LIMIT = 1.35;

export interface Look {
  /** Radians from +z towards +x: the way she looks. */
  yaw: number;
  /** Radians above level. */
  pitch: number;
}

export function clampPitch(pitch: number): number {
  return Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, pitch));
}

/**
 * A look turned by the player: a turn dragged since the last frame, plus one
 * held on a stick or keys at a rate per second. Both read right and down as
 * positive, as a screen does, so turning right lowers the yaw and pushing
 * down looks down.
 */
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

/** How far the head bobs at a walk and at a run, in metres: enough to feel the steps, never to rock the view. */
const BOB = { walk: 0.022, run: 0.04 } as const;
/** How far the head sways side to side, as a share of the bob. */
const SWAY_SHARE = 0.45;

/**
 * Her head's bob for where she is in her stride (which turns by π a step)
 * and her pace (0 standing, 1 at a full run): up and down once a step, side
 * to side once a stride. `side` is to her right.
 */
export function headBob(stride: number, pace: number): { up: number; side: number } {
  const amplitude = pace * (BOB.walk + (BOB.run - BOB.walk) * pace);
  return { up: amplitude * (Math.abs(Math.sin(stride)) - 0.5), side: amplitude * SWAY_SHARE * Math.sin(stride) };
}

/** Where her eyes are, standing at a point on the ground, looking along a yaw, at a moment of her bob. */
export function eyePosition(feet: Point3, yaw: number, bob: { up: number; side: number }): Point3 {
  // Her right, looking along yaw from +z towards +x, is -x at yaw 0.
  const rightX = -Math.cos(yaw);
  const rightZ = Math.sin(yaw);
  return { x: feet.x + rightX * bob.side, y: feet.y + EYE_HEIGHT + bob.up, z: feet.z + rightZ * bob.side };
}

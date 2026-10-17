import type { Point3 } from "./follow-camera";

/*
 * The first-person camera's maths: the witch's eyes, looking where the
 * player turns them (yaw round, pitch up and down within a neck's reach),
 * with a gentle bob as they walk, a dip as they land, and on the broom a
 * view widened by the wind, leaning into its turns.
 */

/** How high above their feet the witch's eyes are, in metres. */
export const EYE_HEIGHT = 1.4;
/** Where the eyes are seated on the broom: sitting up tall, back a little behind the seat and leaning a little to the left of the handle, so it runs in from low on the right and only its tip reaches up into the view. */
export const RIDING_EYE = { height: 1.45, back: 0.18, left: 0.16 } as const;

/** The camera's field of view, in degrees: wider through their eyes, where nothing of them frames the view. */
export const FIELD_OF_VIEW = { first: 72, third: 55 } as const;
/** How much wider the view opens on the broom at its full speed, in degrees: the rush of the wind. */
const WIND_WIDENING = { first: 7, third: 4 } as const;

/** The field of view for a point of view, opened by the wind (0 still, 1 at the broom's full speed). */
export function fieldOfView(view: keyof typeof FIELD_OF_VIEW, wind: number): number {
  return FIELD_OF_VIEW[view] + WIND_WIDENING[view] * wind;
}

/** The furthest they look up or down, in radians from level. */
export const PITCH_LIMIT = 1.35;

export interface Look {
  /** Radians from +z towards +x: the way they look. */
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
 * Their head's bob for where they are in their stride (which turns by π a
 * step) and their pace (0 standing, 1 at a full run): up and down once a
 * step, side to side once a stride. `side` is to their right.
 */
export function headBob(stride: number, pace: number): { up: number; side: number } {
  const amplitude = pace * (BOB.walk + (BOB.run - BOB.walk) * pace);
  return { up: amplitude * (Math.abs(Math.sin(stride)) - 0.5), side: amplitude * SWAY_SHARE * Math.sin(stride) };
}

/** Where their eyes are, standing at a point, looking along a yaw, at a moment of their bob, `height` above their feet. */
export function eyePosition(feet: Point3, yaw: number, bob: { up: number; side: number }, height: number = EYE_HEIGHT): Point3 {
  // Their right, looking along yaw from +z towards +x, is -x at yaw 0.
  const rightX = -Math.cos(yaw);
  const rightZ = Math.sin(yaw);
  return { x: feet.x + rightX * bob.side, y: feet.y + height + bob.up, z: feet.z + rightZ * bob.side };
}

/** How long a landing's dip lasts, in seconds, and how deep it goes per metre a second they came down at, and at most. */
const DIP = { seconds: 0.34, perSpeed: 0.022, deepest: 0.13 } as const;

/** How far the eyes dip at a moment after landing, coming down at `impact` metres a second: a soft knee-bend, down and back up. */
export function landingDip(sinceLanding: number, impact: number): number {
  if (sinceLanding < 0 || sinceLanding >= DIP.seconds) return 0;
  return -Math.min(DIP.deepest, impact * DIP.perSpeed) * Math.sin((Math.PI * sinceLanding) / DIP.seconds);
}

/**
 * The broom's sway through their eyes: a lean into its turns (`turning` in
 * radians a second, left positive, as yaw goes) and, in the wind, a gentle
 * rock and rise. `roll` is the camera's about its own axis, left side down
 * positive.
 */
export function broomSway(seconds: number, turning: number, wind: number): { roll: number; up: number } {
  const lean = Math.max(-0.14, Math.min(0.14, turning * 0.16));
  return { roll: lean + Math.sin(seconds * 1.1) * 0.016 * wind, up: Math.sin(seconds * 1.7) * 0.03 * wind };
}

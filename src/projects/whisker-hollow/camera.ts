import type { Point } from "./types";

/**
 * The player's camera, pure: behind and above the caretaker (third person) or
 * at their eyes (first person), turned by `yaw` and tilted by `pitch`.
 *
 * `yaw` 0 looks toward −z, and a growing yaw turns the view left (anticlockwise
 * seen from above). `pitch` is how far the view looks down: in third person it
 * is also how high the camera sits over the caretaker.
 */

export type CameraMode = "third" | "first";

export interface CameraState {
  mode: CameraMode;
  yaw: number;
  pitch: number;
  /** How far behind the caretaker the third-person camera sits. */
  zoom: number;
}

/** The look input this frame, from the mouse or the right stick, in radians. */
export interface Steer {
  /** Moved right. */
  turn: number;
  /** Moved down: the view tilts down. */
  tilt: number;
  /** Zoom steps, positive out. */
  zoom: number;
}

export const ZOOM_MIN = 4;
export const ZOOM_MAX = 18;
const PITCH_LIMITS: Record<CameraMode, { min: number; max: number; start: number }> = {
  // Low enough to look across the lawn, never under it; high enough to look down on the caretaker.
  third: { min: 0.08, max: 1.35, start: 0.72 },
  first: { min: -1.3, max: 1.3, start: 0.2 },
};
/** Where a caretaker's eyes are, for the first-person camera. */
export const EYE_HEIGHT = 1.4;

export const START_CAMERA: CameraState = { mode: "third", yaw: 0, pitch: PITCH_LIMITS.third.start, zoom: 9 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function pitchLimits(mode: CameraMode): { min: number; max: number } {
  return PITCH_LIMITS[mode];
}

/** Into the other view, looking the same way; the camera behind comes back as far out as it was. */
export function toggleView(camera: CameraState): CameraState {
  const mode = camera.mode === "third" ? "first" : "third";
  return { ...camera, mode, pitch: PITCH_LIMITS[mode].start };
}

/** Turn, tilt and zoom. Zoom moves only the camera behind, within its limits: it never changes the view. */
export function steer(camera: CameraState, by: Steer): CameraState {
  const next = { ...camera, yaw: camera.yaw - by.turn };
  if (next.mode === "third") next.zoom = clamp(next.zoom + by.zoom, ZOOM_MIN, ZOOM_MAX);
  const { min, max } = PITCH_LIMITS[next.mode];
  next.pitch = clamp(next.pitch + by.tilt, min, max);
  return next;
}

/** Level, along the ground: where the camera looks, and to its right. */
export function viewAxes(yaw: number): { forward: Point; right: Point } {
  const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
  return { forward, right: { x: -forward.z, z: forward.x } };
}

/** A push on the stick or keys (x right, y away) as a direction on the ground, relative to the view. */
export function viewMove(yaw: number, push: { x: number; y: number }): Point {
  const { forward, right } = viewAxes(yaw);
  return { x: forward.x * push.y + right.x * push.x, z: forward.z * push.y + right.z * push.x };
}

/** The heading (0 faces +z) of someone looking along `yaw`. */
export function headingOf(yaw: number): number {
  const { forward } = viewAxes(yaw);
  return Math.atan2(forward.x, forward.z);
}

/** Where the camera stands, relative to the caretaker's feet, and the point it looks at. */
export function cameraPose(camera: CameraState, at: Point): { eye: { x: number; y: number; z: number }; look: { x: number; y: number; z: number } } {
  const { forward } = viewAxes(camera.yaw);
  const level = Math.cos(camera.pitch);
  if (camera.mode === "first") {
    const eye = { x: at.x, y: EYE_HEIGHT, z: at.z };
    return { eye, look: { x: eye.x + forward.x * level, y: eye.y - Math.sin(camera.pitch), z: eye.z + forward.z * level } };
  }
  const look = { x: at.x, y: 1, z: at.z };
  return {
    look,
    eye: {
      x: look.x - forward.x * level * camera.zoom,
      y: look.y + Math.sin(camera.pitch) * camera.zoom,
      z: look.z - forward.z * level * camera.zoom,
    },
  };
}

/** How far, in radians either side, a first-person look reaches for something to pick up. */
export const LOOK_CONE = 0.9;

/** How far off the view's line `to` is, seen from `from`, in radians: 0 dead ahead. */
export function offView(yaw: number, from: Point, to: Point): number {
  const { forward } = viewAxes(yaw);
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  return Math.abs(Math.atan2(forward.x * dz - forward.z * dx, forward.x * dx + forward.z * dz));
}

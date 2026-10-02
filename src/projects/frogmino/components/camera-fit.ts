import { TUNING, type Tuning } from "../tuning";

// The gameplay camera's placement, pitch, field of view and clipping planes,
// from the camera knobs in `tuning.ts`: it follows the frog from behind and
// above, and looks down at the floor a look-ahead in front of it. The game
// passes `TUNING`; the world preview passes its live overrides, so both run
// the same maths.
export type CameraKnobs = Pick<Tuning, "cameraHeight" | "cameraFollow" | "cameraLookAhead">;

export function cameraPitch({ cameraHeight, cameraFollow, cameraLookAhead }: CameraKnobs): number {
  return -Math.atan2(cameraHeight, cameraFollow + cameraLookAhead);
}

export const CAMERA_PITCH = cameraPitch(TUNING);

// Where the camera sits for a frog at a rule depth on ground at a height.
export function cameraEye(knobs: CameraKnobs, frogDepth: number, ground: number): { y: number; z: number } {
  return { y: ground + knobs.cameraHeight, z: -frogDepth + knobs.cameraFollow };
}

// The camera rises and falls with the ground under the frog (the overpass,
// the road, the finish gantry) over about this long, in seconds.
const CAMERA_LEVEL_EASE = 0.6;

// The camera's height `delta` seconds on, easing from `from` toward `to`:
// exponentially, about 95% of the way in the ease.
export function easedCameraHeight(from: number, to: number, delta: number): number {
  return to + (from - to) * Math.exp((-3 / CAMERA_LEVEL_EASE) * delta);
}

// Vertical field of view on wide screens. Narrow portrait screens widen it so
// the corridor always fits across.
const BASE_FOV = 50;
const MIN_HORIZONTAL_FOV = 55;
const DEGREES = 180 / Math.PI;

export function fittedFov(aspect: number): number {
  const halfHorizontal = MIN_HORIZONTAL_FOV / 2 / DEGREES;
  const narrowFov = 2 * Math.atan(Math.tan(halfHorizontal) / aspect) * DEGREES;
  return Math.max(BASE_FOV, narrowFov);
}

// The depth buffer's precision is spent mostly close to the near plane, so it
// sits as far out as the camera allows: nothing ever comes nearer than the
// tallest vehicle passing beneath, several units down. The far plane takes in
// the sky dome around the camera.
export const CAMERA_NEAR = 1;
export const CAMERA_FAR = 1000;

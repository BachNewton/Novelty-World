import { TUNING, type Tuning } from "../tuning";

// The gameplay camera's placement, pitch, field of view and clipping planes,
// from the camera knobs in `tuning.ts` and the road's width: it follows the
// frog from behind and above, over the middle of the road, and looks down at
// the floor a look-ahead in front of it. The game
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
// a road `lanes` wide always fits across: 55° across fits a road of 7 lanes,
// and a wider road widens the tangent of half that angle in proportion, which
// keeps the same share of the road in view at every distance.
const BASE_FOV = 50;
const ROAD_FIT = { horizontalFov: 55, lanes: 7 };
const DEGREES = 180 / Math.PI;

export function fittedFov(aspect: number, lanes: number): number {
  const halfTan = Math.tan(ROAD_FIT.horizontalFov / 2 / DEGREES) * (lanes / ROAD_FIT.lanes);
  const narrowFov = 2 * Math.atan(halfTan / aspect) * DEGREES;
  return Math.max(BASE_FOV, narrowFov);
}

// The depth buffer's precision is spent mostly close to the near plane, so it
// sits as far out as the camera allows: nothing ever comes nearer than the
// tallest vehicle passing beneath, several units down. The far plane takes in
// the sky dome around the camera.
export const CAMERA_NEAR = 1;
export const CAMERA_FAR = 1000;

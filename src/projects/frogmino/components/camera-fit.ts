import { TUNING } from "../tuning";

// The gameplay camera's pitch, field of view and clipping planes, from the
// camera knobs in `tuning.ts`: it looks down at the floor a look-ahead in
// front of the frog.
const { cameraHeight, cameraFollow, cameraLookAhead } = TUNING;
export const CAMERA_PITCH = -Math.atan2(cameraHeight, cameraFollow + cameraLookAhead);

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

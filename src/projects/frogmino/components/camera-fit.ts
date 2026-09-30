import { TUNING } from "../tuning";

// The gameplay camera's pitch and field of view, from the camera knobs in
// `tuning.ts`: it looks down at the floor a look-ahead in front of the frog.
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

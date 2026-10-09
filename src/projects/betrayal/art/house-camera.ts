/*
 * The house camera's tilt, as pure numbers: how far above the horizontal it
 * looks down at its target on the floor.
 */

const degrees = (value: number) => (value * Math.PI) / 180;

/** The tilt the camera starts at, and each standard view takes. */
export const DEFAULT_PITCH = degrees(40);

/** The camera's tilt limits, in radians above the horizontal: near eye level,
 *  looking into a room over its cut walls at the figures, up to near top-down. */
export const PITCH_RANGE = [degrees(9), degrees(80)] as const;

/** The camera never drops below this height above the floor it looks at, in
 *  metres: above the furniture, so zoomed right in at the lowest tilt it looks
 *  over a lamp or a chair rather than into it. */
export const MIN_EYE_HEIGHT = 2.2;

/** A tilt kept within the limits, for a camera standing `distance` metres
 *  back from its target: the closer it stands, the higher its lowest tilt,
 *  to keep it above the furniture. */
export function clampPitch(pitch: number, distance = Infinity): number {
  const lowest = Math.max(PITCH_RANGE[0], Math.asin(Math.min(1, MIN_EYE_HEIGHT / distance)));
  return Math.min(PITCH_RANGE[1], Math.max(lowest, pitch));
}

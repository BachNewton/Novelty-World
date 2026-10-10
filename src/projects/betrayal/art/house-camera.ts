import { WALL_HEIGHT } from "./room";

/*
 * The house camera, as pure numbers: how far above the horizontal it looks
 * down at its target on the floor, how far back it stands, and the depth
 * range it draws with.
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

/** The camera's angle of view, top to bottom of the screen, in degrees. */
export const FIELD_OF_VIEW = 32;
/** Metres of floor across the screen's short side at zoom 1: about four rooms. */
export const BASE_SPAN = 24;
export const ZOOM_RANGE = [0.3, 4] as const;

/** How far the camera stands back from its target at a zoom, on a screen of
 *  this aspect (width over height): far enough to fit the zoom's span of floor
 *  across the screen's short side. */
export function cameraDistance(zoom: number, aspect: number): number {
  return BASE_SPAN / zoom / (2 * Math.tan(degrees(FIELD_OF_VIEW) / 2) * Math.min(1, aspect));
}

/*
 * The depth range. A depth buffer stores 1/distance, not distance, so its
 * steps grow with the square of the distance and shrink as the near plane
 * moves out: a step at distance z is about z² / (near × 2^bits). Two faces
 * nearer than a few steps fight for the same pixels, and the fight shimmers
 * as the camera moves. So the near plane stands as far out as the view
 * allows, at the nearest thing the camera can see, not at a fixed few
 * centimetres from the lens.
 */

/** The depth buffer's bits: WebGL's default framebuffer has 24 on the browsers the house runs on. */
export const DEPTH_BITS = 24;
/** The near plane when the camera stands among what it shows (lower than the
 *  walls' tops, over the house), where nothing bounds how close a piece comes. */
export const LENS_NEAREST = 0.1;
/** How much wider than the bounds the range is set, so a vertex lying on a bound is never clipped by rounding. */
const RANGE_MARGIN = 0.01;

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface DepthRange {
  near: number;
  far: number;
}

/**
 * The near and far planes that hold all of `bounds` the camera can see, for a
 * camera at `eye` looking along the unit `forward` (down, never rolled, as
 * `lookAt` aims it), with the house's angle of view on a screen of `aspect`.
 *
 * Near is the larger of two bounds on the nearest visible point. Below a camera
 * standing above everything, nothing shows nearer than where the bottom edge
 * of the view drops to the top of the bounds. And nothing is nearer than the
 * bounds themselves, seen along the view's widest (corner) ray. Far is the
 * bounds' farthest corner along the view.
 */
export function depthRange(eye: Point3, forward: Point3, aspect: number, bounds: { min: Point3; max: Point3 }): DepthRange {
  const half = Math.tan(degrees(FIELD_OF_VIEW) / 2);
  // A ray along the view's bottom edge drops this far for each metre it goes along the view.
  const drop = -forward.y + Math.hypot(forward.x, forward.z) * half;
  const above = eye.y - bounds.max.y;
  const byHeight = above > 0 && drop > 0 ? above / drop : 0;
  const outside = Math.hypot(...(["x", "y", "z"] as const).map((axis) => Math.max(bounds.min[axis] - eye[axis], 0, eye[axis] - bounds.max[axis])));
  const byDistance = outside / Math.hypot(1, half, half * aspect);
  let far = 0;
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) far = Math.max(far, (x - eye.x) * forward.x + (y - eye.y) * forward.y + (z - eye.z) * forward.z);
    }
  }
  const nearest = Math.max(LENS_NEAREST, byHeight, byDistance);
  return { near: nearest * (1 - RANGE_MARGIN), far: Math.max(far, nearest) * (1 + RANGE_MARGIN) };
}

/** The least change in distance the depth buffer can tell apart, at `distance` from the camera. */
export function depthStep(distance: number, { near, far }: DepthRange): number {
  return (distance * distance * (1 - near / far)) / (near * 2 ** DEPTH_BITS);
}

/** The screens the house is played on, by aspect: a phone held upright, and a desktop. */
const SCREENS = [360 / 780, 16 / 9];

/**
 * The coarsest depth step at the camera's target, anywhere in its reach:
 * every zoom and tilt, on a phone and a desktop, looking at one floor of a
 * house too wide to stand outside of, its walls standing full height.
 */
export function houseDepthStep(): number {
  let worst = 0;
  const [lowZoom, highZoom] = ZOOM_RANGE;
  for (const aspect of SCREENS) {
    for (let zoom = lowZoom; zoom <= highZoom * 1.0001; zoom *= 1.02) {
      const distance = cameraDistance(zoom, aspect);
      for (let tilt = PITCH_RANGE[0]; tilt <= PITCH_RANGE[1]; tilt += degrees(0.5)) {
        const pitch = clampPitch(tilt, distance);
        const forward = { x: 0, y: -Math.sin(pitch), z: -Math.cos(pitch) };
        const eye = { x: 0, y: distance * Math.sin(pitch), z: distance * Math.cos(pitch) };
        const wide = 1e4;
        const { near } = depthRange(eye, forward, aspect, { min: { x: -wide, y: 0, z: -wide }, max: { x: wide, y: WALL_HEIGHT, z: wide } });
        // The far plane only ever narrows the step; at its farthest it leaves the near plane's share.
        worst = Math.max(worst, depthStep(distance, { near, far: Infinity }));
      }
    }
  }
  return worst;
}

/*
 * The third-person camera's maths: it orbits the walker at a distance the
 * player can change, turned by the player, never sinking into the ground,
 * and catching up smoothly however long a frame took.
 */

export interface Orbit {
  /** Radians from +z towards +x: the way the camera looks. */
  yaw: number;
  /** Radians above level the camera looks down from. */
  pitch: number;
  /** Metres from the walker. */
  distance: number;
}

export const ORBIT_LIMITS = {
  pitch: [-0.12, 1.15],
  distance: [3.2, 16],
} as const;

/** The camera's opening view: behind the walker, a little above. */
export const FIRST_ORBIT: Orbit = { yaw: 0, pitch: 0.32, distance: 7 };

/** How high above the ground the camera keeps, in metres. */
export const CAMERA_CLEARANCE = 0.7;
/** How far above the walker's feet the camera looks, in metres. */
export const LOOK_HEIGHT = 1.45;

export function clampOrbit(orbit: Orbit): Orbit {
  return {
    yaw: orbit.yaw,
    pitch: Math.min(ORBIT_LIMITS.pitch[1], Math.max(ORBIT_LIMITS.pitch[0], orbit.pitch)),
    distance: Math.min(ORBIT_LIMITS.distance[1], Math.max(ORBIT_LIMITS.distance[0], orbit.distance)),
  };
}

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** The nearest the camera comes in when the land behind the walker crowds it, in metres. */
const NEAREST = 1.6;
/** How finely the way back from the walker is checked for land in it, in metres. */
const PROBE_STEP = 0.5;

/**
 * Where the camera sits for an orbit round a point it looks at. Where the
 * land rises behind the walker into the camera's way, the camera comes in
 * along its line rather than climbing over it, as a third-person camera
 * does against a wall; it always stays clear of the ground.
 */
export function eyeFor(target: Point3, orbit: Orbit, groundAt: (x: number, z: number) => number): Point3 {
  const backX = -Math.sin(orbit.yaw) * Math.cos(orbit.pitch);
  const backZ = -Math.cos(orbit.yaw) * Math.cos(orbit.pitch);
  const up = Math.sin(orbit.pitch);
  let reach = orbit.distance;
  for (let d = NEAREST; d <= orbit.distance; d += PROBE_STEP) {
    if (target.y + up * d < groundAt(target.x + backX * d, target.z + backZ * d) + CAMERA_CLEARANCE) {
      reach = Math.max(NEAREST, d - PROBE_STEP);
      break;
    }
  }
  const x = target.x + backX * reach;
  const z = target.z + backZ * reach;
  return { x, y: Math.max(target.y + up * reach, groundAt(x, z) + CAMERA_CLEARANCE), z };
}

/** The share of the way to its goal a smoothed value moves in a frame of `seconds`, at `rate` per second. */
export function catchUp(rate: number, seconds: number): number {
  return 1 - Math.exp(-rate * seconds);
}

/** The shortest turn from one angle to another, in radians, -π to π. */
export function turnBetween(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

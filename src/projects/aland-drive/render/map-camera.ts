/*
 * The camera's flight between the chase view and the map, as a pure function of
 * how far along it is. It rises looking at the car, tilts down, and turns to north
 * while the car slides across the frame to its place on the map. The camera only
 * ever pitches and turns, each on its own number: blending the two views' rotations
 * directly takes the shortest way between them, which rolls the horizon over.
 */

export type Vec3 = readonly [x: number, y: number, z: number];

/** The chase camera as it stood when the map began, and the car it looks at. */
export interface ChasePose {
  position: Vec3;
  /** A unit vector, the way the camera looks. */
  forward: Vec3;
  fieldOfViewDeg: number;
  car: Vec3;
}

/** The fixed view at the end of the flight, straight down with north up. */
export interface MapTarget {
  x: number;
  z: number;
  heightM: number;
  fieldOfViewDeg: number;
}

export interface CameraPose {
  position: Vec3;
  /** Radians, down being negative. */
  pitch: number;
  /** Radians clockwise from north. */
  turn: number;
  fieldOfViewDeg: number;
}

const STRAIGHT_DOWN = -Math.PI / 2;
/** Parts of the flight, 0 to 1. The tilt ends as the turn is under way, so most of the turn is the map itself going round. */
const TILTED_BY = 0.6;
const TURN_FROM = 0.25;
const ON_THE_CAR_BY = 0.12;
const FOV_BY = 0.5;
const CLEARED_BY = 0.1;
const CLEARANCE_M = 2.5;
/** How far behind the camera the land is read, so it rises before a hill rather than at it. */
const LOOK_BEHIND_M = [0, 12, 30];
const CLEAR_SOFTNESS_M = 2;
const NEAREST_M = 1;

const smoothstep = (from: number, to: number, value: number) => {
  const share = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return share * share * (3 - 2 * share);
};

const smootherstep = (value: number) => value * value * value * (value * (value * 6 - 15) + 10);

/** The larger of two heights, rounded where they meet, so one taking over from the other never shows as a kink. */
const softMax = (a: number, b: number, softness: number) => {
  const gap = Math.max(softness - Math.abs(a - b), 0) / softness;
  return Math.max(a, b) + (gap * gap * softness) / 4;
};

/** The ground under a place in the scene, for rising over hills. */
export type GroundAt = (x: number, z: number) => number;

/** The camera at a point of the flight, from 0, exactly the chase pose, to 1, exactly the map. */
export function mapCameraAt(flight: number, chase: ChasePose, target: MapTarget, groundAt?: GroundAt): CameraPose {
  const { position, forward, car } = chase;
  const share = smootherstep(flight);

  const fromPitch = Math.asin(Math.max(-1, Math.min(1, forward[1])));
  const pitch = fromPitch + (STRAIGHT_DOWN - fromPitch) * smoothstep(0, TILTED_BY, flight);
  const turn = Math.atan2(forward[0], -forward[2]) * (1 - smoothstep(TURN_FROM, 1, flight));
  const [flatLook, sinTurn, cosTurn] = [Math.cos(pitch), Math.sin(turn), Math.cos(turn)];
  const look: Vec3 = [flatLook * sinTurn, Math.sin(pitch), -flatLook * cosTurn];

  const fromDistance = Math.max(Math.hypot(position[0] - car[0], position[1] - car[1], position[2] - car[2]), NEAREST_M);
  const distance = fromDistance * (target.heightM / fromDistance) ** share;

  // Across in step with height, so the car slides evenly from the frame's middle to its place on the map and never leaves the frame.
  const across = share * (distance / target.heightM);
  const onCar = smoothstep(0, ON_THE_CAR_BY, flight);
  const near = [0, 1, 2].map((axis) => position[axis] + forward[axis] * fromDistance + onCar * (car[axis] - position[axis] - forward[axis] * fromDistance));
  const focus: Vec3 = [near[0] + across * (target.x - near[0]), near[1] * (1 - across), near[2] + across * (target.z - near[2])];

  const x = focus[0] - look[0] * distance;
  const z = focus[2] - look[2] * distance;
  let y = focus[1] - look[1] * distance;
  if (groundAt) {
    const clear = Math.max(...LOOK_BEHIND_M.map((metres) => groundAt(x - sinTurn * metres, z + cosTurn * metres))) + CLEARANCE_M;
    y += smoothstep(0, CLEARED_BY, flight) * (softMax(y, clear, CLEAR_SOFTNESS_M) - y);
  }

  return {
    position: [x, y, z],
    pitch,
    turn,
    fieldOfViewDeg: chase.fieldOfViewDeg + (target.fieldOfViewDeg - chase.fieldOfViewDeg) * smoothstep(0, FOV_BY, flight),
  };
}

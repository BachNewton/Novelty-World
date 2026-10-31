/*
 * The one path of the camera between the chase view and the whole island, as a
 * pure function of one number. Like a crane behind the car: from the chase pose
 * it pulls back along the car's rear axis and up together, keeping the way it
 * faces and always looking at the car, until it looks straight down. There is no
 * map view apart from this path. Distance grows exponentially, so the world
 * moves at one apparent speed from the road to the whole island.
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

export interface MapTarget {
  /** How far from the car the top of the path is. */
  topDistanceM: number;
  fieldOfViewDeg: number;
  /** How far the player has panned, in the scene's x and z. It counts for all of it high up, and nothing at the car. */
  panX: number;
  panZ: number;
}

export interface CameraPose {
  position: Vec3;
  lookAt: Vec3;
  fieldOfViewDeg: number;
}

/** By this zoom the camera looks straight down. */
const LEVEL_OFF_ZOOM = 0.55;
/** Just short of straight down, so which way is up on screen stays the car's heading. */
const STEEPEST_RADIANS = Math.PI / 2 - 0.001;
/** By this zoom the look has moved from the chase's point ahead to the car itself. */
const ON_THE_CAR_ZOOM = 0.12;
const PAN_FROM_ZOOM = 0.2;
const PAN_FULL_ZOOM = 0.45;
const CLEARANCE_M = 2.5;
/** How far behind the camera the land is read, so it rises before a hill rather than at it. */
const LOOK_BEHIND_M = [0, 12, 30];
const CLEAR_SOFTNESS_M = 2;
const CLEARED_BY_ZOOM = 0.04;
const FOV_BY_ZOOM = 0.5;

const smoothstep = (from: number, to: number, value: number) => {
  const share = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return share * share * (3 - 2 * share);
};

/** The larger of two heights, rounded where they meet, so one taking over from the other never shows as a kink. */
const softMax = (a: number, b: number, softness: number) => {
  const gap = Math.max(softness - Math.abs(a - b), 0) / softness;
  return Math.max(a, b) + (gap * gap * softness) / 4;
};

/** The ground under a place in the scene, for rising over hills. */
export type GroundAt = (x: number, z: number) => number;

/** The camera at a zoom from 0, exactly the chase pose, to 1, straight above the car. */
export function mapCameraAt(zoom: number, chase: ChasePose, target: MapTarget, groundAt?: GroundAt): CameraPose {
  const { position, forward, car } = chase;
  const flat = Math.max(Math.hypot(forward[0], forward[2]), 1e-6);
  const backX = -forward[0] / flat;
  const backZ = -forward[2] / flat;

  // The chase camera in the crane's terms: how far behind the car, and how far above it.
  const behind = (position[0] - car[0]) * backX + (position[2] - car[2]) * backZ;
  const above = position[1] - car[1];
  const distance = Math.hypot(behind, above);
  const fromElevation = Math.atan2(above, behind);
  const elevation = fromElevation + (STEEPEST_RADIANS - fromElevation) * smoothstep(0, LEVEL_OFF_ZOOM, zoom);
  const out = distance * (target.topDistanceM / distance) ** zoom;

  const panShare = smoothstep(PAN_FROM_ZOOM, PAN_FULL_ZOOM, zoom);
  const panX = target.panX * panShare;
  const panZ = target.panZ * panShare;
  // Any sideways offset the chase camera had goes with the start of the climb: that's the swing behind a turning car.
  const sideX = position[0] - car[0] - behind * backX;
  const sideZ = position[2] - car[2] - behind * backZ;
  const onCar = smoothstep(0, ON_THE_CAR_ZOOM, zoom);
  const x = car[0] + (1 - onCar) * sideX + backX * out * Math.cos(elevation) + panX;
  const z = car[2] + (1 - onCar) * sideZ + backZ * out * Math.cos(elevation) + panZ;
  let y = car[1] + out * Math.sin(elevation);
  if (groundAt) {
    const clear = Math.max(...LOOK_BEHIND_M.map((metres) => groundAt(x + backX * metres, z + backZ * metres))) + CLEARANCE_M;
    y += smoothstep(0, CLEARED_BY_ZOOM, zoom) * (softMax(y, clear, CLEAR_SOFTNESS_M) - y);
  }

  const reach = Math.hypot(position[0] - car[0], position[1] - car[1], position[2] - car[2]) + 20;
  const chaseLook: Vec3 = [position[0] + forward[0] * reach, position[1] + forward[1] * reach, position[2] + forward[2] * reach];
  return {
    position: [x, y, z],
    lookAt: [chaseLook[0] + onCar * (car[0] - chaseLook[0]) + panX, chaseLook[1] + onCar * (car[1] - chaseLook[1]), chaseLook[2] + onCar * (car[2] - chaseLook[2]) + panZ],
    fieldOfViewDeg: chase.fieldOfViewDeg + (target.fieldOfViewDeg - chase.fieldOfViewDeg) * smoothstep(0, FOV_BY_ZOOM, zoom),
  };
}

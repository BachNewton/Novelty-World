import type { PerspectiveCamera } from "three/webgpu";
import { headingOf, speedOf, type CarState } from "../sim/car-state";

/*
 * The camera that rides with the car. It trails the way the car is going rather
 * than the way it points, so a slide shows the side of the car, and it pulls
 * back and widens with speed. The tuning for how it moves is here.
 */

const CHASE = {
  behindM: 6.2,
  aboveM: 2.15,
  lookAheadM: 7,
  lookAboveM: 0.9,
  /** Extra distance at top speed, so the car seems to pull away from the camera. */
  speedBackM: 2.4,
  /** How quickly the camera swings round behind the car, and follows it up and down. */
  swingPerS: 5,
  heightPerS: 7,
  fieldOfViewDeg: 62,
  /** Added at top speed. */
  speedFieldOfViewDeg: 20,
  fieldOfViewPerS: 3,
  topSpeedMS: 55,
  /** Below this the camera follows the nose: there's no direction of travel to follow. */
  slowMS: 3,
  aboveGroundM: 1,
  /** Looking straight down on the car from this high. */
  downAboveM: 16,
  /** How quickly a look round turns, and comes back. */
  lookPerS: 12,
} as const;

/** Where the driver is looking: a turn of the camera round the car from ahead, in radians growing to the left, or overhead. */
export type ChaseLook = number | "down";

const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

export function startChaseCamera(camera: PerspectiveCamera, groundAt: (x: number, z: number) => number) {
  let swing: number | null = null;
  let height = 0;
  let fieldOfView: number = CHASE.fieldOfViewDeg;
  let lookTurn = 0;
  let downShare = 0;

  const setFieldOfView = (degrees: number) => {
    if (camera.fov === degrees) return;
    camera.fov = degrees;
    camera.updateProjectionMatrix();
  };

  return {
    /** Forgets where it was, for a car that's been put somewhere else. */
    snap() {
      swing = null;
      lookTurn = 0;
      downShare = 0;
    },
    /** Moves the camera after `seconds` of the car's motion. */
    update(car: CarState, seconds: number, look: ChaseLook) {
      const heading = headingOf(car.rotation);
      const [x, y, z] = car.position;
      const speed = speedOf(car);
      const moving = speed > CHASE.slowMS ? Math.atan2(-car.velocity[0], -car.velocity[2]) : heading;
      // Backing up, the camera stays behind the nose: following the travel itself would swing it round the car.
      const travel = Math.cos(wrap(moving - heading)) < 0 ? moving + Math.PI : moving;
      const facing = heading + wrap(travel - heading) * Math.min(speed / CHASE.topSpeedMS + 0.45, 0.8);
      if (swing === null) {
        swing = facing;
        height = y;
      }
      swing += wrap(facing - swing) * Math.min(1, CHASE.swingPerS * seconds);
      height += (y - height) * Math.min(1, CHASE.heightPerS * seconds);
      const fast = Math.min(speed / CHASE.topSpeedMS, 1);
      const behind = CHASE.behindM + CHASE.speedBackM * fast * fast;
      const easeLook = Math.min(1, CHASE.lookPerS * seconds);
      // The short way round, so a look swung from behind-left to behind-right doesn't pass through ahead.
      lookTurn += wrap((look === "down" ? 0 : look) - lookTurn) * easeLook;
      downShare += ((look === "down" ? 1 : 0) - downShare) * easeLook;
      const viewX = -Math.sin(swing + lookTurn);
      const viewZ = -Math.cos(swing + lookTurn);
      const cameraX = x - viewX * behind;
      const cameraZ = z - viewZ * behind;
      const cameraY = Math.max(height + CHASE.aboveM, groundAt(cameraX, cameraZ) + CHASE.aboveGroundM);
      const lerp = (from: number, to: number) => from + (to - from) * downShare;
      camera.position.set(lerp(cameraX, x), lerp(cameraY, height + CHASE.downAboveM), lerp(cameraZ, z));
      // Straight down, "up" on screen is the way the car is going; with world up there, lookAt has no answer.
      camera.up.set(lerp(0, -Math.sin(swing)), 1 - downShare, lerp(0, -Math.cos(swing)));
      camera.lookAt(lerp(x + viewX * CHASE.lookAheadM, x), lerp(height + CHASE.lookAboveM, height), lerp(z + viewZ * CHASE.lookAheadM, z));
      fieldOfView += (CHASE.fieldOfViewDeg + CHASE.speedFieldOfViewDeg * fast * fast - fieldOfView) * Math.min(1, CHASE.fieldOfViewPerS * seconds);
      setFieldOfView(fieldOfView);
    },
  };
}

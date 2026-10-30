import type { PerspectiveCamera } from "three/webgpu";
import { headingOf, speedOf, type CarState } from "../sim/car-state";

/*
 * The cameras that ride with the car: the chase and the front bumper. The chase
 * camera trails the way the car is going rather than the way it points, so a
 * slide shows the side of the car, and it pulls back and widens with speed. The
 * tuning for how they move is here.
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
} as const;

const HOOD = { forwardM: 2.35, aboveM: 0.28, lookAheadM: 30, fieldOfViewDeg: 72 } as const;

const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

export type CarView = "chase" | "hood";

export function startChaseCamera(camera: PerspectiveCamera, groundAt: (x: number, z: number) => number) {
  let swing: number | null = null;
  let height = 0;
  let fieldOfView: number = CHASE.fieldOfViewDeg;

  const setFieldOfView = (degrees: number) => {
    if (camera.fov === degrees) return;
    camera.fov = degrees;
    camera.updateProjectionMatrix();
  };

  return {
    /** Moves the camera after `seconds` of the car's motion. */
    update(car: CarState, view: CarView, seconds: number) {
      const heading = headingOf(car.rotation);
      const [x, y, z] = car.position;
      if (view === "hood") {
        const noseX = -Math.sin(heading);
        const noseZ = -Math.cos(heading);
        camera.position.set(x + noseX * HOOD.forwardM, y + HOOD.aboveM, z + noseZ * HOOD.forwardM);
        camera.up.set(0, 1, 0);
        camera.lookAt(x + noseX * HOOD.lookAheadM, y + HOOD.aboveM, z + noseZ * HOOD.lookAheadM);
        setFieldOfView(HOOD.fieldOfViewDeg);
        swing = null;
        return;
      }
      const speed = speedOf(car);
      const travel = speed > CHASE.slowMS ? Math.atan2(-car.velocity[0], -car.velocity[2]) : heading;
      const facing = heading + wrap(travel - heading) * Math.min(speed / CHASE.topSpeedMS + 0.45, 0.8);
      if (swing === null) {
        swing = facing;
        height = y;
      }
      swing += wrap(facing - swing) * Math.min(1, CHASE.swingPerS * seconds);
      height += (y - height) * Math.min(1, CHASE.heightPerS * seconds);
      const fast = Math.min(speed / CHASE.topSpeedMS, 1);
      const behind = CHASE.behindM + CHASE.speedBackM * fast * fast;
      const noseX = -Math.sin(swing);
      const noseZ = -Math.cos(swing);
      const cameraX = x - noseX * behind;
      const cameraZ = z - noseZ * behind;
      camera.position.set(cameraX, Math.max(height + CHASE.aboveM, groundAt(cameraX, cameraZ) + CHASE.aboveGroundM), cameraZ);
      camera.up.set(0, 1, 0);
      camera.lookAt(x + noseX * CHASE.lookAheadM, height + CHASE.lookAboveM, z + noseZ * CHASE.lookAheadM);
      fieldOfView += (CHASE.fieldOfViewDeg + CHASE.speedFieldOfViewDeg * fast * fast - fieldOfView) * Math.min(1, CHASE.fieldOfViewPerS * seconds);
      setFieldOfView(fieldOfView);
    },
  };
}

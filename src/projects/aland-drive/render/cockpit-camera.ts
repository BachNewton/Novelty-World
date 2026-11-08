import { Euler, Matrix4, Quaternion, Vector3, type Object3D, type PerspectiveCamera } from "three/webgpu";
import { speedOf, type CarState } from "../sim/car-state";

/*
 * The driver's eye, in the driver's seat. It rides the car's body, so every bump
 * and lean the shell makes the view makes too, and on top of that the head moves
 * as a body in a seat does: it lags the car's acceleration by a few centimetres on
 * a damped spring, and keeps a little of the horizon level against the body's roll
 * and pitch, so the motion is felt without the view swimming. Looking round turns
 * the head, and past a quarter turn it leans towards the middle of the car to see
 * past the seat. The tuning for all of it is here.
 */

const COCKPIT = {
  /** Vertical, at rest; the view widens by the second at top speed. */
  fieldOfViewDeg: 52,
  speedFieldOfViewDeg: 6,
  topSpeedMS: 70,
  fieldOfViewPerS: 2,
  /** Close enough for the wheel and the pillars: the depth buffer is reversed, so the far plane loses nothing for it. */
  nearM: 0.03,
  /** How far the head lags each metre per second squared, and the most it goes. */
  swayPerMS2: 0.0026,
  swayMostM: 0.04,
  /** The seat's spring: how fast the head settles, and how much of its bounce is damped. */
  swayHz: 1.6,
  swayDamping: 0.8,
  /** How quickly the acceleration the head feels follows the car's. */
  feltPerS: 10,
  /** The share of the body's roll and pitch the head takes back, keeping the horizon steadier. */
  levelRoll: 0.3,
  levelPitch: 0.15,
  /** Turning, the head looks a little into the bend, by the share of the car's turn rate, at most this. */
  intoTurn: 0.07,
  intoTurnMost: 0.09,
  lookPerS: 9,
  /** The eye rests a little below level, as a driver's does, so the instruments and the road just ahead are in view. */
  restPitch: -0.17,
  /** Looking round past this, the head leans towards the middle of the car: across, forward and up. */
  leanFromYaw: 1.5,
  leanToYaw: 2.6,
  lean: [0.26, -0.05, 0.03],
} as const;

/** Where the head looks: a turn from straight ahead, in radians growing to the left, and a tilt, growing up. */
export interface HeadLook {
  yaw: number;
  pitch: number;
}

export const AHEAD: HeadLook = { yaw: 0, pitch: 0 };

const smoothstep = (from: number, to: number, at: number) => {
  const share = Math.min(1, Math.max(0, (at - from) / (to - from)));
  return share * share * (3 - 2 * share);
};

export function startCockpitCamera(camera: PerspectiveCamera) {
  const felt = new Vector3();
  const lastVelocity = new Vector3();
  const sway = new Vector3();
  const swayRate = new Vector3();
  let known = false;
  const look = { yaw: 0, pitch: 0 };
  let fieldOfView: number = COCKPIT.fieldOfViewDeg;

  const carTurn = new Quaternion();
  const toCar = new Quaternion();
  const head = new Quaternion();
  const euler = new Euler(0, 0, 0, "YXZ");
  const worldUp = new Vector3();
  const local = new Vector3();
  const eyeAt = new Vector3();
  const velocity = new Vector3();
  const spin = new Vector3();
  const body = new Matrix4();

  return {
    nearM: COCKPIT.nearM,
    /** Forgets the motion, for a car that's been put somewhere else. */
    snap() {
      known = false;
      sway.set(0, 0, 0);
      swayRate.set(0, 0, 0);
      felt.set(0, 0, 0);
      look.yaw = 0;
      look.pitch = 0;
    },
    /**
     * Puts the camera at `eye` (the car's own frame) in `cockpit`, the object the interior hangs from, after `seconds`
     * of the car's motion, the head turned by `wanted`.
     */
    update(car: CarState, cockpit: Object3D, eye: Vector3, seconds: number, wanted: HeadLook) {
      cockpit.updateWorldMatrix(true, false);
      body.copy(cockpit.matrixWorld);
      carTurn.setFromRotationMatrix(body);
      toCar.copy(carTurn).invert();
      velocity.set(...car.velocity);
      if (!known) {
        lastVelocity.copy(velocity);
        known = true;
      }
      if (seconds > 0) {
        // The car's acceleration in its own frame, smoothed to what a body in a seat feels.
        local.copy(velocity).sub(lastVelocity).divideScalar(seconds).applyQuaternion(toCar);
        felt.lerp(local, Math.min(1, COCKPIT.feltPerS * seconds));
        const omega = COCKPIT.swayHz * Math.PI * 2;
        const target = local.copy(felt).multiplyScalar(-COCKPIT.swayPerMS2).clampLength(0, COCKPIT.swayMostM);
        // A damped spring, stepped semi-implicitly: the head settles where the acceleration puts it.
        swayRate.addScaledVector(target.sub(sway), omega * omega * seconds).multiplyScalar(Math.max(0, 1 - 2 * COCKPIT.swayDamping * omega * seconds));
        sway.addScaledVector(swayRate, seconds);
        const ease = Math.min(1, COCKPIT.lookPerS * seconds);
        look.yaw += (wanted.yaw - look.yaw) * ease;
        look.pitch += (wanted.pitch - look.pitch) * ease;
        fieldOfView += (COCKPIT.fieldOfViewDeg + COCKPIT.speedFieldOfViewDeg * Math.min(speedOf(car) / COCKPIT.topSpeedMS, 1) ** 2 - fieldOfView) * Math.min(1, COCKPIT.fieldOfViewPerS * seconds);
      }
      lastVelocity.copy(velocity);

      const leaning = smoothstep(COCKPIT.leanFromYaw, COCKPIT.leanToYaw, Math.abs(look.yaw));
      const towardsMiddle = -Math.sign(eye.x) * COCKPIT.lean[0] * leaning;
      eyeAt.set(eye.x + towardsMiddle + sway.x, eye.y + COCKPIT.lean[2] * leaning + sway.y, eye.z + COCKPIT.lean[1] * leaning + sway.z);
      camera.position.copy(eyeAt).applyMatrix4(body);

      worldUp.set(0, 1, 0).applyQuaternion(toCar);
      spin.set(...car.spin).applyQuaternion(toCar);
      const into = Math.max(-COCKPIT.intoTurnMost, Math.min(COCKPIT.intoTurnMost, spin.y * COCKPIT.intoTurn));
      euler.set(COCKPIT.restPitch + look.pitch + Math.atan2(worldUp.z, worldUp.y) * COCKPIT.levelPitch, look.yaw + into, -Math.atan2(worldUp.x, worldUp.y) * COCKPIT.levelRoll);
      head.setFromEuler(euler);
      camera.quaternion.copy(carTurn).multiply(head);
      camera.up.set(0, 1, 0);
      if (Math.abs(camera.fov - fieldOfView) > 1e-4) {
        camera.fov = fieldOfView;
        camera.updateProjectionMatrix();
      }
    },
  };
}

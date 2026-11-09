import { Group, PerspectiveCamera, Quaternion, Scene, Vector3 } from "three/webgpu";
import { describe, expect, it } from "vitest";
import { LAMPS_OFF, type CarState } from "../sim/car-state";
import { AHEAD, startCockpitCamera } from "./cockpit-camera";

/** The head moves a few centimetres in its seat by design; the eye never leaves it by more. */
const HEAD_ROOM_M = 0.05;
const EYE = new Vector3(-0.38, 0.32, 0.1);

/** The car as the game hangs it: a moving root and body pivot, and the interior standing still in the pivot. */
function carInScene() {
  const scene = new Scene();
  const root = new Group();
  const pivot = new Group();
  pivot.position.y = 0.5;
  const interior = new Group();
  interior.position.y = -0.5;
  interior.matrixAutoUpdate = false;
  interior.updateMatrix();
  pivot.add(interior);
  root.add(pivot);
  scene.add(root);
  scene.updateMatrixWorld();
  return { scene, root, interior };
}

const stateOf = (position: Vector3, yaw: number, speed: number, turnRate: number): CarState => {
  const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
  const velocity = new Vector3(0, 0, -speed).applyQuaternion(rotation);
  return {
    position: [position.x, position.y, position.z],
    rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
    velocity: [velocity.x, velocity.y, velocity.z],
    spin: [0, turnRate, 0],
    car: "aska",
    steer: 0,
    suspension: [0, 0, 0, 0],
    roll: [0, 0, 0, 0],
    lamps: LAMPS_OFF,
  };
};

/** Drives a run of (seconds, acceleration, turn rate) frames, and returns the furthest the eye got from its seat. */
function furthestFromSeat(frames: [seconds: number, accelerationMS2: number, turnRate: number][]) {
  const { scene, root, interior } = carInScene();
  const camera = new PerspectiveCamera();
  const cockpit = startCockpitCamera(camera);
  const position = new Vector3();
  let speed = 0;
  let yaw = 0;
  let furthest = 0;
  for (const [seconds, acceleration, turnRate] of frames) {
    speed = Math.max(0, speed + acceleration * seconds);
    yaw += turnRate * seconds;
    const state = stateOf(position, yaw, speed, turnRate);
    position.addScaledVector(new Vector3(...state.velocity), seconds);
    root.position.set(...state.position);
    root.quaternion.set(...state.rotation);
    cockpit.update(state, interior, EYE, seconds, AHEAD);
    // The render brings every matrix up to date before it draws: the car as drawn is where the eye must be.
    scene.updateMatrixWorld();
    furthest = Math.max(furthest, interior.worldToLocal(camera.position.clone()).distanceTo(EYE));
  }
  return furthest;
}

const run = (seconds: number, frames: number, acceleration: number, turnRate = 0) => Array.from({ length: frames }, () => [seconds, acceleration, turnRate] as [number, number, number]);

describe("the cockpit camera", () => {
  it("keeps the eye in the seat from standstill to top speed and back, at any frame rate", () => {
    for (const seconds of [1 / 144, 1 / 100, 1 / 60, 1 / 30]) {
      const frames = [...run(seconds, Math.round(10 / seconds), 10, 0.2), ...run(seconds, Math.round(2 / seconds), 0), ...run(seconds, Math.round(8 / seconds), -12, -0.3)];
      expect(furthestFromSeat(frames), `${seconds} s frames`).toBeLessThan(HEAD_ROOM_M);
    }
  });

  it("keeps the eye in the seat through a crash and a stalled frame", () => {
    const frames = [...run(1 / 60, 600, 15), [1 / 60, -5000, 0] as [number, number, number], ...run(0.1, 3, 0), ...run(1 / 60, 120, 0)];
    expect(furthestFromSeat(frames)).toBeLessThan(HEAD_ROOM_M);
  });
});

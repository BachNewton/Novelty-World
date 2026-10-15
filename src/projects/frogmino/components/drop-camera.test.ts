import { describe, expect, it } from "vitest";
import { GROUND_CLEARANCE } from "../clearance";
import { dropPose, leapProgress } from "../frog/leaps";
import { TALLEST_VEHICLE } from "../fleet";
import { HELI_DECK_TOP, bob, heliPose, type HeliPose } from "../heli/flight";
import { heliModel } from "../heli/model";
import { FROG_THICKNESS } from "../run";
import { TUNING } from "../tuning";
import type { Vec3 } from "../vehicles/parts";
import { PREVIEW_LANES } from "../world/preview-rows";
import { CAMERA_NEAR, CAMERA_PITCH, cameraEye, easedCameraHeight, fittedFov } from "./camera-fit";

// The camera through the jump out of the helicopter, as the scene moves it:
// its depth follows the drawn frog's exactly, and its height eases toward the
// drop's level, while the helicopter, lightened, flies off.

const FRAME = 1 / 60;
const DEGREES = Math.PI / 180;
// The narrowest screen supported, portrait, and a wide one.
const NARROWEST_ASPECT = 360 / 800;
const WIDE_ASPECT = 16 / 9;

interface Point {
  depth: number;
  y: number;
}

interface Frame {
  time: number;
  eye: Point;
  // The middle of the frog's bottom row, and the top of the tallest piece
  // standing upright, at the back of the frog.
  frog: Point;
  frogTop: Point;
}

// A point of the helicopter, in its own frame about the deck's middle, where
// its pose puts it in the scene: tilted by its pitch and roll, turned by its
// yaw, then moved to its place, as the scene draws it.
function placed([x, y, z]: Vec3, pose: HeliPose): Vec3 {
  const [cp, sp, cr, sr, cy, sy] = [Math.cos(pose.pitch), Math.sin(pose.pitch), Math.cos(pose.roll), Math.sin(pose.roll), Math.cos(pose.yaw), Math.sin(pose.yaw)];
  // Euler XYZ: roll about z first, then pitch about x.
  const [x1, y1] = [x * cr - y * sr, x * sr + y * cr];
  const [y2, z2] = [y1 * cp - z * sp, y1 * sp + z * cp];
  const [x3, z3] = [x1 * cy + z2 * sy, -x1 * sy + z2 * cy];
  return [pose.x + x3, pose.y + y2, -pose.depth + z3];
}

// When the team jumps out, in seconds into the run.
const JUMP = 3.1;

// The jump from the frog's place on the deck, frame by frame, and on until
// the camera has settled on the road.
function dropFrames(): Frame[] {
  const start = { fromDepth: 0, fromLevel: HELI_DECK_TOP + bob(JUMP) };
  const landing = TUNING.dropDistance;
  const frames: Frame[] = [];
  let eyeY = cameraEye(TUNING, start.fromDepth, HELI_DECK_TOP).y;
  for (let time = 0; time < TUNING.dropDuration + 1; time += FRAME) {
    const pose = dropPose(start, landing, leapProgress(time, TUNING.dropDuration));
    const eye = cameraEye(TUNING, pose.depth, pose.level);
    eyeY = easedCameraHeight(eyeY, eye.y, FRAME);
    const feet = pose.height + GROUND_CLEARANCE;
    frames.push({
      time,
      eye: { depth: -eye.z, y: eyeY },
      frog: { depth: pose.depth - FROG_THICKNESS / 2, y: feet + 0.5 },
      frogTop: { depth: pose.depth - FROG_THICKNESS, y: feet + TALLEST_VEHICLE },
    });
  }
  return frames;
}

describe("the camera through the jump out", () => {
  const frames = dropFrames();

  it.each(PREVIEW_LANES)("never comes nearer the helicopter than its near plane as it flies off, on a road %d lanes wide", (lanes) => {
    const middle = (lanes - 1) / 2;
    const model = heliModel(lanes);
    // The craft as points in its own frame, about the deck's middle: every
    // corner of its boxes, and each rotor's disc round its rim.
    const points: Vec3[] = [
      ...model.body.flatMap(({ min, max }) =>
        [0, 1, 2, 3, 4, 5, 6, 7].map((k): Vec3 => [k & 1 ? max[0] : min[0], k & 2 ? max[1] : min[1], k & 4 ? max[2] : min[2]]),
      ),
      ...model.rotors.flatMap(({ centre, axis, radius }) =>
        Array.from({ length: 16 }, (_, k): Vec3 => {
          const [a, b] = [radius * Math.cos((k * Math.PI) / 8), radius * Math.sin((k * Math.PI) / 8)];
          return axis === "y" ? [centre[0] + a, centre[1], centre[2] + b] : [centre[0], centre[1] + a, centre[2] + b];
        }),
      ),
    ].map(([x, y, z]) => [x - middle, y, z]);
    for (const { time, eye } of frames) {
      const pose = heliPose(middle, JUMP + time, JUMP);
      const nearest = Math.min(
        ...points.map((point) => {
          const [x, y, z] = placed(point, pose);
          return Math.hypot(x - middle, y - eye.y, z + eye.depth);
        }),
      );
      // Nearer than the camera's near plane, it would be cut open.
      expect(nearest).toBeGreaterThanOrEqual(CAMERA_NEAR);
    }
  });

  it.each(PREVIEW_LANES)("keeps even the tallest frog in view, below the top of a wide screen's view, on a road %d lanes wide", (lanes) => {
    const top = -CAMERA_PITCH - (fittedFov(WIDE_ASPECT, lanes) / 2) * DEGREES;
    for (const { eye, frogTop } of frames) {
      const below = Math.atan2(eye.y - frogTop.y, frogTop.depth - eye.depth);
      expect(below).toBeGreaterThan(top);
    }
  });

  it.each(PREVIEW_LANES)("never looks back past itself, so what is behind it is out of view, on a road %d lanes wide", (lanes) => {
    expect(-CAMERA_PITCH + (fittedFov(NARROWEST_ASPECT, lanes) / 2) * DEGREES).toBeLessThan(Math.PI / 2);
  });
});

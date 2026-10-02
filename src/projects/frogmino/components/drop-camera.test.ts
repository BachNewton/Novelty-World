import { describe, expect, it } from "vitest";
import { GROUND_CLEARANCE } from "../clearance";
import { dropPose, leapProgress } from "../frog/leaps";
import { FROG_THICKNESS } from "../run";
import { TUNING } from "../tuning";
import { ROAD_LEFT, ROAD_RIGHT } from "../world/geometry";
import { DECK_TOP, OVERPASS_FAR, VEHICLE_TOP, overpassBoxes } from "../world/structures";
import { CAMERA_PITCH, cameraEye, easedCameraHeight, fittedFov } from "./camera-fit";

// The camera through the drop, as the scene moves it: its depth follows the
// drawn frog's exactly, and its height eases toward the drop's level. The
// overpass is seen side on, as the camera over the middle of the road sees
// it: every part of it standing over the road, as a rectangle of depth and
// height.

const FRAME = 1 / 60;
const DEGREES = Math.PI / 180;
// The narrowest screen supported, portrait, and a wide one.
const NARROWEST_ASPECT = 360 / 800;
const WIDE_ASPECT = 16 / 9;
// The camera keeps at least the room from the overpass that it keeps from
// the tallest vehicle passing beneath it.
const CLEARANCE = TUNING.cameraHeight - VEHICLE_TOP;

interface Rect {
  near: number;
  far: number;
  bottom: number;
  top: number;
}

interface Point {
  depth: number;
  y: number;
}

const OVERPASS: Rect[] = overpassBoxes()
  .filter(({ center, size }) => center[0] + size[0] / 2 > ROAD_LEFT && center[0] - size[0] / 2 < ROAD_RIGHT)
  .map(({ center, size }) => ({
    near: -center[2] - size[2] / 2,
    far: -center[2] + size[2] / 2,
    bottom: center[1] - size[1] / 2,
    top: center[1] + size[1] / 2,
  }));

function distanceTo(rect: Rect, point: Point): number {
  const along = Math.max(rect.near - point.depth, 0, point.depth - rect.far);
  const up = Math.max(rect.bottom - point.y, 0, point.y - rect.top);
  return Math.hypot(along, up);
}

// Whether the straight line from `from` to `to` passes through the rectangle.
function crosses(rect: Rect, from: Point, to: Point): boolean {
  let [enter, leave] = [0, 1];
  const slabs: [number, number, number, number][] = [
    [from.depth, to.depth - from.depth, rect.near, rect.far],
    [from.y, to.y - from.y, rect.bottom, rect.top],
  ];
  for (const [start, run, low, high] of slabs) {
    if (run === 0) {
      if (start <= low || start >= high) return false;
      continue;
    }
    const [a, b] = [(low - start) / run, (high - start) / run];
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
  }
  return enter < leave;
}

interface Frame {
  eye: Point;
  // The middle of the frog's bottom row, and the top of the tallest piece
  // standing upright, at the back of the frog.
  frog: Point;
  frogTop: Point;
}

// The drop from the frog's place on the deck, frame by frame, and on until
// the camera has settled on the road.
function dropFrames(): Frame[] {
  const start = { fromDepth: 0, fromLevel: DECK_TOP };
  const landing = TUNING.dropDistance;
  const frames: Frame[] = [];
  let eyeY = cameraEye(TUNING, start.fromDepth, start.fromLevel).y;
  for (let time = 0; time < TUNING.dropDuration + 1; time += FRAME) {
    const pose = dropPose(start, landing, leapProgress(time, TUNING.dropDuration));
    const eye = cameraEye(TUNING, pose.depth, pose.level);
    eyeY = easedCameraHeight(eyeY, eye.y, FRAME);
    const feet = pose.height + GROUND_CLEARANCE;
    frames.push({
      eye: { depth: -eye.z, y: eyeY },
      frog: { depth: pose.depth - FROG_THICKNESS / 2, y: feet + 0.5 },
      frogTop: { depth: pose.depth - FROG_THICKNESS, y: feet + TUNING.wallRows },
    });
  }
  return frames;
}

describe("the camera through the drop", () => {
  const frames = dropFrames();

  it("never passes through or skims the overpass", () => {
    for (const { eye } of frames) {
      for (const rect of OVERPASS) expect(distanceTo(rect, eye)).toBeGreaterThanOrEqual(CLEARANCE);
    }
  });

  it("always sees the frog past the overpass, never through it", () => {
    for (const { eye, frog } of frames) {
      for (const rect of OVERPASS) expect(crosses(rect, eye, frog)).toBe(false);
    }
  });

  it("keeps even the tallest frog in view, below the top of a wide screen's view", () => {
    const top = -CAMERA_PITCH - (fittedFov(WIDE_ASPECT) / 2) * DEGREES;
    for (const { eye, frogTop } of frames) {
      const below = Math.atan2(eye.y - frogTop.y, frogTop.depth - eye.depth);
      expect(below).toBeGreaterThan(top);
    }
  });

  it("never looks back past itself, so a deck behind it is out of view", () => {
    expect(-CAMERA_PITCH + (fittedFov(NARROWEST_ASPECT) / 2) * DEGREES).toBeLessThan(Math.PI / 2);
  });

  it("is past the overpass when the frog lands, and still is after a bonk as it lands", () => {
    const { dropDistance, depthStep, bonkKnockback, cameraFollow } = TUNING;
    expect(dropDistance - cameraFollow).toBeGreaterThan(OVERPASS_FAR);
    // The farthest back a bonk can put it: knocked back from a row whose face
    // the leap's last jump reaches.
    const bonked = dropDistance - depthStep - bonkKnockback * depthStep;
    expect(bonked - cameraFollow).toBeGreaterThanOrEqual(OVERPASS_FAR);
  });
});

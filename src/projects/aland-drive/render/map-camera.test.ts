import { describe, expect, it } from "vitest";
import { mapCameraAt, type CameraPose, type ChasePose, type MapTarget } from "./map-camera";

/* The camera's path, checked at many points: a jump, a tilt back or a roll is the likely mistake here, and hard to see in a still. */

const chase: ChasePose = { position: [10, 22.5, -14], forward: [0.6, -0.08, -0.796], fieldOfViewDeg: 62, car: [14.2, 20.3, -19.6] };
const target: MapTarget = { topDistanceM: 70000, fieldOfViewDeg: 45, panX: 0, panZ: 0 };
const STEPS = 2000;
const zooms = Array.from({ length: STEPS + 1 }, (_, step) => step / STEPS);

const pitchOf = ({ position, lookAt }: CameraPose) => Math.atan2(position[1] - lookAt[1], Math.hypot(lookAt[0] - position[0], lookAt[2] - position[2]));
const yawOf = ({ position, lookAt }: CameraPose) => Math.atan2(lookAt[0] - position[0], lookAt[2] - position[2]);
const distanceFrom = (pose: CameraPose, point: readonly number[]) => Math.hypot(pose.position[0] - point[0], pose.position[1] - point[1], pose.position[2] - point[2]);

describe("the camera's path to the map", () => {
  it("starts at the chase camera exactly: where it is, where it looks, and its field of view", () => {
    const pose = mapCameraAt(0, chase, target);
    pose.position.forEach((value, axis) => {
      expect(value).toBeCloseTo(chase.position[axis], 6);
    });
    expect(pose.fieldOfViewDeg).toBe(chase.fieldOfViewDeg);
    const toLook = [0, 1, 2].map((axis) => pose.lookAt[axis] - pose.position[axis]);
    const length = Math.hypot(...toLook);
    toLook.forEach((value, axis) => {
      expect(value / length).toBeCloseTo(chase.forward[axis], 3);
    });
  });

  it("only ever tilts down, and ends straight down", () => {
    const pitches = zooms.map((zoom) => pitchOf(mapCameraAt(zoom, chase, target)));
    for (let step = 1; step < pitches.length; step++) expect(pitches[step]).toBeGreaterThanOrEqual(pitches[step - 1] - 1e-9);
    expect(pitches[STEPS]).toBeGreaterThan(Math.PI / 2 - 0.01);
  });

  it("never turns: the way it faces stays the car's until it's looking straight down", () => {
    const start = yawOf(mapCameraAt(0, chase, target));
    for (const zoom of zooms.filter((value) => value < 0.5)) {
      const change = Math.atan2(Math.sin(yawOf(mapCameraAt(zoom, chase, target)) - start), Math.cos(yawOf(mapCameraAt(zoom, chase, target)) - start));
      expect(Math.abs(change)).toBeLessThan(0.01);
    }
  });

  it("has the car at the middle of the frame from the start of the climb", () => {
    for (const zoom of zooms.filter((value) => value >= 0.12)) {
      const pose = mapCameraAt(zoom, chase, target);
      const aim = [0, 1, 2].map((axis) => pose.lookAt[axis] - pose.position[axis]);
      const toCar = [0, 1, 2].map((axis) => chase.car[axis] - pose.position[axis]);
      const cross = Math.hypot(aim[1] * toCar[2] - aim[2] * toCar[1], aim[2] * toCar[0] - aim[0] * toCar[2], aim[0] * toCar[1] - aim[1] * toCar[0]);
      expect(cross / (Math.hypot(...aim) * Math.hypot(...toCar))).toBeLessThan(1e-6);
    }
  });

  it("moves in even steps for its height, with no jump anywhere", () => {
    for (let step = 1; step < zooms.length; step++) {
      const [before, after] = [mapCameraAt(zooms[step - 1], chase, target), mapCameraAt(zooms[step], chase, target)];
      const moved = distanceFrom(after, before.position);
      expect(moved / Math.max(distanceFrom(before, chase.car), 1)).toBeLessThan(0.02);
    }
  });

  it("clears a hill behind the car with no step, and rises over it before reaching it", () => {
    const hill = (x: number, z: number) => 20 + 14 * Math.exp(-(((x - 8) / 10) ** 2 + ((z + 8) / 10) ** 2));
    for (let step = 1; step < zooms.length; step++) {
      const [before, after] = [mapCameraAt(zooms[step - 1], chase, target, hill), mapCameraAt(zooms[step], chase, target, hill)];
      expect(distanceFrom(after, before.position)).toBeLessThan(Math.max(distanceFrom(before, chase.car), 8) * 0.03);
    }
    for (const zoom of zooms.filter((value) => value >= 0.05)) {
      const { position } = mapCameraAt(zoom, chase, target, hill);
      expect(position[1]).toBeGreaterThan(hill(position[0], position[2]) + 1);
    }
  });

  it("forgets a pan on the way back down to the car", () => {
    const panned = { ...target, panX: 9000, panZ: -4000 };
    const top = mapCameraAt(1, chase, panned);
    const unpanned = mapCameraAt(1, chase, target);
    expect(top.position[0] - unpanned.position[0]).toBeCloseTo(9000);
    expect(mapCameraAt(0.1, chase, panned).position).toEqual(mapCameraAt(0.1, chase, target).position);
  });
});

import { describe, expect, it } from "vitest";
import { mapCameraAt, type CameraPose, type ChasePose, type MapTarget } from "./map-camera";

/* The camera's flight, checked at many points: a jump, a tilt back or a lost car is the likely mistake here, and hard to see in a still. */

const CAR: ChasePose["car"] = [14200, 20.3, -19600];
const facing = (x: number, z: number): ChasePose => {
  const length = Math.hypot(x, z, 0.08);
  const forward: ChasePose["forward"] = [x / length, -0.08 / length, z / length];
  return { position: [CAR[0] - forward[0] * 6, CAR[1] + 2.2, CAR[2] - forward[2] * 6], forward, fieldOfViewDeg: 62, car: CAR };
};
const chases = [facing(0.6, -0.8), facing(1, 0), facing(0, 1), facing(-0.7, 0.7)];
const target: MapTarget = { x: -2000, z: 8000, heightM: 90000, fieldOfViewDeg: 45 };
const STEPS = 2000;
const flights = Array.from({ length: STEPS + 1 }, (_, step) => step / STEPS);

const lookOf = ({ pitch, turn }: CameraPose) => [Math.cos(pitch) * Math.sin(turn), Math.sin(pitch), -Math.cos(pitch) * Math.cos(turn)];
const distanceFrom = (pose: CameraPose, point: readonly number[]) => Math.hypot(pose.position[0] - point[0], pose.position[1] - point[1], pose.position[2] - point[2]);

describe("the camera's flight to the map", () => {
  it.each(chases)("starts at the chase camera exactly: where it is, where it looks, and its field of view", (chase) => {
    const pose = mapCameraAt(0, chase, target);
    pose.position.forEach((value, axis) => {
      expect(value).toBeCloseTo(chase.position[axis], 6);
    });
    expect(pose.fieldOfViewDeg).toBe(chase.fieldOfViewDeg);
    lookOf(pose).forEach((value, axis) => {
      expect(value).toBeCloseTo(chase.forward[axis], 6);
    });
  });

  it.each(chases)("ends on the map exactly, whichever way the car faced: over the middle, straight down, north up", (chase) => {
    const { position, pitch, turn, fieldOfViewDeg } = mapCameraAt(1, chase, target);
    expect(position[0]).toBeCloseTo(target.x, 3);
    expect(position[1]).toBeCloseTo(target.heightM, 3);
    expect(position[2]).toBeCloseTo(target.z, 3);
    expect(pitch).toBeCloseTo(-Math.PI / 2, 9);
    expect(turn).toBeCloseTo(0, 9);
    expect(fieldOfViewDeg).toBe(target.fieldOfViewDeg);
  });

  it.each(chases)("only ever tilts down, and turns to north the short way with no swing back", (chase) => {
    const poses = flights.map((flight) => mapCameraAt(flight, chase, target));
    expect(Math.abs(poses[0].turn)).toBeLessThanOrEqual(Math.PI);
    for (let step = 1; step < poses.length; step++) {
      expect(poses[step].pitch).toBeLessThanOrEqual(poses[step - 1].pitch + 1e-9);
      expect(Math.abs(poses[step].turn)).toBeLessThanOrEqual(Math.abs(poses[step - 1].turn) + 1e-9);
    }
  });

  it.each(chases)("keeps the car in the frame all the way", (chase) => {
    const halfView = (target.fieldOfViewDeg * Math.PI) / 360;
    for (const flight of flights.filter((value) => value >= 0.12)) {
      const pose = mapCameraAt(flight, chase, target);
      const look = lookOf(pose);
      const toCar = [0, 1, 2].map((axis) => chase.car[axis] - pose.position[axis]);
      const along = (toCar[0] * look[0] + toCar[1] * look[1] + toCar[2] * look[2]) / Math.hypot(...toCar);
      expect(Math.acos(Math.min(along, 1))).toBeLessThan(halfView);
    }
  });

  it.each(chases)("moves in even steps for its height, with no jump anywhere", (chase) => {
    for (let step = 1; step < flights.length; step++) {
      const [before, after] = [mapCameraAt(flights[step - 1], chase, target), mapCameraAt(flights[step], chase, target)];
      expect(distanceFrom(after, before.position) / Math.max(distanceFrom(before, chase.car), 1)).toBeLessThan(0.03);
    }
  });

  it("clears a hill behind the car with no step, and rises over it before reaching it", () => {
    const chase = chases[0];
    const hill = (x: number, z: number) => 20 + 14 * Math.exp(-(((x - chase.position[0]) / 10) ** 2 + ((z - chase.position[2]) / 10) ** 2));
    for (let step = 1; step < flights.length; step++) {
      const [before, after] = [mapCameraAt(flights[step - 1], chase, target, hill), mapCameraAt(flights[step], chase, target, hill)];
      expect(distanceFrom(after, before.position)).toBeLessThan(Math.max(distanceFrom(before, chase.car), 8) * 0.03);
    }
    for (const flight of flights.filter((value) => value >= 0.12)) {
      const { position } = mapCameraAt(flight, chase, target, hill);
      expect(position[1]).toBeGreaterThan(hill(position[0], position[2]) + 1);
    }
  });
});

import { describe, expect, it } from "vitest";
import { SURFACES } from "../cars/mesh";
import { buildBikeMesh } from "./build";
import { riderLook } from "./look";
import { apply } from "./mat";
import { PARTS, poseBike, reach, restMotion, stepMotion, stillInput, type RideMotion } from "./rig";
import { SLOTS } from "./shapes";
import { BIKES } from "./specs";

const NEAR_BUDGET = 3000;
const FAR_BUDGET = 300;
const RIDER = { rider: true, helmet: true, hair: "short" } as const;
const named = BIKES.map((bike) => [bike.name, bike] as const);

describe("the bikes", () => {
  it("has a surface index for every palette slot", () => {
    expect(SLOTS.length).toBeLessThanOrEqual(SURFACES.length);
  });

  it.each(named)("%s stays in its triangle budget, rider and all, at both details", (_, bike) => {
    expect(buildBikeMesh(bike, "near").triangles).toBeLessThan(NEAR_BUDGET);
    expect(buildBikeMesh(bike, "far").triangles).toBeLessThan(FAR_BUDGET);
  });

  it.each(named)("%s has no broken normals", (_, bike) => {
    for (const detail of ["near", "far"] as const) {
      expect(buildBikeMesh(bike, detail).normals.every(Number.isFinite)).toBe(true);
    }
  });

  it.each(named)("%s keeps the rider's hands and feet on it, round the whole cycle and every way of riding", (_, bike) => {
    const ways: Partial<RideMotion>[] = [{}, { stand: 1 }, { coast: 1 }, { stop: 1 }];
    for (const way of ways) {
      for (let crank = 0; crank < Math.PI * 2; crank += 0.25) {
        const input = { ...stillInput(), steer: 0.35, lean: 0.25 };
        const { reachShort } = poseBike(bike, input, { ...restMotion(), ...way, crank }, RIDER);
        expect(reachShort).toBeLessThan(0.02);
      }
    }
  });

  it("a wheel turns once for each circumference it rolls", () => {
    const bike = BIKES[0];
    const motion = restMotion();
    const distance = Math.PI * 2 * bike.wheelRadiusM;
    for (let step = 0; step < 100; step++) stepMotion(motion, { ...stillInput(), speedMS: distance }, bike, 0.01);
    expect(motion.wheel).toBeCloseTo(Math.PI * 2);
  });

  it("the cranks settle level and stop while the wheels roll on when the rider coasts", () => {
    const bike = BIKES[0];
    const motion = restMotion();
    const coasting = { ...stillInput(), effort: 0 };
    for (let step = 0; step < 240; step++) stepMotion(motion, coasting, bike, 1 / 60);
    const [crank, wheel] = [motion.crank, motion.wheel];
    for (let step = 0; step < 60; step++) stepMotion(motion, coasting, bike, 1 / 60);
    expect(motion.crank).toBeCloseTo(crank, 2);
    expect(motion.wheel).toBeGreaterThan(wheel);
    expect(Math.abs(Math.sin(motion.crank))).toBeLessThan(0.02);
  });

  it("a lean tops the bike over the side it is given, and leaves the tyres on the road", () => {
    const { matrices } = poseBike(BIKES[3], { ...stillInput(), lean: 0.3 }, restMotion(), RIDER);
    const frame = matrices[PARTS.indexOf("frame")];
    expect(apply(frame, [0, 1, 0])[0]).toBeGreaterThan(0.2);
    expect(apply(frame, [0, 0, 0])[1]).toBeCloseTo(0);
  });

  it("a reach bends the way it is told and meets its target", () => {
    const { joint, tip } = reach([0, 1, 0], [0, 0.2, 0], 0.5, 0.5, [0, 0, -1]);
    expect(joint[2]).toBeLessThan(0);
    expect(tip[1]).toBeCloseTo(0.2);
  });

  it("the same seed is the same rider, and seeds give a crowd", () => {
    expect(riderLook(7)).toEqual(riderLook(7));
    const tops = new Set(Array.from({ length: 40 }, (_, seed) => riderLook(seed).top));
    expect(tops.size).toBeGreaterThan(4);
  });
});

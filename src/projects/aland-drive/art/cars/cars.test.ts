import { describe, expect, it } from "vitest";
import { CAR } from "../../sim/tuning";
import { buildCarParts } from "./build";
import type { Soup } from "./mesh";
import { CARS, PLAYER_CAR } from "./specs";

const NEAR_BUDGET = 8000;
const FAR_BUDGET = 2000;

const total = ({ body, wheel }: { body: Soup; wheel: Soup }) => body.triangles + wheel.triangles * 4;

/** Six times the volume a shell encloses: positive when its faces point outwards. */
function signedVolume({ positions }: Soup) {
  let sum = 0;
  for (let at = 0; at < positions.length; at += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = positions.subarray(at, at + 9);
    sum += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  return sum;
}

describe("the cars", () => {
  it.each(CARS.map((car) => [car.name, car] as const))("%s stays in its triangle budget, at both details", (_, car) => {
    expect(total(buildCarParts(car, "near"))).toBeLessThan(NEAR_BUDGET);
    expect(total(buildCarParts(car, "far"))).toBeLessThan(FAR_BUDGET);
  });

  it.each(CARS.map((car) => [car.name, car] as const))("%s has its faces outwards and no broken normals", (_, car) => {
    const { body, wheel } = buildCarParts(car, "near");
    expect(signedVolume(body)).toBeGreaterThan(0);
    expect(signedVolume(wheel)).toBeGreaterThan(0);
    expect(body.normals.every(Number.isFinite)).toBe(true);
  });

  it("the player's car is the simulation's car", () => {
    expect(PLAYER_CAR.body.axleZ).toEqual([-CAR.wheelBaseM / 2, CAR.wheelBaseM / 2]);
    expect(PLAYER_CAR.body.trackM).toBe(CAR.trackM);
    expect(PLAYER_CAR.wheel.radiusM).toBe(CAR.wheelRadiusM);
    const { positions } = buildCarParts(PLAYER_CAR, "near").body;
    let longest = 0;
    for (let at = 2; at < positions.length; at += 3) longest = Math.max(longest, Math.abs(positions[at]));
    expect(longest).toBeCloseTo(CAR.halfSize[2], 1);
  });
});

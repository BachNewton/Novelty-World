import { describe, expect, it } from "vitest";
import { CAR_IDS, CARS as TUNINGS } from "../../sim/cars";
import { buildDistant } from "./body";
import { buildCarParts, groundY } from "./build";
import type { Soup } from "./mesh";
import { CARS, WORLD_CARS } from "./specs";

const HERO_BUDGET = 25000;
const FAR_BUDGET = 2000;
const DISTANT_BUDGET = 160;

const total = ({ body, glass, wheel }: { body: Soup; glass: Soup | null; wheel: Soup }) => body.triangles + (glass?.triangles ?? 0) + wheel.triangles * 4;

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
  it.each(CARS.map((car) => [car.name, car] as const))("%s stays in its triangle budget at both details, its faces outwards and its normals whole", (_, car) => {
    const hero = buildCarParts(car, "hero");
    const far = buildCarParts(car, "far");
    expect(total(hero)).toBeLessThan(HERO_BUDGET);
    expect(total(far)).toBeLessThan(FAR_BUDGET);
    expect(signedVolume(far.body)).toBeGreaterThan(0);
    expect(signedVolume(hero.wheel)).toBeGreaterThan(0);
    expect(hero.body.normals.every(Number.isFinite)).toBe(true);
  });

  it.each(WORLD_CARS.map((car) => [car.name, car] as const))("%s, a world car, stays under the world budget", (_, car) => {
    const far = buildCarParts(car, "far", true);
    expect(total(far)).toBeLessThan(FAR_BUDGET);
    expect(signedVolume(far.body)).toBeGreaterThan(0);
  });

  it.each([...CARS, ...WORLD_CARS].map((car) => [car.name, car] as const))("%s has a stand-in of its near version simplified, in its budget and facing out", (_, car) => {
    const distant = buildDistant(car.body, groundY(car), buildCarParts(car, "far").body);
    expect(distant.triangles).toBeLessThan(DISTANT_BUDGET);
    expect(signedVolume(distant)).toBeGreaterThan(0);
  });

  it("has art for every car a player can drive, once each", () => {
    expect(CARS.map(({ id }) => id)).toEqual(CAR_IDS);
  });

  it.each(CARS.map((car) => [car.name, car] as const))("%s collides as the box it's drawn as, above its sills and under its roof", (_, car) => {
    if (!car.id) throw new Error(`${car.name} has no simulation`);
    const { halfSize, boxUpM } = TUNINGS[car.id].car;
    const { positions } = buildCarParts(car, "far").body;
    const low = [Infinity, Infinity, Infinity];
    const high = [-Infinity, -Infinity, -Infinity];
    for (let at = 0; at < positions.length; at++) {
      low[at % 3] = Math.min(low[at % 3], positions[at]);
      high[at % 3] = Math.max(high[at % 3], positions[at]);
    }
    // The drawn width takes in the mirrors.
    expect(Math.abs(halfSize[0] - (high[0] - low[0]) / 2)).toBeLessThan(0.15);
    expect(Math.abs(halfSize[2] - (high[2] - low[2]) / 2)).toBeLessThan(0.12);
    expect(boxUpM - halfSize[1]).toBeGreaterThan(low[1] + 0.15);
    expect(boxUpM + halfSize[1]).toBeLessThan(high[1]);
  });
});

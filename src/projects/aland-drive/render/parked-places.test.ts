import { describe, expect, it } from "vitest";
import { WORLD_CARS } from "../art/cars/specs";
import { PARKED_CARS, parkedAt, parkedWalls } from "./parked-places";

describe("parked cars", () => {
  it("collide as the world cars they're drawn as", () => {
    for (const { name, half } of PARKED_CARS) {
      const spec = WORLD_CARS.find((car) => car.name === name);
      expect(spec?.shadowHalf, name).toEqual(half);
    }
  });

  it("turn their walls with their yaw as the material turns the car: a quarter turn lays its length east and west", () => {
    const walls = parkedWalls(Float32Array.of(10, 0, 20, Math.PI / 2));
    const xs = walls.filter((_, index) => index % 2 === 0);
    const zs = walls.filter((_, index) => index % 2 === 1);
    const [wide, long] = PARKED_CARS[parkedAt(10, 20).car].half;
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(long * 2, 4);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(wide * 2, 4);
  });
});

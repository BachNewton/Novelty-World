import { beforeAll, describe, expect, it } from "vitest";
import { CAR_LIMITS } from "./car-limits";
import { DEFAULT_CAR } from "./cars";
import { initPhysics } from "./drive";
import { measureCar } from "./measure-limits";
import { testPad } from "./test-pad";

/*
 * The tuning print catches a change to a car's numbers. This catches a change to
 * how every car drives (`car.ts`, the gearbox, the world's physics), which the
 * print can't see: the default car measured again comes out as the table has it,
 * to the last digit, since the simulation gives the same numbers every run.
 * Wet gravel is the ground that uses every part of a surface's grip, so it
 * catches a change to how a surface reshapes the tyres.
 */

beforeAll(initPhysics);

describe("the table of the cars' limits", () => {
  // One car through every manoeuvre: about 40,000 steps of the simulation.
  it("is what the simulation measures now: if not, run tools/car-limits.ts", { timeout: 60_000 }, () => {
    expect(measureCar(DEFAULT_CAR)).toEqual(CAR_LIMITS[DEFAULT_CAR].grounds["dry-asphalt"]);
  });

  it("is what the simulation measures now on wet gravel: if not, run tools/car-limits.ts", { timeout: 60_000 }, () => {
    expect(measureCar(DEFAULT_CAR, testPad("gravel"), "wet")).toEqual(CAR_LIMITS[DEFAULT_CAR].grounds["wet-gravel"]);
  });
});

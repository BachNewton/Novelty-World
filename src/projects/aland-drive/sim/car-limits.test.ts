import { describe, expect, it } from "vitest";
import { CAR_LIMITS, tuningPrint } from "./car-limits";
import { CAR_IDS, CARS } from "./cars";

describe("the table of the cars' limits", () => {
  it.each(CAR_IDS)("was measured with %s's tuning as it is now: if not, run tools/car-limits.ts", (id) => {
    expect(CAR_LIMITS[id].tuning).toBe(tuningPrint(CARS[id]));
  });

  it.each(CAR_IDS)("has %s's braking and pull on every ground: a plan reads both wherever its line runs", (id) => {
    for (const [ground, limits] of Object.entries(CAR_LIMITS[id].grounds)) {
      expect(limits.braking.length, ground).toBeGreaterThan(0);
      expect(limits.pull.length, ground).toBeGreaterThan(0);
    }
  });
});

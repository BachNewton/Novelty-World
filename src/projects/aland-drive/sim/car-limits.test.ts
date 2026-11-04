import { describe, expect, it } from "vitest";
import { CAR_LIMITS, tuningPrint } from "./car-limits";
import { CAR_IDS, CARS } from "./cars";

describe("the table of the cars' limits", () => {
  it.each(CAR_IDS)("was measured with %s's tuning as it is now: if not, run tools/car-limits.ts", (id) => {
    expect(CAR_LIMITS[id].tuning).toBe(tuningPrint(CARS[id]));
  });
});

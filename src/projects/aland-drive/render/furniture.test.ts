import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CAFE_TABLE_Z_M, POSES } from "../art/people/index";
import { BIKE_RACK_M } from "../art/street/index";
import { SEAT_POSES } from "./tile-models";

// A seated person and their seat come from one placement, so the pipeline's seats must be where the art's are.
describe("the furniture's seats", () => {
  const python = readFileSync(resolve(__dirname, "../pipeline/furniture.py"), "utf8");
  const number = (pattern: RegExp) => Number(pattern.exec(python)?.[1]);

  it("puts a café chair where the sitting pose expects its table", () => {
    expect(number(/^CAFE_CHAIR_Z = ([\d.]+)/m)).toBe(CAFE_TABLE_Z_M);
  });

  it("lays bike racks end to end at the art's length", () => {
    expect(number(/^BIKE_RACK_M = ([\d.]+)/m)).toBeCloseTo(BIKE_RACK_M, 6);
  });

  it("names poses the people kit has", () => {
    for (const pose of SEAT_POSES) expect(POSES).toContain(pose);
    expect(python).toContain(`"${SEAT_POSES[0]}"`);
    expect(python).toContain(`"${SEAT_POSES[1]}"`);
  });
});

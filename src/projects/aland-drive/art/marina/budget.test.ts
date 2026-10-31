import { describe, expect, it } from "vitest";
import type { RoadsideModel } from "../roadside/index";
import { catalogue } from "./catalogue";
import { MARINA_PARTS } from "./paint";
import { buildSpar, MARK_SPECS } from "./seamarks";

const triangles = (geometry: RoadsideModel["near"] | null) => (geometry?.index?.count ?? 0) / 3;

describe("marina budgets", () => {
  it.each(catalogue().map((entry) => [entry.name, entry] as const))("%s stays within its budget, with finite corners and known paints", (_, { limit, model }) => {
    expect(triangles(model.near)).toBeLessThan(limit);
    expect(triangles(model.far)).toBeLessThan(triangles(model.near));
    for (const geometry of [model.near, model.far]) {
      if (geometry === null) continue;
      expect(geometry.getAttribute("position").array.every(Number.isFinite)).toBe(true);
      const tints = geometry.getAttribute("tint").array;
      for (let index = 0; index < tints.length; index += 4) expect(tints[index]).toBeLessThan(MARINA_PARTS.length);
    }
  });
});

// A wrong mark is the one mistake a sailor sees at once, and these are easy to swap by hand.
describe("IALA region A", () => {
  it("bands follow the cones: black where their points point", () => {
    expect(MARK_SPECS.north).toMatchObject({ bands: ["mark-black", "mark-yellow"], topmark: "cones-up" });
    expect(MARK_SPECS.south).toMatchObject({ bands: ["mark-yellow", "mark-black"], topmark: "cones-down" });
    expect(MARK_SPECS.east).toMatchObject({ bands: ["mark-black", "mark-yellow", "mark-black"], topmark: "cones-base-to-base" });
    expect(MARK_SPECS.west).toMatchObject({ bands: ["mark-yellow", "mark-black", "mark-yellow"], topmark: "cones-point-to-point" });
  });

  it("is red to port with a can, green to starboard with a cone", () => {
    expect(MARK_SPECS.port).toMatchObject({ bands: ["mark-red"], topmark: "can", topmarkPaint: "mark-red" });
    expect(MARK_SPECS.starboard).toMatchObject({ bands: ["mark-green"], topmark: "cone", topmarkPaint: "mark-green" });
  });

  // East and west are the pair that's easy to get backwards: a diamond against a wineglass.
  it("draws east's cones base to base and west's point to point", () => {
    const widthAtMiddle = (mark: "east" | "west") => {
      const position = buildSpar(mark).near.getAttribute("position");
      const heights = Array.from({ length: position.count }, (_, index) => position.getY(index));
      const middle = (2.32 + Math.max(...heights)) / 2;
      return Math.max(...Array.from({ length: position.count }, (_, index) => (Math.abs(position.getY(index) - middle) < 0.02 ? Math.hypot(position.getX(index), position.getZ(index)) : 0)));
    };
    expect(widthAtMiddle("east")).toBeGreaterThan(0.2);
    expect(widthAtMiddle("west")).toBeLessThan(0.02);
  });
});

import { describe, expect, it } from "vitest";
import { CATALOGUE, FAR_LIMIT } from "./catalogue";
import { BOAT_PARTS, triangles } from "./mesh";

// The brief's budgets are the limit on what a harbour of these can cost, and a rig grows quietly.
describe("boat triangle budgets", () => {
  it.each(CATALOGUE.map((entry) => [entry.name, entry] as const))("%s stays within its budget", (_, { limit, model }) => {
    const { near, far } = model();
    expect(triangles(near)).toBeLessThan(limit);
    expect(triangles(far)).toBeLessThan(FAR_LIMIT);
  });
});

// A bad vertex or part shows only in the shader, as a boat that isn't there.
describe("boat vertices", () => {
  it.each(CATALOGUE.map((entry) => [entry.name, entry.model] as const))("%s has finite corners and known parts", (_, model) => {
    const { near, far } = model();
    for (const geometry of [near, far]) {
      if (geometry === null) continue;
      expect(geometry.getAttribute("position").array.every(Number.isFinite)).toBe(true);
      const tints = geometry.getAttribute("tint").array;
      for (let index = 0; index < tints.length; index += 4) expect(tints[index]).toBeLessThan(BOAT_PARTS.length);
    }
  });
});

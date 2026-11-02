import { describe, expect, it } from "vitest";
import type { RoadsideModel } from "../roadside/index";
import { catalogue } from "./catalogue";
import { GABLE_PAINTS } from "./buildings";
import { PAINT, PAINTED_FROM, PATTERNS, RURAL_PARTS } from "./mesh";

const triangles = (geometry: RoadsideModel["near"] | null) => (geometry?.index?.count ?? 0) / 3;

// The art direction's own limits: a thing placed by the hundred mustn't creep past them as it's worked on.
describe("rural triangle budgets", () => {
  it.each(catalogue().map((entry) => [entry.name, entry] as const))("%s stays within its budget", (_, { limit, farLimit, model }) => {
    expect(triangles(model.near)).toBeLessThan(limit);
    expect(triangles(model.far)).toBeLessThanOrEqual(farLimit);
    expect(model.far).not.toBeNull();
  });
});

// A place folds to nothing past its reach, so a vertex that isn't finite, or a part or paint the materials don't have, is the failure that shows only in the shader.
describe("rural vertices", () => {
  it.each(catalogue().map((entry) => [entry.name, entry.model] as const))("%s has finite corners and known parts", (_, model) => {
    for (const [geometry, patterns] of [[model.near, PATTERNS.length], [model.far, PAINTED_FROM + GABLE_PAINTS.length]] as const) {
      if (geometry === null) continue;
      expect(geometry.getAttribute("position").array.every(Number.isFinite)).toBe(true);
      const tints = geometry.getAttribute("tint").array;
      for (let index = 0; index < tints.length; index += 4) {
        expect(tints[index]).toBeLessThan(RURAL_PARTS.length);
        const pattern = tints[index + 2];
        expect(pattern < PATTERNS.length || (pattern >= PAINTED_FROM && pattern < patterns)).toBe(true);
      }
    }
    expect(Object.keys(PAINT)).toEqual(RURAL_PARTS);
  });
});

import { describe, expect, it } from "vitest";
import type { RoadsideModel } from "../roadside/models";
import { catalogue } from "./catalogue";
import { IDENTITY_PARTS } from "./mesh";

const triangles = (geometry: RoadsideModel["near"] | null) => (geometry?.index?.count ?? 0) / 3;

// A thing placed by the hundred mustn't creep past the art direction's limits as it's worked on, and a part outside the palette shows only in the shader.
describe("identity models", () => {
  it.each(catalogue().map((entry) => [entry.name, entry] as const))("%s stays in budget with known parts", (_, { limit, farLimit, model }) => {
    expect(triangles(model.near)).toBeLessThan(limit);
    expect(triangles(model.far)).toBeLessThanOrEqual(farLimit);
    for (const geometry of [model.near, model.far]) {
      if (geometry === null) continue;
      expect(geometry.getAttribute("position").array.every(Number.isFinite)).toBe(true);
      const tints = geometry.getAttribute("tint").array;
      for (let index = 0; index < tints.length; index += 4) expect(tints[index]).toBeLessThan(IDENTITY_PARTS.length);
    }
  });
});

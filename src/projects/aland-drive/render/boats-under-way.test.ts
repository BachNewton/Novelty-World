import { Box3 } from "three/webgpu";
import { describe, expect, it } from "vitest";
import { BOW_TURN, MODELS } from "./boats-under-way";

describe("the boats under way", () => {
  it("sail every model bow first: turned by its kit's turn, its length lies along the way it goes", () => {
    for (const [name, { kit, build }] of Object.entries(MODELS)) {
      const { min, max } = new Box3().setFromBufferAttribute(build().near.getAttribute("position") as never);
      const [alongX, alongZ] = [max.x - min.x, max.z - min.z];
      // A turn of a quarter swaps which of the model's axes points where it sails.
      const [ahead, across] = BOW_TURN[kit] === 0 ? [alongX, alongZ] : [alongZ, alongX];
      expect(ahead, name).toBeGreaterThan(across);
    }
  });
});

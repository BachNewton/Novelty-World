import { describe, expect, it } from "vitest";
import { sculptCat } from "./sculpt";

// Meshes both hair lengths once (about a second each): what the budget and
// the skinning rest on, which no faster test can see.
describe.each([false, true])("the cat's mesh, long hair %s", (longHair) => {
  const mesh = sculptCat({ longHair });

  it("stays within the phone's budget", () => {
    expect(mesh.triangles.length / 3).toBeLessThan(16000);
  });

  it("gives every vertex bones whose weights sum to one", () => {
    for (let v = 0; v < mesh.positions.length / 3; v++) {
      const sum = mesh.skinWeight[v * 4] + mesh.skinWeight[v * 4 + 1] + mesh.skinWeight[v * 4 + 2] + mesh.skinWeight[v * 4 + 3];
      expect(sum).toBeCloseTo(1, 4);
    }
  });

  it("stands on the ground in its bind pose's front paws", () => {
    let lowest = Infinity;
    for (let v = 0; v < mesh.positions.length / 3; v++) if (mesh.positions[v * 3 + 2] > 0.05) lowest = Math.min(lowest, mesh.positions[v * 3 + 1]);
    expect(Math.abs(lowest)).toBeLessThan(0.015);
  });
});

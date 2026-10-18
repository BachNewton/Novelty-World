import { describe, expect, it } from "vitest";
import { lowestAhead, triangleCount, worstWeightSum } from "../animals/mesh-checks";
import { sculptSquirrel } from "./sculpt";

// Meshes the red squirrel once: what its budget and skinning rest on, which no faster test can see.
describe.each([null])("the red squirrel's mesh %#", (kind) => {
  const mesh = sculptSquirrel();
  it("stays within the phone's budget", () => {
    expect(triangleCount(mesh)).toBeLessThan(22000);
  });
  it("gives every vertex bones whose weights sum to one", () => {
    expect(worstWeightSum(mesh)).toBeLessThan(1e-4);
  });
  it("stands on the ground on its front feet", () => {
    expect(Math.abs(lowestAhead(mesh, 0.03))).toBeLessThan(0.006);
  });
});

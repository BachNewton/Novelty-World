import { describe, expect, it } from "vitest";
import { lowestAhead, triangleCount, worstWeightSum } from "../animals/mesh-checks";
import { sculptHedgehog } from "./sculpt";

// Meshes the hedgehog once (its spines' cones make it the slowest of the small animals): its budget and skinning.
describe("the hedgehog's mesh", () => {
  const mesh = sculptHedgehog();
  it("stays within the phone's budget", () => {
    expect(triangleCount(mesh)).toBeLessThan(22000);
  });
  it("gives every vertex bones whose weights sum to one", () => {
    expect(worstWeightSum(mesh)).toBeLessThan(1e-4);
  });
  it("stands on the ground on its front paws", () => {
    expect(Math.abs(lowestAhead(mesh, 0.02))).toBeLessThan(0.006);
  });
  it("bristles: its mantle stands out further than the smooth dome it is raised from", () => {
    let top = 0;
    for (let v = 0; v < mesh.positions.length / 3; v++) top = Math.max(top, mesh.positions[v * 3 + 1]);
    expect(top).toBeGreaterThan(0.066 + 0.056 + 0.003);
  });
});

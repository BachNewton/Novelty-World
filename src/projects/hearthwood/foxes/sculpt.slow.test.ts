import { describe, expect, it } from "vitest";
import { lowestAhead, triangleCount, worstWeightSum } from "../animals/mesh-checks";
import { sculptFox } from "./sculpt";

// Meshes the fox once (about half a second): what its budget, skinning and tongue rest on, which no faster test can see.
describe("the fox's mesh", () => {
  const mesh = sculptFox();
  it("stays within the phone's budget", () => {
    expect(triangleCount(mesh)).toBeLessThan(22000);
  });
  it("gives every vertex bones whose weights sum to one", () => {
    expect(worstWeightSum(mesh)).toBeLessThan(1e-4);
  });
  it("stands on the ground on its front paws", () => {
    expect(Math.abs(lowestAhead(mesh, 0.05))).toBeLessThan(0.015);
  });
  it("has a tongue of its own for the shader to colour", () => {
    expect(mesh.part.filter((p) => p === 2).length).toBeGreaterThan(10);
  });
});

import { describe, expect, it } from "vitest";
import { sculptDog } from "./sculpt";

// Meshes every kind of ear and coat once (half a second each): what the budget, the skinning and the
// tongue rest on, which no faster test can see.
const KINDS = (["prick", "fold", "drop"] as const).flatMap((ears) => (["short", "medium", "long"] as const).map((coat) => ({ ears, coat })));

describe.each(KINDS)("the dog's mesh, $ears ears and $coat coat", (kind) => {
  const mesh = sculptDog(kind);
  const count = mesh.positions.length / 3;

  it("stays within the phone's budget", () => {
    expect(mesh.triangles.length / 3).toBeLessThan(20000);
  });

  it("gives every vertex bones whose weights sum to one", () => {
    for (let v = 0; v < count; v++) {
      const sum = mesh.skinWeight[v * 4] + mesh.skinWeight[v * 4 + 1] + mesh.skinWeight[v * 4 + 2] + mesh.skinWeight[v * 4 + 3];
      expect(sum).toBeCloseTo(1, 4);
    }
  });

  it("stands on the ground in its bind pose's front paws", () => {
    let lowest = Infinity;
    for (let v = 0; v < count; v++) if (mesh.positions[v * 3 + 2] > 0.05) lowest = Math.min(lowest, mesh.positions[v * 3 + 1]);
    expect(Math.abs(lowest)).toBeLessThan(0.015);
  });

  it("has a tongue of its own for the shader to colour", () => {
    expect(mesh.part.filter((p) => p === 2).length).toBeGreaterThan(20);
  });
});

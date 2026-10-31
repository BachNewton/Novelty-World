import { describe, expect, it } from "vitest";
import { buildFountain, buildHedge } from "./models";

const triangles = (geometry: { index: { count: number } | null } | null) => (geometry?.index?.count ?? 0) / 3;

// A hedge is laid by the metre along every barrier=hedge in town, so its budget mustn't creep as it's worked on.
describe("town ground triangle budgets", () => {
  it("keeps a hedge cheap enough to lay by the hundred", () => {
    const hedge = buildHedge();
    expect(triangles(hedge.near)).toBeLessThanOrEqual(36);
    expect(triangles(hedge.far)).toBeLessThanOrEqual(8);
  });

  it("keeps a fountain's far version a fraction of its near one", () => {
    const fountain = buildFountain();
    expect(triangles(fountain.near)).toBeLessThanOrEqual(300);
    expect(triangles(fountain.far)).toBeLessThanOrEqual(80);
  });
});

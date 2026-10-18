import { describe, expect, it } from "vitest";
import { PLANT_CHUNK } from "./life";
import { createWorld } from "./world";

const world = createWorld("first-valley");

describe("the plants", () => {
  it("carry how far the bands sit where each grows, so the seasons' snow line follows the land's shift of them", () => {
    // On the flank of a fell, whose bands sit far below their usual altitudes.
    const chunkX = Math.floor(-7400 / PLANT_CHUNK);
    const chunkZ = Math.floor(-2600 / PLANT_CHUNK);
    const plants = [-1, 0, 1].flatMap((dz) => [-1, 0, 1].flatMap((dx) => world.plantsIn(chunkX + dx, chunkZ + dz).plants));
    expect(plants.length).toBeGreaterThan(20);
    for (const p of plants) expect(p.bands).toBe(world.sampleAt(p.x, p.z).bands);
    expect(Math.max(...plants.map((p) => p.bands))).toBeLessThan(-300);
  });
});

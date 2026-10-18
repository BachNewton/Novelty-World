import { describe, expect, it } from "vitest";
import { PLANT_CHUNK } from "./life";
import { TREE_KINDS, type PlantKind } from "./regions";
import { campStick, sticksInChunk, sticksNear } from "./sticks";
import { createWorld } from "./world";

const world = createWorld("first-valley");
const campChunk = { cx: Math.floor(world.home.x / PLANT_CHUNK), cz: Math.floor(world.home.z / PLANT_CHUNK) };
const chunks: { cx: number; cz: number }[] = [];
for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) chunks.push({ cx: campChunk.cx + dx, cz: campChunk.cz + dz });
const fire = { x: world.home.x, z: world.home.z, turn: 0 };
const all = chunks.flatMap(({ cx, cz }) => sticksInChunk(world, cx, cz));

describe("sticks by area", () => {
  it("are the same every time a chunk is asked for", () => {
    expect(sticksInChunk(world, campChunk.cx + 1, campChunk.cz)).toEqual(sticksInChunk(createWorld("first-valley"), campChunk.cx + 1, campChunk.cz));
  });

  it("lie about the woods, a few to a wooded chunk, each near a tree", () => {
    expect(all.length).toBeGreaterThan(chunks.length * 0.5);
    const trees = chunks.flatMap(({ cx, cz }) => world.plantsIn(cx, cz).plants.filter((p) => (TREE_KINDS as readonly PlantKind[]).includes(p.kind)));
    for (const stick of all) expect(trees.some((t) => Math.hypot(t.x - stick.x, t.z - stick.z) < 3.4)).toBe(true);
  });

  it("lie on dry ground, at its height", () => {
    for (const stick of all) {
      expect(world.heightAt(stick.x, stick.z)).toBeGreaterThan(world.waterAt(stick.x, stick.z));
      expect(stick.y).toBeCloseTo(world.heightAt(stick.x, stick.z));
    }
  });

  it("always include one by camp's fire, a few steps from it on dry ground", () => {
    const camp = campStick(world, fire);
    const d = Math.hypot(camp.x - world.home.x, camp.z - world.home.z);
    expect(d).toBeGreaterThan(2.8);
    expect(d).toBeLessThan(4);
    expect(world.heightAt(camp.x, camp.z)).toBeGreaterThan(world.waterAt(camp.x, camp.z));
    expect(sticksNear(world, world.home.x, world.home.z, 6, fire).map((s) => s.id)).toContain("camp");
  });

  it("keep camp's stick by its fire wherever it is pitched, and leave it out while camp is carried", () => {
    const pitched = { x: world.home.x + 300, z: world.home.z - 200, turn: 1.3 };
    const stick = campStick(world, pitched);
    const d = Math.hypot(stick.x - pitched.x, stick.z - pitched.z);
    expect(d).toBeGreaterThan(2.8);
    expect(d).toBeLessThan(4);
    expect(sticksNear(world, pitched.x, pitched.z, 6, pitched).map((s) => s.id)).toContain("camp");
    expect(sticksNear(world, world.home.x, world.home.z, 6, null).map((s) => s.id)).not.toContain("camp");
  });
});

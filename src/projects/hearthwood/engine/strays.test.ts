import { describe, expect, it } from "vitest";
import { canStand } from "../gameplay/walking";
import { STRAY_CELL, straysInCell, straysNear, type Stray } from "./strays";
import { createWorld } from "./world";

const world = createWorld("first-valley");

/** A block of cells round camp: enough for the strays' frequencies to show. */
const cells: { cx: number; cz: number; strays: Stray[] }[] = [];
const campCell = { cx: Math.floor(world.camp.x / STRAY_CELL), cz: Math.floor(world.camp.z / STRAY_CELL) };
for (let dz = -6; dz <= 6; dz++) {
  for (let dx = -6; dx <= 6; dx++) {
    const cx = campCell.cx + dx;
    const cz = campCell.cz + dz;
    cells.push({ cx, cz, strays: straysInCell(world, cx, cz) });
  }
}
const all = cells.flatMap((c) => c.strays);

describe("strays by area", () => {
  it("are the same every time a cell is asked for", () => {
    expect(straysInCell(world, 3, -2)).toEqual(straysInCell(createWorld("first-valley"), 3, -2));
  });

  it("are frequent but each special: about one for every cell or two", () => {
    const perCell = all.length / cells.length;
    expect(perCell).toBeGreaterThan(0.35);
    expect(perCell).toBeLessThan(1.3);
    expect(all.some((s) => s.species === "cat")).toBe(true);
    expect(all.some((s) => s.species === "dog")).toBe(true);
  });

  it("live in their own cell, on ground an animal can stand on, above the water", () => {
    for (const { cx, cz, strays } of cells) {
      for (const stray of strays) {
        expect(Math.floor(stray.home.x / STRAY_CELL)).toBe(cx);
        expect(Math.floor(stray.home.z / STRAY_CELL)).toBe(cz);
        expect(canStand(world, stray.home.x, stray.home.z)).toBe(true);
        const ground = world.sampleAt(stray.home.x, stray.home.z);
        expect(ground.height).toBeGreaterThan(ground.water);
      }
    }
  });

  it("keep a cat near camp, so the first walk out meets one", () => {
    const near = straysInCell(world, campCell.cx, campCell.cz).filter((s) => s.species === "cat" && Math.hypot(s.home.x - world.camp.x, s.home.z - world.camp.z) < 50);
    expect(near.length).toBeGreaterThan(0);
  });

  it("gather by the places people keep: cats are commoner in a cell with a shrine, seter or stone circle", () => {
    const kept = new Set(["seter", "shrine", "stone-circle"]);
    const share = (pick: (c: (typeof cells)[number]) => boolean) => {
      const chosen = cells.filter(pick);
      return chosen.filter((c) => c.strays.some((s) => s.species === "cat")).length / Math.max(1, chosen.length);
    };
    const byPlace = (c: (typeof cells)[number]) => kept.has(world.placeIn(c.cx, c.cz)?.kind ?? "");
    expect(cells.filter(byPlace).length).toBeGreaterThanOrEqual(4);
    expect(share(byPlace)).toBeGreaterThan(share((c) => !byPlace(c)));
  });

  it("hold a fox or a hedgehog now and then, rarer than the cats and dogs, and hedgehogs by the places people keep", () => {
    const count = (species: string) => all.filter((s) => s.species === species).length;
    expect(count("fox")).toBeGreaterThan(2);
    expect(count("hedgehog")).toBeGreaterThan(2);
    expect(count("fox") + count("hedgehog")).toBeLessThan(count("cat"));
    const kept = new Set(["seter", "shrine", "stone-circle", "fairy-ring", "fallen-tree"]);
    const share = (pick: (c: (typeof cells)[number]) => boolean) => {
      const chosen = cells.filter(pick);
      return chosen.filter((c) => c.strays.some((s) => s.species === "hedgehog")).length / Math.max(1, chosen.length);
    };
    const byPlace = (c: (typeof cells)[number]) => kept.has(world.placeIn(c.cx, c.cz)?.kind ?? "");
    expect(share(byPlace)).toBeGreaterThan(share((c) => !byPlace(c)));
  });

  it("each has an id and seed of its own", () => {
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length);
    expect(new Set(all.map((s) => s.seed)).size).toBe(all.length);
  });

  it("near a point are those whose homes lie within the radius", () => {
    const { x, z } = world.camp;
    const near = straysNear(world, x, z, 300);
    for (const stray of near) expect(Math.hypot(stray.home.x - x, stray.home.z - z)).toBeLessThanOrEqual(300);
    const ids = new Set(near.map((s) => s.id));
    for (const stray of all) if (Math.hypot(stray.home.x - x, stray.home.z - z) < 300) expect(ids.has(stray.id)).toBe(true);
  });
});

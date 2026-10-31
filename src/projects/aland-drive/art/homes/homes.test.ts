import { describe, expect, it } from "vitest";
import { carSizes, HOMES, trianglesOf } from "./index";
import { INTERIOR_PARTS } from "./paint";

const EXTERIOR_LIMIT = 2500;
const INTERIOR_LIMIT = 15000;

// The owner's budgets, and the promises a home makes in its exported data: cheap to break by moving a wall or a sofa.
describe.each(HOMES.map((home) => [home.id, home] as const))("%s", (_, home) => {
  const rooms = home.interior();

  it("keeps to its budgets", () => {
    const model = home.exterior();
    expect(trianglesOf(model)).toBeLessThan(EXTERIOR_LIMIT);
    expect(model.far).not.toBeNull();
    expect(rooms.reduce((sum, { triangles }) => sum + triangles, 0)).toBeLessThan(INTERIOR_LIMIT);
  });

  it.each(rooms.map((room) => [room.id, room] as const))("%s has cameras inside it and known parts", (_id, { cameras, size, geometry }) => {
    expect(cameras.length).toBeGreaterThanOrEqual(2);
    for (const { position: [x, y, z] } of cameras) {
      expect(Math.abs(x)).toBeLessThan(size.wide / 2);
      expect(Math.abs(z)).toBeLessThan(size.deep / 2);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(size.tall);
    }
    expect(geometry.getAttribute("light").array.every(Number.isFinite)).toBe(true);
    const tints = geometry.getAttribute("tint").array;
    for (let index = 0; index < tints.length; index += 4) expect(tints[index]).toBeLessThan(INTERIOR_PARTS.length);
  });

  it("parks the game's biggest cars without touching", () => {
    const garage = rooms.find(({ id }) => id === "garage");
    const fit = garage?.fit;
    expect(fit?.cars).toBeGreaterThan(0);
    const widest = Math.max(...carSizes().map(({ widthM }) => widthM));
    fit?.slots.forEach((slot, index) => {
      if (index > 0) expect(slot.x - fit.slots[index - 1].x).toBeGreaterThan(widest + 0.5);
      expect(Math.abs(slot.x) + widest / 2).toBeLessThan((garage?.size.wide ?? 0) / 2);
    });
  });
});

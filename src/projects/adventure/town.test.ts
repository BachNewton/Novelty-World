import { describe, expect, it } from "vitest";
import { BUILDINGS, TREES } from "./town";

/** The cells the player can walk on: the grid is 40 units wide, centred on the origin. */
const WALKABLE = { min: -19, max: 18 };

const cell = (p: { x: number; z: number }): string => `${Math.floor(p.x + 0.5)},${Math.floor(p.z + 0.5)}`;

describe("the town", () => {
  it("stands wholly on the walkable grid", () => {
    for (const p of [...TREES, ...BUILDINGS]) {
      expect(Math.min(p.x, p.z), p.piece).toBeGreaterThanOrEqual(WALKABLE.min);
      expect(Math.max(p.x, p.z), p.piece).toBeLessThanOrEqual(WALKABLE.max);
    }
  });

  it("keeps every tree clear of the village", () => {
    const taken = new Set(BUILDINGS.map(cell));
    expect(TREES.filter((tree) => taken.has(cell(tree)))).toEqual([]);
  });
});

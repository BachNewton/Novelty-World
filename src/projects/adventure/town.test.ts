import { describe, expect, it } from "vitest";
import { GROUND, pathCells } from "./ground";
import { BUILDINGS, PATHS, TREES } from "./town";

/** The cells the player can walk on: all the ground's but its outermost ring. */
const WALKABLE = { min: GROUND.min + 1, max: GROUND.max - 1 };

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

  it("runs no path under a gate: the path is wider than a gate's opening, and sunk below its feet", () => {
    const path = new Set(PATHS.flatMap(pathCells).map(([x, z]) => `${x},${z}`));
    expect(BUILDINGS.filter((p) => p.piece.endsWith("gate") && path.has(cell(p)))).toEqual([]);
  });
});

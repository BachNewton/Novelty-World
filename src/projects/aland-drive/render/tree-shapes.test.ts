import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { grownCrown, shapeRows } from "./tree-shapes";

describe("tree shapes", () => {
  it("climbs ring by ring and ends in a tip, or a tree folds through itself", () => {
    for (const rings of shapeRows()) {
      expect(rings[0][0]).toBe(0);
      expect(rings.at(-1)).toEqual([1, 0]);
      for (let ring = 1; ring < rings.length; ring++) expect(rings[ring][0]).toBeGreaterThan(rings[ring - 1][0]);
    }
  });

  it("is what the stands plan their cover from", () => {
    const python = readFileSync(resolve(__dirname, "../pipeline/stands.py"), "utf8");
    const planned = /CROWN_SHARE = np\.array\(\[(.+)\]\)/.exec(python)?.[1].split(",").map(Number);
    const otherBroadleaf = Math.sqrt((grownCrown("round") ** 2 + grownCrown("upright") ** 2) / 2);
    expect(planned).toEqual([grownCrown("pine"), grownCrown("spruce"), grownCrown("birch"), Number(otherBroadleaf.toFixed(2))]);
  });
});

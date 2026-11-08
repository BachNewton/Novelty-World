import { describe, expect, it } from "vitest";
import { sectoredCells, sectorRange } from "./clipmap";

/*
 * A ring draws one stretch of its sectored index buffer each frame, so the layout and the stretch chosen have to agree:
 * a cell left out or counted twice shows as a hole or a fight in the terrain only from some headings, which no still
 * shot catches.
 */

const CELLS = 192;

describe("a ring's cells by sector", () => {
  const hole = (column: number, row: number) => !(column >= 48 && column < 144 && row >= 48 && row < 144);
  const ring = sectoredCells(hole);

  it("holds every kept cell's triangles once, then all of them again", () => {
    const kept = CELLS * CELLS - 96 * 96;
    expect(ring.starts[0]).toBe(0);
    expect(ring.starts[ring.starts.length - 1]).toBe(kept * 6);
    expect(ring.indices.length).toBe(kept * 12);
    const once = ring.indices.subarray(0, kept * 6);
    expect(ring.indices.subarray(kept * 6)).toEqual(once);
    // Each cell's north-west corner is its first index, and no two cells share one.
    const corners = new Set<number>();
    for (let at = 0; at < once.length; at += 6) corners.add(once[at]);
    expect(corners.size).toBe(kept);
    for (const corner of corners) expect(hole(corner % (CELLS + 1), Math.floor(corner / (CELLS + 1)))).toBe(true);
  });

  it("gives each sector an outline that holds all its cells", () => {
    expect(ring.hulls).toHaveLength(8);
    ring.starts.slice(0, -1).forEach((start, sector) => {
      const hull = ring.hulls[sector];
      expect(hull.length).toBeGreaterThanOrEqual(3);
      const inside = (x: number, z: number) => hull.every((corner, at) => {
        const next = hull[(at + 1) % hull.length];
        return (next[0] - corner[0]) * (z - corner[1]) - (next[1] - corner[1]) * (x - corner[0]) >= -1e-9;
      });
      for (let at = start; at < ring.starts[sector + 1]; at += 6) {
        const corner = ring.indices[at];
        const [column, row] = [corner % (CELLS + 1), Math.floor(corner / (CELLS + 1))];
        for (const [x, z] of [[column, row], [column + 1, row], [column, row + 1], [column + 1, row + 1]]) expect(inside(x, z)).toBe(true);
      }
    });
  });
});

describe("the stretch of sectors drawn", () => {
  const range = (seen: string) => sectorRange([...seen].map((flag) => flag === "1"), { first: 0, count: 0 });

  it("is every sector when all are seen, and none when none is", () => {
    expect(range("11111111")).toEqual({ first: 0, count: 8 });
    expect(range("00000000")).toEqual({ first: 0, count: 0 });
  });

  it("is the shortest run round the ring that holds every sector seen", () => {
    expect(range("01110000")).toEqual({ first: 1, count: 3 });
    expect(range("11000001")).toEqual({ first: 7, count: 3 });
    expect(range("10000001")).toEqual({ first: 7, count: 2 });
    expect(range("01010000")).toEqual({ first: 1, count: 3 });
    expect(range("00000010")).toEqual({ first: 6, count: 1 });
  });
});

import { describe, expect, it } from "vitest";
import { building, type Building } from "./buildings";
import type { Placement } from "./town";

/** Which way each turn puts a +x wall: its outward direction on the ground. */
const OUTWARD = [
  [1, 0],
  [0, -1],
  [-1, 0],
  [0, 1],
] as const;

/** The edge a wall stands on, as the point midway along it. */
function edge(p: Placement): string {
  const [dx, dz] = OUTWARD[p.turn ?? 0];
  return `${p.x + 0.5 + dx / 2},${p.z + 0.5 + dz / 2}`;
}

const isWall = (p: Placement): boolean => (p.y ?? 0) === 0 && p.piece.startsWith("wall") && !/corner/.test(p.piece);

/** Every outer edge of a footprint, from its −x, −z corner cell. */
function perimeter(x: number, z: number, across: number, deep: number): string[] {
  const edges: string[] = [];
  for (let i = 0; i < across; i++) edges.push(`${x + i + 0.5},${z}`, `${x + i + 0.5},${z + deep}`);
  for (let i = 0; i < deep; i++) edges.push(`${x},${z + i + 0.5}`, `${x + across},${z + i + 0.5}`);
  return edges;
}

const COTTAGE: Building = { x: 3, z: -2, width: 2, depth: 3, walls: { front: ["door", "window-shutters"] } };

describe("building", () => {
  it.each([0, 1, 2, 3])("walls every outer edge exactly once, facing %i", (facing) => {
    for (const [width, depth] of [[2, 3], [3, 1], [4, 2]] as const) {
      const walls = building({ x: 3, z: -2, width, depth, facing, roof: "none" }).filter(isWall).map(edge);
      // Turned a quarter, the footprint lies the other way across the grid.
      const [across, deep] = facing % 2 === 0 ? [width, depth] : [depth, width];
      expect(walls.sort()).toEqual(perimeter(3, -2, across, deep).sort());
    }
  });

  it.each([
    [0, [0, 1]],
    [1, [1, 0]],
    [2, [0, -1]],
    [3, [-1, 0]],
  ] as const)("puts the door on the side it faces, facing %i", (facing, way) => {
    const door = building({ ...COTTAGE, facing }).find((p) => p.piece === "wall-door");
    expect(door && OUTWARD[door.turn ?? 0]).toEqual(way);
  });

  it("reads each side's walls from the left, as seen from outside", () => {
    // Facing +z, the front's left as seen from outside is −x.
    const front = building({ ...COTTAGE, roof: "none" }).filter((p) => p.turn === 3 && isWall(p));
    expect(front.sort((a, b) => a.x - b.x).map((p) => p.piece)).toEqual(["wall-door", "wall-window-shutters"]);
  });

  it.each([0, 1, 2, 3])("puts each gable's boards on the roof's outer ends, facing %i", (facing) => {
    const placed = building({ ...COTTAGE, depth: 4, facing });
    const footprint = new Set(placed.filter((p) => (p.y ?? 0) === 0).map((p) => `${p.x},${p.z}`));
    const ends = placed.filter((p) => p.piece === "roof-high-left" || p.piece === "roof-high-right");
    expect(ends).toHaveLength(4);
    for (const end of ends) {
      // A `-left` piece's board is at its −z end, a `-right`'s at its +z: turned with the piece, it must look out of the building.
      const [dx, dz] = OUTWARD[((end.turn ?? 0) + (end.piece === "roof-high-left" ? 1 : 3)) % 4];
      expect(footprint.has(`${end.x + dx},${end.z + dz}`)).toBe(false);
    }
  });
});

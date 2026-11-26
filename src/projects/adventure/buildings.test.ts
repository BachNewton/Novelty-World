import { describe, expect, it } from "vitest";
import { building, type Building } from "./buildings";
import type { Placement } from "./town";

/** Which way a piece's own +x points on the grid at each turn. */
const PLUS_X = [
  [1, 0],
  [0, -1],
  [-1, 0],
  [0, 1],
] as const;

/** Which way a piece's own −z points on the grid at each turn. */
const MINUS_Z = [
  [0, -1],
  [-1, 0],
  [0, 1],
  [1, 0],
] as const;

const turnOf = (p: Placement): number => p.turn ?? 0;
const round = (v: number): number => Math.round(v * 1000) / 1000;

/** A wall's outside face, which lies along its piece's +x edge a tenth in, as the point midway along it. */
function face(p: Placement): string {
  const [dx, dz] = PLUS_X[turnOf(p)];
  return `${round(p.x + 0.5 + 0.4 * dx)},${round(p.z + 0.5 + 0.4 * dz)}`;
}

/** Which way a wall's outside looks: its piece's −x. */
function looks(p: Placement): readonly [number, number] {
  const [dx, dz] = PLUS_X[turnOf(p)];
  return [-dx || 0, -dz || 0];
}

const isWall = (p: Placement): boolean => p.piece.startsWith("wall") && !/corner/.test(p.piece);
const on = (y: number) => (p: Placement): boolean => (p.y ?? 0) === y;

/** Every outer edge of a footprint, from its −x, −z corner cell. */
function perimeter(x: number, z: number, across: number, deep: number): string[] {
  const edges: string[] = [];
  for (let i = 0; i < across; i++) edges.push(`${x + i + 0.5},${z}`, `${x + i + 0.5},${z + deep}`);
  for (let i = 0; i < deep; i++) edges.push(`${x},${z + i + 0.5}`, `${x + across},${z + i + 0.5}`);
  return edges;
}

/** The cells a building's roof covers, which are its footprint. */
function footprint(placed: readonly Placement[]): Set<string> {
  const top = Math.max(...placed.map((p) => p.y ?? 0));
  return new Set(placed.filter((p) => (p.y ?? 0) === top && p.piece.startsWith("roof")).map((p) => `${p.x},${p.z}`));
}

const COTTAGE: Building = { x: 3, z: -2, width: 2, depth: 3, storeys: [{ walls: { front: ["door", "window-shutters"] } }] };

describe("building", () => {
  it.each([0, 1, 2, 3])("walls every outer edge exactly once on each storey, outside flush with the edge, facing %i", (facing) => {
    for (const [width, depth] of [[2, 3], [3, 1], [4, 2]] as const) {
      const placed = building({ x: 3, z: -2, width, depth, facing, storeys: [{}, { material: "wood" }], roof: "none" });
      // Turned a quarter, the footprint lies the other way across the grid.
      const [across, deep] = facing % 2 === 0 ? [width, depth] : [depth, width];
      for (const y of [0, 1]) {
        expect(placed.filter(on(y)).filter(isWall).map(face).sort()).toEqual(perimeter(3, -2, across, deep).sort());
      }
    }
  });

  it.each([0, 1, 2, 3])("turns every wall's outside out of the building, facing %i", (facing) => {
    const placed = building({ ...COTTAGE, facing, roof: "none" });
    const [cx, cz] = facing % 2 === 0 ? [3 + 1, -2 + 1.5] : [3 + 1.5, -2 + 1];
    for (const wall of placed.filter(isWall)) {
      const [x, z] = face(wall).split(",").map(Number);
      const [lx, lz] = looks(wall);
      // From the footprint's middle to the wall, and on the way it looks.
      expect((x - cx) * lx + (z - cz) * lz).toBeGreaterThan(0);
    }
  });

  it.each([
    [0, [0, 1]],
    [1, [1, 0]],
    [2, [0, -1]],
    [3, [-1, 0]],
  ] as const)("puts the door on the side it faces, facing %i", (facing, way) => {
    const door = building({ ...COTTAGE, facing }).find((p) => p.piece === "wall-door");
    expect(door && looks(door)).toEqual(way);
  });

  it("reads each side's walls from the left, as seen from outside", () => {
    // Facing +z, the front's left as seen from outside is −x.
    const front = building({ ...COTTAGE, roof: "none" }).filter((p) => isWall(p) && looks(p)[1] === 1);
    expect(front.sort((a, b) => a.x - b.x).map((p) => p.piece)).toEqual(["wall-door", "wall-window-shutters"]);
  });

  it("stands each storey on the one below, and the roof on the top one", () => {
    const placed = building({ ...COTTAGE, storeys: [{}, { material: "wood" }, {}] });
    expect(placed.filter((p) => p.piece === "wall-wood").every(on(1))).toBe(true);
    expect(placed.filter((p) => p.piece.startsWith("roof")).every(on(3))).toBe(true);
  });

  it.each([0, 1, 2, 3])("puts each gable's boards on the roof's outer ends, facing %i", (facing) => {
    for (const pitch of ["high", "low"] as const) {
      const placed = building({ ...COTTAGE, depth: 4, facing, roof: { shape: "gable", pitch } });
      const cells = footprint(placed);
      const ends = placed.filter((p) => /^roof(-high)?-(left|right)$/.test(p.piece));
      expect(ends).toHaveLength(4);
      for (const end of ends) {
        // A `-left` piece's board is at its −z end, a `-right`'s at its +z: turned with the piece, it must look out of the building.
        const [dx, dz] = MINUS_Z[(turnOf(end) + (end.piece.endsWith("-left") ? 0 : 2)) % 4];
        expect(cells.has(`${end.x + dx},${end.z + dz}`)).toBe(false);
      }
    }
  });

  it.each([0, 1, 2, 3])("rises every hipped roof's corner to the middle, facing %i", (facing) => {
    for (const depth of [2, 3]) {
      const placed = building({ ...COTTAGE, depth, facing, roof: { shape: "hip" } });
      const cells = footprint(placed);
      const corners = placed.filter((p) => p.piece === "roof-high-corner");
      expect(corners).toHaveLength(4);
      for (const corner of corners) {
        // A corner rises to its own +x, −z corner: both ways from there lie inside the roof.
        const [ax, az] = PLUS_X[turnOf(corner)];
        const [bx, bz] = MINUS_Z[turnOf(corner)];
        expect(cells.has(`${corner.x + ax},${corner.z + az}`)).toBe(true);
        expect(cells.has(`${corner.x + bx},${corner.z + bz}`)).toBe(true);
      }
    }
  });

  it.each([0, 1, 2, 3])("runs a one-cell gable's ridge front to back, facing %i", (facing) => {
    const placed = building({ x: 0, z: 0, width: 1, depth: 3, facing, roof: { shape: "gable" } });
    const door = building({ x: 0, z: 0, width: 1, depth: 3, facing, storeys: [{ walls: { front: ["door"] } }] }).find((p) => p.piece === "wall-door");
    // The whole-gable piece's ridge lies along its own x, so it must point the way the door looks, or straight back.
    for (const gable of placed.filter((p) => p.piece === "roof-high-gable")) {
      const [rx, rz] = PLUS_X[turnOf(gable)];
      const [lx, lz] = door ? looks(door) : [0, 0];
      expect(Math.abs(rx * lx + rz * lz)).toBe(1);
    }
  });

  it.each([0, 1, 2, 3])("climbs a balcony's stairs toward it, from the end asked for, facing %i", (facing) => {
    for (const end of ["left", "right"] as const) {
      const placed = building({ ...COTTAGE, facing, storeys: [{}, {}], balcony: { side: "front", storey: 1, stairs: end } });
      const floor = new Set(placed.filter((p) => p.piece === "planks").map((p) => `${p.x},${p.z}`));
      const stairs = placed.filter((p) => p.piece === "stairs-wood");
      expect(stairs).toHaveLength(1);
      // Stairs rise to their own +x: their top step must land on the balcony's floor.
      const [dx, dz] = PLUS_X[turnOf(stairs[0])];
      expect(floor.has(`${stairs[0].x + dx},${stairs[0].z + dz}`)).toBe(true);
      // Facing +z, the front's left end as seen from outside is −x: turned with the building, the stairs are on that end.
      const [lx, lz] = PLUS_X[(2 + facing) % 4];
      const along = (p: Placement): number => p.x * lx + p.z * lz;
      const farthest = Math.max(...[...floor].map((cell) => along({ piece: "planks", x: Number(cell.split(",")[0]), z: Number(cell.split(",")[1]) })));
      expect(along(stairs[0]) > farthest).toBe(end === "left");
    }
  });
});

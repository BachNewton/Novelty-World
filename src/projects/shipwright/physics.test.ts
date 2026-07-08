import { describe, expect, it } from "vitest";
import { findTrappedAirCells } from "./physics";

// The flood-fill classifier is the heart of the air-cavity buoyancy overhaul (docs/buoyancy.md):
// a mis-classification floats a hull wrong. It models the sea spreading sideways and rising UP
// (into a bottom breach) but never falling DOWN over a rim — so an intact open-top hull traps the
// air below its gunwale, while side/bottom breaches flood. These lock down those cases.

const key = ([x, y, z]: [number, number, number]) => `${x},${y},${z}`;
const asSet = (cells: [number, number, number][]) => new Set(cells.map(key));

describe("findTrappedAirCells", () => {
  it("finds no trapped air in a solid block (nothing empty)", () => {
    const cells: [number, number, number][] = [];
    for (let x = 0; x < 3; x++)
      for (let y = 0; y < 3; y++)
        for (let z = 0; z < 3; z++) cells.push([x, y, z]);
    expect(findTrappedAirCells(cells)).toEqual([]);
  });

  it("finds the enclosed cavity of a fully sealed hollow box", () => {
    // 3x3x3 shell with the single centre cell empty and walled in on all six sides.
    const cells: [number, number, number][] = [];
    for (let x = 0; x < 3; x++)
      for (let y = 0; y < 3; y++)
        for (let z = 0; z < 3; z++)
          if (!(x === 1 && y === 1 && z === 1)) cells.push([x, y, z]);
    expect(findTrappedAirCells(cells)).toEqual([[1, 1, 1]]);
  });

  it("traps an open-topped hull's interior (a boat floats on the air below its gunwale)", () => {
    // A box open at the top (the whole y=2 face left off) around an empty centre. Water can't fall
    // down over the rim, so the walled-in interior (1,1,1) is trapped air — even with no lid. The
    // rim layer (y=2) is open air above the walls, connected sideways to the sea, so it's not air.
    const cells: [number, number, number][] = [];
    for (let x = 0; x < 3; x++)
      for (let y = 0; y < 3; y++)
        for (let z = 0; z < 3; z++) {
          const isTopFace = y === 2;
          const isInterior = x === 1 && y === 1 && z === 1;
          if (!isTopFace && !isInterior) cells.push([x, y, z]);
        }
    expect(findTrappedAirCells(cells)).toEqual([[1, 1, 1]]);
  });

  it("floods a hull with a hole in the SIDE (sea reaches in sideways)", () => {
    // Sealed box minus one side-wall cell: the interior has a sideways path to the open sea.
    const cells: [number, number, number][] = [];
    for (let x = 0; x < 3; x++)
      for (let y = 0; y < 3; y++)
        for (let z = 0; z < 3; z++) {
          const isInterior = x === 1 && y === 1 && z === 1;
          const isSideGap = x === 0 && y === 1 && z === 1; // hole in the side wall into the cavity
          if (!isInterior && !isSideGap) cells.push([x, y, z]);
        }
    expect(findTrappedAirCells(cells)).toEqual([]);
  });

  it("floods a hull with a hole in the BOTTOM (sea rises in through the breach)", () => {
    // Sealed box minus one FLOOR cell directly under the cavity: water climbs up through it.
    const cells: [number, number, number][] = [];
    for (let x = 0; x < 3; x++)
      for (let y = 0; y < 3; y++)
        for (let z = 0; z < 3; z++) {
          const isInterior = x === 1 && y === 1 && z === 1;
          const isFloorGap = x === 1 && y === 0 && z === 1; // hole in the floor below the cavity
          if (!isInterior && !isFloorGap) cells.push([x, y, z]);
        }
    expect(findTrappedAirCells(cells)).toEqual([]);
  });

  it("still traps a cavity that only 'leaks' through a diagonal (voxel water needs a face)", () => {
    // Remove a shell EDGE cell diagonal to the cavity. In a voxel model water flows face-to-face,
    // so a diagonal-only opening does not connect — the centre stays trapped.
    const cells: [number, number, number][] = [];
    for (let x = 0; x < 3; x++)
      for (let y = 0; y < 3; y++)
        for (let z = 0; z < 3; z++) {
          const isInterior = x === 1 && y === 1 && z === 1;
          const isEdgeGap = x === 0 && y === 0 && z === 1; // diagonal to the centre, not face-adjacent
          if (!isInterior && !isEdgeGap) cells.push([x, y, z]);
        }
    expect(asSet(findTrappedAirCells(cells))).toEqual(asSet([[1, 1, 1]]));
  });

  it("traps the air layer inside an open tray (a deck with a perimeter wall, like the raft)", () => {
    // Solid 3x3 deck at y=0, a 1-voxel perimeter wall at y=1, open top. The single interior cell
    // (1,1,1) is walled on all four sides + floored below → trapped, even with no lid.
    const cells: [number, number, number][] = [];
    for (let x = 0; x < 3; x++)
      for (let z = 0; z < 3; z++) {
        cells.push([x, 0, z]); // deck
        const onPerimeter = x === 0 || x === 2 || z === 0 || z === 2;
        if (onPerimeter) cells.push([x, 1, z]); // wall
      }
    expect(findTrappedAirCells(cells)).toEqual([[1, 1, 1]]);
  });

  it("keeps two disjoint cavities apart (an internal bulkhead → two air pockets)", () => {
    // 7x4x4 sealed box with a full cross-section wall at x=3 splitting the cavity into x1..2 and
    // x4..5. Both are fully enclosed, so every interior cell of both pockets is trapped air.
    const cells: [number, number, number][] = [];
    for (let x = 0; x < 7; x++)
      for (let y = 0; y < 4; y++)
        for (let z = 0; z < 4; z++) {
          const onShell = x === 0 || x === 6 || y === 0 || y === 3 || z === 0 || z === 3;
          const onBulkhead = x === 3;
          if (onShell || onBulkhead) cells.push([x, y, z]);
        }
    const expected: [number, number, number][] = [];
    for (const x of [1, 2, 4, 5])
      for (const y of [1, 2])
        for (const z of [1, 2]) expected.push([x, y, z]);
    expect(asSet(findTrappedAirCells(cells))).toEqual(asSet(expected));
  });

  it("floods a closed-top / open-bottom cup (inverted diving bell — the documented limit)", () => {
    // Closed top + walls, no floor: the sea rises up into it, so nothing is trapped (our model
    // doesn't hold a diving bell's air — acceptable for ships).
    const cells: [number, number, number][] = [];
    for (let x = 0; x < 3; x++)
      for (let y = 0; y < 3; y++)
        for (let z = 0; z < 3; z++) {
          const onShell = x === 0 || x === 2 || y === 2 || z === 0 || z === 2; // no y===0 floor
          const isInterior = x === 1 && y === 1 && z === 1;
          if (onShell && !isInterior) cells.push([x, y, z]);
        }
    expect(findTrappedAirCells(cells)).toEqual([]);
  });

  it("returns nothing for an empty build", () => {
    expect(findTrappedAirCells([])).toEqual([]);
  });
});

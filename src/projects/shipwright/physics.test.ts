import { describe, expect, it } from "vitest";
import {
  analyzeBuildVoids,
  compartmentTargetFill,
  groupCompartments,
} from "./physics";

// The buoyancy overhaul's trapped-air model is two pieces. analyzeBuildVoids pre-builds the STATIC
// graph of a build's empty interior cells: their adjacency, the `enclosed` air-capable mask, and the
// `compartment` (connected component of the enclosed graph) each enclosed cell belongs to. The
// buoyancy loop then advances a per-compartment water LEVEL each step against the live sea; a cell is
// flooded when it sits below its compartment's level, and a FULLY SEALED compartment (no openings)
// never floods. These lock down the static analysis, the compartment grouping, and the pure
// level-target rule the loop integrates.

type Cell = [number, number, number];
const key = ([x, y, z]: Cell) => `${x},${y},${z}`;
const asSet = (cells: Cell[]) => new Set(cells.map(key));

const sealedBox = (n: number): Cell[] => {
  const cells: Cell[] = [];
  for (let x = 0; x < n; x++)
    for (let y = 0; y < n; y++)
      for (let z = 0; z < n; z++)
        if (x === 0 || x === n - 1 || y === 0 || y === n - 1 || z === 0 || z === n - 1)
          cells.push([x, y, z]);
  return cells;
};

// A 7×4×4 hull split by an internal bulkhead at x=3 into two sealed 2×2×2 bays.
const bulkheadHull = (): Cell[] => {
  const cells: Cell[] = [];
  for (let x = 0; x < 7; x++)
    for (let y = 0; y < 4; y++)
      for (let z = 0; z < 4; z++) {
        const onShell = x === 0 || x === 6 || y === 0 || y === 3 || z === 0 || z === 3;
        if (onShell || x === 3) cells.push([x, y, z]);
      }
  return cells;
};

// A 3×3×3 bucket: shell on the four sides + floor, NO lid. Its interior below the rim (cells (1,1,1)
// and the mouth (1,2,1)) is one compartment; the exposed mouth cell is its only opening.
const openTopBucket = (): Cell[] => {
  const cells: Cell[] = [];
  for (let x = 0; x < 3; x++)
    for (let y = 0; y < 3; y++)
      for (let z = 0; z < 3; z++)
        if (x === 0 || x === 2 || z === 0 || z === 2 || y === 0) cells.push([x, y, z]);
  return cells;
};

// A 5×5 deck with a 1-voxel perimeter rim wall — like the raft. Its interior below the rim is trapped
// air (enclosed), the base for checking decorative geometry doesn't leak into the enclosure.
const deckWall = (): Cell[] => {
  const cells: Cell[] = [];
  for (let x = 0; x < 5; x++)
    for (let z = 0; z < 5; z++) {
      cells.push([x, 0, z]);
      if (x === 0 || x === 4 || z === 0 || z === 4) cells.push([x, 1, z]);
    }
  return cells;
};

describe("analyzeBuildVoids", () => {
  it("finds no voids in a solid block", () => {
    const cells: Cell[] = [];
    for (let x = 0; x < 3; x++)
      for (let y = 0; y < 3; y++)
        for (let z = 0; z < 3; z++) cells.push([x, y, z]);
    expect(analyzeBuildVoids(cells).cells).toEqual([]);
  });

  it("finds a sealed box's cavity, marks it NOT exposed, and gives it one compartment", () => {
    const { cells: voids, exposed, enclosed, compartment } = analyzeBuildVoids(sealedBox(3));
    expect(voids).toEqual([[1, 1, 1]]);
    expect(exposed).toEqual([false]);
    expect(enclosed).toEqual([true]);
    expect(compartment).toEqual([0]);
  });

  it("marks a bounding-box-face void (a hull opening) as exposed and open (compartment -1)", () => {
    // Sealed box minus one side-wall cell: the hole is an empty cell ON the boundary → exposed, and
    // reachable from outside → not a sealed compartment.
    const cells = sealedBox(3).filter(([x, y, z]) => !(x === 0 && y === 1 && z === 1));
    const { cells: voids, exposed, compartment } = analyzeBuildVoids(cells);
    const hole = voids.findIndex(([x, y, z]) => x === 0 && y === 1 && z === 1);
    expect(exposed[hole]).toBe(true);
    expect(compartment[hole]).toBe(-1);
  });

  it("splits a bulkheaded hull into two separate compartments", () => {
    const { cells: voids, compartment } = analyzeBuildVoids(bulkheadHull());
    const ids = new Set(compartment.filter((c) => c !== -1));
    expect(ids.size).toBe(2);
    // The two bays sit on opposite sides of the x=3 wall and must get DIFFERENT ids.
    const at = (c: Cell) => compartment[voids.findIndex((v) => key(v) === key(c))];
    expect(at([1, 1, 1])).not.toBe(at([5, 1, 1]));
  });

  it("a decorative crown adds NO enclosed air — only the interior below the rim is enclosed", () => {
    const enclosedCells = (cells: Cell[]): Set<string> => {
      const { cells: voids, enclosed } = analyzeBuildVoids(cells);
      return asSet(voids.filter((_, i) => enclosed[i]));
    };
    const bare = enclosedCells(deckWall());
    expect(bare.size).toBeGreaterThan(0); // sanity: there IS trapped-air interior below the rim
    // A corner spire (solid, open all around + above) encloses nothing, so it mustn't change the set.
    const withCrown = enclosedCells([...deckWall(), [0, 2, 0], [0, 3, 0]]);
    expect(withCrown).toEqual(bare);
  });
});

describe("groupCompartments", () => {
  it("a fully sealed box → one compartment with NO openings (never floods)", () => {
    const { cells, openings } = groupCompartments(analyzeBuildVoids(sealedBox(3)));
    expect(cells.length).toBe(1);
    expect(cells[0].length).toBe(1); // the single cavity cell
    expect(openings[0]).toEqual([]); // sealed → the sea has no way in
  });

  it("an open-top bucket → one compartment whose opening is its exposed rim cell", () => {
    // The mouth cell (1,2,1) is EXPOSED (top face) yet ENCLOSED (air below a rim), so it's the
    // opening — the only kind an upright open-top hull has, since nothing sits above it to be an
    // open neighbour. This is what makes a bucket flood only once its rim dips to the waterline.
    const voids = analyzeBuildVoids(openTopBucket());
    const { cells, openings } = groupCompartments(voids);
    expect(cells.length).toBe(1);
    const openingCoords = asSet(openings[0].map((idx) => voids.cells[idx]));
    expect(openingCoords.has(key([1, 2, 1]))).toBe(true);
  });

  it("a breach that opens the whole cavity leaves NO sealed compartment (it floods)", () => {
    // 3³ box minus a side-wall cell: the sea reaches the lone cavity by rising sideways, so it's open
    // (compartment -1) — no trapped air, the dense shell sinks. Small holes on small hulls just flood.
    const cells = sealedBox(3).filter(([x, y, z]) => !(x === 0 && y === 1 && z === 1));
    const voids = analyzeBuildVoids(cells);
    expect(voids.compartment.every((c) => c === -1)).toBe(true);
    expect(groupCompartments(voids).cells.length).toBe(0);
  });

  it("a bulkheaded hull → two compartments, each still fully sealed", () => {
    const { cells, openings } = groupCompartments(analyzeBuildVoids(bulkheadHull()));
    expect(cells.length).toBe(2);
    expect(cells.every((c) => c.length === 8)).toBe(true); // each bay is a 2×2×2 cavity
    expect(openings.every((o) => o.length === 0)).toBe(true);
  });

  it("connects only through a face, not a diagonal — a diagonal shell gap leaves the cavity sealed", () => {
    // Remove a shell EDGE cell diagonal to the cavity: no shared-face path in, so it stays sealed.
    const cells = sealedBox(3).filter(([x, y, z]) => !(x === 0 && y === 0 && z === 1));
    const voids = analyzeBuildVoids(cells);
    const { cells: comp, openings } = groupCompartments(voids);
    const cavity = voids.cells.findIndex(([x, y, z]) => x === 1 && y === 1 && z === 1);
    expect(voids.compartment[cavity]).toBe(0);
    expect(comp.length).toBe(1);
    expect(openings[0]).toEqual([]);
  });
});

describe("compartmentTargetFill — target fill FRACTION (0..1) a breached compartment settles toward", () => {
  // A compartment spanning world y 0..10, so fracBelow(y) = y/10 (fill fraction if the surface sits at y).
  const FLOOR = 0;
  const CEIL = 10;

  it("a sealed compartment (no openings) keeps its current fill — no water in or out, at any depth", () => {
    expect(compartmentTargetFill([], 3, 0.4, FLOOR, CEIL)).toBe(0.4);
  });

  it("a hole below the waterline fills toward SEA LEVEL (not full, and no diving-bell cap at the hole)", () => {
    // Hole at y=0 (deeply submerged), sea at y=3: fills to fracBelow(3)=0.3 — the sea level, not the top.
    expect(compartmentTargetFill([0], 3, 0, FLOOR, CEIL)).toBe(0.3);
  });

  it("fills to sea level when ANY of several holes is underwater", () => {
    // Holes [3,1,8], sea at y=5: the y=1 and y=3 holes are submerged → fracBelow(5)=0.5.
    expect(compartmentTargetFill([3, 1, 8], 5, 0, FLOOR, CEIL)).toBe(0.5);
  });

  it("drains out the lowest hole when every hole is above the waterline", () => {
    // Holes at y=6 and y=8, sea at y=2 (below both), currently 90% full → drains to fracBelow(6)=0.6.
    expect(compartmentTargetFill([6, 8], 2, 0.9, FLOOR, CEIL)).toBe(0.6);
  });

  it("leaves water trapped below the lowest hole (it can't run uphill out)", () => {
    // Same holes above water, but only 30% full — already below the lowest hole (0.6) → unchanged.
    expect(compartmentTargetFill([6, 8], 2, 0.3, FLOOR, CEIL)).toBe(0.3);
  });
});

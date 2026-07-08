import { describe, expect, it } from "vitest";
import { analyzeBuildVoids, floodSea } from "./physics";

// The buoyancy overhaul's trapped-air model is two pieces: analyzeBuildVoids pre-builds the graph of
// a build's empty interior cells (once), and floodSea runs each step against the live water surface
// to split them into flooded vs trapped air. Together they're orientation- + waterline-correct: the
// SAME geometry traps air or floods depending only on which cells are wet, so a rolling/swamping hull
// is handled for free. These lock down both pieces and that behaviour.

const key = ([x, y, z]: [number, number, number]) => `${x},${y},${z}`;
const asSet = (cells: [number, number, number][]) => new Set(cells.map(key));

// Trapped air = air-capable (enclosed) AND not flooded, given which cells are wet (default: fully
// submerged). Mirrors the buoyancy loop: `enclosed` rules out open volume, `floodSea` the flooding.
const trappedAir = (
  cells: [number, number, number][],
  isWet: (x: number, y: number, z: number) => boolean = () => true,
): [number, number, number][] => {
  const { cells: voids, exposed, adjacency, enclosed } = analyzeBuildVoids(cells);
  const wet = new Uint8Array(voids.length);
  const flooded = new Uint8Array(voids.length);
  const stack = new Int32Array(voids.length);
  voids.forEach(([x, y, z], i) => {
    wet[i] = isWet(x, y, z) ? 1 : 0;
  });
  floodSea(exposed, adjacency, wet, flooded, stack);
  return voids.filter((_, i) => enclosed[i] && flooded[i] === 0);
};

const sealedBox = (n: number): [number, number, number][] => {
  const cells: [number, number, number][] = [];
  for (let x = 0; x < n; x++)
    for (let y = 0; y < n; y++)
      for (let z = 0; z < n; z++)
        if (x === 0 || x === n - 1 || y === 0 || y === n - 1 || z === 0 || z === n - 1)
          cells.push([x, y, z]);
  return cells;
};

describe("analyzeBuildVoids", () => {
  it("finds no voids in a solid block", () => {
    const cells: [number, number, number][] = [];
    for (let x = 0; x < 3; x++)
      for (let y = 0; y < 3; y++)
        for (let z = 0; z < 3; z++) cells.push([x, y, z]);
    expect(analyzeBuildVoids(cells).cells).toEqual([]);
  });

  it("finds a sealed box's cavity and marks it NOT exposed (walled off from the outside)", () => {
    const { cells: voids, exposed } = analyzeBuildVoids(sealedBox(3));
    expect(voids).toEqual([[1, 1, 1]]);
    expect(exposed).toEqual([false]);
  });

  it("marks a bounding-box-face void (a hull opening) as exposed", () => {
    // Sealed box minus one side-wall cell: the hole is an empty cell ON the boundary → exposed.
    const cells = sealedBox(3).filter(([x, y, z]) => !(x === 0 && y === 1 && z === 1));
    const { cells: voids, exposed } = analyzeBuildVoids(cells);
    const holeIndex = voids.findIndex(([x, y, z]) => x === 0 && y === 1 && z === 1);
    expect(exposed[holeIndex]).toBe(true);
  });
});

describe("floodSea — fully submerged (only truly enclosed cavities keep their air)", () => {
  it("keeps a fully sealed box's cavity as air even underwater (buoyant pontoon)", () => {
    expect(trappedAir(sealedBox(3))).toEqual([[1, 1, 1]]);
  });

  it("floods an OPEN-TOP hull once it's fully submerged (rim underwater)", () => {
    // Whole top face left off. Submerged, the sea reaches in over the (now underwater) rim → no air.
    const cells = sealedBox(3).filter(([, y]) => y !== 2).filter(([x, y, z]) => !(x === 1 && y === 1 && z === 1));
    expect(trappedAir(cells)).toEqual([]);
  });

  it("floods a SIDE breach", () => {
    const cells = sealedBox(3).filter(([x, y, z]) => !(x === 0 && y === 1 && z === 1));
    expect(trappedAir(cells)).toEqual([]);
  });

  it("floods a BOTTOM breach (the sea reaches in through any submerged opening)", () => {
    const cells = sealedBox(3).filter(([x, y, z]) => !(x === 1 && y === 0 && z === 1));
    expect(trappedAir(cells)).toEqual([]);
  });

  it("keeps two disjoint sealed compartments (an internal bulkhead → two air pockets)", () => {
    const cells: [number, number, number][] = [];
    for (let x = 0; x < 7; x++)
      for (let y = 0; y < 4; y++)
        for (let z = 0; z < 4; z++) {
          const onShell = x === 0 || x === 6 || y === 0 || y === 3 || z === 0 || z === 3;
          if (onShell || x === 3) cells.push([x, y, z]);
        }
    const expected: [number, number, number][] = [];
    for (const x of [1, 2, 4, 5])
      for (const y of [1, 2])
        for (const z of [1, 2]) expected.push([x, y, z]);
    expect(asSet(trappedAir(cells))).toEqual(asSet(expected));
  });

  it("only 'leaks' through a face, not a diagonal (voxel water needs a shared face)", () => {
    // Remove a shell EDGE cell diagonal to the cavity — no face path in, so it stays sealed.
    const cells = sealedBox(3).filter(([x, y, z]) => !(x === 0 && y === 0 && z === 1));
    expect(asSet(trappedAir(cells))).toEqual(asSet([[1, 1, 1]]));
  });
});

describe("enclosed mask — decorative geometry doesn't leak into trapped air", () => {
  it("a decorative crown/spire adds NO trapped air (only the interior below the rim is enclosed)", () => {
    // A 5x5 deck + a 1-voxel rim wall — like the raft. Dry, so nothing floods → trapped = enclosed.
    const deckWall: [number, number, number][] = [];
    for (let x = 0; x < 5; x++)
      for (let z = 0; z < 5; z++) {
        deckWall.push([x, 0, z]);
        if (x === 0 || x === 4 || z === 0 || z === 4) deckWall.push([x, 1, z]);
      }
    const bare = asSet(trappedAir(deckWall, () => false));
    // Add a decorative corner spire (solid, open all around + above → encloses nothing).
    const withCrown: [number, number, number][] = [...deckWall, [0, 2, 0], [0, 3, 0]];
    expect(asSet(trappedAir(withCrown, () => false))).toEqual(bare);
  });
});

describe("floodSea — waterline dependence (the orientation-correct part)", () => {
  it("keeps an open-top hull's air when the rim is above water, floods it when submerged", () => {
    // Taller open-top box (3x3x4, top face off): interior column (1,1,1)+(1,2,1), rim cell (1,2,1).
    const cells: [number, number, number][] = [];
    for (let x = 0; x < 3; x++)
      for (let y = 0; y < 4; y++)
        for (let z = 0; z < 3; z++) {
          const onShell = x === 0 || x === 2 || y === 0 || z === 0 || z === 2; // no y===3 lid
          const isInterior = x === 1 && z === 1 && (y === 1 || y === 2);
          if (onShell && !isInterior) cells.push([x, y, z]);
        }

    // Rim (y=2) above water, lower interior (y=1) below: the below-rim air is trapped (buoyant).
    const partial = trappedAir(cells, (_x, y) => y <= 1);
    expect(asSet(partial).has(key([1, 1, 1]))).toBe(true);

    // Fully submerged: the rim is underwater, so the sea floods the whole column → no air.
    expect(trappedAir(cells)).toEqual([]);
  });
});

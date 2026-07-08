import * as THREE from "three";

/**
 * Shipwright's voxel-build catalogue — pure content: the `Shape` descriptor plus the gameplay RAFT and
 * the buoyancy-demo builds (`TEST_SHAPES`). A shape is just an integer-cell list + render/spawn hints;
 * nothing here touches THREE beyond the bucket grid layout, and nothing touches Rapier or the ocean.
 * physics.ts turns these into dynamic bodies (mass from `density`, mesh from `merged`/`textured`), and
 * scene.ts / bench-shapes.ts pick which to drop. Kept separate so this data can grow without bloating
 * the physics engine and so an edit here can't touch simulation code.
 */

// Densities in kg/m³ for the shape catalogue (the physics default, VOXEL_DENSITY, lives in physics.ts).
// Raft build: a real light boat softwood (cedar / dry pine ≈ 400 kg/m³), chosen so the deck floats
// HONESTLY proud of a calm sea rather than by fudging buoyancy. Freeboard of a solid slab =
// thickness·(1 − ρ/ρ_water); at 400 a single 0.5 m course clears ~0.22 m of dry deck once the perimeter
// wall's weight is counted, and an 85 kg sailor spread over the ~20 m² deck adds only ~4 mm of draft —
// one person barely sinks it. Also seeds the density of Q-dropped voxels (see physics.ts dropVoxel).
export const RAFT_DENSITY = 400;
// Denser than water (1000): a SOLID block of this sinks like a stone. The sealed-hull test shape floats
// at this density anyway — proof that its enclosed air, not its material, is what keeps it up (Stage 1).
const DENSE_HULL_DENSITY = 1400;
// The stability-test buckets: modestly DENSER than water (1000), so they float ONLY on their trapped
// air. In calm water they sit upright with some freeboard; a heavy wave that crests the rim floods the
// air out and the now-heavier-than-water shell sinks. Wall height then trades freeboard (harder to
// swamp) against a higher, tippier centre of mass.
const BUCKET_DENSITY = 1100;

export interface Shape {
  name: string;
  color: number;
  /** Voxel cells on an integer grid (X right, Y up, Z depth). */
  cells: [number, number, number][];
  /** Drop level rather than pre-tilted (stability test — does it stay standing?). */
  upright?: boolean;
  /** Spawn at this world position instead of the default drop row. */
  spawnOverride?: [number, number, number];
  /** kg/m³ for this build's voxels (sets mass + waterline). Defaults to VOXEL_DENSITY. */
  density?: number;
  /** Render with the shared wood-plank PBR material instead of a flat colour. */
  textured?: boolean;
  /** Render as ONE merged mesh with continuous body-local UVs (planks flow across voxels)
   *  instead of per-voxel instances that re-tile the texture on every 0.5 m face. */
  merged?: boolean;
}

// A hollow boat hull sized like a real 7-adult speedboat: 12×5 voxels (6.0 × 2.5 m)
// with a tapered bow, one course of side walls (open top) → ~0.47 m draft. Built
// hollow on purpose: a SOLID block of wood-density voxels floats ~60% submerged like
// a log, but a shell displaces water with its hull and floats shallow like a boat —
// the scale reference for judging whether the sea (and the physics) read as real.
const buildBoatCells = (): [number, number, number][] => {
  const LENGTH = 12;
  const CENTER_Z = 2;
  const halfBeam = (x: number): number => {
    if (x >= LENGTH - 1) return 0; // bow tip: a single spine cell
    if (x >= LENGTH - 2) return 1; // bow shoulder: z 1..3
    return 2; // full 5-wide beam
  };
  const floor = new Set<string>();
  const floorCells: [number, number][] = [];
  for (let x = 0; x < LENGTH; x++) {
    const hb = halfBeam(x);
    for (let z = CENTER_Z - hb; z <= CENTER_Z + hb; z++) {
      floorCells.push([x, z]);
      floor.add(`${x},${z}`);
    }
  }
  const isFloor = (x: number, z: number) => floor.has(`${x},${z}`);
  const cells: [number, number, number][] = [];
  for (const [x, z] of floorCells) {
    cells.push([x, 0, z]); // hull bottom
    // A wall on any bottom cell missing a 4-neighbour — i.e. the hull perimeter.
    const onPerimeter =
      !isFloor(x - 1, z) ||
      !isFloor(x + 1, z) ||
      !isFloor(x, z - 1) ||
      !isFloor(x, z + 1);
    if (onPerimeter) cells.push([x, 1, z]); // side wall (one 0.5 m course)
  }
  return cells;
};

// Hollow box shell (nx×ny×nz), walls one voxel thick on all six faces — the base for the sealed
// hull and the hull edge-case demos. Punch holes with the filter helpers below (a breach that
// floods, an open face that makes a bucket or an open-bottom cup) to stress the flood-fill.
const buildHollowBox = (
  nx: number,
  ny: number,
  nz: number,
): [number, number, number][] => {
  const cells: [number, number, number][] = [];
  for (let x = 0; x < nx; x++) {
    for (let y = 0; y < ny; y++) {
      for (let z = 0; z < nz; z++) {
        const onShell =
          x === 0 || x === nx - 1 ||
          y === 0 || y === ny - 1 ||
          z === 0 || z === nz - 1;
        if (onShell) cells.push([x, y, z]);
      }
    }
  }
  return cells;
};

// Drop one cell (a point breach) or a whole face (an opening) from a build — used to carve the
// edge-case hulls so their difference from a plain sealed box is a single obvious hole.
const omitCell = (
  cells: [number, number, number][],
  x: number,
  y: number,
  z: number,
): [number, number, number][] =>
  cells.filter(([cx, cy, cz]) => cx !== x || cy !== y || cz !== z);

const omitFace = (
  cells: [number, number, number][],
  axis: 0 | 1 | 2,
  value: number,
): [number, number, number][] => cells.filter((c) => c[axis] !== value);

// The Stage-1 air-cavity demo: a sealed 8³ box, walls one voxel thick, closed on ALL six sides
// around a hollow 6³ interior. Built at DENSE_HULL_DENSITY, the shell alone is far heavier than
// water — a solid block of it sinks — yet the box floats high, because the flood-fill classifies
// the sealed interior as air that displaces water at zero mass. This is the whole point of the
// overhaul: a hull floats on the air it encloses, not on light voxels.
const buildSealedHull = (): [number, number, number][] => buildHollowBox(8, 8, 8);

// A sealed hull split by an internal bulkhead into TWO separate air pockets — checks the flood-fill
// keeps disjoint cavities apart (and previews how a bulkhead localises flooding for stability).
const buildBulkheadHull = (): [number, number, number][] => {
  const cells = buildHollowBox(7, 4, 4);
  for (let y = 1; y < 3; y++) {
    for (let z = 1; z < 3; z++) {
      cells.push([3, y, z]); // complete the x=3 cross-section, walling the cavity into two
    }
  }
  return cells;
};

// A raft (deck + rim wall) topped with a DECORATIVE crown of solid pointed merlons — 3-tall spires
// at the corners, 2-tall at the edge midpoints. The crown encloses nothing (open all around and
// above), so it must NOT change the trapped air: the classifier should still find only the deck-
// level interior below the rim, exactly like a plain raft. It's the test that decorative geometry
// doesn't leak into the buoyancy — flip the "trapped-air cells" x-ray and the crown stays dark.
const buildCrownRaft = (): [number, number, number][] => {
  const SIDE = 7;
  const cells: [number, number, number][] = [];
  for (let x = 0; x < SIDE; x++) {
    for (let z = 0; z < SIDE; z++) {
      cells.push([x, 0, z]); // deck
      const onPerimeter = x === 0 || x === SIDE - 1 || z === 0 || z === SIDE - 1;
      if (onPerimeter) cells.push([x, 1, z]); // base rim wall
    }
  }
  const mid = (SIDE - 1) / 2;
  const crownHeight = (x: number, z: number): number => {
    const onPerimeter = x === 0 || x === SIDE - 1 || z === 0 || z === SIDE - 1;
    if (!onPerimeter) return 0;
    const corner = (x === 0 || x === SIDE - 1) && (z === 0 || z === SIDE - 1);
    if (corner) return 3; // corner spire (up to y=3)
    if (x === mid || z === mid) return 2; // edge-midpoint merlon (up to y=2)
    return 0;
  };
  for (let x = 0; x < SIDE; x++) {
    for (let z = 0; z < SIDE; z++) {
      const h = crownHeight(x, z);
      for (let y = 2; y <= h; y++) cells.push([x, y, z]); // solid crown above the rim
    }
  }
  return cells;
};

// The Stage-1 air-cavity demonstrator (part of TEST_SHAPES, which the live scene drops in beside
// the raft) — the direct way to SEE a dense hull float on trapped air. Steel-grey, dropped a few
// metres off the raft's port bow: it plunges, then bobs up and floats high despite being denser
// than water. Toggle the Debug "trapped-air cells" x-ray to watch the cavity do the work, or the
// Physics "air-cavity buoyancy" switch off to watch it sink without it. Exported as a named handle.
export const SEALED_HULL: Shape = {
  name: "Sealed hull",
  color: 0x9aa7b4,
  upright: true,
  density: DENSE_HULL_DENSITY,
  spawnOverride: [-10, 3, -28],
  cells: buildSealedHull(),
};

// Stability buckets: open-top hulls (dense — float only on trapped air) across a MATRIX of wall
// height (h3→h10) × interior air size (3×3, 4×4, 5×5). The spectrum shows the whole range — shallow
// walls swamp on the splash-down, tall walls take the plunge and bob back up — and how a wider air
// cavity lifts more. Laid out BROADSIDE to the default camera (pos (-8,2.5,8) → target (4,1.5,-4)) so
// all 15 are in frame the instant the scene loads, no orbiting: that camera's ground-plane ray runs
// along x = -z, its screen-right axis is (1,0,1)/√2 and its into-screen axis is (1,0,-1)/√2. We centre
// the grid on the ray in the empty water beyond the other demos — heights spread across screen-right,
// interior sizes recede into depth (smallest nearest). Dropped in low for a gentle entry.
const BUCKET_COLORS = [0x4fbfa0, 0x4fae9e, 0x4f9eae, 0x4f7eae, 0x4f6ec0];
const BUCKET_GRID_CENTER = new THREE.Vector3(12, 0, -12);
const BUCKET_GRID_RIGHT = new THREE.Vector3(1, 0, 1).normalize(); // camera screen-right
const BUCKET_GRID_DEPTH = new THREE.Vector3(1, 0, -1).normalize(); // camera into-screen
const buildBuckets = (): Shape[] => {
  const heights = [3, 4, 6, 8, 10];
  const exts = [5, 6, 7]; // interior 3×3, 4×4, 5×5
  const COL = 5; // spacing between heights (across screen)
  const ROW = 5; // spacing between interior sizes (into depth)
  const shapes: Shape[] = [];
  exts.forEach((ext, r) => {
    const inner = ext - 2;
    heights.forEach((h, i) => {
      const p = BUCKET_GRID_CENTER.clone()
        .addScaledVector(BUCKET_GRID_RIGHT, (i - (heights.length - 1) / 2) * COL)
        .addScaledVector(BUCKET_GRID_DEPTH, (r - 1) * ROW);
      shapes.push({
        name: `Bucket ${inner}x${inner} h${h}`,
        color: BUCKET_COLORS[i],
        upright: true,
        density: BUCKET_DENSITY,
        spawnOverride: [p.x, 1.5 + i * 0.3, p.z],
        cells: omitFace(buildHollowBox(ext, h, ext), 1, h - 1),
      });
    });
  });
  return shapes;
};

// The retired buoyancy testbed — a spread of 0.5 m³-voxel builds that validated the
// per-voxel float (plates topple + self-right; upright shapes range from rock-stable
// pyramid/catamaran to doomed pillar; a hollow boat hull as a scale reference). Kept
// behind an opt-in: the gameplay scene spawns the raft, but pass TEST_SHAPES to
// createPhysics to drop these again. Buoyancy is per-voxel, so each one's behaviour
// falls out of its geometry alone.
export const TEST_SHAPES: Shape[] = [
  { name: "I", color: 0x28c6d6, cells: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]] },
  { name: "O", color: 0xf2c94c, cells: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]] },
  { name: "T", color: 0xa06cd5, cells: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [1, 1, 0]] },
  { name: "S", color: 0x6fcf6f, cells: [[1, 0, 0], [2, 0, 0], [0, 1, 0], [1, 1, 0]] },
  { name: "L", color: 0xf2994a, cells: [[0, 0, 0], [0, 1, 0], [0, 2, 0], [1, 0, 0]] },
  // Tower: a 3×3 base with a tall central column — wide bottom, tall centre. Stands
  // on calm water; a big enough wave tilts the base far enough to topple the column.
  {
    name: "Tower",
    color: 0xd94f4f,
    upright: true,
    cells: [
      [0, 0, 0], [1, 0, 0], [2, 0, 0],
      [0, 0, 1], [1, 0, 1], [2, 0, 1],
      [0, 0, 2], [1, 0, 2], [2, 0, 2],
      [1, 1, 1], [1, 2, 1], [1, 3, 1],
    ],
  },
  // Pillar: a 1×1 footprint 4 tall. Top-heavy with no beam — it capsizes almost at
  // once and self-rights to float lying down. The extreme-instability end.
  {
    name: "Pillar",
    color: 0x5b8def,
    upright: true,
    cells: [[0, 0, 0], [0, 1, 0], [0, 2, 0], [0, 3, 0]],
  },
  // Catamaran: two low pontoons bridged by a deck. Wide beam + low mass → very
  // stable, self-rights hard. Previews how a real hull's beam resists rolling.
  {
    name: "Catamaran",
    color: 0x35b0a0,
    upright: true,
    cells: [
      [0, 0, 0], [1, 0, 0], [2, 0, 0],
      [0, 0, 2], [1, 0, 2], [2, 0, 2],
      [1, 1, 0], [1, 1, 1], [1, 1, 2],
    ],
  },
  // Pyramid: a 3×3 base tapering to a single cap. Broad and bottom-heavy — the
  // rock-stable, self-levelling baseline to compare the tippy shapes against.
  {
    name: "Pyramid",
    color: 0xcaa96a,
    upright: true,
    cells: [
      [0, 0, 0], [1, 0, 0], [2, 0, 0],
      [0, 0, 1], [1, 0, 1], [2, 0, 1],
      [0, 0, 2], [1, 0, 2], [2, 0, 2],
      [1, 1, 1],
    ],
  },
  // The scale reference: a real-sized speedboat hull, spawned at its waterline (off to starboard,
  // clear of the raft that sits at the origin in the live scene) so it settles without a big drop.
  {
    name: "Boat",
    color: 0xe6e2d8,
    upright: true,
    spawnOverride: [-14, 0.2, -2],
    cells: buildBoatCells(),
  },
  // The Stage-1 air-cavity demo (see SEALED_HULL): a dense sealed box that floats on its
  // enclosed air. Dropped clear of the row — watch it plunge, then bob up and float high.
  SEALED_HULL,
  // --- Non-standard hulls: stress the flood-fill on gaps, holes, and openings. Default density so
  // they float and stay put; toggle the Debug "trapped-air cells" x-ray on each to check what it
  // classifies as air. Each is a plain hollow box differing by a single deliberate feature. ---
  {
    // Hole in a SIDE wall: the sea reaches the cavity sideways, so it FLOODS — overlay shows no air.
    name: "Breached (side)",
    color: 0xd98f4f,
    upright: true,
    spawnOverride: [-5, 3, -32],
    cells: omitCell(buildHollowBox(4, 4, 4), 0, 2, 2),
  },
  {
    // Hole in the FLOOR: the sea rises up through the breach, so it FLOODS too (tests +Y inflow).
    name: "Breached (bottom)",
    color: 0xd9694f,
    upright: true,
    spawnOverride: [0, 3, -32],
    cells: omitCell(buildHollowBox(4, 4, 4), 2, 0, 2),
  },
  {
    // Sealed box split by an internal wall → TWO separate trapped-air pockets in one hull.
    name: "Bulkhead",
    color: 0x6fae4f,
    upright: true,
    spawnOverride: [6, 3, -32],
    cells: buildBulkheadHull(),
  },
  {
    // Closed top, open BOTTOM (an inverted cup / diving bell): the sea rises in and it FLOODS. A
    // real diving bell would hold air; our model doesn't (rare for ships) — the documented limit.
    name: "Open-bottom cup",
    color: 0x8f6fd9,
    upright: true,
    spawnOverride: [3, 3, -38],
    cells: omitFace(buildHollowBox(4, 4, 4), 1, 0),
  },
  // Stability buckets: a matrix of wall height × interior air size (see buildBuckets). Dropped in low
  // (Debug "sim speed" slows the entry). Flooding is all-or-nothing — a hard entry that drives the
  // rim fully under floods a low-walled bucket, which is expected.
  ...buildBuckets(),
  {
    // Decorative crown (see buildCrownRaft): pointed merlons that must NOT change the trapped air —
    // the overlay should show only the deck-level interior, exactly like a plain raft.
    name: "Crown raft",
    color: 0x9a92a8,
    upright: true,
    spawnOverride: [-8, 2, -38],
    cells: buildCrownRaft(),
  },
];

// The raft — the gameplay platform. A 9×9 course of the 0.5 m voxel (4.5 × 4.5 m deck)
// with a 1-voxel (0.5 m) retaining wall around the perimeter to bound the player. Built
// in light boat softwood (RAFT_DENSITY) so it floats a sailor with a real dry deck — the
// player stands and walks on it. One solid course; thicken it (add a y=−1 course) if we
// want more freeboard for rougher water.
const buildRaft = (): [number, number, number][] => {
  const SIDE = 9;
  const cells: [number, number, number][] = [];
  for (let x = 0; x < SIDE; x++) {
    for (let z = 0; z < SIDE; z++) {
      cells.push([x, 0, z]); // deck course
      const onPerimeter = x === 0 || x === SIDE - 1 || z === 0 || z === SIDE - 1;
      if (onPerimeter) cells.push([x, 1, z]); // low retaining wall
    }
  }
  return cells;
};

export const RAFT: Shape = {
  name: "Raft",
  color: 0x6b4f3a, // wood-brown fallback shown until the plank texture loads
  upright: true, // drops level, no self-right tilt
  density: RAFT_DENSITY,
  textured: true,
  merged: true,
  spawnOverride: [0, 0.3, 0], // just above its waterline — settles with a gentle bob
  cells: buildRaft(),
};

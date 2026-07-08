import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import RAPIER from "@dimforge/rapier3d-compat";
import type GUI from "three/examples/jsm/libs/lil-gui.module.min.js";
import type { Ocean } from "./ocean";

/**
 * Rapier physics for Shipwright — the OTHER half of the HYBRID floating decision
 * (see CLAUDE.md "Water architecture"). Decorative floaters ride the water
 * kinematically (`ocean.sampleParticle`, in scene.ts); anything that must collide
 * and carry momentum is a Rapier dynamic body floated by *force-based buoyancy*.
 *
 * This module is the buoyancy testbed: it drops an assortment of builds — flat
 * tetromino plates, upright 3-D shapes (tower, pillar, catamaran, pyramid), and a
 * real-sized speedboat hull as a scale reference — each made of the game's 0.5 m³
 * voxel cube, into the sea as dynamic bodies with a
 * compound (one-box-per-voxel) collider, then floats them by sampling the water
 * height under each voxel (`ocean.sampleSurface`) and pushing up in proportion to
 * how submerged that voxel is. Because the up-force is applied at each voxel's own
 * point, the torques emerge for free: shapes self-right, tip, and bob differently
 * by geometry. It's scoped to collision / momentum / buoyancy ONLY — never water
 * rendering (that's ocean.ts).
 *
 * AIR-CAVITY BUOYANCY + COMPARTMENT FLOODING (see docs/buoyancy.md). Hulls float on the air they
 * enclose, not just on light voxels. `analyzeBuildVoids` pre-builds ONCE (pure, cheap, re-runnable
 * per place/break by the coming voxel builder) a build's empty interior cells: their adjacency
 * graph, a static ENCLOSED mask (cells air-CAPABLE — the sea can't reach them by rising + moving
 * sideways, i.e. they sit below a rim), and the COMPARTMENT each enclosed cell belongs to (connected
 * components of the enclosed graph; a bulkhead makes two). ENCLOSED (orientation-free shape geometry)
 * rules out open volume, so a decorative crown above the rim is never counted as air.
 *
 * Each fixed step every compartment tracks a FILL FRACTION (0..1) — pose-invariant flooding state, so
 * it tracks the hull as it bobs/sinks/rolls instead of freezing at a spawn world height. Sample the
 * sea at the compartment centroid, and if any of its openings (the cells where the sea meets it) sits
 * underwater, raise the fraction toward sea level at a finite ORIFICE rate (wider/deeper holes fill
 * faster); otherwise drain out the lowest opening. The fraction realizes to a world FLOOD LEVEL for the
 * current pose (dryFloor + fraction·span), and a cell is FLOODED when its centre is below it (so water
 * pools to a heeled hull's low side). Trapped air = enclosed AND not flooded → up-buoyancy at ZERO mass; a
 * flooded cell instead carries WATER WEIGHT (ρg·(1−submerged)·V, down), so a swamped/heeled hull is
 * pulled under and founders. This is orientation- + waterline-correct for free (openings' and cells'
 * world heights track the hull as it rolls): a submerged opening floods to the waterline; a FULLY
 * SEALED compartment (no openings) never floods, so it keeps its air at any depth — seal a hull and
 * it survives underwater. We deliberately DON'T model a trapped-air (diving-bell) seal at a lone
 * submerged hole — at 0.5 m voxels that edge case isn't worth simulating; a hole below the waterline
 * just floods. Interior water rendering is Stage 3c (docs/buoyancy.md).
 *
 * Rapier is deterministic and we keep it that way for future host-authoritative
 * multiplayer: a FIXED physics timestep, and no wall-clock or Math.random in the
 * sim. Buoyancy forces are a pure function of body state + the sim clock, and the
 * sim clock advances only in fixed increments.
 */

// Metric, matching the rest of Shipwright: 1 unit = 1 m, standard voxel = 0.5 m³.
const VOXEL = 0.5;
const HALF = VOXEL / 2;
const VOXEL_VOLUME = VOXEL * VOXEL * VOXEL;
const GRAVITY = 9.81;

// Densities in kg/m³. Wood-like density sets weight + waterline: a shape settles at
// ~60% submerged (equilibrium submerged fraction = VOXEL_DENSITY / water).
const WATER_DENSITY = 1000;
const VOXEL_DENSITY = 600;
// Raft build: a real light boat softwood (cedar / dry pine ≈ 400 kg/m³), chosen so the deck
// floats HONESTLY proud of a calm sea rather than by fudging buoyancy. Freeboard of a solid
// slab = thickness·(1 − ρ/ρ_water); at 400 a single 0.5 m course clears ~0.22 m of dry deck
// once the perimeter wall's weight is counted, and an 85 kg sailor spread over the ~20 m²
// deck adds only ~4 mm of draft — one person barely sinks it. See the player/raft plan.
const RAFT_DENSITY = 400;
// Denser than water (1000): a SOLID block of this sinks like a stone. The sealed-hull test
// shape floats at this density anyway — proof that its enclosed air, not its material, is what
// keeps it up (Stage 1). See `buildSealedHull` / TEST_SHAPES.
const DENSE_HULL_DENSITY = 1400;
// The stability-test buckets: modestly DENSER than water (1000), so they float ONLY on their trapped
// air. In calm water they sit upright with some freeboard; a heavy wave that crests the rim floods
// the air out and the now-heavier-than-water shell sinks. Wall height then trades freeboard (harder
// to swamp) against a higher, tippier centre of mass. (Estimated — eyeball and re-tune if needed;
// once Stage 3b adds flooded water MASS, even light hulls will founder and this can drop toward wood.)
const BUCKET_DENSITY = 1100;
// Metres of raft surface per wood-texture tile. Merged builds (see `merged`) get CONTINUOUS
// body-local UVs, so planks flow seamlessly across voxels at this scale instead of the texture
// restarting on every 0.5 m face (which read as thin stripes). Fine-tune live via "tile repeat".
const WOOD_TILE = 2;
// NB: added mass is deliberately NOT faked via density + gravityScale — gravityScale
// scales gravity everywhere (mid-air included), which made launched shapes fall slow
// and hang. Real mass, real gravity; a proper (submersion-gated) added-mass force is
// unnecessary at these sea states.

// Fixed physics timestep (deterministic). We accumulate real frame time and step
// in whole FIXED_DT chunks; MAX_SUBSTEPS caps catch-up so a long stall (hidden
// tab) can't trigger a spiral of death — leftover backlog past the cap is dropped.
const FIXED_DT = 1 / 60;
const MAX_SUBSTEPS = 5;

// Runaway guard. The water model is tuned for gentle seas (see CLAUDE.md — waves can't out-
// accelerate gravity there); crank the wave sliders hard and bodies get launched and can pump
// energy each bounce. Left unchecked that grows without bound until Rapier's WASM solver sees a
// non-finite value and traps ("unreachable"), which then hard-freezes the app. After each step we
// clamp any body's speed back under these caps (and zero a non-finite one), so the state fed into
// the next step stays sane and the solver can't explode — the sim just saturates instead.
const MAX_LINVEL = 40; // m/s
const MAX_ANGVEL = 20; // rad/s

// Rapier's built-in damping pulls toward WORLD-REST, which is unphysical here (it
// fights riding the orbit), so linear damping is OFF — all translational damping is
// the water-relative drag below. A little angular damping is kept purely for
// numerical calm on the spin axes.
const LINEAR_DAMPING = 0;
const ANGULAR_DAMPING = 0.1;

// Per-voxel hydrodynamic drag toward the local water velocity, gated (like buoyancy)
// by the submerged fraction, so both fade to zero as a voxel leaves the water. The
// QUADRATIC term ½·ρ·Cd·A·|v|·v (Cd ≈ 1.1 for a cube face, A = one voxel face) is real
// form drag and dominates at speed. The small LINEAR term is a near-equilibrium
// radiation/viscous damper — form drag vanishes as v → 0, so a linear floor prevents
// undamped micro-ringing — sized for a LIGHT heave ζ ≈ 0.2, like a real small floater
// that bobs a couple of times and settles. Both are relative to the water, so they
// track the orbital motion and only resist DEVIATION from it. This stays stable at
// light damping because the wave forcing (ω ≈ 0.6 rad/s) is far below heave resonance
// (ω_n ≈ 5.7 rad/s) AND the sea can never out-accelerate gravity (ω²·a ≈ 0.6 ≪ 9.81
// m/s²), so waves physically cannot throw a float off the surface — no launch pump to
// damp against. The GUI "water drag" scales both terms live.
const DRAG_CUBE_CD = 1.1;
const DRAG_FACE_AREA = VOXEL * VOXEL;
const DRAG_QUADRATIC = 0.5 * WATER_DENSITY * DRAG_CUBE_CD * DRAG_FACE_AREA;
const DRAG_LINEAR = 200; // ≈ ζ 0.23 per voxel — light, physical
const DRAG_MULTIPLIER_DEFAULT = 1;

// Half-step used to finite-difference the water (particle) velocity analytically.
const VELOCITY_EPS = 1 / 120;

// Flood inflow — ORIFICE (Torricelli) flow, so how fast a compartment fills depends on how open it is
// and how deep its holes sit, not a flat fudge factor. Water enters a submerged hole at ~Cd·√(2g·head)
// (head = the hole's depth below the sea surface). Summed over a compartment's holes and divided by
// its `footprint` (mean horizontal cross-section, in cells), that becomes a water-LEVEL rise rate:
//   dL/dt = params.fillRate · Cd · Σ_holes √(2g·head) / footprint
// A WIDE mouth (open cells ≈ the compartment's own cross-section, e.g. a capsized bucket) floods in ~a
// second and founders — nearly instantly when deeply submerged (big head); a small deep cannon hole
// trickles in slowly. Draining is the same law with head = the interior water's height above a hole.
// `params.fillRate` scales it live for tuning; determinism holds (pure √ of world heights + clock).
const ORIFICE_C = 0.6; // discharge coefficient of a sharp-edged hole
const FILL_RATE_DEFAULT = 1; // dimensionless multiplier on the orifice law (GUI "flood rate")


// Spawn layout: a deterministic row dropped from a small height. Plate shapes get a
// fixed (non-random — determinism) tilt so they enter at an angle and must
// self-right; `upright` shapes drop level so we can watch whether they stay standing
// or tip over on the chop.
const SPAWN_SPACING = 4;
const SPAWN_HEIGHT = 1.5;
const SPAWN_Z = -48; // legacy per-voxel demos drop in a far BACK row, clear of the buckets up front

const ARROW_COLOR = 0x35ffd0; // material-voxel buoyancy force arrows
const AIR_ARROW_COLOR = 0x35a0ff; // sealed-air-cell buoyancy force arrows (distinct from material)
const AIR_OVERLAY_COLOR = 0x35d0ff; // translucent x-ray overlay filling the trapped-air cells
const ARROW_SCALE = 1 / 300; // newtons → metres for the debug force arrows

const UP = new THREE.Vector3(0, 1, 0);
const ORIGIN = new THREE.Vector3(0, 0, 0);
const ZERO = { x: 0, y: 0, z: 0 };

interface Shape {
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
// player stands and walks on it (next step). One solid course; thicken it (add a y=−1
// course) if we want more freeboard for rougher water.
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

interface Visual {
  /** InstancedMesh (one instance per voxel) OR, when `single`, one merged Mesh posed by the
   *  body transform. Buoyancy always uses `offsets` regardless of how it renders. */
  mesh: THREE.InstancedMesh | THREE.Mesh;
  /** True when `mesh` is a single merged Mesh (posed whole) rather than per-voxel instances. */
  single: boolean;
  /** Local voxel-centre offsets (metres), centred on the shape's centroid. */
  offsets: THREE.Vector3[];
  /** Local centres (metres) of the build's empty interior cells (voids), SAME body frame as
   *  `offsets`. Each step the compartment water levels split these into trapped air (buoyancy at zero
   *  mass — no collider, no mesh) and flooded (water weight). */
  voidOffsets: THREE.Vector3[];
  /** Per void: air-capable (enclosed) — a static shape property (see BuildVoids.enclosed). Trapped
   *  air = this AND its compartment's water level hasn't reached it; an open volume is never enclosed. */
  voidEnclosed: boolean[];
  /** Per void: its compartment id (see BuildVoids.compartment), or -1 for an open void. */
  voidCompartment: number[];
  /** Per-body flood scratch (allocated once, reused every step so the hot loop never allocates):
   *  world x/y/z of each void, its submerged fraction, and whether it's currently flooded (for the
   *  buoyancy loop's water weight + the trapped-air x-ray). */
  voidWorld: Float32Array;
  voidSubmerged: Float32Array;
  voidFlooded: Uint8Array;
  /** Compartments (connected enclosed voids) of this build: per compartment its cell + opening void
   *  indices (into `voidOffsets`) and its body-local centroid (where the external waterline is
   *  sampled). `compartmentWater` is the persistent per-compartment fill FRACTION (0..1), the one
   *  piece of flooding SIM STATE — pose-invariant (so it tracks the hull as it moves), integrated at
   *  FIXED_DT, reset to 0 (dry) on respawn. `compartmentFloodLevel` is per-step scratch: the world
   *  height that fraction realizes to this pose, which the force loop floods cells below. */
  compartmentCells: number[][];
  compartmentOpenings: number[][];
  compartmentCentroidLocal: THREE.Vector3[];
  compartmentFloodLevel: Float32Array;
  /** Per compartment: its mean horizontal cross-section in cells (nCells / vertical span), the
   *  denominator of the orifice fill rate — how spread-out the compartment is, so a given hole area
   *  fills a wide shallow bay slower than a narrow deep one. See ORIFICE_C / the buoyancy loop. */
  compartmentFootprint: Float32Array;
  compartmentWater: Float32Array;
  spawnPos: THREE.Vector3;
  spawnQuat: THREE.Quaternion;
  /** Post-step transforms of the last two fixed steps, interpolated at render time (see syncMeshes). */
  prevPos: THREE.Vector3;
  prevQuat: THREE.Quaternion;
  currPos: THREE.Vector3;
  currQuat: THREE.Quaternion;
  /** Start index of this piece's buoyancy points in the flat force/pos/arrow arrays: its
   *  material voxels (`offsets.length`) then its void cells (`voidOffsets.length`). */
  arrowBase: number;
  /** Voxel density (kg/m³) — sets the body's mass via the colliders. */
  density: number;
}

export interface Physics {
  /** Add to the scene once. Holds the tetromino meshes + the debug-arrow overlay. */
  object: THREE.Object3D;
  /** Load the Rapier WASM and build the world + bodies. Meshes render at their
   *  spawn pose until this resolves; `update` is a no-op until then. */
  init: () => Promise<void>;
  /** Step the fixed-timestep sim for `delta` real seconds and sync the meshes.
   *  `time` is the SAME clock the ocean is rendered at (scene's `elapsed`), so the
   *  buoyancy samples the exact water surface that's on screen. */
  update: (delta: number, time: number) => void;
  /** The Rapier world once init() resolves (null before). Lets other systems — the player
   *  character controller — add bodies/colliders to the SAME world so they collide. */
  world: () => RAPIER.World | null;
  /** Register a callback run inside the fixed-step loop, just before each world.step(), with the
   *  fixed dt + sim time. Character movement steps here so it's deterministic and in-phase. */
  onFixedStep: (cb: (dt: number, time: number) => void) => void;
  /** Register a callback run inside the fixed-step loop, just AFTER each world.step(). A rider
   *  (the player) snapshots its post-step transform here, in lock-step with the raft's snapshot,
   *  so both interpolate off the same pair of steps. */
  onAfterStep: (cb: () => void) => void;
  /** Render-interpolation factor in [0, 1]: how far the leftover accumulator sits between the last
   *  two fixed steps. Interpolate any body riding the sim (the player) by this so it moves smoothly
   *  at the render rate, matching the interpolated raft. Valid after `update`. */
  alpha: () => number;
  /** Reset every body to its spawn pose + zero velocity and re-seed the interpolation pair, so the
   *  sim starts from a KNOWN state. Used by the deterministic benchmark (and the debug "respawn"
   *  button) to make physics reproducible run-to-run. No-op until `init()` has resolved. */
  respawn: () => void;
  /** Fill the "Objects" folder (physics + raft material) and append the force-arrow
   *  diagnostic to the "Debug" folder. */
  buildGui: (folders: { objects: GUI; debug: GUI }) => void;
  dispose: () => void;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** A build's empty interior cells (voids), pre-analysed once so the per-step sea flood is cheap. */
export interface BuildVoids {
  /** Empty cells inside the material bounding box, in the build's integer grid (X right, Y up). */
  cells: [number, number, number][];
  /** Per void: does it touch a bounding-box face? Those are where the outside sea can reach in
   *  (a hull opening leaves an empty cell on the boundary), so they seed the flood when submerged. */
  exposed: boolean[];
  /** Per void: indices of its face-adjacent voids. Material cells aren't voids, so they're absent
   *  here — that's what walls the sea off. The flood walks this graph among submerged cells. */
  adjacency: number[][];
  /** Per void: is it AIR-CAPABLE — a pocket the hull could hold air in? True when the outside can't
   *  reach it by RISING + moving sideways (never descending over a rim), in the build's local frame.
   *  An orientation-independent shape property: the raft/bucket interior below the rim is enclosed,
   *  but a decorative crown's open volume ABOVE the rim is not (the sea rises into it from the side).
   *  Trapped air = enclosed AND its compartment's water level hasn't reached it (see the buoyancy loop). */
  enclosed: boolean[];
  /** Per void: which sealed COMPARTMENT it belongs to (a connected component of the ENCLOSED void
   *  graph), or -1 for an open void. An internal bulkhead splits a hull into two → ids 0 and 1. Each
   *  compartment floods to its own water level, so a breached bay doesn't flood a sealed neighbour. */
  compartment: number[];
}

/**
 * Pre-analyse a build's empty INTERIOR cells (the pockets a hull could hold air or water in) into the
 * adjacency graph, `enclosed` mask, and `compartment` ids the flooding model uses. Interior = empty
 * cells within the material's bounding box; a hole in the shell simply leaves an empty cell ON the
 * boundary (flagged `exposed`), which is how the sea finds its way in. Pure + deterministic — a
 * function of the cell list alone, cheap at build sizes, re-run per place/break by the coming voxel
 * builder to keep the graph correct as ships change.
 *
 * This is the STATIC half of the trapped-air model; the dynamic half runs each step in the buoyancy
 * loop, advancing a per-compartment water level against the live sea surface, so which cells are air
 * vs flooded is orientation- and waterline-correct as the hull rolls and bobs — see docs/buoyancy.md.
 */
export const analyzeBuildVoids = (
  cells: [number, number, number][],
): BuildVoids => {
  if (cells.length === 0)
    return { cells: [], exposed: [], adjacency: [], enclosed: [], compartment: [] };
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const solid = new Set<string>();
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const [x, y, z] of cells) {
    solid.add(key(x, y, z));
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  const voidCells: [number, number, number][] = [];
  const voidIndex = new Map<string, number>();
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        const k = key(x, y, z);
        if (!solid.has(k)) {
          voidIndex.set(k, voidCells.length);
          voidCells.push([x, y, z]);
        }
      }
    }
  }

  const exposed = voidCells.map(
    ([x, y, z]) =>
      x === minX || x === maxX ||
      y === minY || y === maxY ||
      z === minZ || z === maxZ,
  );
  const adjacency = voidCells.map(([x, y, z]) => {
    const nbrs: number[] = [];
    const faces: [number, number, number][] = [
      [x - 1, y, z], [x + 1, y, z],
      [x, y - 1, z], [x, y + 1, z],
      [x, y, z - 1], [x, y, z + 1],
    ];
    for (const [nx, ny, nz] of faces) {
      const j = voidIndex.get(key(nx, ny, nz));
      if (j !== undefined) nbrs.push(j);
    }
    return nbrs;
  });

  // Air-capable (enclosed) mask — the orientation-INDEPENDENT half of the model. Flood the outside
  // in through voids the sea could reach by RISING or moving sideways, never DESCENDING: seed from
  // voids open on a SIDE or the BOTTOM (the sea rises in / spreads in there) but NOT a top-only
  // opening (it can't rain down over a rim), then spread to non-lower neighbours. Reached = open;
  // the rest are enclosed pockets that hold air below a rim (raft/bucket interior) — while a crown's
  // open volume above the rim is reached from the side and correctly stays NOT air.
  const open = voidCells.map(
    ([x, y, z]) => x === minX || x === maxX || z === minZ || z === maxZ || y === minY,
  );
  const encStack: number[] = [];
  for (let i = 0; i < open.length; i++) if (open[i]) encStack.push(i);
  while (encStack.length > 0) {
    const i = encStack.pop();
    if (i === undefined) break;
    const yi = voidCells[i][1];
    for (const j of adjacency[i]) {
      if (open[j] || voidCells[j][1] < yi) continue; // skip already-open and downward (over-a-rim) moves
      open[j] = true;
      encStack.push(j);
    }
  }
  const enclosed = open.map((o) => !o);

  // Group the enclosed voids into COMPARTMENTS — connected components of the enclosed graph, walking
  // `adjacency` but only enclosed→enclosed (an open void breaks the connection, which is how a
  // bulkhead sealing a hull into two bays yields two compartments). Open voids get -1. Each
  // compartment floods to its own water level in the buoyancy loop.
  const compartment = voidCells.map(() => -1);
  let compartmentCount = 0;
  const compStack: number[] = [];
  for (let i = 0; i < voidCells.length; i++) {
    if (!enclosed[i] || compartment[i] !== -1) continue;
    const id = compartmentCount++;
    compartment[i] = id;
    compStack.push(i);
    while (compStack.length > 0) {
      const c = compStack.pop();
      if (c === undefined) break;
      for (const j of adjacency[c]) {
        if (enclosed[j] && compartment[j] === -1) {
          compartment[j] = id;
          compStack.push(j);
        }
      }
    }
  }

  return { cells: voidCells, exposed, adjacency, enclosed, compartment };
};

/** Per compartment: its enclosed-void cell indices, and the OPENING indices — the void cells where
 *  the sea meets the compartment. Two kinds, both taken at their own world height in the buoyancy
 *  loop: (a) an EXPOSED compartment cell — a hole flush with the hull surface, e.g. an open-top rim,
 *  which the sea touches directly; and (b) an OPEN void face-adjacent to the compartment — where it
 *  meets already-open interior volume (a side/bottom breach). A pure derivation of `analyzeBuildVoids`
 *  output, done once per build. A fully sealed compartment has NO openings → it never floods (keeps
 *  its air at any depth); every other fills through its openings toward the external waterline. */
export interface Compartments {
  /** cells[c] = enclosed-void indices making up compartment c. */
  cells: number[][];
  /** openings[c] = void indices where the sea meets compartment c (deduped): its own exposed cells
   *  plus the open voids adjacent to it. */
  openings: number[][];
}

export const groupCompartments = (voids: BuildVoids): Compartments => {
  let count = 0;
  for (const c of voids.compartment) if (c + 1 > count) count = c + 1;
  const cells: number[][] = Array.from({ length: count }, () => []);
  const openingSets: Set<number>[] = Array.from({ length: count }, () => new Set<number>());
  voids.compartment.forEach((c, i) => {
    if (c === -1) return;
    cells[c].push(i);
    // (a) An exposed compartment cell is itself a hole flush with the hull (an open-top rim / mouth):
    // the sea touches it directly, so it's an opening at its own height — the only openings an
    // upright open-top hull has, since nothing exists above the bounding box to be an open neighbour.
    if (voids.exposed[i]) openingSets[c].add(i);
    // (b) An open void face-adjacent to the compartment is where it meets already-open interior
    // volume that reaches the sea (a side or bottom breach).
    for (const j of voids.adjacency[i]) {
      if (voids.compartment[j] === -1) openingSets[c].add(j);
    }
  });
  return { cells, openings: openingSets.map((s) => [...s]) };
};

/**
 * The target water FILL FRACTION (0..1 of the compartment's cell span) a compartment seeks THIS step.
 * The fraction is the persistent state — it's POSE-INVARIANT, so it tracks the hull as it bobs/sinks/
 * rolls (a world-height level would freeze at spawn and spuriously flood cells as the body descends).
 * `ext` is the external sea surface at the compartment; `openingHeights` are its holes' world heights
 * (empty = fully sealed); `currentFill` is last step's fraction; `dryFloor`/`wetCeil` bound the
 * compartment's cells this pose (so `fracBelow(y)` = how full it is if the water surface sits at world
 * height `y`, treating the compartment as a uniform column — exact for boxes/buckets).
 *
 * - Sealed (no openings) → unchanged: no water can enter or leave, so it keeps its air at any depth.
 * - A hole underwater (below `ext`) → fill toward SEA LEVEL (`fracBelow(ext)`). We deliberately don't
 *   cap at the highest hole to trap air above it (a diving-bell seal) — not worth it at 0.5 m voxels,
 *   so any submerged hole simply floods the compartment.
 * - Otherwise (all holes above water) → drain out the LOWEST hole (`min(currentFill, fracBelow(lowest))`);
 *   water below that hole is trapped and can't run uphill out.
 *
 * The caller rate-limits the move toward this target (see the buoyancy loop). Pure.
 */
export const compartmentTargetFill = (
  openingHeights: number[],
  ext: number,
  currentFill: number,
  dryFloor: number,
  wetCeil: number,
): number => {
  const span = Math.max(wetCeil - dryFloor, 1e-6);
  const fracBelow = (y: number) => clamp((y - dryFloor) / span, 0, 1);
  if (openingHeights.length === 0) return currentFill;
  let lowest = Infinity;
  let anySubmerged = false;
  for (const h of openingHeights) {
    if (h < lowest) lowest = h;
    if (h < ext) anySubmerged = true;
  }
  return anySubmerged ? fracBelow(ext) : Math.min(currentFill, fracBelow(lowest));
};

// Merge a shape's voxel boxes into ONE geometry with continuous, body-local, per-face planar
// UVs (project each face onto its in-plane axes, scaled by WOOD_TILE). Because the UVs come from
// the voxel's body-local position rather than the box's own 0..1 face coords, the plank texture
// flows unbroken across the whole build — no per-voxel re-tiling — and the "tile repeat" slider
// stays seamless at any scale. Used for the raft (see the `merged` shape flag).
const buildMergedVoxelGeometry = (offsets: THREE.Vector3[]): THREE.BufferGeometry => {
  const geoms = offsets.map((o) => {
    const g = new THREE.BoxGeometry(VOXEL, VOXEL, VOXEL);
    g.translate(o.x, o.y, o.z);
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const uv = g.attributes.uv;
    for (let k = 0; k < pos.count; k++) {
      const ax = Math.abs(nor.getX(k));
      const ay = Math.abs(nor.getY(k));
      const az = Math.abs(nor.getZ(k));
      let u: number;
      let w: number;
      if (ay >= ax && ay >= az) {
        u = pos.getX(k); // up/down face → XZ plane
        w = pos.getZ(k);
      } else if (ax >= az) {
        u = pos.getZ(k); // left/right face → ZY plane
        w = pos.getY(k);
      } else {
        u = pos.getX(k); // front/back face → XY plane
        w = pos.getY(k);
      }
      uv.setXY(k, u / WOOD_TILE, w / WOOD_TILE);
    }
    return g;
  });
  const merged = mergeGeometries(geoms);
  for (const g of geoms) g.dispose();
  // aoMap samples the second UV set; our planar UVs work for it too, so mirror uv → uv2.
  merged.setAttribute("uv2", merged.attributes.uv.clone());
  return merged;
};

export function createPhysics(ocean: Ocean, shapes: Shape[] = [RAFT]): Physics {
  // `airBuoyancy` is the Stage-1 A/B switch: off, trapped-air cells contribute NO lift, so a dense
  // hull that floats on its trapped air sinks like the solid block it's built from. The direct
  // proof the enclosed air — not the material — is what floats it.
  const params = { drag: DRAG_MULTIPLIER_DEFAULT, airBuoyancy: true, fillRate: FILL_RATE_DEFAULT };

  const group = new THREE.Group();
  const boxGeometry = new THREE.BoxGeometry(VOXEL, VOXEL, VOXEL);
  const materials: THREE.MeshStandardMaterial[] = [];
  const visuals: Visual[] = [];

  // Shared wood-plank PBR material for the raft (and future wood builds). The maps live in
  // public/shipwright/; load them async and attach on success, so a missing or slow file
  // just leaves the wood-brown base colour rather than rendering the raft black.
  const texLoader = new THREE.TextureLoader();
  const woodMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x6b4f3a, // wood-brown FALLBACK; reset to white once the diffuse map loads (below),
    // so the map shows its true colour instead of being tinted darker by this multiplier.
    roughness: 0.85, // matte deck timber
    metalness: 0,
    // DRY weathered wood is ~non-reflective: the default dielectric specular (F0 ≈ 0.04)
    // Fresnel-boosts at grazing angles into a bright sky/sun sheen the flat deck shows across
    // its whole face → ACES desaturates the clipped highlight to white (the "metal deck" bug).
    // Zero it out for a fully matte deck with no sun hotspot; raise the "specular" slider later
    // when the deck is WET (spray/waves) for that case's sheen.
    specularIntensity: 0,
    envMapIntensity: 0.3, // ambient fill only
    // Strong normal + an AO map are what stop the deck reading as a flat brown decal: normal
    // relief needs a raking sun to show (a flat deck lit from overhead shows little), so lean on
    // it hard; AO darkens the plank seams/crevices in AMBIENT light, giving depth at ANY sun angle.
    normalScale: new THREE.Vector2(2.5, 2.5),
  });
  const woodTextures: THREE.Texture[] = [];
  const loadWood = (
    file: string,
    apply: (t: THREE.Texture) => void,
    srgb: boolean,
  ) => {
    texLoader.load(`/shipwright/${file}`, (t) => {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      woodTextures.push(t);
      apply(t);
      woodMaterial.needsUpdate = true;
    });
  };
  loadWood(
    "wood_planks_diff.jpg",
    (t) => {
      woodMaterial.map = t;
      woodMaterial.color.setHex(0xffffff); // drop the brown fallback tint now the real map is here
    },
    true,
  );
  loadWood("wood_planks_nor.jpg", (t) => (woodMaterial.normalMap = t), false);
  loadWood("wood_planks_rough.jpg", (t) => (woodMaterial.roughnessMap = t), false);
  loadWood("wood_planks_ao.jpg", (t) => (woodMaterial.aoMap = t), false);

  // Reused scratch objects — the per-frame loops must not allocate.
  const tmpQuat = new THREE.Quaternion();
  const tmpPos = new THREE.Vector3();
  const tmpVec = new THREE.Vector3();
  const wvOut = new THREE.Vector3();
  const dummy = new THREE.Object3D();

  // Pose one piece at a given world transform. A merged (single) mesh already bakes the voxel
  // layout into its geometry, so it just takes the body pose whole; an instanced mesh writes one
  // matrix per voxel (pose applied to each local offset). Used for the spawn pose and per frame.
  const placeInstances = (
    v: Visual,
    pos: THREE.Vector3,
    quat: THREE.Quaternion,
  ) => {
    if (v.single) {
      v.mesh.position.copy(pos);
      v.mesh.quaternion.copy(quat);
      return;
    }
    const im = v.mesh as THREE.InstancedMesh;
    for (let j = 0; j < v.offsets.length; j++) {
      tmpVec.copy(v.offsets[j]).applyQuaternion(quat).add(pos);
      dummy.position.copy(tmpVec);
      dummy.quaternion.copy(quat);
      dummy.updateMatrix();
      im.setMatrixAt(j, dummy.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
  };

  const rowCount = shapes.reduce((n, s) => n + (s.spawnOverride ? 0 : 1), 0);
  let rowIndex = 0;
  let arrowCursor = 0;
  shapes.forEach((shape, i) => {
    const n = shape.cells.length;
    // Centre the cells on their centroid so the body origin sits at the middle of
    // the shape and instance offsets are symmetric about it.
    let cxSum = 0;
    let cySum = 0;
    let czSum = 0;
    for (const [cx, cy, cz] of shape.cells) {
      cxSum += cx;
      cySum += cy;
      czSum += cz;
    }
    const cxMean = cxSum / n;
    const cyMean = cySum / n;
    const czMean = czSum / n;
    const offsets = shape.cells.map(
      ([cx, cy, cz]) =>
        new THREE.Vector3(
          (cx - cxMean) * VOXEL,
          (cy - cyMean) * VOXEL,
          (cz - czMean) * VOXEL,
        ),
    );
    // Empty interior cells (voids) of this build + their compartments, in the SAME body-local frame
    // as `offsets` (centred on the material centroid). Each step the compartment water levels split
    // these into trapped air (buoyancy-only) and flooded (water weight) — see applyBuoyancy.
    // Pre-analysed once here; a pure recompute of the cell list, ready for the voxel builder to re-run
    // on every place/break.
    const voids = analyzeBuildVoids(shape.cells);
    const voidOffsets = voids.cells.map(
      ([cx, cy, cz]) =>
        new THREE.Vector3(
          (cx - cxMean) * VOXEL,
          (cy - cyMean) * VOXEL,
          (cz - czMean) * VOXEL,
        ),
    );
    const voidCount = voidOffsets.length;
    // Compartments: per compartment its cell + opening void indices, its body-local centroid (mean of
    // its cell offsets, where the buoyancy loop samples the external waterline), and its footprint
    // (mean cells per vertical layer — the orifice fill-rate denominator).
    const { cells: compartmentCells, openings: compartmentOpenings } = groupCompartments(voids);
    const compartmentCentroidLocal = compartmentCells.map((cellIdxs) => {
      const centroid = new THREE.Vector3();
      for (const idx of cellIdxs) centroid.add(voidOffsets[idx]);
      if (cellIdxs.length > 0) centroid.multiplyScalar(1 / cellIdxs.length);
      return centroid;
    });
    const compartmentFootprint = Float32Array.from(compartmentCells, (cellIdxs) => {
      if (cellIdxs.length === 0) return 1;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const idx of cellIdxs) {
        const cy = voids.cells[idx][1];
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
      }
      return cellIdxs.length / (maxY - minY + 1); // cells ÷ vertical span (layers) = mean cross-section
    });

    // Textured builds share the wood material; the rest get a flat colour we own + dispose.
    let material: THREE.MeshStandardMaterial;
    if (shape.textured === true) {
      material = woodMaterial;
    } else {
      material = new THREE.MeshStandardMaterial({
        color: shape.color,
        roughness: 0.6,
        metalness: 0.05,
      });
      materials.push(material);
    }
    // A `merged` build renders as one Mesh (continuous-UV geometry, posed whole); the rest
    // render as per-voxel instances of the shared box.
    const single = shape.merged === true;
    const mesh: THREE.InstancedMesh | THREE.Mesh = single
      ? new THREE.Mesh(buildMergedVoxelGeometry(offsets), material)
      : new THREE.InstancedMesh(boxGeometry, material, n);
    // Instances/merged meshes are translated metres from the origin and drift as they float, so
    // the origin-centred bounding sphere would wrongly cull the whole mesh at some angles. These
    // are tiny — just always draw them.
    mesh.frustumCulled = false;
    group.add(mesh);

    let spawnPos: THREE.Vector3;
    if (shape.spawnOverride) {
      const [ox, oy, oz] = shape.spawnOverride;
      spawnPos = new THREE.Vector3(ox, oy, oz);
    } else {
      spawnPos = new THREE.Vector3(
        (rowIndex - (rowCount - 1) / 2) * SPAWN_SPACING,
        SPAWN_HEIGHT,
        SPAWN_Z,
      );
      rowIndex++;
    }
    // Upright shapes drop level (stability test); plates get a fixed, deterministic
    // (index-derived, no randomness) tilt so they enter at an angle and self-right.
    const axis = new THREE.Vector3(1, 0.3 * i, 0.6).normalize();
    const angle = shape.upright === true ? 0 : 0.4 + i * 0.15;
    const spawnQuat = new THREE.Quaternion().setFromAxisAngle(axis, angle);

    const v: Visual = {
      mesh,
      single,
      offsets,
      voidOffsets,
      voidEnclosed: voids.enclosed,
      voidCompartment: voids.compartment,
      voidWorld: new Float32Array(voidCount * 3),
      voidSubmerged: new Float32Array(voidCount),
      voidFlooded: new Uint8Array(voidCount),
      compartmentCells,
      compartmentOpenings,
      compartmentCentroidLocal,
      compartmentFloodLevel: new Float32Array(compartmentCells.length),
      compartmentFootprint,
      compartmentWater: new Float32Array(compartmentCells.length), // fill fraction, starts 0 (dry)
      spawnPos,
      spawnQuat,
      prevPos: spawnPos.clone(),
      prevQuat: spawnQuat.clone(),
      currPos: spawnPos.clone(),
      currQuat: spawnQuat.clone(),
      arrowBase: arrowCursor,
      density: shape.density ?? VOXEL_DENSITY,
    };
    visuals.push(v);
    placeInstances(v, spawnPos, spawnQuat);
    arrowCursor += n + voidCount;
  });

  // Buoyancy points = every visual's material voxels + its trapped-air cells. Allocate the flat
  // force/pos/arrow arrays now the counts are known. (Static per build today; when the voxel
  // builder edits a ship at runtime these reallocate alongside the recomputed air cells.)
  const totalBuoyancyPoints = arrowCursor;
  const forceArr = Array.from({ length: totalBuoyancyPoints }, () => new THREE.Vector3());
  const posArr = Array.from({ length: totalBuoyancyPoints }, () => new THREE.Vector3());

  // Per-point buoyancy-force debug overlay (off by default). One arrow per buoyancy point,
  // positioned + scaled each frame from the last forces the sim applied. Built in the same
  // contiguous order as `arrowBase`: each visual's material voxels (teal) then its void cells
  // (blue), so the trapped air's lift is visible on its own (flooded voids apply no force → hidden).
  const arrowGroup = new THREE.Group();
  arrowGroup.visible = false;
  group.add(arrowGroup);
  const arrows: THREE.ArrowHelper[] = [];
  const addArrow = (color: number) => {
    const arrow = new THREE.ArrowHelper(UP, ORIGIN, 1, color, 0.3, 0.2);
    arrow.visible = false;
    arrowGroup.add(arrow);
    arrows.push(arrow);
  };
  for (const v of visuals) {
    for (let j = 0; j < v.offsets.length; j++) addArrow(ARROW_COLOR);
    for (let j = 0; j < v.voidOffsets.length; j++) addArrow(AIR_ARROW_COLOR);
  }

  // Trapped-air x-ray overlay (off by default): a box filling each cell the sea DIDN'T reach (i.e.
  // trapped air), drawn with depth test OFF so it shows THROUGH the opaque hull (a lidded or deep
  // hull hides it otherwise) — the direct way to eyeball what the per-step flood classified. As a
  // hull rolls or swamps, cells switch between air and flooded, so the glow updates live. ADDITIVE
  // blending makes the stacked cells glow brighter the deeper the pocket. Boxes are inset to read as
  // a floating inner volume; posed + counted each frame in syncMeshes from the last step's flood.
  const totalVoidCells = visuals.reduce((sum, v) => sum + v.voidOffsets.length, 0);
  const airBoxGeometry = new THREE.BoxGeometry(VOXEL * 0.85, VOXEL * 0.85, VOXEL * 0.85);
  const airOverlayMaterial = new THREE.MeshBasicMaterial({
    color: AIR_OVERLAY_COLOR,
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });
  const airOverlay = new THREE.InstancedMesh(
    airBoxGeometry,
    airOverlayMaterial,
    Math.max(totalVoidCells, 1), // ≥1 buffer; only the trapped-air subset is drawn (count set per frame)
  );
  airOverlay.count = 0; // set each frame in syncMeshes to the current trapped-air-cell count
  airOverlay.frustumCulled = false;
  airOverlay.renderOrder = 999; // draw last so the transparent x-ray composites over the scene
  airOverlay.visible = true; // on by default — the trapped-air x-ray is the main debugging aid now
  group.add(airOverlay);

  // Rapier is loaded async (init); until then there's no world and update no-ops.
  // `bodies` is index-parallel to `visuals` once init resolves.
  let world: RAPIER.World | null = null;
  const bodies: RAPIER.RigidBody[] = [];
  const fixedStepCallbacks: ((dt: number, time: number) => void)[] = [];
  const afterStepCallbacks: (() => void)[] = [];
  let accumulator = 0;
  let interpAlpha = 0; // leftover-accumulator fraction in [0,1] for render interpolation (see update)
  let simFailed = false; // set if Rapier's WASM ever traps — we then stop stepping (see update)

  // Local water velocity = analytic time-derivative of the Gerstner particle ride
  // at this (x, z), by central finite difference. This is what the drag nudges the
  // body toward, so it rides the orbital motion emergently. (Approximation: we treat
  // the voxel's displaced world (x, z) as a rest coordinate rather than Newton-
  // inverting it — negligible at our steepness, where horizontal displacement is small.)
  const waterVelocity = (x: number, z: number, time: number): THREE.Vector3 => {
    const p1 = ocean.sampleParticle(x, z, time + VELOCITY_EPS).position;
    const p0 = ocean.sampleParticle(x, z, time - VELOCITY_EPS).position;
    return wvOut.subVectors(p1, p0).multiplyScalar(1 / (2 * VELOCITY_EPS));
  };

  // Apply the per-voxel buoyancy + drag forces for one sub-step. Rapier's user
  // forces persist across steps, so we reset and recompute every sub-step (the
  // forces depend on the pose, which the last step changed).
  const applyBuoyancy = (time: number) => {
    for (let i = 0; i < visuals.length; i++) {
      const v = visuals[i];
      const body = bodies[i];
      const t = body.translation();
      const rot = body.rotation();
      tmpQuat.set(rot.x, rot.y, rot.z, rot.w);
      const com = body.worldCom();
      const lin = body.linvel();
      const ang = body.angvel();
      body.resetForces(false);
      body.resetTorques(false);

      for (let j = 0; j < v.offsets.length; j++) {
        const gi = v.arrowBase + j;
        tmpVec.copy(v.offsets[j]).applyQuaternion(tmpQuat);
        const wx = tmpVec.x + t.x;
        const wy = tmpVec.y + t.y;
        const wz = tmpVec.z + t.z;
        posArr[gi].set(wx, wy, wz);

        // How much of this voxel's height is under the water surface right now.
        const surface = ocean.sampleSurface(wx, wz, time);
        const submerged = clamp((surface.height - (wy - HALF)) / VOXEL, 0, 1);
        if (submerged <= 0) {
          forceArr[gi].set(0, 0, 0);
          continue; // fully clear of the water — free flight under gravity alone
        }

        // Archimedes: up-force = weight of displaced water = ρ·g·(submerged vol).
        const buoyancy = WATER_DENSITY * GRAVITY * submerged * VOXEL_VOLUME;

        // Hydrodynamic drag toward the local water velocity. Point velocity of this
        // voxel is linvel + angvel × r (r from the centre of mass), so the drag
        // resists both translation and spin — damping toward the orbit, not toward
        // rest. The coefficient is linear + quadratic in the relative speed (the
        // quadratic term is the real ½·ρ·Cd·A·v² water resistance), scaled by how
        // submerged the voxel is and the user's drag multiplier.
        const wv = waterVelocity(wx, wz, time);
        const rx = wx - com.x;
        const ry = wy - com.y;
        const rz = wz - com.z;
        const relx = wv.x - (lin.x + (ang.y * rz - ang.z * ry));
        const rely = wv.y - (lin.y + (ang.z * rx - ang.x * rz));
        const relz = wv.z - (lin.z + (ang.x * ry - ang.y * rx));
        const relSpeed = Math.hypot(relx, rely, relz);
        const dc = (DRAG_LINEAR + DRAG_QUADRATIC * relSpeed) * submerged * params.drag;
        const fx = relx * dc;
        const fy = buoyancy + rely * dc;
        const fz = relz * dc;

        forceArr[gi].set(fx, fy, fz);
        body.addForceAtPoint({ x: fx, y: fy, z: fz }, { x: wx, y: wy, z: wz }, true);
      }

      // COMPARTMENT FLOODING (Stage 3b, orientation-correct — see the module header). Three passes:
      // (1) pose every void cell in world space + note how submerged it is; (2) advance each
      // compartment's water level toward its target; (3) apply trapped-air lift OR flooded water
      // weight per cell. All keyed off real world heights, so it tracks the hull's roll + draft.
      const voidN = v.voidOffsets.length;
      for (let j = 0; j < voidN; j++) {
        tmpVec.copy(v.voidOffsets[j]).applyQuaternion(tmpQuat);
        const wx = tmpVec.x + t.x;
        const wy = tmpVec.y + t.y;
        const wz = tmpVec.z + t.z;
        v.voidWorld[j * 3] = wx;
        v.voidWorld[j * 3 + 1] = wy;
        v.voidWorld[j * 3 + 2] = wz;
        const surface = ocean.sampleSurface(wx, wz, time);
        v.voidSubmerged[j] = clamp((surface.height - (wy - HALF)) / VOXEL, 0, 1);
      }

      // Advance each compartment's fill FRACTION (0..1) — the pose-invariant flooding state, so it
      // tracks the hull as it bobs/sinks/rolls instead of freezing at a spawn world height. Sample the
      // sea at the compartment centroid (a representative external waterline — the surface varies per
      // x,z with the waves), read its openings' world heights, and step the fraction toward its target
      // (compartmentTargetFill) at the ORIFICE rate Σ_holes √(2g·head)·Cd / footprint per second (see
      // ORIFICE_C). The fraction then realizes to a world FLOOD LEVEL for this pose — dryFloor+f·span —
      // which the force loop floods cells below (world-horizontal, so water pools to a heeled hull's
      // low side). dryFloor/wetCeil come from the compartment's cell heights THIS pose.
      const orifice = params.fillRate * ORIFICE_C * FIXED_DT;
      for (let c = 0; c < v.compartmentCells.length; c++) {
        const cellIdxs = v.compartmentCells[c];
        if (cellIdxs.length === 0) continue;
        let dryFloor = Infinity;
        let wetCeil = -Infinity;
        for (const idx of cellIdxs) {
          const cy = v.voidWorld[idx * 3 + 1];
          if (cy < dryFloor) dryFloor = cy;
          if (cy > wetCeil) wetCeil = cy;
        }
        dryFloor -= HALF;
        wetCeil += HALF;
        const span = Math.max(wetCeil - dryFloor, 1e-6);

        tmpVec.copy(v.compartmentCentroidLocal[c]).applyQuaternion(tmpQuat);
        const ext = ocean.sampleSurface(tmpVec.x + t.x, tmpVec.z + t.z, time).height;

        const openingIdxs = v.compartmentOpenings[c];
        const openingHeights = openingIdxs.map((idx) => v.voidWorld[idx * 3 + 1]);

        const water = v.compartmentWater[c];
        const target = compartmentTargetFill(openingHeights, ext, water, dryFloor, wetCeil);
        // Orifice rate toward the target, as a FRACTION change: fill through holes below the sea (head
        // = sea − hole), drain through holes below the interior surface (head = level − hole). Wider/
        // deeper holes → faster. Convert the level rate to a fraction rate by dividing by the span.
        const level = dryFloor + water * span; // current interior surface (this pose) for the drain head
        const rising = target > water;
        let head = 0;
        for (const oy of openingHeights) {
          const h = (rising ? ext : level) - oy;
          if (h > 0) head += Math.sqrt(2 * GRAVITY * h);
        }
        const maxDF = (orifice * head) / v.compartmentFootprint[c] / span;
        const next = clamp(water + clamp(target - water, -maxDF, maxDF), 0, 1);
        v.compartmentWater[c] = next;
        v.compartmentFloodLevel[c] = dryFloor + next * span; // world level cells flood below
      }

      // Apply each void cell's force at its own point, so the lift/weight enters through the centre of
      // buoyancy and the righting torques stay physical. Trapped air (enclosed + above its
      // compartment's water level) displaces water at ZERO mass/drag — the material shell already
      // carries the wetted drag. A FLOODED cell instead carries water weight ρg·(1−submerged)·V down:
      // a submerged flooded cell nets ~zero (its lost air lift equals the water's weight), while water
      // perched above the sea (a heeled/awash hull) pulls down for real — the "extra water sinks the
      // boat → submerges more openings → cascade" feedback. Open voids and (A/B off) all voids: no force.
      for (let j = 0; j < voidN; j++) {
        const gi = v.arrowBase + v.offsets.length + j;
        const submerged = v.voidSubmerged[j];
        const comp = v.voidCompartment[j];
        const wx = v.voidWorld[j * 3];
        const wy = v.voidWorld[j * 3 + 1];
        const wz = v.voidWorld[j * 3 + 2];
        const flooded = v.voidEnclosed[j] && comp !== -1 && wy < v.compartmentFloodLevel[comp];
        v.voidFlooded[j] = flooded ? 1 : 0;

        let fy = 0;
        if (params.airBuoyancy) {
          if (v.voidEnclosed[j] && !flooded && submerged > 0) {
            fy = WATER_DENSITY * GRAVITY * submerged * VOXEL_VOLUME; // trapped-air lift
          } else if (flooded) {
            fy = -WATER_DENSITY * GRAVITY * (1 - submerged) * VOXEL_VOLUME; // water weight
          }
        }
        posArr[gi].set(wx, wy, wz);
        forceArr[gi].set(0, fy, 0);
        if (fy !== 0) body.addForceAtPoint({ x: 0, y: fy, z: 0 }, { x: wx, y: wy, z: wz }, true);
      }
    }
  };

  // Pose each mesh at the state interpolated between the last two fixed steps by `alpha` (the
  // leftover-accumulator fraction), so the raft moves smoothly at the RENDER rate rather than
  // snapping at the 60 Hz step rate. Without this, in first person the smoothly-drawn ocean
  // shudders against a camera glued to the discretely-stepped raft (worst in heavy seas, where
  // each step moves the raft a lot). The player is interpolated the same way with the same alpha
  // (player.ts), so the two stay locked to each other; both simply render ~one step behind, which
  // is an imperceptible constant lag against the ocean, not jitter.
  const syncMeshes = (alpha: number) => {
    const showAir = airOverlay.visible;
    let airInstance = 0;
    for (let i = 0; i < visuals.length; i++) {
      const v = visuals[i];
      tmpPos.lerpVectors(v.prevPos, v.currPos, alpha);
      tmpQuat.slerpQuaternions(v.prevQuat, v.currQuat, alpha);
      placeInstances(v, tmpPos, tmpQuat);
      // The x-ray boxes ride the interpolated body pose, drawn only for voids the sea DIDN'T reach
      // (trapped air) per the last step's flood — so the glow updates live as the hull rolls/swamps.
      if (showAir) {
        for (let j = 0; j < v.voidOffsets.length; j++) {
          // Draw only trapped air: air-capable (enclosed) and not currently flooded. Open volumes
          // (a decorative crown) and flooded compartments are skipped, so the x-ray blinks out the
          // frame a hull ships water.
          if (!v.voidEnclosed[j] || v.voidFlooded[j] === 1) continue;
          tmpVec.copy(v.voidOffsets[j]).applyQuaternion(tmpQuat).add(tmpPos);
          dummy.position.copy(tmpVec);
          dummy.quaternion.copy(tmpQuat);
          dummy.updateMatrix();
          airOverlay.setMatrixAt(airInstance++, dummy.matrix);
        }
      }
    }
    if (showAir) {
      airOverlay.count = airInstance; // only the current trapped-air cells
      airOverlay.instanceMatrix.needsUpdate = true;
    }
  };

  const updateArrows = () => {
    for (let gi = 0; gi < arrows.length; gi++) {
      const arrow = arrows[gi];
      const force = forceArr[gi];
      const mag = force.length();
      if (mag < 1) {
        arrow.visible = false;
        continue;
      }
      arrow.visible = true;
      arrow.position.copy(posArr[gi]);
      arrow.setDirection(tmpVec.copy(force).multiplyScalar(1 / mag));
      arrow.setLength(clamp(mag * ARROW_SCALE, 0.3, 5), 0.3, 0.2);
    }
  };

  const respawn = () => {
    if (!world) return;
    for (let i = 0; i < visuals.length; i++) {
      const v = visuals[i];
      const body = bodies[i];
      body.setTranslation(v.spawnPos, true);
      body.setRotation(v.spawnQuat, true);
      body.setLinvel(ZERO, true);
      body.setAngvel(ZERO, true);
      body.resetForces(true);
      body.resetTorques(true);
      v.compartmentWater.fill(0); // drain every compartment dry (fill fraction is persistent state)
      // Re-seed the interpolation pair to the spawn pose, else the next frame lerps the mesh
      // across from wherever it was floating to the spawn.
      v.prevPos.copy(v.spawnPos);
      v.currPos.copy(v.spawnPos);
      v.prevQuat.copy(v.spawnQuat);
      v.currQuat.copy(v.spawnQuat);
    }
  };

  // Runaway guard (see MAX_LINVEL/MAX_ANGVEL): after each step, scale a body's velocity back under
  // the caps and zero any non-finite one, so the next step's inputs stay bounded and the WASM solver
  // can't blow up into a trap. Only bites at extreme speeds (a heavy-sea launch / a deep sinker), so
  // it's inert during normal calm floating and keeps the sim deterministic.
  const clampVelocity = (body: RAPIER.RigidBody) => {
    const lv = body.linvel();
    const ls = Math.hypot(lv.x, lv.y, lv.z);
    if (!Number.isFinite(ls)) body.setLinvel(ZERO, true);
    else if (ls > MAX_LINVEL) {
      const s = MAX_LINVEL / ls;
      body.setLinvel({ x: lv.x * s, y: lv.y * s, z: lv.z * s }, true);
    }
    const av = body.angvel();
    const as = Math.hypot(av.x, av.y, av.z);
    if (!Number.isFinite(as)) body.setAngvel(ZERO, true);
    else if (as > MAX_ANGVEL) {
      const s = MAX_ANGVEL / as;
      body.setAngvel({ x: av.x * s, y: av.y * s, z: av.z * s }, true);
    }
  };

  return {
    object: group,
    init: async () => {
      await RAPIER.init();
      const w = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
      w.timestep = FIXED_DT;
      for (const v of visuals) {
        const desc = RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(v.spawnPos.x, v.spawnPos.y, v.spawnPos.z)
          .setRotation(v.spawnQuat)
          .setLinearDamping(LINEAR_DAMPING)
          .setAngularDamping(ANGULAR_DAMPING)
          .setCanSleep(false); // buoyancy keeps nudging — don't let bodies sleep
        const body = w.createRigidBody(desc);
        for (const offset of v.offsets) {
          const collider = RAPIER.ColliderDesc.cuboid(HALF, HALF, HALF)
            .setTranslation(offset.x, offset.y, offset.z)
            .setDensity(v.density)
            .setFriction(0.5)
            .setRestitution(0);
          w.createCollider(collider, body);
        }
        bodies.push(body);
      }
      world = w;
    },
    update: (delta, time) => {
      if (!world || simFailed) return;
      accumulator += delta;
      let steps = 0;
      // Sample buoyancy at `time` — the SAME clock the ocean is drawn at — so bodies
      // float on the on-screen water. (A separate sim clock drifts out of phase, since
      // it seeds at 0 on Rapier's async load, and the bodies then ride an invisible,
      // offset sea.) Fixed dt is only the integration step, not the sampling clock.
      // The whole stepping loop is guarded: if Rapier's WASM traps (a solver blow-up), it
      // can't recover, so we stop stepping and freeze the bodies rather than hard-freezing
      // the app — the scene keeps rendering the last pose.
      try {
        while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
          applyBuoyancy(time);
          for (const cb of fixedStepCallbacks) cb(FIXED_DT, time);
          world.step();
          // Snapshot each body's post-step transform (shifting the last into `prev`) for render
          // interpolation, then let anything else riding the sim (the player) snapshot in lock-step.
          for (let i = 0; i < visuals.length; i++) {
            const v = visuals[i];
            clampVelocity(bodies[i]); // keep the next step's inputs bounded — no solver explosion
            const tr = bodies[i].translation();
            const rot = bodies[i].rotation();
            v.prevPos.copy(v.currPos);
            v.prevQuat.copy(v.currQuat);
            v.currPos.set(tr.x, tr.y, tr.z);
            v.currQuat.set(rot.x, rot.y, rot.z, rot.w);
          }
          for (const cb of afterStepCallbacks) cb();
          accumulator -= FIXED_DT;
          steps++;
        }
      } catch (err) {
        simFailed = true;
        console.warn("Shipwright physics halted after a solver error; freezing bodies.", err);
        return;
      }
      if (steps === MAX_SUBSTEPS) accumulator = 0; // drop backlog past the cap
      interpAlpha = clamp(accumulator / FIXED_DT, 0, 1);
      syncMeshes(interpAlpha);
      if (arrowGroup.visible) updateArrows();
    },
    world: () => world,
    onFixedStep: (cb) => {
      fixedStepCallbacks.push(cb);
    },
    onAfterStep: (cb) => {
      afterStepCallbacks.push(cb);
    },
    alpha: () => interpAlpha,
    respawn,
    buildGui: ({ objects, debug }) => {
      const folder = objects.addFolder("Physics");
      folder.add({ respawn }, "respawn").name("respawn shapes");
      folder.add(params, "drag", 0, 3, 0.05).name("water drag");
      // Stage-1 A/B: turn the enclosed-air buoyancy off to watch a sealed dense hull sink (respawn
      // it after to reset). On = hulls float by the air they enclose; off = every voxel for itself.
      folder.add(params, "airBuoyancy").name("air-cavity buoyancy");
      // Multiplier on the orifice flood rate (see ORIFICE_C): a hole's inflow scales with its area +
      // depth, this just tunes the overall pace live. Higher = swamped hulls founder sooner.
      folder.add(params, "fillRate", 0, 3, 0.05).name("flood rate");

      // Live wood-material tuning (best judged at full framerate on a real GPU). `roughness`
      // trades gloss vs. how much the normal-map relief reads; `tile` is the texture repeats
      // per 0.5 m voxel face — integer values stay seamless across the deck (the map is
      // tileable), lower values enlarge the planks but reveal a per-voxel seam.
      const wood = objects.addFolder("Raft wood");
      wood.add(woodMaterial, "roughness", 0, 1, 0.01);
      // Specular reflectance. The default (1 → F0 ≈ 0.04) Fresnel-boosts at grazing angles into a
      // bright sky/sun sheen that blows the flat deck white; keep it low for matte weathered wood.
      wood.add(woodMaterial, "specularIntensity", 0, 1, 0.01).name("specular");
      wood.add(woodMaterial, "aoMapIntensity", 0, 2, 0.05).name("ao"); // crevice depth, any sun angle
      wood.add(woodMaterial, "envMapIntensity", 0, 1.5, 0.05).name("env reflect");
      const woodProxy = { normalDepth: woodMaterial.normalScale.x, tile: 1 };
      wood
        .add(woodProxy, "normalDepth", 0, 3, 0.05)
        .name("normal depth")
        .onChange((v: number) => woodMaterial.normalScale.set(v, v));
      wood
        .add(woodProxy, "tile", 0.25, 4, 0.25)
        .name("tile repeat")
        .onChange((v: number) => {
          for (const t of woodTextures) t.repeat.set(v, v);
        });

      // Force-vector arrows + trapped-air x-ray are diagnostic overlays, not look controls — Debug.
      const toggles = { arrows: false, trappedAir: true };
      debug
        .add(toggles, "arrows")
        .name("force arrows")
        .onChange((on: boolean) => {
          arrowGroup.visible = on;
          if (!on) for (const arrow of arrows) arrow.visible = false;
        });
      debug
        .add(toggles, "trappedAir")
        .name("trapped-air cells")
        .onChange((on: boolean) => {
          airOverlay.visible = on;
        });
    },
    dispose: () => {
      world?.free();
      boxGeometry.dispose();
      airBoxGeometry.dispose();
      airOverlay.dispose();
      airOverlayMaterial.dispose();
      woodMaterial.dispose();
      for (const t of woodTextures) t.dispose();
      for (const material of materials) material.dispose();
      for (const v of visuals) {
        // Merged builds own a unique geometry to free; instanced builds share `boxGeometry`
        // (freed above) and just release their instance buffers via InstancedMesh.dispose().
        if (v.single) v.mesh.geometry.dispose();
        else (v.mesh as THREE.InstancedMesh).dispose();
      }
      for (const arrow of arrows) arrow.dispose();
    },
  };
}

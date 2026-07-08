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
 * STAGE 1 — air-cavity buoyancy (see docs/buoyancy.md). A build's empty cells are
 * classified by flood-fill (`findTrappedAirCells`): pockets the outside sea can't reach
 * — walled off on the sides and bottom, open top allowed (a boat hull below its gunwale
 * counts, not just a sealed box) — are TRAPPED AIR. Those cells get buoyancy too — they
 * displace water at ZERO mass — so a dense shell around a cavity floats high, like a real
 * hull, instead of every voxel needing to be lighter than water. The classifier is a PURE
 * function of the cell list (not baked into the colliders or merged mesh), so the coming
 * Minecraft-style voxel builder can re-run it on every place/break to keep the cavities
 * correct as players rebuild the ship in real time — the air set stays a cheap, standalone
 * recompute, never entangled with the collider/mesh rebuild.
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

// Spawn layout: a deterministic row dropped from a small height. Plate shapes get a
// fixed (non-random — determinism) tilt so they enter at an angle and must
// self-right; `upright` shapes drop level so we can watch whether they stay standing
// or tip over on the chop.
const SPAWN_SPACING = 4;
const SPAWN_HEIGHT = 1.5;
const SPAWN_Z = -6;

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
  spawnOverride: [-10, 3, -12],
  cells: buildSealedHull(),
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
    spawnOverride: [9, 0.2, 0],
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
    spawnOverride: [-5, 3, -16],
    cells: omitCell(buildHollowBox(4, 4, 4), 0, 2, 2),
  },
  {
    // Hole in the FLOOR: the sea rises up through the breach, so it FLOODS too (tests +Y inflow).
    name: "Breached (bottom)",
    color: 0xd9694f,
    upright: true,
    spawnOverride: [0, 3, -16],
    cells: omitCell(buildHollowBox(4, 4, 4), 2, 0, 2),
  },
  {
    // Sealed box split by an internal wall → TWO separate trapped-air pockets in one hull.
    name: "Bulkhead",
    color: 0x6fae4f,
    upright: true,
    spawnOverride: [6, 3, -16],
    cells: buildBulkheadHull(),
  },
  {
    // Open TOP (no lid): the walls + floor still trap a tall air column below the rim — the open-top
    // hull case that floats a boat. Overlay shows a full-height air stack.
    name: "Bucket",
    color: 0x4fae9e,
    upright: true,
    spawnOverride: [-3, 4, -22],
    cells: omitFace(buildHollowBox(4, 6, 4), 1, 5),
  },
  {
    // Closed top, open BOTTOM (an inverted cup / diving bell): the sea rises in and it FLOODS. A
    // real diving bell would hold air; our model doesn't (rare for ships) — the documented limit.
    name: "Open-bottom cup",
    color: 0x8f6fd9,
    upright: true,
    spawnOverride: [3, 3, -22],
    cells: omitFace(buildHollowBox(4, 4, 4), 1, 0),
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
  /** Local trapped-air-cell centres (metres), SAME body frame as `offsets`. Buoyancy only —
   *  they displace water (float the hull on trapped air) but have NO mass, collider, or mesh. */
  airOffsets: THREE.Vector3[];
  spawnPos: THREE.Vector3;
  spawnQuat: THREE.Quaternion;
  /** Post-step transforms of the last two fixed steps, interpolated at render time (see syncMeshes). */
  prevPos: THREE.Vector3;
  prevQuat: THREE.Quaternion;
  currPos: THREE.Vector3;
  currQuat: THREE.Quaternion;
  /** Start index of this piece's buoyancy points in the flat force/pos/arrow arrays: its
   *  material voxels (`offsets.length`) then its trapped-air cells (`airOffsets.length`). */
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
  /** Fill the "Objects" folder (physics + raft material) and append the force-arrow
   *  diagnostic to the "Debug" folder. */
  buildGui: (folders: { objects: GUI; debug: GUI }) => void;
  dispose: () => void;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/**
 * Classify a build's empty cells and return the ones that hold TRAPPED AIR — the pockets a hull
 * encloses that displace water (buoyancy) at zero mass. "Trapped" means the open sea can't reach
 * the cell because material walls it off on the sides and bottom. The TOP may be OPEN: an upright
 * boat hull floats on the air below its gunwale even with no lid, as long as water doesn't crest
 * the rim — so an open-topped hull's interior counts, not just a fully-sealed box.
 *
 * The trick is the flood that stands in for the sea: it spreads SIDEWAYS (±X, ±Z) and rises UP
 * (+Y — so it climbs in through a breach in the bottom and floods) but never falls DOWN (−Y) over
 * a rim into an open-top hull. Empty cells the flood can't reach = trapped air. Consequences:
 * a solid deck + perimeter wall (the raft) traps the air layer inside the wall; a hole in the
 * SIDE or BOTTOM floods; a fully-sealed box traps its whole cavity.
 *
 * IMPORTANT — this is a BUILD-TIME classification in the body's LOCAL frame, with local +Y hard-
 * coded as "up". It is only correct near the DESIGN (upright) orientation. Gravity and the sea are
 * world-fixed while the hull rotates, so an OPEN pocket's air is orientation-dependent: capsize the
 * bucket and its "open top" now faces down — the air should glug out, but this static set still
 * floats it on phantom air. FULLY-SEALED cavities are the exception: they hold their air in any
 * pose, so the classification stays correct for them however they tumble. Making the open cases
 * accurate under roll needs the per-step world-space flood-fill of Stage 3 (see docs/buoyancy.md),
 * which recomputes trapped air against the actual orientation + water level each frame.
 *
 * Related simplification: this assumes rims stay above the waterline (intact hull, calm-ish sea).
 * Dynamic swamping over a rim, draining, and per-compartment water level are likewise Stage 3;
 * until then a trapped-air cell is buoyant whenever it's below the surface. (An exotic open-BOTTOM
 * pocket — a diving bell — reads as flooded here, which is fine for ships.)
 *
 * Face-connectivity (6-neighbour) matches how water flows in a voxel model: a purely diagonal gap
 * doesn't connect. Pure + deterministic — a function of the cell list alone, cheap at build sizes,
 * re-run per place/break by the coming voxel builder to keep the cavities correct as ships change.
 */
export const findTrappedAirCells = (
  cells: [number, number, number][],
): [number, number, number][] => {
  if (cells.length === 0) return [];
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
  // Pad by one so the flood starts in guaranteed-empty space wrapping the build.
  const loX = minX - 1;
  const loY = minY - 1;
  const loZ = minZ - 1;
  const hiX = maxX + 1;
  const hiY = maxY + 1;
  const hiZ = maxZ + 1;

  // Seed the whole bottom pad layer (all empty, below the build), then flood sideways + UP — never
  // down. Rising covers every outside cell (the sea reaches anything via up + sideways) and enters
  // bottom breaches; refusing to descend keeps it from raining over a rim into an open-top hull.
  const reached = new Set<string>();
  const stack: [number, number, number][] = [];
  for (let x = loX; x <= hiX; x++) {
    for (let z = loZ; z <= hiZ; z++) {
      reached.add(key(x, loY, z));
      stack.push([x, loY, z]);
    }
  }
  while (stack.length > 0) {
    const cell = stack.pop();
    if (!cell) break;
    const [x, y, z] = cell;
    const neighbours: [number, number, number][] = [
      [x - 1, y, z], [x + 1, y, z],
      [x, y, z - 1], [x, y, z + 1],
      [x, y + 1, z], // UP only — the sea rises into a breach but never falls down over a rim
    ];
    for (const [nx, ny, nz] of neighbours) {
      if (nx < loX || nx > hiX || ny < loY || ny > hiY || nz < loZ || nz > hiZ) continue;
      const k = key(nx, ny, nz);
      if (reached.has(k) || solid.has(k)) continue;
      reached.add(k);
      stack.push([nx, ny, nz]);
    }
  }

  // Empty cells inside the ORIGINAL bounding box the flood never reached = trapped air.
  const trapped: [number, number, number][] = [];
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        const k = key(x, y, z);
        if (!solid.has(k) && !reached.has(k)) trapped.push([x, y, z]);
      }
    }
  }
  return trapped;
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
  const params = { drag: DRAG_MULTIPLIER_DEFAULT, airBuoyancy: true };

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
    // Trapped-air cells for this build, in the SAME body-local frame as `offsets` (centred on the
    // material centroid, so they sit correctly against the colliders). Buoyancy-only — see
    // applyBuoyancy. A pure recompute of the cell list, ready for runtime rebuilds later.
    const airOffsets = findTrappedAirCells(shape.cells).map(
      ([cx, cy, cz]) =>
        new THREE.Vector3(
          (cx - cxMean) * VOXEL,
          (cy - cyMean) * VOXEL,
          (cz - czMean) * VOXEL,
        ),
    );

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
      airOffsets,
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
    arrowCursor += n + airOffsets.length;
  });

  // Buoyancy points = every visual's material voxels + its trapped-air cells. Allocate the flat
  // force/pos/arrow arrays now the counts are known. (Static per build today; when the voxel
  // builder edits a ship at runtime these reallocate alongside the recomputed air cells.)
  const totalBuoyancyPoints = arrowCursor;
  const forceArr = Array.from({ length: totalBuoyancyPoints }, () => new THREE.Vector3());
  const posArr = Array.from({ length: totalBuoyancyPoints }, () => new THREE.Vector3());

  // Per-point buoyancy-force debug overlay (off by default). One arrow per buoyancy point,
  // positioned + scaled each frame from the last forces the sim applied. Built in the same
  // contiguous order as `arrowBase`: each visual's material voxels (teal) then its trapped-air
  // cells (blue), so the trapped air's lift is visible on its own.
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
    for (let j = 0; j < v.airOffsets.length; j++) addArrow(AIR_ARROW_COLOR);
  }

  // Trapped-air x-ray overlay (off by default): a box filling each trapped-air cell, drawn with
  // depth test OFF so the air shows THROUGH the opaque hull (a lidded or deep hull hides it
  // otherwise) — the direct way to eyeball what the flood-fill classified. ADDITIVE blending makes
  // the stacked cells glow brighter the deeper the pocket, so it reads as an unmistakable cyan
  // volume rather than a faint tint lost across the water. Boxes are slightly inset to read as a
  // floating inner volume; posed each frame in syncMeshes (they ride the floating body).
  const totalAirCells = visuals.reduce((sum, v) => sum + v.airOffsets.length, 0);
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
    Math.max(totalAirCells, 1), // InstancedMesh needs a ≥1 buffer; count set below (0 for open builds)
  );
  airOverlay.count = totalAirCells;
  airOverlay.frustumCulled = false;
  airOverlay.renderOrder = 999; // draw last so the transparent x-ray composites over the scene
  airOverlay.visible = false;
  group.add(airOverlay);

  // Rapier is loaded async (init); until then there's no world and update no-ops.
  // `bodies` is index-parallel to `visuals` once init resolves.
  let world: RAPIER.World | null = null;
  const bodies: RAPIER.RigidBody[] = [];
  const fixedStepCallbacks: ((dt: number, time: number) => void)[] = [];
  const afterStepCallbacks: (() => void)[] = [];
  let accumulator = 0;
  let interpAlpha = 0; // leftover-accumulator fraction in [0,1] for render interpolation (see update)

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

      // Trapped-air cells: they displace water (buoyancy, gated by submerged fraction) but carry
      // NO mass and NO drag — the material shell already provides the whole wetted drag surface,
      // so adding drag here would double-count it. This is what floats a hull on its trapped air.
      // Applied at each cell's own point, so the extra lift enters through the centre of buoyancy
      // and the righting torques stay physical (a flooded compartment would simply drop out of this
      // loop, losing its lift — the Stage 3 hook).
      for (let j = 0; j < v.airOffsets.length; j++) {
        const gi = v.arrowBase + v.offsets.length + j;
        if (!params.airBuoyancy) {
          forceArr[gi].set(0, 0, 0); // A/B test: kill the cavity's lift → the dense hull sinks
          continue;
        }
        tmpVec.copy(v.airOffsets[j]).applyQuaternion(tmpQuat);
        const wx = tmpVec.x + t.x;
        const wy = tmpVec.y + t.y;
        const wz = tmpVec.z + t.z;
        posArr[gi].set(wx, wy, wz);

        const surface = ocean.sampleSurface(wx, wz, time);
        const submerged = clamp((surface.height - (wy - HALF)) / VOXEL, 0, 1);
        if (submerged <= 0) {
          forceArr[gi].set(0, 0, 0);
          continue;
        }
        const buoyancy = WATER_DENSITY * GRAVITY * submerged * VOXEL_VOLUME;
        forceArr[gi].set(0, buoyancy, 0);
        body.addForceAtPoint({ x: 0, y: buoyancy, z: 0 }, { x: wx, y: wy, z: wz }, true);
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
      // The sealed-air x-ray boxes ride the same interpolated body pose as the mesh.
      if (showAir) {
        for (const off of v.airOffsets) {
          tmpVec.copy(off).applyQuaternion(tmpQuat).add(tmpPos);
          dummy.position.copy(tmpVec);
          dummy.quaternion.copy(tmpQuat);
          dummy.updateMatrix();
          airOverlay.setMatrixAt(airInstance++, dummy.matrix);
        }
      }
    }
    if (showAir) airOverlay.instanceMatrix.needsUpdate = true;
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
      // Re-seed the interpolation pair to the spawn pose, else the next frame lerps the mesh
      // across from wherever it was floating to the spawn.
      v.prevPos.copy(v.spawnPos);
      v.currPos.copy(v.spawnPos);
      v.prevQuat.copy(v.spawnQuat);
      v.currQuat.copy(v.spawnQuat);
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
      if (!world) return;
      accumulator += delta;
      let steps = 0;
      // Sample buoyancy at `time` — the SAME clock the ocean is drawn at — so bodies
      // float on the on-screen water. (A separate sim clock drifts out of phase, since
      // it seeds at 0 on Rapier's async load, and the bodies then ride an invisible,
      // offset sea.) Fixed dt is only the integration step, not the sampling clock.
      while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
        applyBuoyancy(time);
        for (const cb of fixedStepCallbacks) cb(FIXED_DT, time);
        world.step();
        // Snapshot each body's post-step transform (shifting the last into `prev`) for render
        // interpolation, then let anything else riding the sim (the player) snapshot in lock-step.
        for (let i = 0; i < visuals.length; i++) {
          const v = visuals[i];
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
    buildGui: ({ objects, debug }) => {
      const folder = objects.addFolder("Physics");
      folder.add({ respawn }, "respawn").name("respawn shapes");
      folder.add(params, "drag", 0, 3, 0.05).name("water drag");
      // Stage-1 A/B: turn the enclosed-air buoyancy off to watch a sealed dense hull sink (respawn
      // it after to reset). On = hulls float by the air they enclose; off = every voxel for itself.
      folder.add(params, "airBuoyancy").name("air-cavity buoyancy");

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
      const toggles = { arrows: false, trappedAir: false };
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

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import RAPIER from "@dimforge/rapier3d-compat";
import type GUI from "three/examples/jsm/libs/lil-gui.module.min.js";
import type { Ocean } from "./ocean";
import { MAIN_PASS_LAYER } from "./layers";
import { analyzeBuildVoids, groupCompartments, compartmentTargetFill } from "./flooding";
import { type Shape, RAFT, RAFT_DENSITY } from "./shapes";

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
 * AIR-CAVITY BUOYANCY + COMPARTMENT FLOODING. Hulls float on the air they
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
 * just floods. Rendering flooded interior water (and masking the sea out of dry interiors) is a
 * separate RENDERING follow-up that reads this sim state but adds no physics — see docs/FIDELITY.md.
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

// The six axis-aligned voxel faces: outward normal = the neighbour-cell offset across that face. A face
// is EXPOSED (wetted → it drags) only when no voxel occupies the neighbour cell. Hydrodynamic form drag
// acts per exposed face, projected onto the face normal (see applyBuoyancy), so drag becomes ANISOTROPIC:
// a hull's leading surface carries it, its buried interior does not, and a long thin hull shows little
// frontal area moving ahead but its whole flank moving sideways — lateral resistance emerges from shape.
const FACE_NORMALS: readonly [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

// Densities in kg/m³. Wood-like density sets weight + waterline: a shape settles at
// ~60% submerged (equilibrium submerged fraction = VOXEL_DENSITY / water).
const WATER_DENSITY = 1000;
const VOXEL_DENSITY = 600;
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

// Hydrodynamic drag toward the local water velocity, gated (like buoyancy) by the submerged fraction,
// so it fades to zero as a voxel leaves the water. It has two parts with DIFFERENT geometry:
//   - The QUADRATIC form drag ½·ρ·Cd·A·(u·n)² (Cd ≈ 1.1 for a flat face, A = one voxel face) is applied
//     per EXPOSED FACE, projected onto that face's normal, on windward faces only (see FACE_NORMALS +
//     applyBuoyancy). This is what makes hull drag DIRECTIONAL — a pointed bow presents few windward
//     faces, a broadside flank presents many, so shape decides how a hull tracks and turns. It dominates
//     at speed.
//   - The small LINEAR term is a near-equilibrium radiation/viscous damper, kept ISOTROPIC and applied at
//     the voxel centre — form drag vanishes as v → 0, so a linear floor prevents undamped micro-ringing —
//     sized for a LIGHT heave ζ ≈ 0.2, like a real small floater that bobs a couple of times and settles.
// Both are relative to the water, so they track the orbital motion and only resist DEVIATION from it. This stays stable at
// light damping because the wave forcing (ω ≈ 0.6 rad/s) is far below heave resonance
// (ω_n ≈ 5.7 rad/s) AND the sea can never out-accelerate gravity (ω²·a ≈ 0.6 ≪ 9.81
// m/s²), so waves physically cannot throw a float off the surface — no launch pump to
// damp against. The GUI "water drag" scales both terms live.
const DRAG_CUBE_CD = 1.1;
const DRAG_FACE_AREA = VOXEL * VOXEL;
const DRAG_QUADRATIC = 0.5 * WATER_DENSITY * DRAG_CUBE_CD * DRAG_FACE_AREA;
const DRAG_LINEAR = 200; // ≈ ζ 0.23 per voxel — light, physical
const DRAG_MULTIPLIER_DEFAULT = 1;
// Ceiling on the relative speed (m/s) the per-voxel drag is evaluated at. Above it the quadratic drag
// impulse would exceed the voxel's own momentum in one fixed step and overshoot — the numerical
// stiffness that let a fast body (kicked by a bad contact after a runtime edit) diverge to Inf inside
// world.step(). Chosen so the drag impulse stays under the body's momentum at our lightest voxel mass
// + fixed dt (no overshoot); well above any speed calm-water floating produces, so normal motion is
// untouched. See applyBuoyancy.
const DRAG_MAX_REL_SPEED = 12;

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

export interface Visual {
  /** InstancedMesh (one instance per voxel) OR, when `single`, one merged Mesh posed by the
   *  body transform. Buoyancy always uses `offsets` regardless of how it renders. */
  mesh: THREE.InstancedMesh | THREE.Mesh;
  /** True when `mesh` is a single merged Mesh (posed whole) rather than per-voxel instances. */
  single: boolean;
  /** The build's CURRENT integer grid cells (X right, Y up, Z depth). The voxel builder mutates this
   *  on place/break; every derived array below is recomputed from it (see `rebuildVoxelData`). */
  cells: [number, number, number][];
  /** The build's FIXED local-frame origin, in grid units (the centroid at creation time). Kept
   *  constant across edits so retained voxels never shift when the ship grows or shrinks: a cell's
   *  local offset is always (cell − centroid)·VOXEL. Rapier derives the true centre of mass from the
   *  colliders, so the body origin needn't sit at the COM — it just has to be stable. */
  centroid: THREE.Vector3;
  /** Each voxel's box collider, keyed by cell ("x,y,z"), so a break removes exactly one collider and
   *  a place adds one — no need to tear down and rebuild the whole compound. */
  colliders: Map<string, RAPIER.Collider>;
  /** Render material: the shared wood PBR material for textured builds, else an owned flat colour.
   *  Reused (not recreated) when the mesh is regenerated on an edit. */
  material: THREE.MeshStandardMaterial;
  /** Renders with the shared wood material (vs an owned flat colour) — decides which path regenerates. */
  textured: boolean;
  /** The dynamic body, once created in `init`/a split/a drop (null before). */
  body: RAPIER.RigidBody | null;
  /** Local voxel-centre offsets (metres), centred on the shape's centroid. */
  offsets: THREE.Vector3[];
  /** Exposed-face table (see facesFor) for the anisotropic form drag: `faceDir` is a flat list of face
   *  directions (0..5 → FACE_NORMALS), `faceStart[j]..faceStart[j+1]` slices it to voxel j's wetted
   *  faces. Rebuilt with `offsets` on every edit; walked in step with the buoyancy loop. */
  faceStart: Uint32Array;
  faceDir: Uint8Array;
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

/** A voxel the player is aiming at: the build + the cell hit (to break), the empty cell across the
 *  hit face (to place into), and the world-space hit point (for a face-anchored highlight). */
export interface VoxelHit {
  visual: Visual;
  /** The targeted voxel's grid cell — what a break removes. */
  cell: [number, number, number];
  /** The empty grid cell adjacent across the hit face — where a place adds a voxel. */
  placeCell: [number, number, number];
  /** World-space point the ray struck (origin + dir·toi). */
  point: THREE.Vector3;
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
  /** Cast a ray (world space) against the voxel bodies only (the player capsule and anything else are
   *  excluded) and return the aimed voxel — the cell hit, the empty cell across the hit face, and the
   *  hit point. Null if nothing editable is within `maxReach` metres. The builder calls this per frame
   *  for the selection highlight and on click for the edit target. No-op (null) until `init` resolves. */
  raycastVoxel: (origin: THREE.Vector3, dir: THREE.Vector3, maxReach: number) => VoxelHit | null;
  /** Add a voxel in the empty cell across the aimed face, extending that build (same material +
   *  density). Recomputes the build's colliders, buoyancy voids, and mesh. */
  placeVoxel: (hit: VoxelHit) => void;
  /** Remove the aimed voxel. If that disconnects the build into separate chunks, each chunk becomes
   *  its own dynamic body (inheriting the pose + velocity); emptying a build removes it entirely. */
  removeVoxel: (hit: VoxelHit) => void;
  /** Drop a fresh, unconnected single voxel into the world just ahead of `origin` along `dir` — a new
   *  editable body you can then build a ship onto (Q in first person). `velocity` seeds its motion (the
   *  player's, so it keeps your momentum when dropped while moving); omit for a dead drop. */
  dropVoxel: (origin: THREE.Vector3, dir: THREE.Vector3, velocity?: THREE.Vector3) => void;
  /** Register a collider for `raycastVoxel` to exclude (the player capsule — the eye is inside it, so
   *  it'd self-hit at toi 0). Call once after the player attaches. */
  setPlayerCollider: (collider: RAPIER.Collider | null) => void;
  /** Pose `target` (position + orientation) onto a build's cell at the render-interpolated transform
   *  (matches the drawn mesh, including the hull's heel). The builder poses the selection highlight
   *  with this so the outline sits squarely on the aimed voxel. */
  poseVoxel: (target: THREE.Object3D, visual: Visual, cell: [number, number, number]) => void;
  /** Is a solid voxel present at this build cell? Read-only — the builder uses it to refuse placing a
   *  fixture whose footprint would overlap existing hull. */
  hasVoxel: (visual: Visual, cell: [number, number, number]) => boolean;
  /** The current voxel-body visuals (read-only snapshot). Lets startup code seed a fixture onto the raft
   *  (`visuals()[0]`) without a raycast. */
  visuals: () => Visual[];
  /** Render-interpolation factor in [0, 1]: how far the leftover accumulator sits between the last
   *  two fixed steps. Interpolate any body riding the sim (the player) by this so it moves smoothly
   *  at the render rate, matching the interpolated raft. Valid after `update`. */
  alpha: () => number;
  /** Reset every body to its spawn pose + zero velocity and re-seed the interpolation pair, so the
   *  sim starts from a KNOWN state. Used by the deterministic benchmark (and the debug "respawn"
   *  button) to make physics reproducible run-to-run. No-op until `init()` has resolved. */
  respawn: () => void;
  /** Enable/disable contact generation on ALL colliders at once (via collision groups), leaving mass,
   *  inertia, buoyancy, and the broad-phase AABBs untouched — so it isolates Rapier's narrow-phase +
   *  solver contact cost from everything else. Used by the benchmark's `--collision off` (Option A to
   *  measure the collision-resolution share of the step). Default is enabled. */
  setCollisionEnabled: (on: boolean) => void;
  /** Turn the per-voxel hydrodynamic drag term off (with its two `sampleParticle` water-velocity
   *  evals) to isolate the drag/velocity-sampling share of the buoyancy loop — the benchmark's
   *  `--drag off` cost knob. Buoyancy up-force stays; only the drag/damping (and its evals) drop.
   *  Default enabled. Alters dynamics (undamped), so it's a COST probe, not a gameplay setting. */
  setDragEnabled: (on: boolean) => void;
  /** Add a world-space force at a world point to a body, for the CURRENT fixed step only. Call it from
   *  an `onFixedStep` callback (those run after the buoyancy pass that resets each body's forces), so the
   *  force persists into the following `world.step()` and is cleared before the next substep's buoyancy.
   *  No-op if the body isn't built yet. Used by the builder's debug engine thrust (a temporary way to
   *  feel the drag before real propulsion — see builder.ts). */
  addBodyForce: (
    visual: Visual,
    force: { x: number; y: number; z: number },
    point: { x: number; y: number; z: number },
  ) => void;
  /** Wall-clock ms of the LAST update()'s two hot phases, SUMMED across substeps: `buoyancy` = the
   *  per-voxel flood-fill + trapped-air force loop (applyBuoyancy), `solver` = Rapier's world.step().
   *  Lets the benchmark split the physics step into its two systems (thread 5). Both 0 before the
   *  first update, and when the sim is paused/failed (the loop is skipped). */
  stepTiming: () => { buoyancy: number; solver: number };
  /** Fill the "Objects" folder (physics + raft material) and append the force-arrow
   *  diagnostic to the "Debug" folder. */
  buildGui: (folders: { objects: GUI; debug: GUI }) => void;
  dispose: () => void;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

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

  // Rapier world (null until init). Held here (not just in the returned closure) so the voxel-edit
  // helpers below can add/remove colliders and bodies on it.
  let world: RAPIER.World | null = null;
  // collider.handle → the build + cell it belongs to. Each voxel is its own box collider, so a ray
  // hit identifies the exact voxel directly, and an edit can find + remove its collider. Maintained
  // incrementally as colliders are created/removed (place, break, split, drop).
  const colliderToVoxel = new Map<
    number,
    { visual: Visual; cell: [number, number, number] }
  >();
  const cellKey = (x: number, y: number, z: number) => `${x},${y},${z}`;
  // The player capsule, excluded from the build ray (see setPlayerCollider / raycastVoxel).
  let excludedCollider: RAPIER.Collider | null = null;

  // Shared wood-plank PBR material for the raft (and future wood builds). The maps live in
  // public/shipwright/; load them async and attach on success, so a missing or slow file
  // just leaves the wood-brown base colour rather than rendering the raft black.
  const texLoader = new THREE.TextureLoader();
  const woodMaterial = new THREE.MeshStandardMaterial({
    color: 0x6b4f3a, // wood-brown FALLBACK; reset to white once the diffuse map loads (below),
    // so the map shows its true colour instead of being tinted darker by this multiplier.
    // 1.0 so the roughnessMap IS the effective roughness (three multiplies base × map.g). The map
    // is authored to a mean of ~0.85 — real weathered/unfinished timber, matching the DRIFTWOOD spec
    // in materials.ts — with per-plank variation preserved. A lower base would pull the whole deck
    // glossier than bare wood and put a milky sun-sheen back on it. See the roughness note in
    // materials.ts: wood's gloss is its FINISH, and a raft deck is unfinished.
    roughness: 1,
    metalness: 0,
    // A zeroed specular and a per-material env scale used to live here. Both were the buoy/island
    // seam in another costume: the deck went white not because dry wood is non-reflective (it isn't —
    // every dielectric has F0 ≈ 0.04) but because the sky env out-lit the sun ~21:1, so a broad
    // white sheen sat on top of everything. With the light balanced, wood is allowed to be wood — a
    // plain Standard dielectric (F0 ≈ 0.04 from ior 1.5), like every other surface. (This was a
    // MeshPhysicalMaterial only to hold that now-deleted `specularIntensity: 0`; nothing else here
    // needs Physical's clearcoat/sheen/ior, and Standard's default specular is already full.)
    // The normal map carries the plank-seam grooves + grain relief, so this stays at the physical
    // 1.0 — the map does the work, the sun rakes it, and the AO darkens the seams in ambient light
    // for depth at any sun angle. (It was 2.5 to fake relief out of an earlier map that had almost
    // none baked in; over-scaling a near-flat map just smeared the bright sky into a milky haze
    // instead of adding depth. A matched map with real relief needs no exaggeration.)
    normalScale: new THREE.Vector2(1, 1),
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
    "weathered_brown_planks_diff_1k.jpg",
    (t) => {
      woodMaterial.map = t;
      woodMaterial.color.setHex(0xffffff); // drop the brown fallback tint now the real map is here
    },
    true,
  );
  // nor_gl: OpenGL-convention normal (+Y green), which three expects — no channel flip needed.
  loadWood("weathered_brown_planks_nor_gl_1k.png", (t) => (woodMaterial.normalMap = t), false);
  loadWood("weathered_brown_planks_rough_1k.jpg", (t) => (woodMaterial.roughnessMap = t), false);
  loadWood("weathered_brown_planks_ao_1k.jpg", (t) => (woodMaterial.aoMap = t), false);

  // Reused scratch objects — the per-frame loops must not allocate.
  const tmpQuat = new THREE.Quaternion();
  const tmpPos = new THREE.Vector3();
  const tmpVec = new THREE.Vector3();
  const tmpNormal = new THREE.Vector3(); // scratch for a face's world-space normal in the drag loop
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

  // --- Voxel-build primitives ------------------------------------------------------------------
  // A build is just its integer `cells`; everything else (offsets, void graph, colliders, mesh) is
  // DERIVED from that list and recomputed when the player places/breaks a voxel. These helpers are
  // the derivation, factored out of construction so the runtime editor re-runs the same code.

  // Centroid of the cells, in grid units — the FIXED local-frame origin (see Visual.centroid).
  const centroidOf = (cells: [number, number, number][]): THREE.Vector3 => {
    const c = new THREE.Vector3();
    for (const [x, y, z] of cells) {
      c.x += x;
      c.y += y;
      c.z += z;
    }
    if (cells.length > 0) c.multiplyScalar(1 / cells.length);
    return c;
  };

  // Body-local metre offset of a cell about a fixed centroid.
  const offsetOf = (
    x: number,
    y: number,
    z: number,
    centroid: THREE.Vector3,
  ): THREE.Vector3 =>
    new THREE.Vector3(
      (x - centroid.x) * VOXEL,
      (y - centroid.y) * VOXEL,
      (z - centroid.z) * VOXEL,
    );

  const offsetsFor = (
    cells: [number, number, number][],
    centroid: THREE.Vector3,
  ): THREE.Vector3[] => cells.map(([x, y, z]) => offsetOf(x, y, z, centroid));

  // Exposed-face table for a build, for the per-face form drag. `faceDir` lists a direction (0..5 into
  // FACE_NORMALS) for every voxel face with no neighbouring voxel; `faceStart` slices it per voxel, so
  // voxel j owns faces [faceStart[j], faceStart[j+1]) — a contiguous range the buoyancy loop walks in
  // step with `offsets`. Only wetted faces appear, so a buried voxel contributes no drag (anisotropy).
  const facesFor = (
    cells: [number, number, number][],
  ): { faceStart: Uint32Array; faceDir: Uint8Array } => {
    const present = new Set(cells.map(([x, y, z]) => cellKey(x, y, z)));
    const faceStart = new Uint32Array(cells.length + 1);
    const faceDir: number[] = [];
    for (let j = 0; j < cells.length; j++) {
      faceStart[j] = faceDir.length;
      const [x, y, z] = cells[j];
      for (let d = 0; d < 6; d++) {
        const n = FACE_NORMALS[d];
        if (!present.has(cellKey(x + n[0], y + n[1], z + n[2]))) faceDir.push(d);
      }
    }
    faceStart[cells.length] = faceDir.length;
    return { faceStart, faceDir: new Uint8Array(faceDir) };
  };

  // The void/compartment buoyancy data for a build, in the body-local frame about `centroid` (same
  // frame as the material offsets). A pure recompute of the cell list — see analyzeBuildVoids.
  const buildVoidData = (
    cells: [number, number, number][],
    centroid: THREE.Vector3,
  ) => {
    const voids = analyzeBuildVoids(cells);
    const voidOffsets = voids.cells.map(([x, y, z]) => offsetOf(x, y, z, centroid));
    const { cells: compartmentCells, openings: compartmentOpenings } = groupCompartments(voids);
    const compartmentCentroidLocal = compartmentCells.map((cellIdxs) => {
      const c = new THREE.Vector3();
      for (const idx of cellIdxs) c.add(voidOffsets[idx]);
      if (cellIdxs.length > 0) c.multiplyScalar(1 / cellIdxs.length);
      return c;
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
    return {
      voidCells: voids.cells,
      voidOffsets,
      voidEnclosed: voids.enclosed,
      voidCompartment: voids.compartment,
      compartmentCells,
      compartmentOpenings,
      compartmentCentroidLocal,
      compartmentFootprint,
    };
  };

  // Build the render mesh for a set of offsets. A `single` build is one merged Mesh (continuous-UV
  // geometry, posed whole); otherwise per-voxel instances of the shared box. Meshes drift metres
  // from the origin as they float, so the origin-centred bounding sphere would wrongly cull them —
  // they're tiny, just always draw.
  const makeMesh = (
    single: boolean,
    material: THREE.MeshStandardMaterial,
    offsets: THREE.Vector3[],
  ): THREE.InstancedMesh | THREE.Mesh => {
    const mesh: THREE.InstancedMesh | THREE.Mesh = single
      ? new THREE.Mesh(buildMergedVoxelGeometry(offsets), material)
      : new THREE.InstancedMesh(boxGeometry, material, Math.max(offsets.length, 1));
    mesh.frustumCulled = false;
    // Voxel builds are opaque solids: they cast onto the sea, onto the islands, and onto their own
    // decks. Set here rather than at the call sites so a runtime edit (place / break / split) can
    // never produce a hull that quietly stops casting.
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  const disposeMesh = (v: Visual) => {
    group.remove(v.mesh);
    if (v.single) v.mesh.geometry.dispose();
    else (v.mesh as THREE.InstancedMesh).dispose();
  };

  // Carry a build's per-compartment fill fraction across a void re-classification. Compartment IDS
  // are NOT stable across an edit (they're just the discovery order of connected components, which a
  // one-voxel change reshuffles), but grid-cell COORDS are — so each new compartment inherits the
  // fill of whichever old compartment it shares the most cells with; a brand-new compartment starts
  // dry. This is why an edit doesn't have to reset flooding to zero (patch a leak → the shipped water
  // stays to be bailed).
  const remapFlood = (
    oldVoidCells: [number, number, number][],
    oldCompartment: number[],
    oldWater: Float32Array,
    newVoidCells: [number, number, number][],
    newCompartment: number[],
    newCompCount: number,
  ): Float32Array => {
    const water = new Float32Array(newCompCount);
    if (newCompCount === 0) return water;
    const oldByCell = new Map<string, number>();
    oldVoidCells.forEach(([x, y, z], i) => {
      if (oldCompartment[i] !== -1) oldByCell.set(cellKey(x, y, z), oldCompartment[i]);
    });
    const overlap = Array.from({ length: newCompCount }, () => new Map<number, number>());
    newVoidCells.forEach(([x, y, z], i) => {
      const nc = newCompartment[i];
      if (nc === -1) return;
      const oc = oldByCell.get(cellKey(x, y, z));
      if (oc === undefined) return;
      overlap[nc].set(oc, (overlap[nc].get(oc) ?? 0) + 1);
    });
    for (let c = 0; c < newCompCount; c++) {
      let best = -1;
      let bestN = 0;
      overlap[c].forEach((cnt, oc) => {
        if (cnt > bestN) {
          bestN = cnt;
          best = oc;
        }
      });
      water[c] = best >= 0 ? oldWater[best] : 0;
    }
    return water;
  };

  interface VisualOpts {
    density: number;
    single: boolean;
    textured: boolean;
    material: THREE.MeshStandardMaterial;
  }

  // Build a Visual (derived data + mesh, no body yet) from a cell list and push it. `centroidOverride`
  // pins the local frame (a split child reuses its parent's frame so its voxels don't teleport);
  // otherwise the centroid is the build's own.
  const createVisual = (
    cells: [number, number, number][],
    opts: VisualOpts,
    spawnPos: THREE.Vector3,
    spawnQuat: THREE.Quaternion,
    centroidOverride?: THREE.Vector3,
  ): Visual => {
    const centroid = centroidOverride ? centroidOverride.clone() : centroidOf(cells);
    const offsets = offsetsFor(cells, centroid);
    const faces = facesFor(cells);
    const vd = buildVoidData(cells, centroid);
    const voidCount = vd.voidOffsets.length;
    const nComp = vd.compartmentCells.length;
    const mesh = makeMesh(opts.single, opts.material, offsets);
    group.add(mesh);
    const v: Visual = {
      mesh,
      single: opts.single,
      cells: cells.map(([x, y, z]) => [x, y, z] as [number, number, number]),
      centroid,
      colliders: new Map(),
      material: opts.material,
      textured: opts.textured,
      body: null,
      offsets,
      faceStart: faces.faceStart,
      faceDir: faces.faceDir,
      voidOffsets: vd.voidOffsets,
      voidEnclosed: vd.voidEnclosed,
      voidCompartment: vd.voidCompartment,
      voidWorld: new Float32Array(voidCount * 3),
      voidSubmerged: new Float32Array(voidCount),
      voidFlooded: new Uint8Array(voidCount),
      compartmentCells: vd.compartmentCells,
      compartmentOpenings: vd.compartmentOpenings,
      compartmentCentroidLocal: vd.compartmentCentroidLocal,
      compartmentFloodLevel: new Float32Array(nComp),
      compartmentFootprint: vd.compartmentFootprint,
      compartmentWater: new Float32Array(nComp), // fill fraction, starts 0 (dry)
      spawnPos: spawnPos.clone(),
      spawnQuat: spawnQuat.clone(),
      prevPos: spawnPos.clone(),
      prevQuat: spawnQuat.clone(),
      currPos: spawnPos.clone(),
      currQuat: spawnQuat.clone(),
      arrowBase: 0, // assigned by rebuildDiagnostics
      density: opts.density,
    };
    visuals.push(v);
    placeInstances(v, spawnPos, spawnQuat);
    return v;
  };

  // Recompute a build's DERIVED state after its cells changed (place/break): offsets, void graph,
  // flooding (fill carried over — see remapFlood), and the mesh. Colliders are handled separately by
  // the edit op; the pose is preserved, so the rebuilt mesh re-poses at the current transform.
  const rebuildVoxelData = (v: Visual) => {
    const centroid = v.centroid;
    // Old void grid-cells recovered from the current offsets (the frame is fixed, so this is exact),
    // paired with the old flooding, to carry the fill across the re-classification.
    const oldVoidCells = v.voidOffsets.map(
      (o) =>
        [
          Math.round(o.x / VOXEL + centroid.x),
          Math.round(o.y / VOXEL + centroid.y),
          Math.round(o.z / VOXEL + centroid.z),
        ] as [number, number, number],
    );
    const oldCompartment = v.voidCompartment;
    const oldWater = v.compartmentWater;

    const offsets = offsetsFor(v.cells, centroid);
    const faces = facesFor(v.cells);
    const vd = buildVoidData(v.cells, centroid);
    const voidCount = vd.voidOffsets.length;
    const nComp = vd.compartmentCells.length;

    v.offsets = offsets;
    v.faceStart = faces.faceStart;
    v.faceDir = faces.faceDir;
    v.voidOffsets = vd.voidOffsets;
    v.voidEnclosed = vd.voidEnclosed;
    v.voidCompartment = vd.voidCompartment;
    v.voidWorld = new Float32Array(voidCount * 3);
    v.voidSubmerged = new Float32Array(voidCount);
    v.voidFlooded = new Uint8Array(voidCount);
    v.compartmentCells = vd.compartmentCells;
    v.compartmentOpenings = vd.compartmentOpenings;
    v.compartmentCentroidLocal = vd.compartmentCentroidLocal;
    v.compartmentFloodLevel = new Float32Array(nComp);
    v.compartmentFootprint = vd.compartmentFootprint;
    v.compartmentWater = remapFlood(
      oldVoidCells,
      oldCompartment,
      oldWater,
      vd.voidCells,
      vd.voidCompartment,
      nComp,
    );

    disposeMesh(v);
    v.mesh = makeMesh(v.single, v.material, offsets);
    group.add(v.mesh);
    placeInstances(v, v.currPos, v.currQuat);
  };

  // Add one voxel's box collider to a body, keyed + registered so a ray hit and a later break can
  // find it. Density-weighted so mass follows the build (Rapier recomputes the body mass properties).
  const addVoxelCollider = (
    v: Visual,
    body: RAPIER.RigidBody,
    x: number,
    y: number,
    z: number,
  ) => {
    if (!world) return;
    const off = offsetOf(x, y, z, v.centroid);
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(HALF, HALF, HALF)
        .setTranslation(off.x, off.y, off.z)
        .setDensity(v.density)
        .setFriction(0.5)
        .setRestitution(0),
      body,
    );
    v.colliders.set(cellKey(x, y, z), collider);
    colliderToVoxel.set(collider.handle, { visual: v, cell: [x, y, z] });
  };

  // Create the dynamic body + one collider per current cell, optionally seeded with a velocity (a
  // split child inherits its parent's). Used by init, split, and drop.
  const createBody = (
    v: Visual,
    pos: THREE.Vector3,
    quat: THREE.Quaternion,
    linvel?: { x: number; y: number; z: number },
    angvel?: { x: number; y: number; z: number },
  ) => {
    if (!world) return;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setRotation(quat)
        .setLinearDamping(LINEAR_DAMPING)
        .setAngularDamping(ANGULAR_DAMPING)
        .setCanSleep(false), // buoyancy keeps nudging — don't let bodies sleep
    );
    v.colliders.clear();
    for (const [x, y, z] of v.cells) addVoxelCollider(v, body, x, y, z);
    if (linvel) body.setLinvel(linvel, true);
    if (angvel) body.setAngvel(angvel, true);
    v.body = body;
  };

  // Remove a build entirely (its last voxel was broken): mesh, body (which frees its colliders), and
  // the registry entries. The material is shared/owned-elsewhere, freed at dispose().
  const destroyVisual = (v: Visual) => {
    const idx = visuals.indexOf(v);
    if (idx === -1) return;
    disposeMesh(v);
    for (const collider of v.colliders.values()) colliderToVoxel.delete(collider.handle);
    v.colliders.clear();
    if (world && v.body) world.removeRigidBody(v.body); // frees the body's colliders too
    v.body = null;
    visuals.splice(idx, 1);
  };

  // --- Diagnostics overlays (force arrows + trapped-air x-ray) --------------------------------
  // Both index every build's buoyancy points (material voxels then void cells, in `visuals` order),
  // so they're rebuilt whenever the point counts change — construction and every edit. The two shared
  // resources (arrow group, x-ray box/material) are created once; the per-point arrows and the x-ray
  // InstancedMesh (its capacity = the void-cell count) are re-created by rebuildDiagnostics.
  const arrowGroup = new THREE.Group();
  arrowGroup.visible = false;
  group.add(arrowGroup);
  const airBoxGeometry = new THREE.BoxGeometry(VOXEL * 0.85, VOXEL * 0.85, VOXEL * 0.85);
  const airOverlayMaterial = new THREE.MeshBasicMaterial({
    color: AIR_OVERLAY_COLOR,
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending, // stacked cells glow brighter the deeper the pocket
    depthTest: false, // show THROUGH the opaque hull (a lidded/deep hull hides it otherwise)
    depthWrite: false,
  });
  // The flat force/pos arrays (one entry per buoyancy point, indexed by v.arrowBase + j), the
  // per-point arrows, and the trapped-air x-ray — all reallocated by rebuildDiagnostics. `let` so the
  // hot loops (applyBuoyancy/syncMeshes/updateArrows) always read the current binding after a rebuild.
  let forceArr: THREE.Vector3[] = [];
  let posArr: THREE.Vector3[] = [];
  let arrows: THREE.ArrowHelper[] = [];
  // Physics-step seam timers (thread 5), summed across a frame's substeps; read via stepTiming().
  let lastBuoyancyMs = 0;
  let lastSolverMs = 0;
  let airOverlay = new THREE.InstancedMesh(airBoxGeometry, airOverlayMaterial, 1);
  airOverlay.count = 0;
  airOverlay.frustumCulled = false;
  airOverlay.renderOrder = 999; // draw last so the transparent x-ray composites over the scene
  airOverlay.visible = false; // off by default — a debug aid, toggled on demand (Debug → trapped-air cells)
  // Main pass only: an x-ray drawn depthTest-off ON TOP of the frame is HUD, not world — it must not
  // land in the scene capture, where the water would refract/reflect it (see layers.ts).
  airOverlay.layers.set(MAIN_PASS_LAYER);

  const clearArrows = () => {
    for (const a of arrows) a.dispose();
    arrowGroup.clear();
    arrows = [];
  };
  // Force arrows (teal per material voxel, blue per void cell) in the same order as arrowBase — one
  // ArrowHelper (a Group + line + cone = ~3 Object3D) per buoyancy point. Built LAZILY: created only
  // while the "force arrows" debug toggle is on, because thousands of them (all bodies' voxels) bloat
  // the scene graph, and three.js' updateMatrixWorld traverses even hidden nodes on EVERY render call
  // (capture + SSR + main = 3×/frame) — the dominant CPU render-prep cost (see docs/PERFORMANCE.md).
  const rebuildArrows = () => {
    clearArrows();
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
  };

  const rebuildDiagnostics = () => {
    // Re-number the contiguous buoyancy-point ranges (material voxels, then void cells, per build).
    let cursor = 0;
    for (const v of visuals) {
      v.arrowBase = cursor;
      cursor += v.offsets.length + v.voidOffsets.length;
    }
    forceArr = Array.from({ length: cursor }, () => new THREE.Vector3());
    posArr = Array.from({ length: cursor }, () => new THREE.Vector3());

    // Only materialize the arrow objects when the overlay is on; otherwise keep the graph lean (the
    // buoyancy loop still fills forceArr/posArr, so toggling on rebuilds arrows that light up at once).
    if (arrowGroup.visible) rebuildArrows();
    else clearArrows();

    // Trapped-air x-ray: capacity = total void cells; only the trapped-air subset draws (count set
    // per frame in syncMeshes). Preserve the current on/off state across the reallocation.
    const totalVoidCells = visuals.reduce((sum, v) => sum + v.voidOffsets.length, 0);
    const wasVisible = airOverlay.visible;
    group.remove(airOverlay);
    airOverlay.dispose();
    airOverlay = new THREE.InstancedMesh(
      airBoxGeometry,
      airOverlayMaterial,
      Math.max(totalVoidCells, 1),
    );
    airOverlay.count = 0;
    airOverlay.frustumCulled = false;
    airOverlay.renderOrder = 999;
    airOverlay.layers.set(MAIN_PASS_LAYER); // HUD overlay, main pass only — same as at construction
    airOverlay.visible = wasVisible;
    group.add(airOverlay);
  };

  // --- Construction: build each starting shape, then size the diagnostics -----------------------
  const rowCount = shapes.reduce((n, s) => n + (s.spawnOverride ? 0 : 1), 0);
  let rowIndex = 0;
  shapes.forEach((shape, i) => {
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

    createVisual(
      shape.cells,
      {
        density: shape.density ?? VOXEL_DENSITY,
        single: shape.merged === true,
        textured: shape.textured === true,
        material,
      },
      spawnPos,
      spawnQuat,
    );
  });
  rebuildDiagnostics();

  // Rapier is loaded async (init); until then there's no world and update no-ops. Bodies live on
  // each Visual (v.body) once init resolves.
  const fixedStepCallbacks: ((dt: number, time: number) => void)[] = [];
  const afterStepCallbacks: (() => void)[] = [];
  let accumulator = 0;
  let interpAlpha = 0; // leftover-accumulator fraction in [0,1] for render interpolation (see update)
  let simFailed = false; // set if Rapier's WASM ever traps — we then stop stepping (see update)
  let paused = false; // debug: freeze the sim (skip the whole step loop) to measure physics' frame cost
  let dragEnabled = true; // bench cost-isolation (--drag off): skip the drag term + its 2 sampleParticle evals
  let hasStepped = false; // set after the first world.step() — the query BVH is only valid once stepped
  // Deferred voxel edits (place/break/drop). They mutate the collider set, but the query BVH the raycasts
  // use is ONLY rebuilt by world.step() (add/removeCollider don't touch it) — so casting between an edit
  // and the next step dereferences a changed collider and traps the WASM. We therefore QUEUE edits and
  // apply them inside the fixed loop right AFTER the riders' casts and right BEFORE world.step(), so the
  // BVH is always consistent with the collider set at every cast, and the step immediately refreshes it.
  // (This also makes edits discrete, fixed-point events — the shape a replayable co-op edit log needs.)
  const editQueue: (() => void)[] = [];

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
      const body = v.body;
      if (!body) continue;
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

        // How much of this voxel's height is under the water surface right now. sampleHeight (not
        // sampleSurface) — buoyancy needs only the height, and this per-voxel-per-substep call skips
        // the surface-normal Vector3 allocation sampleSurface would make (and discard here).
        const surfaceHeight = ocean.sampleHeight(wx, wz, time);
        const submerged = clamp((surfaceHeight - (wy - HALF)) / VOXEL, 0, 1);
        if (submerged <= 0) {
          forceArr[gi].set(0, 0, 0);
          continue; // fully clear of the water — free flight under gravity alone
        }

        // Archimedes: up-force = weight of displaced water = ρ·g·(submerged vol).
        const buoyancy = WATER_DENSITY * GRAVITY * submerged * VOXEL_VOLUME;

        // Voxel-centre force: buoyancy (up) + the LINEAR low-speed damper (isotropic, toward the water
        // velocity). Point velocity of the voxel is linvel + angvel × r (r from the COM), so the damper
        // resists both translation and spin — toward the orbit, not toward rest. The QUADRATIC form drag
        // is applied per exposed FACE below (so it can be directional); this centre force carries only the
        // near-equilibrium linear floor + buoyancy.
        // `dragEnabled` gates the whole drag term — including its `waterVelocity` (2 `sampleParticle`)
        // evals — so `--drag off` isolates the drag/water-velocity share (default on = unchanged).
        let cx = 0;
        let cy = buoyancy;
        let cz = 0;
        // Net force accumulator for this voxel's debug arrow: the centre force + this voxel's face drag.
        let nfx = 0;
        let nfy = buoyancy;
        let nfz = 0;
        if (dragEnabled) {
          const wv = waterVelocity(wx, wz, time);
          const rx = wx - com.x;
          const ry = wy - com.y;
          const rz = wz - com.z;
          let relx = wv.x - (lin.x + (ang.y * rz - ang.z * ry));
          let rely = wv.y - (lin.y + (ang.z * rx - ang.x * rz));
          let relz = wv.z - (lin.z + (ang.x * ry - ang.y * rx));
          // Cap the relative flow the drag sees. Form drag grows with v², so a body that gets fast (a bad
          // contact from a runtime edit) generates a drag impulse larger than its own momentum in one step
          // → it overshoots, oscillates, and can diverge to Inf INSIDE world.step(), before any post-step
          // guard runs (the real solver-trap trigger). Clamping the relative-flow magnitude keeps every
          // face impulse bounded so it can't overshoot. Inert in normal floating (relative speed ≪ the
          // cap); only bites the pathological high-speed case.
          const relSpeed = Math.hypot(relx, rely, relz);
          if (relSpeed > DRAG_MAX_REL_SPEED) {
            const s = DRAG_MAX_REL_SPEED / relSpeed;
            relx *= s;
            rely *= s;
            relz *= s;
          }
          const lc = DRAG_LINEAR * submerged * params.drag;
          cx = relx * lc;
          cy = buoyancy + rely * lc;
          cz = relz * lc;
          nfx = cx;
          nfy = cy;
          nfz = cz;

          // Per-exposed-face QUADRATIC form drag: ½·ρ·Cd·A·(u·n)² along −n, on windward faces only (u·n<0,
          // flow pushing into the outer face). u is the water-relative flow AT the face centre, so a wide
          // flank moving broadside stacks many windward faces (strong lateral resistance) while a pointed
          // bow shows few (it goes). Applied at the face centre for the right turning moment. Faces of
          // voxel j are the contiguous slice faceStart[j]..faceStart[j+1] (see facesFor), walked in step.
          for (let f = v.faceStart[j]; f < v.faceStart[j + 1]; f++) {
            const n = FACE_NORMALS[v.faceDir[f]];
            tmpNormal.set(n[0], n[1], n[2]).applyQuaternion(tmpQuat);
            const nx = tmpNormal.x;
            const ny = tmpNormal.y;
            const nz = tmpNormal.z;
            const fcx = wx + HALF * nx;
            const fcy = wy + HALF * ny;
            const fcz = wz + HALF * nz;
            let ux = wv.x - (lin.x + (ang.y * (fcz - com.z) - ang.z * (fcy - com.y)));
            let uy = wv.y - (lin.y + (ang.z * (fcx - com.x) - ang.x * (fcz - com.z)));
            let uz = wv.z - (lin.z + (ang.x * (fcy - com.y) - ang.y * (fcx - com.x)));
            const uSpeed = Math.hypot(ux, uy, uz);
            if (uSpeed > DRAG_MAX_REL_SPEED) {
              const s = DRAG_MAX_REL_SPEED / uSpeed;
              ux *= s;
              uy *= s;
              uz *= s;
            }
            const vn = ux * nx + uy * ny + uz * nz;
            if (vn >= 0) continue; // leeward — the flow leaves this face, no pressure drag
            const mag = DRAG_QUADRATIC * vn * vn * submerged * params.drag;
            const ffx = -mag * nx;
            const ffy = -mag * ny;
            const ffz = -mag * nz;
            body.addForceAtPoint({ x: ffx, y: ffy, z: ffz }, { x: fcx, y: fcy, z: fcz }, true);
            nfx += ffx;
            nfy += ffy;
            nfz += ffz;
          }
        }

        forceArr[gi].set(nfx, nfy, nfz);
        body.addForceAtPoint({ x: cx, y: cy, z: cz }, { x: wx, y: wy, z: wz }, true);
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
        const surfaceHeight = ocean.sampleHeight(wx, wz, time); // height only — per void cell, hot
        v.voidSubmerged[j] = clamp((surfaceHeight - (wy - HALF)) / VOXEL, 0, 1);
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
        const ext = ocean.sampleHeight(tmpVec.x + t.x, tmpVec.z + t.z, time);

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
      const body = v.body;
      if (!body) continue;
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

  // --- Solver-trap diagnostic (TEMPORARY) -------------------------------------------------------
  // world.step() traps ("unreachable") when Rapier integrates a non-finite body transform, and the
  // runaway clamp above is meant to make that impossible — yet it still fires in NORMAL play (a camera
  // flip on a calm sea, no edits). That means the sim is producing bad state we don't yet understand,
  // so instead of widening the clamp we record every body's state and dump it at the instant of a trap.
  // We snapshot the PRE-step inputs (right before world.step) rather than reading in the catch, because
  // a trap poisons the WASM instance: body.translation() afterward would itself throw "recursive use"
  // (the same reason raycastVoxel bails on simFailed). The snapshot is plain JS numbers, so it's safe to
  // read post-trap. It names the offender (player vs a voxel body, position vs velocity) and `steps ==
  // MAX_SUBSTEPS` confirms/denies the frame-hitch → catch-up theory. Remove once the cause is found.
  //
  // The first capture (2026-07-17) REFUTED both standing theories: steps=0 (no catch-up) and every
  // body finite, in pristine free-fall 5 steps after spawn, trapping in resetForces — a world that
  // had done nothing wrong. That is an ECHO on an already-poisoned instance (see rapierHealth); the
  // primal trap — the first one on a clean instance — is still uncaptured.
  //
  // rapierHealth (TEMPORARY, same package): rapier3d-compat's WASM module is a singleton — one
  // instance, one linear memory, shared by every World and surviving scene remounts, HMR, and
  // client-side navigation until a full page load. A Rust panic ("unreachable") leaves it in
  // undefined state, so every world created afterward runs on corrupted memory and can trap on an
  // innocuous call. Tracked on globalThis (module state resets when this file itself hot-reloads)
  // so each trap dump can tag itself PRIMAL (worth studying) or an echo (discard; reload the page).
  const rapierHealth = () => {
    const g = globalThis as unknown as {
      __shipwrightRapierHealth?: { worlds: number; poisonedAtWorld: number | null };
    };
    g.__shipwrightRapierHealth ??= { worlds: 0, poisonedAtWorld: null };
    return g.__shipwrightRapierHealth;
  };
  let worldNumber = 0; // page-wide ordinal of this instance's world (assigned in init)
  const TRAP_STRIDE = 13; // per body: pos(3) rot(4) linvel(3) angvel(3)
  const TRAP_MAX_BODIES = 64;
  const trapSnap = new Float32Array(TRAP_MAX_BODIES * TRAP_STRIDE);
  let trapSnapPlayerPresent = false; // slot 0 is the player when true (see capture/dump order)
  const snapshotBody = (slot: number, body: RAPIER.RigidBody) => {
    const o = slot * TRAP_STRIDE;
    const t = body.translation();
    const r = body.rotation();
    const lv = body.linvel();
    const av = body.angvel();
    trapSnap[o] = t.x;
    trapSnap[o + 1] = t.y;
    trapSnap[o + 2] = t.z;
    trapSnap[o + 3] = r.x;
    trapSnap[o + 4] = r.y;
    trapSnap[o + 5] = r.z;
    trapSnap[o + 6] = r.w;
    trapSnap[o + 7] = lv.x;
    trapSnap[o + 8] = lv.y;
    trapSnap[o + 9] = lv.z;
    trapSnap[o + 10] = av.x;
    trapSnap[o + 11] = av.y;
    trapSnap[o + 12] = av.z;
  };
  // Fixed order [player, ...visuals] so the catch can re-derive each slot's label without storing it.
  const captureTrapSnapshot = () => {
    const playerBody = excludedCollider?.parent() ?? null;
    trapSnapPlayerPresent = playerBody !== null;
    let slot = 0;
    if (playerBody) snapshotBody(slot++, playerBody);
    for (const v of visuals) {
      if (v.body && slot < TRAP_MAX_BODIES) snapshotBody(slot++, v.body);
    }
  };
  const dumpTrapSlot = (slot: number, label: string) => {
    const o = slot * TRAP_STRIDE;
    const pos = [trapSnap[o], trapSnap[o + 1], trapSnap[o + 2]];
    const rot = [trapSnap[o + 3], trapSnap[o + 4], trapSnap[o + 5], trapSnap[o + 6]];
    const linvel = [trapSnap[o + 7], trapSnap[o + 8], trapSnap[o + 9]];
    const angvel = [trapSnap[o + 10], trapSnap[o + 11], trapSnap[o + 12]];
    const finite = (n: number) => Number.isFinite(n);
    const bad: string[] = [];
    if (!pos.every(finite)) bad.push("pos");
    if (!rot.every(finite)) bad.push("rot");
    if (!linvel.every(finite)) bad.push("linvel");
    if (!angvel.every(finite)) bad.push("angvel");
    console.warn(`  ${label}${bad.length > 0 ? ` — NON-FINITE: ${bad.join(", ")}` : ""}`, {
      pos,
      linSpeed: Math.hypot(linvel[0], linvel[1], linvel[2]),
      angSpeed: Math.hypot(angvel[0], angvel[1], angvel[2]),
      linvel,
      angvel,
      rot,
    });
  };
  const logSolverTrap = (delta: number, steps: number) => {
    const health = rapierHealth();
    const poisonedAt = health.poisonedAtWorld;
    if (poisonedAt === null) health.poisonedAtWorld = worldNumber;
    console.warn(
      `Shipwright solver trap — delta=${delta.toFixed(4)}s steps=${steps}/${MAX_SUBSTEPS} ` +
        `accumulator=${accumulator.toFixed(4)}s` +
        (steps === MAX_SUBSTEPS ? " (hit substep cap ⇒ a frame hitch drove catch-up)" : ""),
    );
    console.warn(
      poisonedAt === null
        ? `  instance CLEAN → PRIMAL trap in world #${worldNumber} — this capture is the one worth studying`
        : `  instance POISONED since a trap in world #${poisonedAt} → world #${worldNumber}'s trap is an ECHO — discard it and reload the page`,
    );
    let slot = 0;
    if (trapSnapPlayerPresent) dumpTrapSlot(slot++, "player");
    else console.warn("  player — no body attached");
    for (let i = 0; i < visuals.length; i++) {
      if (visuals[i].body) dumpTrapSlot(slot++, `voxel-body[${i}] (${visuals[i].cells.length} voxels)`);
    }
  };

  // --- Voxel editing (place / break / drop) ---------------------------------------------------
  // Scratch for the edit ops — these run once per click / once per frame (the highlight raycast), not
  // per-voxel, so a little allocation is fine, but keep the hot-ish ray + pose reused.
  const editPos = new THREE.Vector3();
  const editQuat = new THREE.Quaternion();
  const editNormal = new THREE.Vector3();
  const editRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
  // Distance ahead of the eye a Q-dropped voxel spawns. A dropped voxel must NOT spawn overlapping any
  // existing voxel: two dynamic bodies spawned in deep penetration is what the contact solver can't
  // resolve — it blows up and traps the WASM. So `applyDropVoxel` nudges the spawn UP a voxel at a time
  // until the spot is clear (stacking a Q-burst instead of piling it into one point), up to this cap.
  const DROP_DISTANCE = 2;
  const DROP_MAX_NUDGE = 64;
  const dropProbe = new THREE.Vector3(); // scratch for the spawn-clearance check

  // Connected components of a cell list by 6-face adjacency — the disconnection test after a break.
  const connectedComponents = (
    cells: [number, number, number][],
  ): [number, number, number][][] => {
    const present = new Set(cells.map(([x, y, z]) => cellKey(x, y, z)));
    const seen = new Set<string>();
    const comps: [number, number, number][][] = [];
    for (const start of cells) {
      if (seen.has(cellKey(start[0], start[1], start[2]))) continue;
      const comp: [number, number, number][] = [];
      const stack: [number, number, number][] = [start];
      seen.add(cellKey(start[0], start[1], start[2]));
      while (stack.length > 0) {
        const cur = stack.pop();
        if (!cur) break;
        const [cx, cy, cz] = cur;
        comp.push(cur);
        const nbrs: [number, number, number][] = [
          [cx - 1, cy, cz], [cx + 1, cy, cz],
          [cx, cy - 1, cz], [cx, cy + 1, cz],
          [cx, cy, cz - 1], [cx, cy, cz + 1],
        ];
        for (const nb of nbrs) {
          const nk = cellKey(nb[0], nb[1], nb[2]);
          if (present.has(nk) && !seen.has(nk)) {
            seen.add(nk);
            stack.push(nb);
          }
        }
      }
      comps.push(comp);
    }
    return comps;
  };

  const raycastVoxel = (
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxReach: number,
  ): VoxelHit | null => {
    // The query BVH is only valid once the world has stepped; and after a solver trap (simFailed) the
    // WASM instance is poisoned, so any further cast throws "recursive use" — bail on both.
    if (!world || !hasStepped || simFailed) return null;
    editRay.origin.x = origin.x;
    editRay.origin.y = origin.y;
    editRay.origin.z = origin.z;
    editRay.dir.x = dir.x;
    editRay.dir.y = dir.y;
    editRay.dir.z = dir.z;
    // Exclude the player capsule (the eye sits inside it → it'd self-hit at toi 0); every other collider
    // in the world is a voxel, confirmed via the map below. Excluding by HANDLE (not a filter predicate)
    // keeps this a plain query with no JS callback. The one real hazard for a cast — traversing a BVH
    // that still holds a freed collider's proxy — is closed by the edit queue: collider mutations are
    // only applied immediately before a world.step(), which is the sole thing that refreshes the BVH, so
    // no cast ever observes an un-stepped mutation. `solid` so a face flush with the ray still registers.
    const hit = world.castRayAndGetNormal(
      editRay,
      maxReach,
      true,
      undefined,
      undefined,
      excludedCollider ?? undefined,
    );
    if (!hit) return null;
    const rec = colliderToVoxel.get(hit.collider.handle);
    if (!rec) return null; // not a voxel we know (shouldn't happen with the player excluded)
    const v = rec.visual;
    const [cx, cy, cz] = rec.cell;
    const point = new THREE.Vector3(
      origin.x + dir.x * hit.timeOfImpact,
      origin.y + dir.y * hit.timeOfImpact,
      origin.z + dir.z * hit.timeOfImpact,
    );
    // The hit face's outward normal (world) → the build's local grid axes (inverse body rotation) →
    // the unit grid step to the empty neighbour across that face (where a place lands).
    const rot = v.body ? v.body.rotation() : { x: 0, y: 0, z: 0, w: 1 };
    editQuat.set(rot.x, rot.y, rot.z, rot.w).invert();
    editNormal.set(hit.normal.x, hit.normal.y, hit.normal.z).applyQuaternion(editQuat);
    const ax = Math.abs(editNormal.x);
    const ay = Math.abs(editNormal.y);
    const az = Math.abs(editNormal.z);
    let dx = 0;
    let dy = 0;
    let dz = 0;
    if (ax >= ay && ax >= az) dx = Math.sign(editNormal.x);
    else if (ay >= az) dy = Math.sign(editNormal.y);
    else dz = Math.sign(editNormal.z);
    return {
      visual: v,
      cell: [cx, cy, cz],
      placeCell: [cx + dx, cy + dy, cz + dz],
      point,
    };
  };

  const poseVoxel = (
    target: THREE.Object3D,
    v: Visual,
    cell: [number, number, number],
  ) => {
    // Interpolated pose so the highlight sits on the DRAWN mesh (syncMeshes uses the same lerp/alpha).
    editPos.lerpVectors(v.prevPos, v.currPos, interpAlpha);
    editQuat.slerpQuaternions(v.prevQuat, v.currQuat, interpAlpha);
    target.position
      .copy(offsetOf(cell[0], cell[1], cell[2], v.centroid))
      .applyQuaternion(editQuat)
      .add(editPos);
    target.quaternion.copy(editQuat);
  };

  const applyPlaceVoxel = (hit: VoxelHit) => {
    if (!world) return;
    const v = hit.visual;
    const body = v.body;
    if (!body) return;
    const [x, y, z] = hit.placeCell;
    if (v.colliders.has(cellKey(x, y, z))) return; // already occupied (shouldn't happen off a face)
    v.cells.push([x, y, z]);
    addVoxelCollider(v, body, x, y, z);
    body.recomputeMassPropertiesFromColliders(); // mass follows the added voxel
    rebuildVoxelData(v);
  };

  // Spin every non-largest chunk of a just-broken build off into its own body. Each child reuses the
  // parent's local frame + pose (so its voxels don't teleport) and inherits its velocity (so it drifts
  // apart naturally). The largest chunk stays on the original body.
  const splitVisual = (v: Visual, comps: [number, number, number][][]) => {
    const w = world;
    if (!w || !v.body) return;
    comps.sort((a, b) => b.length - a.length);
    const t = v.body.translation();
    const rot = v.body.rotation();
    const lin = v.body.linvel();
    const ang = v.body.angvel();
    editPos.set(t.x, t.y, t.z);
    editQuat.set(rot.x, rot.y, rot.z, rot.w);
    for (let c = 1; c < comps.length; c++) {
      for (const [x, y, z] of comps[c]) {
        const col = v.colliders.get(cellKey(x, y, z));
        if (col) {
          w.removeCollider(col, true);
          colliderToVoxel.delete(col.handle);
          v.colliders.delete(cellKey(x, y, z));
        }
      }
      const child = createVisual(
        comps[c],
        { density: v.density, single: v.single, textured: v.textured, material: v.material },
        editPos,
        editQuat,
        v.centroid,
      );
      createBody(
        child,
        editPos,
        editQuat,
        { x: lin.x, y: lin.y, z: lin.z },
        { x: ang.x, y: ang.y, z: ang.z },
      );
    }
    v.cells = comps[0];
    v.body.recomputeMassPropertiesFromColliders();
    rebuildVoxelData(v);
  };

  const applyRemoveVoxel = (hit: VoxelHit) => {
    if (!world) return;
    const v = hit.visual;
    const body = v.body;
    if (!body) return;
    const [x, y, z] = hit.cell;
    const collider = v.colliders.get(cellKey(x, y, z));
    if (!collider) return;
    world.removeCollider(collider, true);
    colliderToVoxel.delete(collider.handle);
    v.colliders.delete(cellKey(x, y, z));
    v.cells = v.cells.filter(([cx, cy, cz]) => cx !== x || cy !== y || cz !== z);

    if (v.cells.length === 0) {
      destroyVisual(v); // broke the last voxel — the build is gone
    } else {
      const comps = connectedComponents(v.cells);
      if (comps.length > 1) splitVisual(v, comps);
      else {
        body.recomputeMassPropertiesFromColliders();
        rebuildVoxelData(v);
      }
    }
  };

  // Is a voxel centred at `p` (world) overlapping any existing voxel? A plain check against our own
  // voxel positions — NO physics query, so it has none of the query-BVH hazards, and it naturally
  // includes voxels dropped earlier in this same batch (they're already in `visuals`, posed at their
  // spawn). Two centres within one voxel edge in every axis ⇒ the 0.5 m boxes overlap.
  const dropSpotOccupied = (p: THREE.Vector3): boolean => {
    for (const v of visuals) {
      for (const off of v.offsets) {
        dropProbe.copy(off).applyQuaternion(v.currQuat).add(v.currPos);
        if (
          Math.abs(dropProbe.x - p.x) < VOXEL &&
          Math.abs(dropProbe.y - p.y) < VOXEL &&
          Math.abs(dropProbe.z - p.z) < VOXEL
        ) {
          return true;
        }
      }
    }
    return false;
  };

  const applyDropVoxel = (
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    velocity?: { x: number; y: number; z: number },
  ) => {
    if (!world) return;
    const spawn = new THREE.Vector3(
      origin.x + dir.x * DROP_DISTANCE,
      origin.y + dir.y * DROP_DISTANCE + 0.3, // a touch high so it drops in and settles
      origin.z + dir.z * DROP_DISTANCE,
    );
    // Nudge up until the spot is clear of existing voxels — never spawn into deep penetration. Skip the
    // drop entirely if no room turns up (a jammed column) rather than forcing an overlap.
    let clear = false;
    for (let attempt = 0; attempt < DROP_MAX_NUDGE; attempt++) {
      if (!dropSpotOccupied(spawn)) {
        clear = true;
        break;
      }
      spawn.y += VOXEL;
    }
    if (!clear) return;
    const quat = new THREE.Quaternion(); // level
    const child = createVisual(
      [[0, 0, 0]],
      { density: RAFT_DENSITY, single: true, textured: true, material: woodMaterial },
      spawn,
      quat,
      new THREE.Vector3(0, 0, 0),
    );
    // Seed with the player's velocity so it keeps their momentum (drop while walking/riding a swell and
    // it travels with you, not lurching). Safe against the old clump bug because the spawn is already
    // guaranteed clear — the clump only exploded when bodies shared a velocity AND were coincident.
    createBody(child, spawn, quat, velocity);
  };

  // Public edit entry points: enqueue the mutation to run at the safe point in the fixed loop (see
  // editQueue). `dir` is copied because the caller's vector (the camera forward) keeps changing.
  const placeVoxel = (hit: VoxelHit) => editQueue.push(() => applyPlaceVoxel(hit));
  const removeVoxel = (hit: VoxelHit) => editQueue.push(() => applyRemoveVoxel(hit));
  const dropVoxel = (origin: THREE.Vector3, dir: THREE.Vector3, velocity?: THREE.Vector3) => {
    const o = origin.clone();
    const d = dir.clone();
    // Snapshot the velocity at press time (the player keeps moving before the edit drains).
    const vel = velocity ? { x: velocity.x, y: velocity.y, z: velocity.z } : undefined;
    editQueue.push(() => applyDropVoxel(o, d, vel));
  };

  return {
    object: group,
    init: async () => {
      await RAPIER.init();
      const w = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
      w.timestep = FIXED_DT;
      const health = rapierHealth();
      health.worlds += 1;
      worldNumber = health.worlds;
      // Diagnosis only, no behavior change: a world built after a trap runs on corrupted memory,
      // so say so NOW — the echo trap it will eventually report is then already explained.
      if (health.poisonedAtWorld !== null) {
        console.warn(
          `Shipwright: Rapier's singleton WASM instance was poisoned by a trap in world ` +
            `#${health.poisonedAtWorld}; world #${worldNumber} is built on corrupted memory and ` +
            `any trap it reports is an echo. Reload the page for a clean instance.`,
        );
      }
      world = w; // set before createBody so it can create colliders on the world
      for (const v of visuals) createBody(v, v.spawnPos, v.spawnQuat);
    },
    update: (delta, time) => {
      if (!world || simFailed || paused) return;
      accumulator += delta;
      let steps = 0;
      // Seam timers for the physics-step split (thread 5): buoyancy (applyBuoyancy) vs Rapier
      // (world.step), SUMMED over this frame's substeps. Reset here; read via stepTiming().
      lastBuoyancyMs = 0;
      lastSolverMs = 0;
      // Sample buoyancy at `time` — the SAME clock the ocean is drawn at — so bodies
      // float on the on-screen water. (A separate sim clock drifts out of phase, since
      // it seeds at 0 on Rapier's async load, and the bodies then ride an invisible,
      // offset sea.) Fixed dt is only the integration step, not the sampling clock.
      // The whole stepping loop is guarded: if Rapier's WASM ever traps, the instance is poisoned and
      // can't recover, so we stop stepping and freeze the bodies rather than hard-crashing the app.
      try {
        while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
          // Bound every body's velocity BEFORE we sample it for drag and before the solver integrates
          // it: a finite, bounded input can't diverge to Inf inside world.step(). (Post-step clamping
          // is always one step too late — the blow-up happens within the step it feeds.)
          for (const v of visuals) if (v.body) clampVelocity(v.body);
          const buoyancyStart = globalThis.performance.now();
          applyBuoyancy(time);
          lastBuoyancyMs += globalThis.performance.now() - buoyancyStart;
          for (const cb of fixedStepCallbacks) cb(FIXED_DT, time); // riders (player) cast HERE, pre-edit
          // Apply queued voxel edits now — after the riders' casts, before the step that refreshes the
          // query BVH — so no cast ever sees a collider set the BVH doesn't match (see editQueue). Each
          // apply recomputes its own build; the diagnostics overlay is rebuilt ONCE for the whole batch
          // (a Q-burst can apply many edits in a frame).
          if (editQueue.length > 0) {
            for (const edit of editQueue) edit();
            editQueue.length = 0;
            rebuildDiagnostics();
          }
          captureTrapSnapshot(); // TEMPORARY: record pre-step inputs so a trap can name the offender
          const solverStart = globalThis.performance.now();
          world.step();
          lastSolverMs += globalThis.performance.now() - solverStart;
          hasStepped = true;
          // Snapshot each body's post-step transform (shifting the last into `prev`) for render
          // interpolation, then let anything else riding the sim (the player) snapshot in lock-step.
          for (let i = 0; i < visuals.length; i++) {
            const v = visuals[i];
            const body = v.body;
            if (!body) continue;
            const tr = body.translation();
            const rot = body.rotation();
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
        // A WASM trap poisons the instance — stop stepping (raycastVoxel also bails on simFailed, so we
        // don't spawn the follow-on "recursive use" errors). Freezing beats hard-crashing.
        console.warn("Shipwright physics halted after a solver error; freezing bodies.", err);
        logSolverTrap(delta, steps); // TEMPORARY: dump the pre-step body states to pinpoint the trap
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
    raycastVoxel,
    placeVoxel,
    removeVoxel,
    dropVoxel,
    poseVoxel,
    hasVoxel: (v, cell) => v.colliders.has(cellKey(cell[0], cell[1], cell[2])),
    visuals: () => visuals.slice(),
    setPlayerCollider: (collider) => {
      excludedCollider = collider;
    },
    alpha: () => interpAlpha,
    respawn,
    stepTiming: () => ({ buoyancy: lastBuoyancyMs, solver: lastSolverMs }),
    setDragEnabled: (on: boolean) => {
      dragEnabled = on;
    },
    addBodyForce: (visual, force, point) => {
      visual.body?.addForceAtPoint(force, point, true);
    },
    setCollisionEnabled: (on: boolean) => {
      if (!world) return;
      // Toggle contact generation on every collider WITHOUT removing them, so mass/inertia/buoyancy
      // and the broad-phase AABBs are all untouched — the ONLY change is whether Rapier's narrow phase
      // + solver do contact work. Collision groups are a u32 = (membership<<16)|filter; two colliders
      // interact only if each one's membership bit falls in the other's filter. filter=0 (0xffff0000)
      // → no pair ever matches → zero contacts; 0xffffffff is Rapier's default (collide with all).
      // This isolates the collision-RESOLUTION cost for the benchmark; the broad phase still runs.
      const groups = on ? 0xffffffff : 0xffff0000;
      world.forEachCollider((c) => c.setCollisionGroups(groups));
    },
    buildGui: ({ objects, debug }) => {
      const folder = objects.addFolder("Physics");
      folder.add({ respawn }, "respawn").name("respawn shapes");
      // Freeze the whole step loop (buoyancy + world.step() + snapshots) to measure how much of the
      // frame is Rapier physics vs. rendering — the render keeps running, bodies just hold their pose.
      folder.add({ paused }, "paused").name("pause physics").onChange((on: boolean) => (paused = on));
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
      wood.add(woodMaterial, "aoMapIntensity", 0, 2, 0.05).name("ao"); // crevice depth, any sun angle
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
          // Materialize the arrow objects on demand (they're not built while off — see rebuildArrows);
          // tear them back out when hidden so the idle scene graph stays lean.
          if (on) rebuildArrows();
          else clearArrows();
        });
      debug
        .add(toggles, "trappedAir")
        .name("trapped-air cells")
        .onChange((on: boolean) => {
          airOverlay.visible = on;
        });
    },
    dispose: () => {
      // After a solver trap the WASM borrow stays locked, so world.free() throws "attempted to take
      // ownership while borrowed". We're tearing down anyway — swallow it so the three.js teardown
      // below still runs (and doesn't leak GPU resources).
      try {
        world?.free();
      } catch (err) {
        console.warn("Shipwright: Rapier world.free() failed (poisoned after a solver trap).", err);
      }
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

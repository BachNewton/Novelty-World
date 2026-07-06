import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import type GUI from "three/examples/jsm/libs/lil-gui.module.min.js";
import type { Ocean } from "./ocean";
import { createFerry } from "./ferry";

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

const ARROW_COLOR = 0x35ffd0;
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

// A spread of 0.5 m³-voxel builds to watch interact with the sea. The five flat
// tetromino plates (Z-thin) topple and self-right to a waterline; the upright 3-D
// shapes are stability tests — from rock-stable (pyramid, catamaran) to marginal
// (tower) to doomed (pillar). Buoyancy is per-voxel, so how each one floats, tips,
// or rights itself falls out of its geometry alone.
const SHAPES: Shape[] = [
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
  // The scale reference: a real-sized speedboat hull, front and centre at the origin,
  // spawned at its waterline so it settles without a big drop.
  {
    name: "Boat",
    color: 0xe6e2d8,
    upright: true,
    spawnOverride: [0, 0.2, 0],
    cells: buildBoatCells(),
  },
];

interface Visual {
  mesh: THREE.InstancedMesh;
  /** Local voxel-centre offsets (metres), centred on the shape's centroid. */
  offsets: THREE.Vector3[];
  spawnPos: THREE.Vector3;
  spawnQuat: THREE.Quaternion;
  /** Start index of this piece's voxels in the flat debug-arrow arrays. */
  arrowBase: number;
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
  /** Add the "Physics" controls (respawn / drag / force arrows) to the GUI. */
  buildGui: (gui: GUI) => void;
  dispose: () => void;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export function createPhysics(ocean: Ocean): Physics {
  const params = { drag: DRAG_MULTIPLIER_DEFAULT };

  const group = new THREE.Group();
  const boxGeometry = new THREE.BoxGeometry(VOXEL, VOXEL, VOXEL);
  const materials: THREE.MeshStandardMaterial[] = [];
  const visuals: Visual[] = [];

  const totalVoxels = SHAPES.reduce((sum, s) => sum + s.cells.length, 0);
  const forceArr = Array.from({ length: totalVoxels }, () => new THREE.Vector3());
  const posArr = Array.from({ length: totalVoxels }, () => new THREE.Vector3());

  // Reused scratch objects — the per-frame loops must not allocate.
  const tmpQuat = new THREE.Quaternion();
  const tmpPos = new THREE.Vector3();
  const tmpVec = new THREE.Vector3();
  const wvOut = new THREE.Vector3();
  const dummy = new THREE.Object3D();

  // Write the instance matrices for one piece at a given world pose (each voxel =
  // pose applied to its local offset). Used for the pre-physics spawn pose and,
  // per frame, from the body's live transform.
  const placeInstances = (
    v: Visual,
    pos: THREE.Vector3,
    quat: THREE.Quaternion,
  ) => {
    for (let j = 0; j < v.offsets.length; j++) {
      tmpVec.copy(v.offsets[j]).applyQuaternion(quat).add(pos);
      dummy.position.copy(tmpVec);
      dummy.quaternion.copy(quat);
      dummy.updateMatrix();
      v.mesh.setMatrixAt(j, dummy.matrix);
    }
    v.mesh.instanceMatrix.needsUpdate = true;
  };

  const rowCount = SHAPES.reduce((n, s) => n + (s.spawnOverride ? 0 : 1), 0);
  let rowIndex = 0;
  let arrowCursor = 0;
  SHAPES.forEach((shape, i) => {
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

    const material = new THREE.MeshStandardMaterial({
      color: shape.color,
      roughness: 0.6,
      metalness: 0.05,
    });
    materials.push(material);
    const mesh = new THREE.InstancedMesh(boxGeometry, material, n);
    // Instances are translated metres from the mesh origin and drift as they
    // float, so the origin-centred bounding sphere would wrongly cull the whole
    // mesh at some angles. These are tiny — just always draw them.
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

    const v: Visual = { mesh, offsets, spawnPos, spawnQuat, arrowBase: arrowCursor };
    visuals.push(v);
    placeInstances(v, spawnPos, spawnQuat);
    arrowCursor += n;
  });

  // Per-voxel buoyancy-force debug overlay (off by default). One arrow per voxel,
  // positioned + scaled each frame from the last forces applied by the sim.
  const arrowGroup = new THREE.Group();
  arrowGroup.visible = false;
  group.add(arrowGroup);
  const arrows = Array.from({ length: totalVoxels }, () => {
    const arrow = new THREE.ArrowHelper(UP, ORIGIN, 1, ARROW_COLOR, 0.3, 0.2);
    arrow.visible = false;
    arrowGroup.add(arrow);
    return arrow;
  });

  // The to-scale ferry shares this world + fixed-timestep loop, but floats off a
  // sparse probe grid instead of per-voxel buoyancy (see ferry.ts).
  const ferry = createFerry(ocean);
  group.add(ferry.object);

  // Rapier is loaded async (init); until then there's no world and update no-ops.
  // `bodies` is index-parallel to `visuals` once init resolves.
  let world: RAPIER.World | null = null;
  const bodies: RAPIER.RigidBody[] = [];
  let accumulator = 0;

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
    }
  };

  const syncMeshes = () => {
    for (let i = 0; i < visuals.length; i++) {
      const body = bodies[i];
      const t = body.translation();
      const rot = body.rotation();
      tmpQuat.set(rot.x, rot.y, rot.z, rot.w);
      tmpPos.set(t.x, t.y, t.z);
      placeInstances(visuals[i], tmpPos, tmpQuat);
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
    }
    ferry.respawn();
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
            .setDensity(VOXEL_DENSITY)
            .setFriction(0.5)
            .setRestitution(0);
          w.createCollider(collider, body);
        }
        bodies.push(body);
      }
      ferry.initBody(w);
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
        ferry.applyBuoyancy(time);
        world.step();
        accumulator -= FIXED_DT;
        steps++;
      }
      if (steps === MAX_SUBSTEPS) accumulator = 0; // drop backlog past the cap
      syncMeshes();
      ferry.sync();
      if (arrowGroup.visible) updateArrows();
    },
    buildGui: (gui) => {
      const folder = gui.addFolder("Physics");
      folder.add({ respawn }, "respawn").name("respawn shapes");
      folder.add(params, "drag", 0, 3, 0.05).name("water drag");
      const toggles = { arrows: false };
      folder
        .add(toggles, "arrows")
        .name("force arrows")
        .onChange((on: boolean) => {
          arrowGroup.visible = on;
          if (!on) for (const arrow of arrows) arrow.visible = false;
        });
      const view = { ferry: true };
      folder
        .add(view, "ferry")
        .name("ferry (heavy)")
        .onChange((on: boolean) => {
          ferry.object.visible = on;
        });
    },
    dispose: () => {
      world?.free();
      boxGeometry.dispose();
      for (const material of materials) material.dispose();
      for (const v of visuals) v.mesh.dispose();
      for (const arrow of arrows) arrow.dispose();
      ferry.dispose();
    },
  };
}

import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import type GUI from "three/examples/jsm/libs/lil-gui.module.min.js";
import type { Ocean } from "./ocean";

/**
 * Rapier physics for Shipwright — the OTHER half of the HYBRID floating decision
 * (see CLAUDE.md "Water architecture"). Decorative floaters ride the water
 * kinematically (`ocean.sampleParticle`, in scene.ts); anything that must collide
 * and carry momentum is a Rapier dynamic body floated by *force-based buoyancy*.
 *
 * This module is the buoyancy testbed: it drops the five Tetris tetrominoes —
 * each built from the game's 0.5 m³ voxel cube — into the sea as dynamic bodies
 * with a compound (one-box-per-voxel) collider, then floats them by sampling the
 * water height under each voxel (`ocean.sampleSurface`) and pushing up in
 * proportion to how submerged that voxel is. Because the up-force is applied at
 * each voxel's own point, the torques emerge for free: shapes self-right, tip,
 * and bob differently by geometry. It's scoped to collision / momentum / buoyancy
 * ONLY — never water rendering (that's ocean.ts).
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

// Densities in kg/m³. The voxel density is ~half water, so a tetromino settles at
// roughly half-submerged (equilibrium submerged fraction = voxelDensity/water).
const WATER_DENSITY = 1000;
const VOXEL_DENSITY = 500;

// Fixed physics timestep (deterministic). We accumulate real frame time and step
// in whole FIXED_DT chunks; MAX_SUBSTEPS caps catch-up so a long stall (hidden
// tab) can't trigger a spiral of death — leftover backlog past the cap is dropped.
const FIXED_DT = 1 / 60;
const MAX_SUBSTEPS = 5;

// Global damping is kept LOW on purpose: heavy linear damping would fight the ride
// (it damps toward world-rest, but the water itself is moving). The per-voxel drag
// below — relative to the local WATER velocity — provides the settling instead, so
// the body damps toward the orbital motion rather than toward standing still.
const LINEAR_DAMPING = 0.05;
const ANGULAR_DAMPING = 0.4;
const DRAG_DEFAULT = 200; // per-voxel drag coefficient toward the water velocity

// Half-step used to finite-difference the water (particle) velocity analytically.
const VELOCITY_EPS = 1 / 120;

// Spawn layout: a deterministic row dropped from a small height, each with a fixed
// (non-random — determinism) tilt so they enter at an angle and must self-right.
const SPAWN_SPACING = 4;
const SPAWN_HEIGHT = 4;
const SPAWN_Z = -6;

const ARROW_COLOR = 0x35ffd0;
const ARROW_SCALE = 1 / 300; // newtons → metres for the debug force arrows

const UP = new THREE.Vector3(0, 1, 0);
const ORIGIN = new THREE.Vector3(0, 0, 0);
const ZERO = { x: 0, y: 0, z: 0 };

interface Tetromino {
  name: string;
  color: number;
  /** Voxel cells on an integer grid in the X-Y plane (X right, Y up). */
  cells: [number, number][];
}

// The classic seven minus its reflections — one of each distinct silhouette, in
// classic Tetris colours. Spawned upright (cells in X-Y) so they must topple and
// self-right to a stable waterline, which is exactly what we want to watch.
const TETROMINOES: Tetromino[] = [
  { name: "I", color: 0x28c6d6, cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
  { name: "O", color: 0xf2c94c, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  { name: "T", color: 0xa06cd5, cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
  { name: "S", color: 0x6fcf6f, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  { name: "L", color: 0xf2994a, cells: [[0, 0], [0, 1], [0, 2], [1, 0]] },
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
  /** Step the fixed-timestep sim for `delta` real seconds and sync the meshes. */
  update: (delta: number) => void;
  /** Add the "Physics" controls (respawn / drag / force arrows) to the GUI. */
  buildGui: (gui: GUI) => void;
  dispose: () => void;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export function createPhysics(ocean: Ocean): Physics {
  const params = { drag: DRAG_DEFAULT };

  const group = new THREE.Group();
  const boxGeometry = new THREE.BoxGeometry(VOXEL, VOXEL, VOXEL);
  const materials: THREE.MeshStandardMaterial[] = [];
  const visuals: Visual[] = [];

  const totalVoxels = TETROMINOES.reduce((sum, t) => sum + t.cells.length, 0);
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

  let arrowCursor = 0;
  TETROMINOES.forEach((tet, i) => {
    const n = tet.cells.length;
    let cxSum = 0;
    let cySum = 0;
    for (const [cx, cy] of tet.cells) {
      cxSum += cx;
      cySum += cy;
    }
    const cxMean = cxSum / n;
    const cyMean = cySum / n;
    const offsets = tet.cells.map(
      ([cx, cy]) => new THREE.Vector3((cx - cxMean) * VOXEL, (cy - cyMean) * VOXEL, 0),
    );

    const material = new THREE.MeshStandardMaterial({
      color: tet.color,
      roughness: 0.6,
      metalness: 0.05,
    });
    materials.push(material);
    const mesh = new THREE.InstancedMesh(boxGeometry, material, n);
    // Instances are translated metres from the mesh origin and drift as they
    // float, so the origin-centred bounding sphere would wrongly cull the whole
    // mesh at some angles. These are tiny (4 instances) — just always draw them.
    mesh.frustumCulled = false;
    group.add(mesh);

    const spawnPos = new THREE.Vector3(
      (i - (TETROMINOES.length - 1) / 2) * SPAWN_SPACING,
      SPAWN_HEIGHT,
      SPAWN_Z,
    );
    // Deterministic tilt (index-derived axis + angle, no randomness).
    const axis = new THREE.Vector3(1, 0.3 * i, 0.6).normalize();
    const spawnQuat = new THREE.Quaternion().setFromAxisAngle(axis, 0.4 + i * 0.15);

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

  // Rapier is loaded async (init); until then there's no world and update no-ops.
  // `bodies` is index-parallel to `visuals` once init resolves.
  let world: RAPIER.World | null = null;
  const bodies: RAPIER.RigidBody[] = [];
  let accumulator = 0;
  let simTime = 0;

  // Local water velocity = analytic time-derivative of the Gerstner particle ride
  // at this (x, z), by central finite difference. This is what the drag nudges the
  // body toward, so it rides the orbital motion emergently.
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
          continue;
        }

        // Archimedes: up-force = weight of displaced water = ρ·g·(submerged vol).
        const buoyancy = WATER_DENSITY * GRAVITY * submerged * VOXEL_VOLUME;

        // Drag toward the local water velocity. Point velocity of this voxel is
        // linvel + angvel × r (r from the centre of mass), so the drag resists
        // both translation and spin — damping toward the orbit, not toward rest.
        const wv = waterVelocity(wx, wz, time);
        const rx = wx - com.x;
        const ry = wy - com.y;
        const rz = wz - com.z;
        const pvx = lin.x + (ang.y * rz - ang.z * ry);
        const pvy = lin.y + (ang.z * rx - ang.x * rz);
        const pvz = lin.z + (ang.x * ry - ang.y * rx);
        const dc = params.drag * submerged;
        const fx = (wv.x - pvx) * dc;
        const fy = buoyancy + (wv.y - pvy) * dc;
        const fz = (wv.z - pvz) * dc;

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
      world = w;
    },
    update: (delta) => {
      if (!world) return;
      accumulator += delta;
      let steps = 0;
      while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
        applyBuoyancy(simTime);
        world.step();
        simTime += FIXED_DT;
        accumulator -= FIXED_DT;
        steps++;
      }
      if (steps === MAX_SUBSTEPS) accumulator = 0; // drop backlog past the cap
      syncMeshes();
      if (arrowGroup.visible) updateArrows();
    },
    buildGui: (gui) => {
      const folder = gui.addFolder("Physics");
      folder.add({ respawn }, "respawn").name("respawn shapes");
      folder.add(params, "drag", 0, 600, 10).name("water drag");
      const toggles = { arrows: false };
      folder
        .add(toggles, "arrows")
        .name("force arrows")
        .onChange((on: boolean) => {
          arrowGroup.visible = on;
          if (!on) for (const arrow of arrows) arrow.visible = false;
        });
    },
    dispose: () => {
      world?.free();
      boxGeometry.dispose();
      for (const material of materials) material.dispose();
      for (const v of visuals) v.mesh.dispose();
      for (const arrow of arrows) arrow.dispose();
    },
  };
}

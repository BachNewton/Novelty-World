import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import type { Ocean } from "./ocean";

/**
 * The Helsinki–Tallinn ferry — a to-scale reference for how something *very* large
 * responds to the sea. Modelled on the Tallink MegaStar / MyStar: ~212 m long,
 * 30.6 m beam, ~7 m draft, built from the same 0.5 m voxel cube as everything else
 * (so the scale is honest) — roughly a 424 × 61 voxel footprint.
 *
 * It's a Rapier dynamic body so it genuinely heaves, pitches, and rolls with the
 * waves. But floating it by sampling every one of its ~60k voxels each physics
 * substep is absurd, so buoyancy is sampled at a sparse GRID OF PROBE POINTS across
 * the hull (the standard real-time-boat technique): each probe applies the buoyancy
 * of the hull column above it from `ocean.sampleSurface`, so bow and stern riding
 * different parts of a swell produce real pitch, and port/starboard produce roll —
 * all for a couple hundred samples instead of tens of thousands. The visual voxels
 * are just rendered instances carried rigidly by the body (moved once per frame, not
 * per voxel). Same HYBRID philosophy, same determinism as physics.ts.
 */

const VOXEL = 0.5;
const WATER_DENSITY = 1000;
const GRAVITY = 9.81;
const VELOCITY_EPS = 1 / 120;

// Hull dimensions in VOXELS. Waterline sits at y = 0 (the body origin), keel below,
// main deck above. 424 × 61 ≈ 212 m × 30.6 m; keel −14 → −7 m draft, deck +8 → +4 m
// freeboard. The superstructure is a schematic blocky shell (shorter than the real
// ~40 m air draft to keep the voxel count sane).
const LEN = 424;
const BEAM = 61;
const KEEL = -14;
const DECK = 8;
const SUP_X0 = 60;
const SUP_X1 = 360;
const SUP_Z0 = 8;
const SUP_Z1 = 52;
const SUP_TOP = 34;

const LEN_M = LEN * VOXEL;
const BEAM_M = BEAM * VOXEL;
const KEEL_M = KEEL * VOXEL;
const DRAFT = -KEEL_M; // 7 m — rest draft, so the probe columns balance the weight
const HULL_H = (DECK - KEEL) * VOXEL;
const COLLIDER_Y = ((KEEL + DECK) / 2) * VOXEL; // low centre of mass → stable
const SUBMERGE_CAP = HULL_H; // clamp a probe's column to the hull depth

// Buoyancy probe grid over the footprint. Each probe carries the hull column above
// its patch of area; together they tile the full waterplane.
const PROBE_NX = 32;
const PROBE_NZ = 8;
// Drag per probe (per m² of its patch). Light damping (heave ζ ≈ 0.25,
// ζ = FERRY_DRAG / (2·ρ·√(g·draft))): the hull tracks the long swell with a gentle,
// lively heave/pitch. Stable because the forcing is far below the hull's heave
// resonance — no launch pump to brace against.
const FERRY_DRAG = 4000;

const SPAWN = new THREE.Vector3(0, 0.2, -70); // well behind the small stuff
const HULL_COLOR = 0x24406b; // navy hull
const SUPER_COLOR = 0xf0eee7; // white superstructure

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

interface Probe {
  x: number;
  z: number;
}

export interface Ferry {
  object: THREE.Object3D;
  /** Create the dynamic body in the shared world (after RAPIER.init). */
  initBody: (world: RAPIER.World) => void;
  /** Apply the probe buoyancy + drag forces for one sub-step (before world.step). */
  applyBuoyancy: (time: number) => void;
  /** Pose the rendered hull from the body transform (after world.step). */
  sync: () => void;
  respawn: () => void;
  dispose: () => void;
}

// The voxel shell: hull walls, fore/aft open decks, and a blocky superstructure.
// Returns metric cell centres split into hull (≤ deck) and superstructure (> deck),
// so each can be a differently-coloured InstancedMesh.
function buildVoxels(): { hull: THREE.Vector3[]; superstructure: THREE.Vector3[] } {
  const seen = new Set<string>();
  const hull: THREE.Vector3[] = [];
  const superstructure: THREE.Vector3[] = [];
  const add = (x: number, y: number, z: number) => {
    const key = `${x},${y},${z}`;
    if (seen.has(key)) return;
    seen.add(key);
    const center = new THREE.Vector3(
      (x - (LEN - 1) / 2) * VOXEL,
      y * VOXEL,
      (z - (BEAM - 1) / 2) * VOXEL,
    );
    (y > DECK ? superstructure : hull).push(center);
  };

  // Hull side walls (port/starboard) + bow/stern walls, keel to deck.
  for (let x = 0; x < LEN; x++) {
    for (let y = KEEL; y <= DECK; y++) {
      add(x, y, 0);
      add(x, y, BEAM - 1);
    }
  }
  for (let z = 0; z < BEAM; z++) {
    for (let y = KEEL; y <= DECK; y++) {
      add(0, y, z);
      add(LEN - 1, y, z);
    }
  }
  // Deck: open weather-decks fore and aft of the superstructure, plus an edge rim
  // beneath it (the rest of the deck is hidden under the superstructure).
  for (let x = 0; x < LEN; x++) {
    for (let z = 0; z < BEAM; z++) {
      if (x < SUP_X0 || x > SUP_X1) add(x, DECK, z);
    }
  }
  for (let x = SUP_X0; x <= SUP_X1; x++) {
    add(x, DECK, 0);
    add(x, DECK, BEAM - 1);
  }
  // Superstructure shell (walls + roof).
  for (let x = SUP_X0; x <= SUP_X1; x++) {
    for (let y = DECK + 1; y <= SUP_TOP; y++) {
      add(x, y, SUP_Z0);
      add(x, y, SUP_Z1);
    }
  }
  for (let z = SUP_Z0; z <= SUP_Z1; z++) {
    for (let y = DECK + 1; y <= SUP_TOP; y++) {
      add(SUP_X0, y, z);
      add(SUP_X1, y, z);
    }
  }
  for (let x = SUP_X0; x <= SUP_X1; x++) {
    for (let z = SUP_Z0; z <= SUP_Z1; z++) {
      add(x, SUP_TOP, z);
    }
  }
  return { hull, superstructure };
}

export function createFerry(ocean: Ocean): Ferry {
  const group = new THREE.Group();
  const { hull, superstructure } = buildVoxels();

  const boxGeometry = new THREE.BoxGeometry(VOXEL, VOXEL, VOXEL);
  const dummy = new THREE.Object3D();
  const makeMesh = (cells: THREE.Vector3[], color: number) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05 });
    const mesh = new THREE.InstancedMesh(boxGeometry, material, cells.length);
    mesh.frustumCulled = false; // one rigid body — its bounds move with the group
    cells.forEach((c, i) => {
      dummy.position.copy(c);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    return { mesh, material };
  };
  const hullMesh = makeMesh(hull, HULL_COLOR);
  const superMesh = makeMesh(superstructure, SUPER_COLOR);

  // Probe grid over the waterplane; each probe owns an equal patch of the footprint.
  const dx = LEN_M / PROBE_NX;
  const dz = BEAM_M / PROBE_NZ;
  const probeArea = dx * dz;
  const probes: Probe[] = [];
  for (let i = 0; i < PROBE_NX; i++) {
    for (let j = 0; j < PROBE_NZ; j++) {
      probes.push({
        x: -LEN_M / 2 + (i + 0.5) * dx,
        z: -BEAM_M / 2 + (j + 0.5) * dz,
      });
    }
  }
  // Mass to float at the rest draft: weight = displaced water over the full column.
  const mass = WATER_DENSITY * probes.length * probeArea * DRAFT;
  const density = mass / (LEN_M * HULL_H * BEAM_M);

  const tmpQuat = new THREE.Quaternion();
  const tmpVec = new THREE.Vector3();
  const wvOut = new THREE.Vector3();
  const waterVelocity = (x: number, z: number, time: number): THREE.Vector3 => {
    const p1 = ocean.sampleParticle(x, z, time + VELOCITY_EPS).position;
    const p0 = ocean.sampleParticle(x, z, time - VELOCITY_EPS).position;
    return wvOut.subVectors(p1, p0).multiplyScalar(1 / (2 * VELOCITY_EPS));
  };

  let body: RAPIER.RigidBody | null = null;

  return {
    object: group,
    initBody: (world) => {
      const desc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(SPAWN.x, SPAWN.y, SPAWN.z)
        .setLinearDamping(0.3)
        .setAngularDamping(0.6)
        .setCanSleep(false);
      const rb = world.createRigidBody(desc);
      const collider = RAPIER.ColliderDesc.cuboid(LEN_M / 2, HULL_H / 2, BEAM_M / 2)
        .setTranslation(0, COLLIDER_Y, 0)
        .setDensity(density);
      world.createCollider(collider, rb);
      body = rb;
    },
    applyBuoyancy: (time) => {
      if (!body) return;
      const t = body.translation();
      const rot = body.rotation();
      tmpQuat.set(rot.x, rot.y, rot.z, rot.w);
      const com = body.worldCom();
      const lin = body.linvel();
      const ang = body.angvel();
      body.resetForces(false);
      body.resetTorques(false);

      for (const probe of probes) {
        tmpVec.set(probe.x, KEEL_M, probe.z).applyQuaternion(tmpQuat);
        const wx = tmpVec.x + t.x;
        const wy = tmpVec.y + t.y;
        const wz = tmpVec.z + t.z;
        const depth = clamp(ocean.sampleSurface(wx, wz, time).height - wy, 0, SUBMERGE_CAP);
        if (depth <= 0) continue;

        const buoyancy = WATER_DENSITY * GRAVITY * probeArea * depth;
        const wv = waterVelocity(wx, wz, time);
        const rx = wx - com.x;
        const ry = wy - com.y;
        const rz = wz - com.z;
        const relx = wv.x - (lin.x + (ang.y * rz - ang.z * ry));
        const rely = wv.y - (lin.y + (ang.z * rx - ang.x * rz));
        const relz = wv.z - (lin.z + (ang.x * ry - ang.y * rx));
        const dc = FERRY_DRAG * probeArea * clamp(depth / DRAFT, 0, 1);
        body.addForceAtPoint(
          { x: relx * dc, y: buoyancy + rely * dc, z: relz * dc },
          { x: wx, y: wy, z: wz },
          true,
        );
      }
    },
    sync: () => {
      if (!body) return;
      const t = body.translation();
      const rot = body.rotation();
      group.position.set(t.x, t.y, t.z);
      group.quaternion.set(rot.x, rot.y, rot.z, rot.w);
    },
    respawn: () => {
      if (!body) return;
      body.setTranslation(SPAWN, true);
      body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      body.resetForces(true);
      body.resetTorques(true);
    },
    dispose: () => {
      boxGeometry.dispose();
      hullMesh.material.dispose();
      superMesh.material.dispose();
      hullMesh.mesh.dispose();
      superMesh.mesh.dispose();
    },
  };
}

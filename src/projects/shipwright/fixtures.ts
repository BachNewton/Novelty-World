import * as THREE from "three";
import { ALUMINIUM, COPPER, MATTE_WHITE, OAK, STEEL, createMaterial, type MaterialSpec } from "./materials";

/**
 * Ship FIXTURES — the functional, non-voxel parts a player mounts on a hull: the HELM (a ship's wheel)
 * and the ENGINE (an electric outboard). Pure content, the fixtures sibling of `shapes.ts`: this file
 * builds the meshes and nothing else. Placement input lives in `builder.ts`; attaching a fixture to a
 * body (transform + mass) lives in `physics.ts`; the wheel→engine steering LINKAGE is a later step.
 *
 * ## Why fixtures are meshes, not voxels
 *
 * A ship's wheel built from 0.5 m cubes is a blocky ~2 m disc that cannot spin smoothly. Fixtures are
 * real three.js meshes pinned to ONE cell of a voxel body (they float/tilt with the hull and add mass),
 * but they overhang that cell freely and animate as rigid sub-parts. They render on the DEFAULT layer,
 * so the screen-space water refracts and reflects them like any other scene object.
 *
 * ## The data model this file is built for: a list, not a pair
 *
 * A body owns a *list* of fixtures and a single body-level steering scalar (reserved for the linkage
 * step, not implemented here). That is what makes multiples "just work": every helm on a body writes
 * the same steering angle and every helm displays it (dual sailboat wheels, an upper + lower helm turn
 * together); every engine reads that one angle (twin/quad engines steer in unison). So there is no "the
 * helm" or "the engine" anywhere — only `Fixture`s, each exposing the sub-transforms the linkage drives.
 *
 * ## Local frame (shared by every fixture)
 *
 * Origin = the mount point (where the fixture pins to its cell). **+Z = the fixture's facing** (a helm's
 * forward / the way the helmsman looks; an engine's outward thrust/wash direction). **+Y = up.**
 * Placement rotates the whole group so +Z lands on the chosen cardinal (helm) or the aimed hull-face
 * normal (engine); this file always builds in the canonical +Z frame.
 *
 * ## The engine is ELECTRIC (Torqeedo / ePropulsion, not a gas outboard)
 *
 * The game is about nature and the sea, so the motor is all-electric: a compact, smooth powerhead (no
 * boxy gas cowling, no vents, no pull-cord) over a slim shaft and a torpedo POD motor — on a direct-drive
 * electric outboard the motor lives in the underwater pod, right behind the prop. The silhouette carries
 * the "electric" read; the transom mount plate is what the on-deck placement gesture hooks over the lip.
 */

export type FixtureKind = "helm" | "engine";

/** Every fixture kind, for iteration / the placement catalogue. */
export const FIXTURE_KINDS = ["helm", "engine"] as const;

export interface Fixture {
  kind: FixtureKind;
  /** The whole assembly, built in the canonical +Z-facing local frame. Add to the scene / a body. */
  object: THREE.Group;
  /** HELM: the wheel disc. Spins about local Z (the axle) to show the steering angle. Null on engines. */
  wheel: THREE.Object3D | null;
  /** ENGINE: the swivel mount. Yaws about local Y to point the thrust (steering). Null on helms. */
  steer: THREE.Object3D | null;
  /** ENGINE: the propeller. Spins about local Z under power. Null on helms. */
  prop: THREE.Object3D | null;
  /** Detach from the scene graph and free the geometries + materials this fixture owns. */
  dispose: () => void;
}

// --- Helm ---------------------------------------------------------------------
const HELM_PEDESTAL_HEIGHT = 0.9; // m — column base at the deck (y=0) up to the axle head
const HELM_WHEEL_RADIUS = 0.35; // m — ~0.8 m wheel, finer than a voxel so it reads as a real wheel
const HELM_WHEEL_TUBE = 0.03;
const HELM_SPOKES = 6;
const HELM_HANDLE_OVERHANG = 0.09; // how far the turned grip handles project past the rim, on the helmsman's side only

// --- Engine (electric outboard) ----------------------------------------------
const ENGINE_HOUSING_HEIGHT = 0.24;
const ENGINE_SHAFT_LENGTH = 0.7; // slim pylon from the powerhead down to the pod
const ENGINE_POD_LENGTH = 0.3; // torpedo motor pod, lying along +Z (holds the motor, so it runs a bit long)
const ENGINE_POD_RADIUS = 0.08;
const ENGINE_PROP_RADIUS = 0.24; // blade span from the hub — a longer blade is a bigger disc
const ENGINE_PROP_CHORD = 0.09; // blade width (fore-aft), so the blades read as blades, not needles
const ENGINE_PROP_BLADES = 3;

/** Collects the geometries + materials a fixture creates so `dispose()` can free exactly those. */
interface Disposer {
  geometry: <T extends THREE.BufferGeometry>(g: T) => T;
  material: (spec: MaterialSpec) => THREE.MeshPhysicalMaterial;
  dispose: () => void;
}

const createDisposer = (): Disposer => {
  const geoms: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  return {
    geometry: (g) => {
      geoms.push(g);
      return g;
    },
    material: (spec) => {
      const m = createMaterial(spec);
      mats.push(m);
      return m;
    },
    dispose: () => {
      geoms.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
    },
  };
};

/** Real scene geometry casts + receives shadows like the rest of the world. */
const enableShadows = (object: THREE.Object3D): void => {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
};

const createHelm = (): Fixture => {
  const d = createDisposer();
  const object = new THREE.Group();
  object.name = "helm";

  const wood = d.material(OAK);
  const steel = d.material(STEEL); // stainless binnacle column
  const brass = d.material(COPPER); // hub accent

  const pedestal = new THREE.Mesh(
    d.geometry(new THREE.CylinderGeometry(0.05, 0.08, HELM_PEDESTAL_HEIGHT, 16)),
    steel,
  );
  pedestal.position.y = HELM_PEDESTAL_HEIGHT / 2;
  object.add(pedestal);

  const head = new THREE.Mesh(d.geometry(new THREE.SphereGeometry(0.07, 16, 12)), steel);
  head.position.y = HELM_PEDESTAL_HEIGHT;
  object.add(head);

  // The wheel is a child transform sat on the AFT (−Z) side of the column head, spinning about local Z
  // (its axle). The helmsman stands aft and grips the rungs (which project further −Z), so the binnacle
  // column is on the far side of the wheel from them — the bow side. Torus lies in XY, axis Z.
  const wheel = new THREE.Group();
  wheel.position.set(0, HELM_PEDESTAL_HEIGHT + 0.02, -0.08);
  object.add(wheel);

  wheel.add(new THREE.Mesh(d.geometry(new THREE.TorusGeometry(HELM_WHEEL_RADIUS, HELM_WHEEL_TUBE, 12, 32)), wood));

  const hub = new THREE.Mesh(d.geometry(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 12)), brass);
  hub.rotation.x = Math.PI / 2; // cylinder axis Y → Z, so the hub caps the axle
  wheel.add(hub);

  // One geometry each, reused across the spokes/handles so dispose frees them once.
  const spokeGeo = d.geometry(new THREE.CylinderGeometry(0.012, 0.012, HELM_WHEEL_RADIUS, 8));
  const handleGeo = d.geometry(new THREE.CylinderGeometry(0.02, 0.02, HELM_HANDLE_OVERHANG, 8));
  for (let i = 0; i < HELM_SPOKES; i++) {
    const angle = (i / HELM_SPOKES) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const spoke = new THREE.Mesh(spokeGeo, wood);
    spoke.position.set((cos * HELM_WHEEL_RADIUS) / 2, (sin * HELM_WHEEL_RADIUS) / 2, 0);
    spoke.rotation.z = angle - Math.PI / 2; // cylinder's +Y axis → the radial direction
    wheel.add(spoke);

    const handle = new THREE.Mesh(handleGeo, wood);
    handle.position.set(cos * HELM_WHEEL_RADIUS, sin * HELM_WHEEL_RADIUS, -HELM_HANDLE_OVERHANG / 2);
    handle.rotation.x = Math.PI / 2; // grips project toward −Z (the helmsman, aft of the +Z-facing wheel) — the iconic knobs
    wheel.add(handle);
  }

  enableShadows(object);
  return {
    kind: "helm",
    object,
    wheel,
    steer: null,
    prop: null,
    dispose: () => {
      object.removeFromParent();
      d.dispose();
    },
  };
};

const createEngine = (): Fixture => {
  const d = createDisposer();
  const object = new THREE.Group();
  object.name = "engine";

  const white = d.material(MATTE_WHITE); // the electric powerhead — clean, not a gas cowling
  const metal = d.material(ALUMINIUM); // bracket, shaft, pod, prop

  // Fixed to the hull: a transom mount PLATE that bolts flat to a vertical face, and the swivel PIN the
  // motor turns on. This is the mounting hardware — no gas-engine cowling. The ORIGIN is the clamp point,
  // placed at the CENTRE of the mount voxel's outboard face, so the plate is CENTRED on the 0.5 m voxel
  // (spanning ±0.11 of ±0.25) rather than hooking its top lip; it sits just outboard of the face (+z) to
  // grip the outer surface. A single clamp bracket grabs the transom face and reaches out to the swivel
  // pin; the motor hangs as one straight column below it. Kept deliberately simple — it's a game prop.
  const motorZ = 0.12; // how far outboard the swivel axis (and the motor under it) stands off the hull
  const bracket = new THREE.Mesh(d.geometry(new THREE.BoxGeometry(0.12, 0.18, motorZ + 0.08)), metal);
  bracket.position.set(0, 0, (motorZ + 0.08) / 2);
  object.add(bracket);
  const swivelPin = new THREE.Mesh(d.geometry(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 12)), metal);
  swivelPin.position.set(0, 0, 0.03 + motorZ);
  object.add(swivelPin);

  // Everything below the pin yaws about local Y to steer. (A dedicated above-water heading cue is
  // deferred — the honest indicator is the pod visibly turning, which arrives when the engine steers.)
  const steer = new THREE.Group();
  steer.position.set(0, 0, 0.03 + motorZ);
  object.add(steer);

  const housing = new THREE.Mesh(
    d.geometry(new THREE.CylinderGeometry(0.09, 0.11, ENGINE_HOUSING_HEIGHT, 20)),
    white,
  );
  housing.position.y = -0.04 - ENGINE_HOUSING_HEIGHT / 2; // hangs just below the pin
  steer.add(housing);

  const shaftTop = -0.04 - ENGINE_HOUSING_HEIGHT;
  const shaft = new THREE.Mesh(d.geometry(new THREE.CylinderGeometry(0.035, 0.035, ENGINE_SHAFT_LENGTH, 12)), metal);
  shaft.position.y = shaftTop - ENGINE_SHAFT_LENGTH / 2;
  steer.add(shaft);

  const podY = shaftTop - ENGINE_SHAFT_LENGTH;
  const pod = new THREE.Mesh(d.geometry(new THREE.CapsuleGeometry(ENGINE_POD_RADIUS, ENGINE_POD_LENGTH, 8, 16)), metal);
  pod.rotation.x = Math.PI / 2; // capsule axis Y → Z, so the torpedo lies fore-aft
  pod.position.set(0, podY, -0.02);
  steer.add(pod);

  // Propeller at the aft end of the pod, spinning about local Z under power.
  const prop = new THREE.Group();
  prop.position.set(0, podY, ENGINE_POD_LENGTH / 2 + 0.03);
  steer.add(prop);
  const bladeGeo = d.geometry(new THREE.BoxGeometry(0.02, ENGINE_PROP_RADIUS, ENGINE_PROP_CHORD));
  for (let i = 0; i < ENGINE_PROP_BLADES; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.z = (i / ENGINE_PROP_BLADES) * Math.PI * 2; // fan the blades around the hub
    prop.add(pivot);
    const blade = new THREE.Mesh(bladeGeo, metal);
    blade.position.y = ENGINE_PROP_RADIUS / 2;
    blade.rotation.y = 0.5; // pitch the chord so it reads as a propeller, not a fan of flat plates
    pivot.add(blade);
  }

  enableShadows(object);
  return {
    kind: "engine",
    object,
    wheel: null,
    steer,
    prop,
    dispose: () => {
      object.removeFromParent();
      d.dispose();
    },
  };
};

/** Build a fresh fixture of the given kind. */
export const createFixture = (kind: FixtureKind): Fixture => (kind === "helm" ? createHelm() : createEngine());

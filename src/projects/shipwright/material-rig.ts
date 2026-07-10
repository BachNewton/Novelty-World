import * as THREE from "three";
import {
  DEFAULT_PROBE_SET,
  MATERIALS,
  createMaterial,
  isMaterialName,
  materialByName,
  type MaterialName,
} from "./materials";

/**
 * The material calibration rig: a grid of probes of KNOWN reflectance, at three depths, in one frame.
 *
 * ## Why one frame and not three
 *
 * The obvious design is a rig you slide up and down, capturing "above water", "at the waterline" and
 * "submerged" as separate shots. That design cannot find the bug it most needs to find. If one
 * reviewer approves the above-water frames and another approves the submerged frames, both can be
 * right while the renderer is still wrong — because the surface where the two models MEET is in
 * neither picture. A sphere sitting half in and half out of the sea is the test: if the above-water
 * shading and the underwater absorption disagree about that sphere, the seam is visible instantly.
 *
 * So every frame contains all three rows, and the middle row straddles the waterline.
 *
 * ## Depends on nothing
 *
 * `three` and `./materials`. That is on purpose: this rig has to be dropped onto the OLD lighting
 * model to A/B against it, and a calibration instrument that only compiles against the thing it is
 * calibrating is not an instrument. Nothing here reads the sun, the sky, or the exposure.
 *
 * ## Shapes
 *
 * A sphere gives a continuous sweep of surface normals — every incidence angle from 0 to 90 degrees
 * at once, so the terminator, the Fresnel rim and the specular lobe are all legible in a single
 * object. A cube gives flat faces at known orientations, which is what you need to read the *ratio*
 * between a sun-facing plane and a sky-facing plane. Neither substitutes for the other, so the rig
 * carries both, side by side, per material.
 */

const SPHERE_RADIUS = 0.6;
const CUBE_SIZE = 1;

/** Horizontal spacing between one material's (sphere, cube) pair and the next. */
const COLUMN_PITCH = 2.8;
/** How far apart the sphere and the cube of the same material sit within a column. */
const PAIR_GAP = 1.15;

/**
 * The three rows. `y` is the object's CENTRE, so the waterline row's sphere and cube are each cut in
 * half by the mean sea surface. `z` grows toward the camera, and the deepest row is NEAREST: from an
 * elevated eye the submerged row then sits lowest in frame, the floating row highest, and nothing
 * occludes anything.
 *
 * The offsets clear the default sea (amplitude ~0.5 m), so `above` really is above and `submerged`
 * really is under — at a storm sea state the crests will wash over them, which is a legitimate thing
 * to photograph and not a reason to move them.
 */
const ROWS = [
  { name: "submerged", y: -1.8, z: 3.4 },
  { name: "waterline", y: 0, z: 0 },
  { name: "above", y: 1.5, z: -3.4 },
] as const;

export type RowName = (typeof ROWS)[number]["name"];

export interface MaterialRig {
  object: THREE.Object3D;
  /** Choose which materials are in frame, left to right. Rebuilds the grid. */
  setMaterials: (names: MaterialName[]) => void;
  /** The current left-to-right order — what a blind reviewer needs to be told, and nothing more. */
  materialOrder: () => MaterialName[];
  /** Show or hide a depth row, for isolating one at a time. */
  setRow: (row: RowName, visible: boolean) => void;
  dispose: () => void;
}

export const createMaterialRig = (): MaterialRig => {
  const group = new THREE.Group();
  group.name = "material-rig";
  group.visible = false;

  // One geometry each, shared across every probe. The materials are what differ; the shapes must not.
  const sphereGeometry = new THREE.SphereGeometry(SPHERE_RADIUS, 64, 48);
  const cubeGeometry = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);

  const rowGroups = new Map<RowName, THREE.Group>();
  for (const row of ROWS) {
    const rowGroup = new THREE.Group();
    rowGroup.name = `material-rig-${row.name}`;
    group.add(rowGroup);
    rowGroups.set(row.name, rowGroup);
  }

  let order: MaterialName[] = [...DEFAULT_PROBE_SET];
  let materials: THREE.Material[] = [];

  const clear = () => {
    for (const rowGroup of rowGroups.values()) {
      rowGroup.clear();
    }
    materials.forEach((m) => m.dispose());
    materials = [];
  };

  const build = () => {
    clear();
    // Centre the grid on the origin so the rig cameras do not have to know how many probes there are.
    const span = (order.length - 1) * COLUMN_PITCH;

    order.forEach((name, column) => {
      const spec = materialByName(name);
      const x = column * COLUMN_PITCH - span / 2;

      for (const row of ROWS) {
        const rowGroup = rowGroups.get(row.name);
        if (rowGroup === undefined) continue;

        // One material instance per (material, row). Sharing across rows would be cheaper, but the
        // underwater rows will eventually want their own wet-surface treatment, and a shared material
        // would make that a per-row exception rather than a per-material one.
        const material = createMaterial(spec);
        materials.push(material);

        const sphere = new THREE.Mesh(sphereGeometry, material);
        sphere.position.set(x - PAIR_GAP / 2, row.y, row.z);

        const cube = new THREE.Mesh(cubeGeometry, material);
        cube.position.set(x + PAIR_GAP / 2, row.y, row.z);
        // Turn the cube off-axis so a sun at any azimuth lights one face and rakes another. Square-on
        // to the camera, every face would be either fully lit or fully unlit and the rig would read
        // the light's DIRECTION as a step function instead of a gradient.
        cube.rotation.y = Math.PI / 7;

        for (const mesh of [sphere, cube]) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          rowGroup.add(mesh);
        }
      }
    });
  };

  build();

  return {
    object: group,
    setMaterials: (names) => {
      const valid = names.filter((n): n is MaterialName => isMaterialName(n));
      if (valid.length === 0) return;
      order = valid;
      build();
    },
    materialOrder: () => [...order],
    setRow: (row, visible) => {
      const rowGroup = rowGroups.get(row);
      if (rowGroup !== undefined) rowGroup.visible = visible;
    },
    dispose: () => {
      clear();
      sphereGeometry.dispose();
      cubeGeometry.dispose();
    },
  };
};

/** Every material name, for a debug API that wants to offer the full gallery. */
export const ALL_MATERIAL_NAMES: MaterialName[] = MATERIALS.map((m) => m.name);

import * as THREE from "three";
import type { CatMesh } from "../../cats/sculpt";
import type { CatMeshReply } from "./cat-mesh.worker";
import { BONE_NAMES, BONES } from "../../cats/rig";

/*
 * The cat's skinned geometry, one per hair length, built the first time a
 * cat of that length is asked for and shared by every cat after. Meshing is
 * the expensive step (most of a second on a desktop, a few on a phone), so it
 * runs once a session, in a worker, off the page's thread.
 */

const geometries = new Map<boolean, THREE.BufferGeometry>();
const pending = new Map<boolean, Promise<THREE.BufferGeometry>>();

function geometryOf(mesh: CatMesh): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(mesh.skinIndex, 4));
  geometry.setAttribute("skinWeight", new THREE.BufferAttribute(mesh.skinWeight, 4));
  geometry.setAttribute("aOcclusion", new THREE.BufferAttribute(mesh.occlusion, 1));
  geometry.setAttribute("aPart", new THREE.BufferAttribute(mesh.part, 1));
  geometry.setIndex(new THREE.BufferAttribute(mesh.triangles, 1));
  // A walking or sitting cat reaches well outside its bind pose's box.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.2, 0), 0.6);
  return geometry;
}

/** The geometry for a hair length if it is meshed already, else null. */
export function readyCatGeometry(longHair: boolean): THREE.BufferGeometry | null {
  return geometries.get(longHair) ?? null;
}

/** The geometry for a hair length, meshed in a worker the first time it is asked for. */
export function loadCatGeometry(longHair: boolean): Promise<THREE.BufferGeometry> {
  let promise = pending.get(longHair);
  if (!promise) {
    promise = new Promise((resolve, reject) => {
      const worker = new Worker(new URL("./cat-mesh.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = ({ data }: MessageEvent<CatMeshReply>) => {
        worker.terminate();
        if ("error" in data) {
          reject(new Error(`Meshing the cat failed in its worker: ${data.error}`));
          return;
        }
        const geometry = geometryOf(data.mesh);
        geometries.set(longHair, geometry);
        resolve(geometry);
      };
      worker.onerror = (event) => {
        worker.terminate();
        reject(new Error(`The cat's mesh worker failed: ${event.message}`));
      };
      worker.postMessage(longHair);
    });
    pending.set(longHair, promise);
  }
  return promise;
}

/** Each bone's inverse bind matrix: the bind pose has no turns, so it is the pivot's own translation undone. */
export const BONE_INVERSES: readonly THREE.Matrix4[] = BONE_NAMES.map((name) => {
  const at = BONES.get(name)?.at;
  if (!at) throw new Error(`No bone ${name}`);
  return new THREE.Matrix4().makeTranslation(-at[0], -at[1], -at[2]);
});

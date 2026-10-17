import { useEffect, useState } from "react";
import * as THREE from "three";
import type { AnimalMesh } from "../../animals/sculpt";
import type { MeshReply, MeshRequest } from "./animal-mesh.worker";

/*
 * Animals' skinned geometries, one per sculpture (a cat's hair length, a
 * dog's ears and coat), built the first time one is asked for and shared by
 * every animal after. Meshing is the expensive step (most of a second on a
 * desktop, a few on a phone), so it runs once a session per sculpture, each
 * in a worker of its own, off the page's thread.
 */

const geometries = new Map<string, THREE.BufferGeometry>();
const pending = new Map<string, Promise<THREE.BufferGeometry>>();

export const meshKey = (request: MeshRequest) => JSON.stringify(request);

function geometryOf(mesh: AnimalMesh): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(mesh.skinIndex, 4));
  geometry.setAttribute("skinWeight", new THREE.BufferAttribute(mesh.skinWeight, 4));
  geometry.setAttribute("aOcclusion", new THREE.BufferAttribute(mesh.occlusion, 1));
  geometry.setAttribute("aPart", new THREE.BufferAttribute(mesh.part, 1));
  geometry.setIndex(new THREE.BufferAttribute(mesh.triangles, 1));
  // A walking or sitting animal reaches well outside its bind pose's box.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.2, 0), 0.6);
  return geometry;
}

/** The geometry for a sculpture, meshed in a worker the first time it is asked for. */
export function loadAnimalGeometry(request: MeshRequest): Promise<THREE.BufferGeometry> {
  const key = meshKey(request);
  let promise = pending.get(key);
  if (!promise) {
    promise = new Promise((resolve, reject) => {
      const worker = new Worker(new URL("./animal-mesh.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = ({ data }: MessageEvent<MeshReply>) => {
        worker.terminate();
        if ("error" in data) {
          reject(new Error(`Meshing ${key} failed in its worker: ${data.error}`));
          return;
        }
        const geometry = geometryOf(data.mesh);
        geometries.set(key, geometry);
        resolve(geometry);
      };
      worker.onerror = (event) => {
        worker.terminate();
        reject(new Error(`The mesh worker for ${key} failed: ${event.message}`));
      };
      worker.postMessage(request);
    });
    pending.set(key, promise);
  }
  return promise;
}

/** A sculpture's geometry once its worker has meshed it; until then null. A failed mesh throws here, loudly. */
export function useAnimalGeometry(request: MeshRequest): THREE.BufferGeometry | null {
  const key = meshKey(request);
  const [loaded, setLoaded] = useState<{ key: string; geometry: THREE.BufferGeometry } | null>(null);
  const [failure, setFailure] = useState<Error | null>(null);
  useEffect(() => {
    let live = true;
    loadAnimalGeometry(JSON.parse(key) as MeshRequest).then(
      (geometry) => live && setLoaded({ key, geometry }),
      (error: unknown) => live && setFailure(error instanceof Error ? error : new Error(String(error))),
    );
    return () => {
      live = false;
    };
  }, [key]);
  if (failure) throw failure;
  return geometries.get(key) ?? (loaded?.key === key ? loaded.geometry : null);
}

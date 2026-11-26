import * as THREE from "three/webgpu";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { kitPieceUrl, type KitPiece } from "../kit";
import type { Placement } from "../town";
import { fitPiece } from "./kit-fit";

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Pieces placed many times over, such as the ground's tiles and what grows on
 * them, drawn as one instanced mesh for each mesh of each piece: hundreds of
 * copies cost a draw per kind rather than a draw each. They only receive
 * shadows, as the town does.
 */
export async function buildInstanced(placements: readonly Placement[], load: (url: string) => Promise<GLTF>): Promise<THREE.Group> {
  const byPiece = Map.groupBy(placements, (p) => p.piece);
  const group = new THREE.Group();
  await Promise.all(
    [...byPiece].map(async ([piece, placed]: [KitPiece, Placement[]]) => {
      const scene = fitPiece(piece, (await load(kitPieceUrl(piece))).scene);
      scene.updateMatrixWorld(true);
      const at = placed.map(
        (p) =>
          new THREE.Matrix4().compose(
            new THREE.Vector3(p.x + 0.5, p.y ?? 0, p.z + 0.5),
            new THREE.Quaternion().setFromAxisAngle(UP, ((p.turn ?? 0) * Math.PI) / 2),
            new THREE.Vector3(1, 1, p.mirror === true ? -1 : 1),
          ),
      );
      scene.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const mesh = new THREE.InstancedMesh(child.geometry, child.material, at.length);
        at.forEach((placement, i) => mesh.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(placement, child.matrixWorld)));
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        group.add(mesh);
      });
    }),
  );
  return group;
}

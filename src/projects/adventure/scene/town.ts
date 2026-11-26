import * as THREE from "three/webgpu";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { kitPieceUrl } from "../kit";
import { fitPiece } from "./kit-fit";
import type { Placement } from "../town";

/**
 * The kit's pieces placed on the grid, as one group. Each piece's file loads
 * once, and every placement of it is a clone sharing its geometry and material.
 */
export async function buildTown(placements: readonly Placement[], load: (url: string) => Promise<GLTF>): Promise<THREE.Group> {
  const pieces = new Map(
    await Promise.all(
      [...new Set(placements.map((p) => p.piece))].map(async (piece) => [piece, fitPiece(piece, (await load(kitPieceUrl(piece))).scene)] as const),
    ),
  );
  const town = new THREE.Group();
  for (const placement of placements) {
    const piece = pieces.get(placement.piece);
    if (piece === undefined) throw new Error(`adventure: no town piece ${placement.piece}`);
    const placed = piece.clone();
    placed.position.set(placement.x + 0.5, placement.y ?? 0, placement.z + 0.5);
    placed.rotation.y = ((placement.turn ?? 0) * Math.PI) / 2;
    if (placement.mirror === true) placed.scale.z = -1;
    town.add(placed);
  }
  town.traverse((child) => {
    // Only the player casts a shadow: the sun's shadows reach only round them.
    if (child instanceof THREE.Mesh) child.receiveShadow = true;
  });
  return town;
}

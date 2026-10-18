import type { AnimalMesh } from "./sculpt";

/*
 * What every species' sculpture test reads off its mesh: how many triangles,
 * whether every vertex's bone weights sum to one, and where it stands.
 */

export const triangleCount = (mesh: AnimalMesh) => mesh.triangles.length / 3;

/** The worst a vertex's four weights miss summing to one by. */
export function worstWeightSum(mesh: AnimalMesh): number {
  let worst = 0;
  for (let v = 0; v < mesh.positions.length / 3; v++) {
    const sum = mesh.skinWeight[v * 4] + mesh.skinWeight[v * 4 + 1] + mesh.skinWeight[v * 4 + 2] + mesh.skinWeight[v * 4 + 3];
    worst = Math.max(worst, Math.abs(sum - 1));
  }
  return worst;
}

/** The lowest point of the mesh ahead of `z`: where its front feet stand in the bind pose. */
export function lowestAhead(mesh: AnimalMesh, z: number): number {
  let lowest = Infinity;
  for (let v = 0; v < mesh.positions.length / 3; v++) if (mesh.positions[v * 3 + 2] > z) lowest = Math.min(lowest, mesh.positions[v * 3 + 1]);
  return lowest;
}

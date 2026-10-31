import type { LandmarkMesh } from "./kit";

/** A built landmark: its models and its place in the world. */
export interface Landmark {
  id: string;
  name: string;
  /** The model's origin, ETRS-TM35FIN metres. */
  east: number;
  north: number;
  /** The height of the model's y = 0, metres above sea level as the elevation model counts it. */
  baseM: number;
  near: LandmarkMesh;
  far: LandmarkMesh;
  /** Past this distance the far version shows. */
  farFromM: number;
}

/** A model as a cell of `render/solids.ts`: scene-space vertices, ready for `buildingMeshes`. East is +x, north is -z. */
export function placed(landmark: Landmark, mesh: LandmarkMesh, origin: { east: number; north: number }) {
  const x = landmark.east - origin.east;
  const z = origin.north - landmark.north;
  const positions = new Float32Array(mesh.positions.length);
  for (let at = 0; at < positions.length; at += 3) {
    positions[at] = mesh.positions[at] + x;
    positions[at + 1] = mesh.positions[at + 1] + landmark.baseM;
    positions[at + 2] = mesh.positions[at + 2] + z;
  }
  return { x, z, positions, facades: mesh.facades, tints: mesh.tints, indices: mesh.indices };
}

export const triangles = (mesh: LandmarkMesh) => mesh.indices.length / 3;

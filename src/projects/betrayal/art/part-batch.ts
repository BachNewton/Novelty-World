import * as THREE from "three";
import { shapeOf } from "./forms";

/*
 * A moving piece (a figure, a swaying chandelier) is built from many rigid
 * parts, each its own mesh on its own pivot, and drawn one by one it costs a
 * draw call a part: a crowded room went over the draw-call budget on its
 * figures alone. So once a piece is placed, its parts that share a material
 * are drawn together, in one `BatchedMesh` per material, which takes each
 * part's matrix every frame. Nothing about the piece changes: its parts stay
 * where they are in its tree, posed by its animation on their pivots as
 * before, and the batch only draws them, in the pose `sync` copies from them.
 *
 * A batch shares the parts' material itself, so it is lit by the piece's own
 * probe and follows anything its animation does to that material (a glow
 * fading). A part stays drawn on its own when a batch can't draw it the
 * same: its geometry's vertices move (cloth over the legs), it hooks its own
 * rendering, it is mirrored (a batch can't flip a part's winding), or no
 * other part shares its material.
 *
 * A batched part keeps its pivot, its name and its bounds, but leaves the
 * camera's layer, and its vertices are handed to the batch: the batch holds
 * the only copy of them, so a placed piece costs no more memory than before.
 */

/** A layer no camera draws: the batched parts' own, so they aren't drawn twice. */
const BATCHED = 31;

export interface PartBatch {
  /** Copies the parts' pose (and whether each shows) into the batches: after the piece's animation, every frame. */
  sync: () => void;
}

interface Part {
  mesh: THREE.Mesh;
  batch: THREE.BatchedMesh;
  instance: number;
}

/** Whether a batch draws a mesh as the mesh would draw itself. */
function batchable(mesh: THREE.Mesh): boolean {
  if (mesh.constructor !== THREE.Mesh || Array.isArray(mesh.material)) return false;
  const geometry = mesh.geometry as THREE.BufferGeometry;
  return (
    shapeOf(geometry) === "" &&
    Object.keys(geometry.morphAttributes).length === 0 &&
    geometry.drawRange.count === Infinity &&
    mesh.onBeforeRender === THREE.Object3D.prototype.onBeforeRender
  );
}

/** What a batch's geometries must agree on: their attributes and whether they are indexed. */
function layout(geometry: THREE.BufferGeometry): string {
  const attributes = Object.entries(geometry.attributes)
    .map(([name, attribute]) => `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}`)
    .sort();
  const index = geometry.getIndex();
  return `${index ? index.array.constructor.name : "-"}|${attributes.join(",")}`;
}

/** A part's matrix in the frame of the piece it belongs to. */
function poseIn(root: THREE.Object3D, mesh: THREE.Object3D, out: THREE.Matrix4): THREE.Matrix4 {
  out.identity();
  for (let object: THREE.Object3D | null = mesh; object !== root; object = object.parent) {
    if (!object) throw new Error(`${mesh.name || "A part"} is not in the piece it was batched with`);
    if (object.matrixAutoUpdate) object.updateMatrix();
    out.premultiply(object.matrix);
  }
  return out;
}

/** Whether a part shows: it and everything it hangs from in the piece. */
function shows(root: THREE.Object3D, mesh: THREE.Object3D): boolean {
  for (let object: THREE.Object3D | null = mesh; object && object !== root; object = object.parent) if (!object.visible) return false;
  return true;
}

/** An empty geometry in the place of one handed to a batch, keeping its bounds and its records. */
function standIn(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const stand = new THREE.BufferGeometry();
  stand.boundingBox = geometry.boundingBox;
  stand.boundingSphere = geometry.boundingSphere;
  stand.userData = geometry.userData;
  return stand;
}

/** Draws a piece's parts in a batch per material from now on. A piece is batched once: batching it again returns the same. */
export function batchParts(root: THREE.Object3D): PartBatch {
  const existing = (root.userData as { partBatch?: PartBatch }).partBatch;
  if (existing) return existing;

  const groups = new Map<string, THREE.Mesh[]>();
  const matrix = new THREE.Matrix4();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !batchable(object)) return;
    // A batch can't flip a part's winding as a mirrored mesh's is flipped.
    if (poseIn(root, object, matrix).determinant() < 0) return;
    const material = object.material as THREE.Material;
    const key = `${material.uuid}|${object.renderOrder}|${layout(object.geometry as THREE.BufferGeometry)}`;
    groups.set(key, [...(groups.get(key) ?? []), object]);
  });

  const parts: Part[] = [];
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const geometries = [...new Set(meshes.map((mesh) => mesh.geometry as THREE.BufferGeometry))];
    const vertices = geometries.reduce((sum, geometry) => sum + geometry.getAttribute("position").count, 0);
    const indices = geometries.reduce((sum, geometry) => sum + (geometry.getIndex()?.count ?? 0), 0);
    const batch = new THREE.BatchedMesh(meshes.length, vertices, indices, meshes[0].material as THREE.Material);
    batch.name = "part batch";
    batch.renderOrder = meshes[0].renderOrder;
    const ids = new Map(geometries.map((geometry) => [geometry, batch.addGeometry(geometry)]));
    for (const mesh of meshes) {
      const id = ids.get(mesh.geometry as THREE.BufferGeometry);
      if (id === undefined) throw new Error("A part's geometry was not added to its batch");
      parts.push({ mesh, batch, instance: batch.addInstance(id) });
    }
    for (const geometry of geometries) {
      const stand = standIn(geometry);
      for (const mesh of meshes) if (mesh.geometry === geometry) mesh.geometry = stand;
    }
    for (const mesh of meshes) mesh.layers.set(BATCHED);
    root.add(batch);
  }
  const batches = [...new Set(parts.map(({ batch }) => batch))];

  const sync = () => {
    for (const { mesh, batch, instance } of parts) {
      batch.setMatrixAt(instance, poseIn(root, mesh, matrix));
      const visible = shows(root, mesh);
      if (batch.getVisibleAt(instance) !== visible) batch.setVisibleAt(instance, visible);
    }
    // The renderer culls a batch by its bounds, which only follow its parts when worked out again.
    for (const batch of batches) batch.computeBoundingSphere();
  };
  sync();
  const made: PartBatch = { sync };
  root.userData.partBatch = made;
  return made;
}

import * as THREE from "three/webgpu";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { kitPieceUrl, type KitPiece } from "../kit";
import type { Placement } from "../town";
import { fitPiece } from "./kit-fit";

const UP = new THREE.Vector3(0, 1, 0);
/** Typed as never failing, it returns null when the geometries don't match. */
const merge: (geometries: THREE.BufferGeometry[]) => THREE.BufferGeometry | null = mergeGeometries;
/** The side of a chunk, in cells: the world is merged a square of this many cells at a time. */
const CHUNK = 5;

/** Each loaded piece's meshes, fitted to the world, by the piece. */
export type Pieces = Map<KitPiece, THREE.Mesh[]>;

/** Load every piece the placements use that isn't loaded yet, fitted to the world. */
export async function loadPieces(pieces: Pieces, placements: readonly Placement[], load: (url: string) => Promise<GLTF>): Promise<void> {
  await Promise.all(
    [...new Set(placements.map((p) => p.piece))]
      .filter((piece) => !pieces.has(piece))
      .map(async (piece) => {
        const scene = fitPiece(piece, (await load(kitPieceUrl(piece))).scene);
        scene.updateMatrixWorld(true);
        const meshes: THREE.Mesh[] = [];
        scene.traverse((child) => {
          if (child instanceof THREE.Mesh) meshes.push(child);
        });
        pieces.set(piece, meshes);
      }),
  );
}

/** The chunk a placement is merged into. */
export function chunkOf(p: Placement): string {
  return `${Math.floor(p.x / CHUNK)},${Math.floor(p.z / CHUNK)}`;
}

/** Where a placement puts its piece: its cell's middle, its height, its turns, and its mirror. */
export function placementMatrix(p: Placement): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(p.x + 0.5, p.y ?? 0, p.z + 0.5),
    new THREE.Quaternion().setFromAxisAngle(UP, ((p.turn ?? 0) * Math.PI) / 2),
    new THREE.Vector3(1, 1, p.mirror === true ? -1 : 1),
  );
}

/**
 * One chunk's placements, pieces that never move, merged: a mesh for each
 * material they share, and where each placement stands. `materials` holds the
 * first copy of each material, shared by every chunk merged with it. A chunk
 * is drawn in one call a material, is culled whole when out of view, and is
 * sorted by its own place, so the near chunks are drawn first and hide what is
 * behind them before it is shaded: the frame is bound by shading pixels, and a
 * pixel hidden by depth costs almost nothing. The kits' pieces share a handful
 * of materials (the town kit's colour map and its water, the Nature Kit's flat
 * colours), so a chunk is a few draws. They only receive shadows: only the
 * player casts one.
 */
export function mergeChunk(placements: readonly Placement[], pieces: Pieces, materials: Map<string, THREE.Material>): { meshes: THREE.Mesh[]; bounds: THREE.Box3[] } {
  const buckets = new Map<string, { material: THREE.Material; geometries: THREE.BufferGeometry[] }>();
  const bounds = placements.map((p) => {
    const matrix = placementMatrix(p);
    const box = new THREE.Box3();
    for (const child of meshesOf(pieces, p.piece)) {
      const material = shared(materials, single(child.material));
      const geometry = child.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(matrix, child.matrixWorld));
      if (p.mirror === true) turnFaces(geometry);
      geometry.computeBoundingBox();
      if (geometry.boundingBox !== null) box.union(geometry.boundingBox);
      const key = `${material.uuid}|${layout(geometry)}`;
      let bucket = buckets.get(key);
      if (bucket === undefined) {
        bucket = { material, geometries: [] };
        buckets.set(key, bucket);
      }
      bucket.geometries.push(geometry);
    }
    return box;
  });
  const meshes = [...buckets.values()].map(({ material, geometries }) => {
    const merged = merge(geometries);
    if (merged === null) throw new Error(`adventure: pieces under ${material.name} don't merge`);
    for (const geometry of geometries) geometry.dispose();
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    return mesh;
  });
  return { meshes, bounds };
}

/** One placement as an object of its own, outside the scene, sharing its piece's geometry, to cast a ray against: in its own materials, or in `material` when given. */
export function solidOf(p: Placement, pieces: Pieces, material?: THREE.Material): THREE.Object3D {
  const matrix = placementMatrix(p);
  const object = new THREE.Group();
  for (const child of meshesOf(pieces, p.piece)) {
    const mesh = new THREE.Mesh(child.geometry, material ?? child.material);
    mesh.matrixAutoUpdate = false;
    mesh.matrixWorld.multiplyMatrices(matrix, child.matrixWorld);
    object.add(mesh);
  }
  return object;
}

export function meshesOf(pieces: Pieces, piece: KitPiece): THREE.Mesh[] {
  const found = pieces.get(piece);
  if (found === undefined) throw new Error(`adventure: ${piece} didn't load`);
  return found;
}

function single(material: THREE.Material | THREE.Material[]): THREE.Material {
  if (Array.isArray(material)) throw new Error("adventure: a kit piece has a mesh of several materials");
  return material;
}

/**
 * The first copy of a material: every file of a kit loads its own copy of the
 * kit's materials, alike but for their textures, which are copies of the kit's one image.
 */
function shared(materials: Map<string, THREE.Material>, material: THREE.Material): THREE.Material {
  const standard = material instanceof THREE.MeshStandardMaterial ? material : null;
  const key = [
    material.type,
    material.name,
    standard?.color.getHexString(),
    standard?.map === null ? "" : "map",
    material.transparent,
    material.opacity,
  ].join("|");
  let first = materials.get(key);
  if (first === undefined) {
    first = material;
    materials.set(key, first);
  }
  return first;
}

/** Which attributes a geometry has, and whether it is indexed: only geometries alike merge. */
function layout(geometry: THREE.BufferGeometry): string {
  return `${Object.keys(geometry.attributes).sort().join(",")}${geometry.index === null ? "" : "|indexed"}`;
}

/**
 * Turn a mirrored geometry's faces back round: a mirror reverses the order of
 * each triangle's corners, so its outside would face in and be culled.
 */
function turnFaces(geometry: THREE.BufferGeometry): void {
  const index = geometry.index;
  if (index !== null) {
    for (let i = 0; i < index.count; i += 3) {
      const b = index.getX(i + 1);
      index.setX(i + 1, index.getX(i + 2));
      index.setX(i + 2, b);
    }
    return;
  }
  for (const attribute of Object.values(geometry.attributes)) {
    if (!(attribute instanceof THREE.BufferAttribute)) throw new Error("adventure: a kit piece has interleaved geometry");
    for (let i = 0; i < attribute.count; i += 3) {
      for (let c = 0; c < attribute.itemSize; c++) {
        const b = attribute.getComponent(i + 1, c);
        attribute.setComponent(i + 1, c, attribute.getComponent(i + 2, c));
        attribute.setComponent(i + 2, c, b);
      }
    }
  }
}

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

/** Placed pieces, merged, and where each placement stands, in the order they were given. */
export interface Merged {
  group: THREE.Group;
  bounds: THREE.Box3[];
  /** One placement as an object of its own, outside the scene, to cast a ray against. */
  solid: (i: number) => THREE.Object3D;
}

/**
 * Placed pieces that never move, merged into one mesh for each material in
 * each chunk of the world. A chunk is drawn in one call a material, is culled
 * whole when out of view, and is sorted by its own place, so the near chunks
 * are drawn first and hide what is behind them before it is shaded: the frame
 * is bound by shading pixels, and a pixel hidden by depth costs almost nothing.
 * The kits' pieces share a handful of materials (the town kit's colour map and
 * its water, the Nature Kit's flat colours), so a chunk is a few draws.
 * They only receive shadows: only the player casts one.
 */
export async function buildMerged(placements: readonly Placement[], load: (url: string) => Promise<GLTF>): Promise<Merged> {
  const pieces = new Map<KitPiece, THREE.Mesh[]>();
  await Promise.all(
    [...new Set(placements.map((p) => p.piece))].map(async (piece) => {
      const scene = fitPiece(piece, (await load(kitPieceUrl(piece))).scene);
      scene.updateMatrixWorld(true);
      const meshes: THREE.Mesh[] = [];
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) meshes.push(child);
      });
      pieces.set(piece, meshes);
    }),
  );

  /** One material for every copy the kits' files make of it, and the pieces' geometry under it, by chunk. */
  const materials = new Map<string, THREE.Material>();
  const buckets = new Map<string, { material: THREE.Material; geometries: THREE.BufferGeometry[] }>();
  const bounds: THREE.Box3[] = [];
  const matrices: THREE.Matrix4[] = [];
  placements.forEach((p, i) => {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(p.x + 0.5, p.y ?? 0, p.z + 0.5),
      new THREE.Quaternion().setFromAxisAngle(UP, ((p.turn ?? 0) * Math.PI) / 2),
      new THREE.Vector3(1, 1, p.mirror === true ? -1 : 1),
    );
    matrices[i] = matrix;
    const chunk = `${Math.floor(p.x / CHUNK)},${Math.floor(p.z / CHUNK)}`;
    const box = new THREE.Box3();
    for (const child of meshes(pieces, p.piece)) {
      const material = shared(materials, single(child.material));
      const geometry = child.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(matrix, child.matrixWorld));
      if (p.mirror === true) turnFaces(geometry);
      geometry.computeBoundingBox();
      if (geometry.boundingBox !== null) box.union(geometry.boundingBox);
      const key = `${chunk}|${material.uuid}|${layout(geometry)}`;
      let bucket = buckets.get(key);
      if (bucket === undefined) {
        bucket = { material, geometries: [] };
        buckets.set(key, bucket);
      }
      bucket.geometries.push(geometry);
    }
    bounds[i] = box;
  });

  const group = new THREE.Group();
  for (const { material, geometries } of buckets.values()) {
    const merged = merge(geometries);
    if (merged === null) throw new Error(`adventure: pieces under ${material.name} don't merge`);
    for (const geometry of geometries) geometry.dispose();
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  group.matrixAutoUpdate = false;

  const solid = (i: number): THREE.Object3D => {
    const object = new THREE.Group();
    for (const child of meshes(pieces, placements[i].piece)) {
      const mesh = new THREE.Mesh(child.geometry, child.material);
      mesh.matrixAutoUpdate = false;
      mesh.matrixWorld.multiplyMatrices(matrices[i], child.matrixWorld);
      object.add(mesh);
    }
    return object;
  };
  return { group, bounds, solid };
}

function meshes(pieces: ReadonlyMap<KitPiece, THREE.Mesh[]>, piece: KitPiece): THREE.Mesh[] {
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

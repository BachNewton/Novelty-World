import * as THREE from "three/webgpu";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { kitPieceUrl, type KitPiece } from "../kit";
import type { Placement } from "../town";
import { fitPiece } from "./kit-fit";
import { chunkOf, loadPieces, mergeChunk, solidOf, type Pieces } from "./merged";

/** What a ray meets on a placement's own object: either face, so a mirrored piece, whose faces a mirror turns round, is met too. Never drawn. */
const PICKED = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

interface Chunk {
  placements: readonly Placement[];
  meshes: THREE.Mesh[];
  /** Round every placement in it, so a ray that misses it is tested against none of them. */
  box: THREE.Box3;
}

/**
 * The map's pieces, drawn merged by chunk as `merged.ts` draws what never
 * moves, and redrawn a chunk at a time when the map editor changes them: a
 * chunk whose placements are the same objects as before is kept, so an edit
 * rebuilds only the chunks it touched. A placement is never changed in place,
 * only replaced, so the same object means the same piece in the same place.
 */
export class TownLayer {
  readonly group = new THREE.Group();
  private readonly pieces: Pieces = new Map();
  private readonly materials = new Map<string, THREE.Material>();
  private readonly chunks = new Map<string, Chunk>();
  /** Where each placement shown stands, from when its chunk was merged. */
  private readonly bounds = new WeakMap<Placement, THREE.Box3>();
  private readonly solids = new WeakMap<Placement, THREE.Object3D>();
  /** The last map asked for, shown once every one asked before it is. */
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly load: (url: string) => Promise<GLTF>) {
    this.group.matrixAutoUpdate = false;
  }

  /**
   * Show these placements, once any piece not loaded yet has loaded. Maps are
   * shown in the order asked for, so a quick run of edits never ends on an
   * older one whose pieces happened to load later.
   */
  show(placements: readonly Placement[]): Promise<void> {
    const shown = this.queue.then(() => this.apply(placements));
    // A failure reaches whoever asked for this map; the next map is still shown after it.
    this.queue = shown.catch(() => undefined);
    return shown;
  }

  private async apply(placements: readonly Placement[]): Promise<void> {
    await loadPieces(this.pieces, placements, this.load);
    const wanted = new Map<string, Placement[]>();
    for (const p of placements) {
      const key = chunkOf(p);
      const chunk = wanted.get(key);
      if (chunk === undefined) wanted.set(key, [p]);
      else chunk.push(p);
    }
    for (const [key, chunk] of this.chunks) {
      if (!wanted.has(key)) this.drop(key, chunk);
    }
    for (const [key, chunkPlacements] of wanted) {
      const old = this.chunks.get(key);
      if (old !== undefined && same(old.placements, chunkPlacements)) continue;
      if (old !== undefined) this.drop(key, old);
      const merged = mergeChunk(chunkPlacements, this.pieces, this.materials);
      const box = new THREE.Box3();
      chunkPlacements.forEach((p, i) => {
        this.bounds.set(p, merged.bounds[i]);
        box.union(merged.bounds[i]);
      });
      this.group.add(...merged.meshes);
      this.chunks.set(key, { placements: chunkPlacements, meshes: merged.meshes, box });
    }
  }

  private drop(key: string, chunk: Chunk): void {
    for (const mesh of chunk.meshes) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
    this.chunks.delete(key);
  }

  /** Where a placement stands, once it is drawn. */
  shownBoundsOf(p: Placement): THREE.Box3 | undefined {
    return this.bounds.get(p);
  }

  /** A shown placement as an object of its own, outside the scene, to cast a ray against. */
  solidOf(p: Placement): THREE.Object3D {
    let solid = this.solids.get(p);
    if (solid === undefined) {
      solid = solidOf(p, this.pieces, PICKED);
      this.solids.set(p, solid);
    }
    return solid;
  }

  /**
   * The nearest drawn placement a ray meets: the chunks it passes through
   * nearer than anything met so far, then the boxes of their placements, then
   * the faces of those whose boxes it meets.
   */
  pick(ray: THREE.Raycaster): Placement | null {
    let best: { placement: Placement; distance: number } | null = null;
    const entry = new THREE.Vector3();
    for (const chunk of this.chunks.values()) {
      if (ray.ray.intersectBox(chunk.box, entry) === null) continue;
      if (best !== null && ray.ray.origin.distanceTo(entry) > best.distance) continue;
      for (const placement of chunk.placements) {
        const box = this.bounds.get(placement);
        if (box === undefined || !ray.ray.intersectsBox(box)) continue;
        const hit = ray.intersectObject(this.solidOf(placement), true)[0] as THREE.Intersection | undefined;
        if (hit !== undefined && (best === null || hit.distance < best.distance)) best = { placement, distance: hit.distance };
      }
    }
    return best?.placement ?? null;
  }

  /** A shown placement drawn again where it stands, in a material of its own: to add to the scene, sharing its piece's geometry. */
  highlightOf(p: Placement, material: THREE.Material): THREE.Object3D {
    const object = solidOf(p, this.pieces, material);
    for (const child of object.children) child.matrix.copy(child.matrixWorld);
    return object;
  }

  /** A piece as an object of its own to show apart from the map, fitted to the world: a clone sharing its file's geometry and materials. */
  async pieceOf(piece: KitPiece): Promise<THREE.Object3D> {
    return fitPiece(piece, (await this.load(kitPieceUrl(piece))).scene).clone();
  }
}

function same(a: readonly Placement[], b: readonly Placement[]): boolean {
  return a.length === b.length && a.every((p, i) => p === b[i]);
}

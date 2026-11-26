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
      chunkPlacements.forEach((p, i) => this.bounds.set(p, merged.bounds[i]));
      this.group.add(...merged.meshes);
      this.chunks.set(key, { placements: chunkPlacements, meshes: merged.meshes });
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

  /** A piece as an object of its own to show apart from the map, fitted to the world: a clone sharing its file's geometry and materials. */
  async pieceOf(piece: KitPiece): Promise<THREE.Object3D> {
    return fitPiece(piece, (await this.load(kitPieceUrl(piece))).scene).clone();
  }
}

function same(a: readonly Placement[], b: readonly Placement[]): boolean {
  return a.length === b.length && a.every((p, i) => p === b[i]);
}

import type * as THREE from "three/webgpu";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { changedCells, groundTiles, onGround, rampsOf, reachedBy, tileAt, tileIndex, type GroundLayer } from "../ground";
import type { Placement } from "../town";
import { TownLayer } from "./town-layer";

interface Laid {
  ground: GroundLayer;
  /** The map's pieces the ramps were found among, so the same pieces aren't searched again. */
  pieces: readonly Placement[];
  ramps: ReadonlySet<string>;
  /** Every cell's tile, by `tileIndex`. */
  tiles: Placement[];
}

/**
 * The ground's tiles, drawn merged by chunk as the map's pieces are, and laid
 * again a few cells at a time: a change retiles only the cells it can reach,
 * and a tile that comes out the same keeps its object, so only the chunks
 * whose tiles changed are rebuilt. Steps or a ramp moved on the map retile
 * the whole ground, since any end may run out onto them.
 */
export class GroundTiles {
  private readonly layer: TownLayer;
  readonly group: THREE.Group;
  private laid: Laid | null = null;
  /** The tiles drawn, by `tileIndex`: what is stood on, which lags what was asked for until its pieces have loaded. */
  private shown: readonly Placement[] = [];

  constructor(load: (url: string) => Promise<GLTF>) {
    this.layer = new TownLayer(load);
    this.group = this.layer.group;
  }

  /** Lay a ground, with the map's pieces that its ends may run out onto, once any tile not loaded yet has loaded. */
  show(ground: GroundLayer, pieces: readonly Placement[]): Promise<void> {
    const before = this.laid;
    const ramps = before !== null && before.pieces === pieces ? before.ramps : rampsOf(pieces);
    let tiles: Placement[];
    if (before === null || !sameSet(before.ramps, ramps)) tiles = kept(before?.tiles ?? [], groundTiles(ground, ramps));
    else if (before.ground === ground) tiles = before.tiles;
    else {
      tiles = [...before.tiles];
      for (const [x, z] of reachedBy(changedCells(before.ground, ground))) {
        const i = tileIndex(x, z);
        const tile = tileAt(ground, x, z, ramps);
        if (!sameTile(tiles[i], tile)) tiles[i] = tile;
      }
    }
    this.laid = { ground, pieces, ramps, tiles };
    return this.layer.show(tiles).then(() => {
      this.shown = tiles;
    });
  }

  /** Where steps or a ramp stand on the ground, as last laid. */
  ramps(): ReadonlySet<string> {
    return this.laid?.ramps ?? new Set();
  }

  /** The tile drawn on a cell, if it is on the ground and drawn. */
  tileAt(x: number, z: number): Placement | undefined {
    return onGround(x, z) ? (this.shown[tileIndex(x, z)] as Placement | undefined) : undefined;
  }

  /** A drawn tile as an object of its own, outside the scene, to cast a ray against. */
  solidOf(tile: Placement): THREE.Object3D {
    return this.layer.solidOf(tile);
  }

  /** A drawn tile drawn again in a material of its own. */
  highlightOf(tile: Placement, material: THREE.Material): THREE.Object3D {
    return this.layer.highlightOf(tile, material);
  }
}

/** The fresh tiles, each the old one's object where it is the same tile. */
function kept(old: readonly Placement[], fresh: Placement[]): Placement[] {
  return fresh.map((tile, i) => (i < old.length && sameTile(old[i], tile) ? old[i] : tile));
}

const sameTile = (a: Placement, b: Placement): boolean => a.piece === b.piece && (a.turn ?? 0) === (b.turn ?? 0);

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => a.size === b.size && [...a].every((cell) => b.has(cell));

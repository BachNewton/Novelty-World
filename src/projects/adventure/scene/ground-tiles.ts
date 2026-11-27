import type * as THREE from "three/webgpu";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { ColliderGroups } from "@/shared/lib/physics/collider-groups";
import { descsOf, groundShapes } from "../colliders";
import { emptyBoxes } from "../physics";
import { changedCells, emptyCells, groundCell, groundCells, onGround, rampsOf, reachedBy, tileIndex, type GroundCell, type GroundLayer } from "../ground";
import type { Placement } from "../town";
import { TownLayer } from "./town-layer";

interface Laid {
  ground: GroundLayer;
  /** The map's pieces the ramps were found among, so the same pieces aren't searched again. */
  pieces: readonly Placement[];
  ramps: ReadonlySet<string>;
  /** What each cell draws, by `tileIndex`. */
  cells: GroundCell[];
}

/**
 * The ground's tiles and the cliffs its heights raise, drawn merged by chunk
 * as the map's pieces are, and laid again a few cells at a time: a change lays
 * again only the cells it can reach, and a cell that comes out the same keeps
 * its pieces' objects, so only the chunks whose cells changed are rebuilt.
 * Steps or a ramp moved on the map lay the whole ground again, since any end
 * may run out onto them.
 */
export class GroundTiles {
  private readonly layer: TownLayer;
  readonly group: THREE.Group;
  private laid: Laid | null = null;
  /** What each cell draws, by `tileIndex`, which lags what was asked for until its pieces have loaded. */
  private shown: readonly GroundCell[] = [];
  /** The empty cells boxed in, and each chunk's columns, as last given to the colliders. */
  private empty = "";
  private readonly columns = new Map<string, string>();

  /**
   * `colliders` is what the players' bodies meet: the ground as columns of
   * its cells' heights, a box over each empty cell, and the cliffs' pieces as
   * the map's pieces are met. The tiles themselves are only drawn.
   */
  constructor(
    load: (url: string) => Promise<GLTF>,
    private readonly colliders: ColliderGroups | null = null,
  ) {
    this.layer = new TownLayer(load, colliders, (p) => !p.piece.startsWith("ground_"));
    this.group = this.layer.group;
  }

  /** Lay a ground, with the map's pieces that its ends may run out onto, once any piece not loaded yet has loaded. */
  show(ground: GroundLayer, pieces: readonly Placement[]): Promise<void> {
    const before = this.laid;
    const ramps = before !== null && before.pieces === pieces ? before.ramps : rampsOf(pieces);
    let cells: GroundCell[];
    if (before === null || !sameSet(before.ramps, ramps)) cells = kept(before?.cells ?? [], groundCells(ground, ramps));
    else if (before.ground === ground) cells = before.cells;
    else {
      cells = [...before.cells];
      for (const [x, z] of reachedBy(changedCells(before.ground, ground))) {
        const i = tileIndex(x, z);
        cells[i] = keptCell(cells[i], groundCell(ground, x, z, ramps));
      }
    }
    this.laid = { ground, pieces, ramps, cells };
    return this.layer.show(cells.flatMap(piecesIn)).then(() => {
      this.shown = cells;
      this.meet(ground);
    });
  }

  /** Give the colliders the ground's columns and empty cells, only the chunks that changed. */
  private meet(ground: GroundLayer): void {
    const colliders = this.colliders;
    if (colliders === null) return;
    const empty = emptyCells(ground);
    const key = empty.join(";");
    if (key !== this.empty) {
      this.empty = key;
      colliders.set("empty", emptyBoxes(empty));
    }
    const chunks = groundShapes(ground);
    for (const chunk of this.columns.keys()) {
      if (chunks.has(chunk)) continue;
      this.columns.delete(chunk);
      colliders.set(`ground ${chunk}`, () => []);
    }
    for (const [chunk, boxes] of chunks) {
      const said = JSON.stringify(boxes);
      if (this.columns.get(chunk) === said) continue;
      this.columns.set(chunk, said);
      colliders.set(`ground ${chunk}`, (rapier) => descsOf(rapier, boxes));
    }
  }

  /** Where steps or a ramp placed on the map have their foot, as last laid. */
  ramps(): ReadonlySet<string> {
    return this.laid?.ramps ?? new Set();
  }

  /** The tile drawn on a cell, if it is on the ground, has ground and is drawn. */
  tileAt(x: number, z: number): Placement | undefined {
    return (onGround(x, z) ? (this.shown[tileIndex(x, z)] as GroundCell | undefined)?.tile : undefined) ?? undefined;
  }

  /** A drawn tile drawn again in a material of its own. */
  highlightOf(tile: Placement, material: THREE.Material): THREE.Object3D {
    return this.layer.highlightOf(tile, material);
  }

  /** Every cliff drawn, cell by cell. */
  cliffs(): Placement[] {
    return this.shown.flatMap((cell) => cell.cliffs);
  }

  /** The nearest drawn tile or cliff a ray meets. */
  pick(ray: THREE.Raycaster): Placement | null {
    return this.layer.pick(ray);
  }

  /** What is drawn in a cell: its tile and its cliffs, nothing off the ground. */
  drawnIn(x: number, z: number): Placement[] {
    const cell = onGround(x, z) ? (this.shown[tileIndex(x, z)] as GroundCell | undefined) : undefined;
    return cell === undefined ? [] : piecesIn(cell);
  }

  /** A drawn tile or cliff as an object of its own, outside the scene, to cast a ray against. */
  solidOf(p: Placement): THREE.Object3D {
    return this.layer.solidOf(p);
  }

  /** Where a drawn tile or cliff stands. */
  shownBoundsOf(p: Placement): THREE.Box3 | undefined {
    return this.layer.shownBoundsOf(p);
  }
}

const piecesIn = (cell: GroundCell): Placement[] => (cell.tile === null ? cell.cliffs : [cell.tile, ...cell.cliffs]);

/** The fresh cells, each the old one where it draws the same. */
function kept(old: readonly GroundCell[], fresh: GroundCell[]): GroundCell[] {
  return fresh.map((cell, i) => (i < old.length ? keptCell(old[i], cell) : cell));
}

/** A cell as laid again: the old one where it draws the same pieces, so its objects, and so its chunk, are kept. */
function keptCell(old: GroundCell, fresh: GroundCell): GroundCell {
  const a = piecesIn(old);
  const b = piecesIn(fresh);
  return a.length === b.length && a.every((p, i) => samePiece(p, b[i])) ? old : fresh;
}

const samePiece = (a: Placement, b: Placement): boolean => a.piece === b.piece && (a.turn ?? 0) === (b.turn ?? 0) && (a.y ?? 0) === (b.y ?? 0);

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => a.size === b.size && [...a].every((cell) => b.has(cell));

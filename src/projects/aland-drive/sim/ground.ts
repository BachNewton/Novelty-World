import RAPIER from "@dimforge/rapier3d-compat";
import { patchIndices, type HeightGrid } from "../render/tile";
import type { RibbonMesh } from "../render/roads";

/*
 * What the car can touch: the drawn triangles themselves, ground and road, in
 * square blocks, with only the blocks round the car loaded into Rapier. The
 * block is a triangle mesh rather than Rapier's heightfield because a mesh is
 * the same triangles as the render by construction, diagonal included.
 */

const BLOCK_CELLS = 30;
const REACH_BLOCKS = 1;

const blockKey = (row: number, column: number) => row * 100000 + column;

export class GroundBlocks {
  private readonly loaded = new Map<number, RAPIER.Collider>();
  /** For each block, the ribbon triangles crossing it, as offsets into the ribbon's indices. */
  private readonly roadTriangles = new Map<number, number[]>();
  private readonly blockSize: number;
  private readonly blocks: number;
  private readonly patch = patchIndices(BLOCK_CELLS);
  /** Colliders built since the start: what moving round the tile has cost. */
  built = 0;

  constructor(
    private readonly world: RAPIER.World,
    private readonly grid: HeightGrid,
    private readonly ribbon: RibbonMesh,
  ) {
    this.blockSize = BLOCK_CELLS * grid.stepM;
    this.blocks = (grid.nodes - 1) / BLOCK_CELLS;
    if (!Number.isInteger(this.blocks)) throw new Error(`${grid.nodes} nodes don't divide into blocks of ${BLOCK_CELLS} cells`);
    const { positions, indices } = ribbon;
    for (let triangle = 0; triangle < indices.length; triangle += 3) {
      let west = Infinity;
      let east = -Infinity;
      let north = -Infinity;
      let south = Infinity;
      for (let corner = 0; corner < 3; corner++) {
        const at = indices[triangle + corner] * 3;
        west = Math.min(west, positions[at]);
        east = Math.max(east, positions[at]);
        north = Math.max(north, -positions[at + 2]);
        south = Math.min(south, -positions[at + 2]);
      }
      const [firstColumn, firstRow] = this.blockAt(west, north);
      const [lastColumn, lastRow] = this.blockAt(east, south);
      for (let row = firstRow; row <= lastRow; row++) {
        for (let column = firstColumn; column <= lastColumn; column++) {
          const key = blockKey(row, column);
          const list = this.roadTriangles.get(key);
          if (list) list.push(triangle);
          else this.roadTriangles.set(key, [triangle]);
        }
      }
    }
  }

  private blockAt(east: number, north: number): [column: number, row: number] {
    const last = this.blocks - 1;
    return [Math.max(0, Math.min(last, Math.floor((east - this.grid.west) / this.blockSize))), Math.max(0, Math.min(last, Math.floor((this.grid.north - north) / this.blockSize)))];
  }

  /** Loads the blocks round a point and lets go of the rest. */
  around(x: number, z: number): void {
    const [column, row] = this.blockAt(x, -z);
    const wanted = new Set<number>();
    for (let r = row - REACH_BLOCKS; r <= row + REACH_BLOCKS; r++) {
      for (let c = column - REACH_BLOCKS; c <= column + REACH_BLOCKS; c++) {
        if (r < 0 || c < 0 || r >= this.blocks || c >= this.blocks) continue;
        const key = blockKey(r, c);
        wanted.add(key);
        if (!this.loaded.has(key)) this.loaded.set(key, this.build(r, c));
      }
    }
    for (const [key, collider] of this.loaded) {
      if (wanted.has(key)) continue;
      this.world.removeCollider(collider, false);
      this.loaded.delete(key);
    }
  }

  private build(row: number, column: number): RAPIER.Collider {
    const { grid, ribbon } = this;
    const across = BLOCK_CELLS + 1;
    const road = this.roadTriangles.get(blockKey(row, column)) ?? [];
    const vertices = new Float32Array((across * across + road.length * 3) * 3);
    const indices = new Uint32Array(this.patch.length + road.length * 3);
    const top = row * BLOCK_CELLS;
    const left = column * BLOCK_CELLS;
    for (let r = 0; r < across; r++) {
      for (let c = 0; c < across; c++) {
        const at = (r * across + c) * 3;
        vertices[at] = grid.west + (left + c) * grid.stepM;
        vertices[at + 1] = grid.heights[(top + r) * grid.nodes + left + c];
        vertices[at + 2] = -(grid.north - (top + r) * grid.stepM);
      }
    }
    indices.set(this.patch);
    let vertex = across * across;
    let next = this.patch.length;
    for (const triangle of road) {
      for (let corner = 0; corner < 3; corner++) {
        const from = ribbon.indices[triangle + corner] * 3;
        vertices.set(ribbon.positions.subarray(from, from + 3), vertex * 3);
        indices[next++] = vertex++;
      }
    }
    this.built++;
    return this.world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices).setFriction(0.3));
  }
}

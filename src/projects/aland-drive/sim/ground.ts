import RAPIER from "@dimforge/rapier3d-compat";
import { patchIndices } from "../render/tile";
import { BLOCK_M, type World } from "./world";

/*
 * What the car can touch: the drawn triangles themselves, ground and road, in
 * square blocks on one lattice for the whole world, with only the blocks round
 * the car loaded into Rapier. A block doesn't care which tile its heights or
 * roads come from, so a tile's edge is nothing to the car. The block is a
 * triangle mesh rather than Rapier's heightfield because a mesh is the same
 * triangles as the render by construction, diagonal included.
 */

const BLOCK_CELLS = 30;
const REACH_BLOCKS = 1;

const blockKey = (row: number, column: number) => row * 65536 + column;

export class GroundBlocks {
  private readonly loaded = new Map<number, RAPIER.Collider>();
  private readonly patch = patchIndices(BLOCK_CELLS);
  private readonly stepM: number;
  private revision: number;
  /** Colliders built since the start: what moving round the world has cost. */
  built = 0;

  constructor(
    private readonly rapier: RAPIER.World,
    private readonly world: World,
  ) {
    this.stepM = BLOCK_M / BLOCK_CELLS;
    this.revision = world.revision;
  }

  private letGo(key: number, collider: RAPIER.Collider): void {
    this.rapier.removeCollider(collider, false);
    this.loaded.delete(key);
  }

  /** Loads the blocks round a point and lets go of the rest. New detail anywhere rebuilds them, so the car stands on the best ground known. */
  around(x: number, z: number): void {
    if (this.world.revision !== this.revision) {
      this.revision = this.world.revision;
      for (const [key, collider] of this.loaded) this.letGo(key, collider);
    }
    const column = Math.floor(x / BLOCK_M);
    const row = Math.floor(z / BLOCK_M);
    const wanted = new Set<number>();
    for (let r = row - REACH_BLOCKS; r <= row + REACH_BLOCKS; r++) {
      for (let c = column - REACH_BLOCKS; c <= column + REACH_BLOCKS; c++) {
        if (!this.world.tileAt((c + 0.5) * BLOCK_M, (r + 0.5) * BLOCK_M)) continue;
        const key = blockKey(r, c);
        wanted.add(key);
        if (!this.loaded.has(key)) this.loaded.set(key, this.build(r, c));
      }
    }
    for (const [key, collider] of this.loaded) {
      if (!wanted.has(key)) this.letGo(key, collider);
    }
  }

  private build(row: number, column: number): RAPIER.Collider {
    const { world, stepM } = this;
    const across = BLOCK_CELLS + 1;
    const road: { positions: Float32Array; indices: Uint32Array; triangle: number }[] = [];
    world.forRoadsInBlock(column, row, (ribbon, triangle) => {
      road.push({ positions: ribbon.positions, indices: ribbon.indices, triangle });
    });
    const vertices = new Float32Array((across * across + road.length * 3) * 3);
    const indices = new Uint32Array(this.patch.length + road.length * 3);
    const top = row * BLOCK_CELLS;
    const left = column * BLOCK_CELLS;
    for (let r = 0; r < across; r++) {
      for (let c = 0; c < across; c++) {
        const at = (r * across + c) * 3;
        vertices[at] = (left + c) * stepM;
        vertices[at + 1] = world.node(left + c, top + r);
        vertices[at + 2] = (top + r) * stepM;
      }
    }
    indices.set(this.patch);
    let vertex = across * across;
    let next = this.patch.length;
    for (const { positions, indices: ribbonIndices, triangle } of road) {
      for (let corner = 0; corner < 3; corner++) {
        const from = ribbonIndices[triangle + corner] * 3;
        vertices.set(positions.subarray(from, from + 3), vertex * 3);
        indices[next++] = vertex++;
      }
    }
    this.built++;
    return this.rapier.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices).setFriction(0.3));
  }
}

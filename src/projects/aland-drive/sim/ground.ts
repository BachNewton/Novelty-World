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
/** Buildings to the car are only walls, from under the ground to above any car. */
const WALL_BELOW_M = 1;
const WALL_TALL_M = 6;

const blockKey = (row: number, column: number) => row * 65536 + column;

export class GroundBlocks {
  private readonly loaded = new Map<number, { collider: RAPIER.Collider; stamp: number }>();
  private readonly patch = patchIndices(BLOCK_CELLS);
  private readonly stepM: number;
  /** Colliders built since the start: what moving round the world has cost. */
  built = 0;

  constructor(
    private readonly rapier: RAPIER.World,
    private readonly world: World,
  ) {
    this.stepM = BLOCK_M / BLOCK_CELLS;
  }

  private letGo(key: number): void {
    const block = this.loaded.get(key);
    if (!block) return;
    this.rapier.removeCollider(block.collider, false);
    this.loaded.delete(key);
  }

  /** What a block was built from: the tiles its corners and a road's or wall's reach beyond them lie in. Only their changing can change it. */
  private stampOf(row: number, column: number): number {
    let stamp = 0;
    for (const r of [row - 1, row + 2]) {
      for (const c of [column - 1, column + 2]) stamp = stamp * 31 + (this.world.tileAt(c * BLOCK_M, r * BLOCK_M)?.revision ?? 0);
    }
    return stamp;
  }

  /** Loads the blocks round a point and lets go of the rest. New detail under a block rebuilds it, so the car stands on the best ground known; detail landing anywhere else costs the car nothing. */
  around(x: number, z: number): void {
    const column = Math.floor(x / BLOCK_M);
    const row = Math.floor(z / BLOCK_M);
    const wanted = new Set<number>();
    for (let r = row - REACH_BLOCKS; r <= row + REACH_BLOCKS; r++) {
      for (let c = column - REACH_BLOCKS; c <= column + REACH_BLOCKS; c++) {
        if (!this.world.tileAt((c + 0.5) * BLOCK_M, (r + 0.5) * BLOCK_M)) continue;
        const key = blockKey(r, c);
        wanted.add(key);
        const stamp = this.stampOf(r, c);
        const block = this.loaded.get(key);
        if (block?.stamp === stamp) continue;
        this.letGo(key);
        this.loaded.set(key, { collider: this.build(r, c), stamp });
      }
    }
    for (const key of this.loaded.keys()) {
      if (!wanted.has(key)) this.letGo(key);
    }
  }

  private build(row: number, column: number): RAPIER.Collider {
    const { world, stepM } = this;
    const across = BLOCK_CELLS + 1;
    const road: { positions: Float32Array; indices: Uint32Array; triangle: number }[] = [];
    world.forRoadsInBlock(column, row, (ribbon, triangle) => {
      road.push({ positions: ribbon.positions, indices: ribbon.indices, triangle });
    });
    const walls: { from: Float32Array; at: number }[] = [];
    world.forWallsInBlock(column, row, (from, at) => {
      walls.push({ from, at });
    });
    const vertices = new Float32Array((across * across + road.length * 3 + walls.length * 4) * 3);
    const indices = new Uint32Array(this.patch.length + road.length * 3 + walls.length * 6);
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
    for (const { from, at } of walls) {
      const [x1, z1, x2, z2] = [from[at], from[at + 1], from[at + 2], from[at + 3]];
      const [foot1, foot2] = [world.height(x1, z1) - WALL_BELOW_M, world.height(x2, z2) - WALL_BELOW_M];
      vertices.set([x1, foot1, z1, x2, foot2, z2, x2, foot2 + WALL_TALL_M, z2, x1, foot1 + WALL_TALL_M, z1], vertex * 3);
      indices.set([vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3], next);
      vertex += 4;
      next += 6;
    }
    this.built++;
    return this.rapier.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices).setFriction(0.3));
  }
}

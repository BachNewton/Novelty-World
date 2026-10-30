import { BufferAttribute, BufferGeometry, DataTexture, FloatType, Mesh, MeshBasicNodeMaterial, NearestFilter, RedFormat, Vector2, type Node, type Scene, type Vector3 } from "three/webgpu";
import { abs, float, ivec2, max, mix, mod, positionGeometry, smoothstep, textureLoad, uniform, vec3 } from "three/tsl";
import { patchIndices } from "./tile";
import type { World } from "../sim/world";

/*
 * The terrain: one mesh for the whole world, that follows the camera. It is
 * square rings of cells, each ring's cells twice the size of the one inside it,
 * and all of them on the world's lattice of height nodes, so the count of
 * triangles is the same anywhere and doesn't grow with the number of tiles.
 *
 * Each ring keeps a little texture of heights, copied from wherever they live
 * whenever it moves, and a vertex is only a place in that texture. So nothing in
 * this file knows where one tile stops and the next begins: a seam can't show,
 * because there isn't one. Towards its outer edge a ring's vertices fold on to
 * the next ring's coarser lattice, so rings meet without a crack, and with
 * distance from the camera rather than a sudden swap, so nothing pops.
 *
 * The innermost ring is exactly the 4 m mesh, with the same diagonals as the
 * blocks the car collides with (`sim/ground.ts`).
 */

/** A ring's width in its own cells. A multiple of four, so the hole for the ring within lands on whole cells. */
const CELLS = 192;
const LEVELS = 7;
/** A share of a ring's half width: inside it the ring is at its own detail. */
const FOLD_STARTS = 0.75;

const nodeStride = (level: number) => 2 ** level;

/** The cells of a ring, leaving the middle for the ring within, which can sit a cell either way off centre. */
function ringIndices(holeColumn: number, holeRow: number): Uint32Array {
  const whole = patchIndices(CELLS);
  const kept = new Uint32Array(whole.length);
  let next = 0;
  const hole = CELLS / 2;
  for (let row = 0; row < CELLS; row++) {
    for (let column = 0; column < CELLS; column++) {
      if (column >= holeColumn && column < holeColumn + hole && row >= holeRow && row < holeRow + hole) continue;
      const at = (row * CELLS + column) * 6;
      kept.set(whole.subarray(at, at + 6), next);
      next += 6;
    }
  }
  return kept.slice(0, next);
}

interface Ring {
  stepM: number;
  heights: Float32Array;
  texture: DataTexture;
  origin: { value: Vector2 };
  /** The lattice node of the ring's first vertex, to know when it moved. */
  column: number;
  row: number;
  revision: number;
  mesh: Mesh;
}

export interface Clipmap {
  /** Moves the rings to the camera, copying heights where they moved or the world's changed. */
  update: (camera: Vector3) => void;
  dispose: () => void;
}

export function createClipmap(scene: Scene, world: World, stepM: number, colorNode: Node<"vec3">): Clipmap {
  const across = CELLS + 1;
  const positions = new Float32Array(across * across * 3);
  for (let row = 0; row < across; row++) {
    for (let column = 0; column < across; column++) {
      const at = (row * across + column) * 3;
      positions[at] = column;
      positions[at + 2] = row;
    }
  }
  const position = new BufferAttribute(positions, 3);
  const quarter = CELLS / 4;
  // Each ring draws one stretch of this, by where its hole falls. A mesh or a geometry per hole would mean new render
  // objects as the camera first moves each ring's hole, and each of those stalls a frame while three builds it.
  const holes = [0, 1].flatMap((rowShift) => [0, 1].map((columnShift) => ringIndices(quarter + columnShift, quarter + rowShift)));
  const holeIndices = holes[0].length;
  const ringIndex = new BufferAttribute(Uint32Array.from(holes.flatMap((hole) => [...hole])), 1);
  const solid = new BufferAttribute(patchIndices(CELLS), 1);
  const geometries: BufferGeometry[] = [];

  const cameraSpot = uniform(new Vector2());
  const materials: MeshBasicNodeMaterial[] = [];

  const rings: Ring[] = Array.from({ length: LEVELS }, (_, level) => {
    const ringStep = stepM * nodeStride(level);
    const heights = new Float32Array(across * across);
    const texture = new DataTexture(heights, across, across, RedFormat, FloatType);
    texture.minFilter = texture.magFilter = NearestFilter;
    const origin = uniform(new Vector2());

    const grid = positionGeometry.xz;
    const odd = mod(grid, float(2));
    const place = grid.mul(ringStep).add(origin);
    const offset = abs(place.sub(cameraSpot));
    const half = (CELLS / 2) * ringStep;
    // The ring's centre can lag the camera by two cells, and its rim must be fully folded even then.
    const fold = smoothstep(float(FOLD_STARTS * half), float(half - 2.5 * ringStep), max(offset.x, offset.y));
    const own = textureLoad(texture, ivec2(grid)).r;
    const coarse = textureLoad(texture, ivec2(grid.sub(odd))).r;
    const moved = place.sub(odd.mul(ringStep).mul(fold));

    const material = new MeshBasicNodeMaterial();
    material.positionNode = vec3(moved.x, mix(own, coarse, fold), moved.y);
    material.colorNode = colorNode;
    materials.push(material);

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", position);
    geometry.setIndex(level === 0 ? solid : ringIndex);
    geometries.push(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { stepM: ringStep, heights, texture, origin, column: Number.NaN, row: Number.NaN, revision: -1, mesh };
  });

  const copyHeights = (ring: Ring, level: number) => {
    const stride = nodeStride(level);
    const { heights } = ring;
    let at = 0;
    for (let row = 0; row < across; row++) {
      for (let column = 0; column < across; column++) heights[at++] = world.node(ring.column + column * stride, ring.row + row * stride);
    }
    ring.texture.needsUpdate = true;
    ring.origin.value.set(ring.column * stepM, ring.row * stepM);
  };

  return {
    update(camera) {
      cameraSpot.value.set(camera.x, camera.z);
      let inside: Ring | null = null;
      rings.forEach((ring, level) => {
        const stride = nodeStride(level);
        // Snapped to twice the ring's own step, so its vertices with even indices are the next ring's.
        const centreColumn = Math.floor(camera.x / (2 * ring.stepM)) * 2 * stride;
        const centreRow = Math.floor(camera.z / (2 * ring.stepM)) * 2 * stride;
        const column = centreColumn - (CELLS / 2) * stride;
        const row = centreRow - (CELLS / 2) * stride;
        // From the far grid's step up, a ring reads the same heights with or without detail.
        const changed = ring.revision !== world.revision && ring.stepM < world.manifest.far.stepM;
        if (column !== ring.column || row !== ring.row || changed) {
          ring.column = column;
          ring.row = row;
          ring.revision = world.revision;
          copyHeights(ring, level);
        }
        if (inside) {
          const shiftColumn = (inside.column - ring.column) / stride - quarter;
          const shiftRow = (inside.row - ring.row) / stride - quarter;
          ring.mesh.geometry.setDrawRange((shiftRow * 2 + shiftColumn) * holeIndices, holeIndices);
        }
        inside = ring;
      });
    },
    dispose() {
      for (const ring of rings) {
        scene.remove(ring.mesh);
        ring.texture.dispose();
      }
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}

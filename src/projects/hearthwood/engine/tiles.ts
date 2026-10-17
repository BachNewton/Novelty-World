import { emptySample, type LandSample } from "./land";
import { REGIONS } from "./regions";
import { TILE_VERTICES, tileWidth, type TileKey } from "./streaming";
import type { World } from "./world";

/*
 * One tile of land as plain data, for the art to draw: its heights and
 * normals on a square grid, and the smooth fields the ground's cover is
 * read from (which regions it belongs to, how thick the woods are, the water
 * table and any river, the wobble of the altitude bands), with which way a
 * river runs and how steeply its water falls. Neighbouring tiles of a
 * level share their edge vertices exactly, since every value is a function of
 * the world position alone.
 */

export interface LandTile {
  key: TileKey;
  /** The world position of its first vertex, and the metres between vertices. */
  x0: number;
  z0: number;
  spacing: number;
  /** Vertices along each side. */
  side: number;
  heights: Float32Array;
  /** The height the tile a level coarser would give each vertex, so a tile can ease into its parent's shape as it nears the distance it is swapped for it. */
  parentHeights: Float32Array;
  /** x, y, z per vertex. */
  normals: Float32Array;
  /** REGIONS.length weights per vertex. */
  regions: Float32Array;
  woodland: Float32Array;
  water: Float32Array;
  /** How much of a river channel each vertex lies in, 0 to 1. */
  river: Float32Array;
  /** How far the altitude bands sit from their usual altitudes at each vertex (the land's own shift of them and their wobble), in metres. */
  wobble: Float32Array;
  /** Whether any of the tile lies under water. */
  wet: boolean;
  /** Per vertex: the river's way (x, z, scaled by how much river is there), and how steeply the water drops to a neighbour, in metres per metre. */
  flow: Float32Array;
  fall: Float32Array;
  minHeight: number;
  maxHeight: number;
}

export function landTile(world: World, key: TileKey): LandTile {
  const side = TILE_VERTICES;
  const width = tileWidth(key.level);
  const spacing = width / (side - 1);
  const x0 = key.i * width;
  const z0 = key.j * width;
  // Camp and the places are too small to show from further off than these tiles are drawn, so coarser tiles read the land as it lies and skip working the places out.
  const fine = key.level <= 3;
  const sampleAt = (x: number, z: number, out: LandSample) => (fine ? world.sampleAt(x, z, out) : world.landAt(x, z, out, spacing));
  const outer = side + 2;
  const raw = new Float32Array(outer * outer);
  const s = emptySample();
  for (let j = 0; j < outer; j++) {
    for (let i = 0; i < outer; i++) raw[j * outer + i] = sampleAt(x0 + (i - 1) * spacing, z0 + (j - 1) * spacing, s).height;
  }

  const count = side * side;
  const heights = new Float32Array(count);
  const normals = new Float32Array(count * 3);
  const wobble = new Float32Array(count);
  const regions = new Float32Array(count * REGIONS.length);
  const woodland = new Float32Array(count);
  const water = new Float32Array(count);
  const river = new Float32Array(count);
  const weights = new Float32Array(REGIONS.length);
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  let wet = false;
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const v = j * side + i;
      const x = x0 + i * spacing;
      const z = z0 + j * spacing;
      const at = (j + 1) * outer + (i + 1);
      const land = sampleAt(x, z, s);
      const dx = (raw[at + 1] - raw[at - 1]) / (2 * spacing);
      const dz = (raw[at + outer] - raw[at - outer]) / (2 * spacing);
      const length = Math.hypot(dx, 1, dz);
      normals.set([-dx / length, 1 / length, -dz / length], v * 3);
      const slope = Math.hypot(dx, dz);
      heights[v] = land.height;
      water[v] = land.water;
      river[v] = land.river;
      if (land.water > land.height) wet = true;
      minHeight = Math.min(minHeight, land.height);
      maxHeight = Math.max(maxHeight, land.height);
      world.regionAt(x, z, land, weights);
      regions.set(weights, v * REGIONS.length);
      woodland[v] = world.woodlandAt(x, z, land, weights, slope, fine);
      wobble[v] = land.bands + world.bandWobble(x, z);
    }
  }

  const parentHeights = new Float32Array(count);
  const h = (i: number, j: number) => heights[Math.min(side - 1, Math.max(0, j)) * side + Math.min(side - 1, Math.max(0, i))];
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const oddI = i % 2 === 1;
      const oddJ = j % 2 === 1;
      // The parent keeps every other vertex; between them its triangles (split along the same diagonal) run straight.
      parentHeights[j * side + i] =
        oddI && oddJ ? (h(i + 1, j - 1) + h(i - 1, j + 1)) / 2 : oddI ? (h(i - 1, j) + h(i + 1, j)) / 2 : oddJ ? (h(i, j - 1) + h(i, j + 1)) / 2 : h(i, j);
    }
  }

  const flow = new Float32Array(count * 2);
  const fall = new Float32Array(count);
  if (wet) {
    for (let j = 0; j < side; j++) {
      for (let i = 0; i < side; i++) {
        const v = j * side + i;
        if (river[v] > 0 && water[v] > heights[v] - 1) {
          const way = world.flowAt(x0 + i * spacing, z0 + j * spacing);
          flow[v * 2] = way.x * river[v];
          flow[v * 2 + 1] = way.z * river[v];
        }
        let drop = 0;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const ni = i + di;
          const nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= side || nj >= side) continue;
          drop = Math.max(drop, Math.abs(water[v] - water[nj * side + ni]));
        }
        fall[v] = drop / spacing;
      }
    }
  }
  return { key, x0, z0, spacing, side, heights, parentHeights, normals, regions, woodland, water, river, wobble, wet, flow, fall, minHeight, maxHeight };
}

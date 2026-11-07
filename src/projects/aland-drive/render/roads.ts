import { RING_POINTS, type RoadSurface, type TileManifest } from "./tile";

/*
 * The baked road surface as a mesh: the pipeline's cross-sections joined along
 * each chain. The car collides with these very triangles (`sim/ground.ts`). It
 * is drawn a cell at a time, so roads beyond the ribbons' reach cost nothing.
 */

/** Part of a tile's ribbon, drawn or not as one. */
export interface RibbonCell {
  indices: Uint32Array;
  /** Where its middle is in the scene. */
  x: number;
  z: number;
  /** A sphere round its own triangles, centre and radius: its mesh shares the whole tile's vertices, so three would measure them all. */
  bounds: [number, number, number, number];
}

export interface RibbonMesh {
  positions: Float32Array;
  /** Across the road: 0 on the centre, ±1 at the carriageway's edges, ±2 where the shoulder meets the land. */
  across: Float32Array;
  /** Metres along the chain, set so a dash centres on every tile edge the chain crosses. */
  along: Float32Array;
  /** Each vertex's tier, as an index into `ROAD_TIERS`. */
  tiers: Float32Array;
  /** Two floats a vertex: the way its way runs, as `RoadAprons`' `runs`. Zero on a ribbon, which takes the town image's way instead. */
  runs: Float32Array;
  indices: Uint32Array;
  cells: RibbonCell[];
}

export const DASH_LENGTH_M = 12;
export const RIBBON_CELL_M = 600;
const ACROSS = [2, 1, 0, -1, -2];
const CENTRE = 2;
const SMALLEST_TRIANGLE_M2 = 0.01;
const ON_EDGE_M = 0.01;
const CLIFF_RISE_M = 1.2;
/** The upright share of a triangle's normal: under this it's steeper than 45°. */
const CLIFF_FLATNESS = Math.SQRT1_2;

/** Where a lesser road slides along a greater one's edge, two points of a ring can land together. */
function hasArea(positions: Float32Array, a: number, b: number, c: number): boolean {
  const [ax, ay, az] = [positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2]];
  const [ux, uy, uz] = [positions[b * 3] - ax, positions[b * 3 + 1] - ay, positions[b * 3 + 2] - az];
  const [vx, vy, vz] = [positions[c * 3] - ax, positions[c * 3 + 1] - ay, positions[c * 3 + 2] - az];
  const [nx, ny, nz] = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  const length = Math.hypot(nx, ny, nz);
  if (length <= SMALLEST_TRIANGLE_M2) return false;
  // A track crossing above a road dives under it for one section: a cliff of ribbon, which no car should meet.
  const rise = Math.max(ay, ay + uy, ay + vy) - Math.min(ay, ay + uy, ay + vy);
  return !(rise > CLIFF_RISE_M && Math.abs(ny) / length < CLIFF_FLATNESS);
}

/**
 * Metres of paint along a chain, as a scale and an offset on its real distance.
 * Two tiles only agree on where a seam is, so a chain counts its dashes from
 * there, stretching by less than a dash if it ends on a seam at both ends.
 */
export function paintAlong(length: number, startsOnEdge: boolean, endsOnEdge: boolean): { scale: number; offset: number } {
  if (startsOnEdge && endsOnEdge) return { scale: length < DASH_LENGTH_M ? 1 : (Math.round(length / DASH_LENGTH_M) * DASH_LENGTH_M) / length, offset: 0 };
  return { scale: 1, offset: endsOnEdge ? -length : 0 };
}

export function ribbonMesh(surface: RoadSurface, bounds: TileManifest["bounds"]): RibbonMesh {
  const vertices = surface.rings.length / 3;
  // Paved, the rings only say where each way runs: the paving is the whole surface.
  const quads = surface.paved ? 0 : surface.chains.reduce((sum, chain) => sum + (chain.sections - 1) * (RING_POINTS - 1), 0);
  const { aprons } = surface;
  const across = new Float32Array(vertices);
  const along = new Float32Array(vertices);
  const tiers = new Float32Array(vertices);
  const runs = new Float32Array(vertices * 2);
  const indices = new Uint32Array(quads * 6 + aprons.indices.length);
  const onEdge = (ring: number) => {
    const centre = (ring + CENTRE) * 3;
    const [east, north] = [surface.rings[centre], -surface.rings[centre + 2]];
    return Math.min(Math.abs(east - bounds.west), Math.abs(east - bounds.east), Math.abs(north - bounds.north), Math.abs(north - bounds.south)) < ON_EDGE_M;
  };
  let next = 0;
  for (const chain of surface.chains) {
    const distances = new Float32Array(chain.sections);
    for (let section = 1; section < chain.sections; section++) {
      const centre = ((chain.first + section) * RING_POINTS + CENTRE) * 3;
      const before = centre - RING_POINTS * 3;
      distances[section] = distances[section - 1] + Math.hypot(surface.rings[centre] - surface.rings[before], surface.rings[centre + 2] - surface.rings[before + 2]);
    }
    const { scale, offset } = paintAlong(distances[chain.sections - 1], onEdge(chain.first * RING_POINTS), onEdge((chain.first + chain.sections - 1) * RING_POINTS));
    for (let section = 0; section < chain.sections; section++) {
      const ring = (chain.first + section) * RING_POINTS;
      for (let point = 0; point < RING_POINTS; point++) {
        across[ring + point] = ACROSS[point];
        along[ring + point] = distances[section] * scale + offset;
        tiers[ring + point] = surface.tiers[chain.first + section];
      }
      if (section === chain.sections - 1 || surface.paved) continue;
      for (let lane = 0; lane < RING_POINTS - 1; lane++) {
        const here = ring + lane;
        const ahead = here + RING_POINTS;
        for (const [a, b, c] of [[here, here + 1, ahead], [ahead, here + 1, ahead + 1]]) {
          if (hasArea(surface.rings, a, b, c)) {
            indices.set([a, b, c], next);
            next += 3;
          }
        }
      }
    }
  }
  across.set(aprons.across, aprons.firstPoint);
  tiers.set(aprons.tiers, aprons.firstPoint);
  along.set(aprons.along, aprons.firstPoint);
  runs.set(aprons.runs, aprons.firstPoint * 2);
  for (let at = 0; at < aprons.indices.length; at += 3) {
    const [a, b, c] = [aprons.indices[at] + aprons.firstPoint, aprons.indices[at + 1] + aprons.firstPoint, aprons.indices[at + 2] + aprons.firstPoint];
    // The paving is one surface on each level, built without folds or cliffs: a steep path's thin triangle is its own, and
    // leaving it out would leave a hole.
    if (surface.paved || hasArea(surface.rings, a, b, c)) {
      indices.set([a, b, c], next);
      next += 3;
    }
  }
  const kept = indices.slice(0, next);
  return { positions: surface.rings, across, along, tiers, runs, indices: kept, cells: ribbonCells(surface.rings, kept) };
}

function ribbonCells(positions: Float32Array, indices: Uint32Array): RibbonCell[] {
  const cells = new Map<number, { triangles: number[]; column: number; row: number }>();
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const corner = indices[triangle] * 3;
    const column = Math.floor(positions[corner] / RIBBON_CELL_M);
    const row = Math.floor(positions[corner + 2] / RIBBON_CELL_M);
    const key = column * 65536 + row;
    const cell = cells.get(key);
    if (cell) cell.triangles.push(triangle);
    else cells.set(key, { triangles: [triangle], column, row });
  }
  return [...cells.values()].map(({ triangles, column, row }) => {
    const cellIndices = new Uint32Array(triangles.length * 3);
    triangles.forEach((triangle, at) => {
      cellIndices.set(indices.subarray(triangle, triangle + 3), at * 3);
    });
    const low = [Infinity, Infinity, Infinity];
    const high = [-Infinity, -Infinity, -Infinity];
    for (const vertex of cellIndices) {
      for (let axis = 0; axis < 3; axis++) {
        low[axis] = Math.min(low[axis], positions[vertex * 3 + axis]);
        high[axis] = Math.max(high[axis], positions[vertex * 3 + axis]);
      }
    }
    const bounds: RibbonCell["bounds"] = [(low[0] + high[0]) / 2, (low[1] + high[1]) / 2, (low[2] + high[2]) / 2, Math.hypot(high[0] - low[0], high[1] - low[1], high[2] - low[2]) / 2];
    return { indices: cellIndices, x: (column + 0.5) * RIBBON_CELL_M, z: (row + 0.5) * RIBBON_CELL_M, bounds };
  });
}

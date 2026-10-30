import { RING_POINTS, type RoadSurface } from "./tile";

/*
 * The baked road surface as a mesh: the pipeline's cross-sections joined along
 * each chain. The car collides with these very triangles (`sim/ground.ts`).
 */

export interface RibbonMesh {
  positions: Float32Array;
  /** Across the road: 0 on the centre, ±1 at the carriageway's edges, ±2 where the shoulder meets the land. */
  across: Float32Array;
  /** Metres along the chain. */
  along: Float32Array;
  /** Each vertex's tier, as an index into `ROAD_TIERS`. */
  tiers: Float32Array;
  indices: Uint32Array;
}

const ACROSS = [2, 1, 0, -1, -2];
const CENTRE = 2;
const SMALLEST_TRIANGLE_M2 = 0.01;

/** Where a lesser road slides along a greater one's edge, two points of a ring can land together. */
function hasArea(positions: Float32Array, a: number, b: number, c: number): boolean {
  const [ax, ay, az] = [positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2]];
  const [ux, uy, uz] = [positions[b * 3] - ax, positions[b * 3 + 1] - ay, positions[b * 3 + 2] - az];
  const [vx, vy, vz] = [positions[c * 3] - ax, positions[c * 3 + 1] - ay, positions[c * 3 + 2] - az];
  return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) > SMALLEST_TRIANGLE_M2;
}

export function ribbonMesh(surface: RoadSurface): RibbonMesh {
  const vertices = surface.rings.length / 3;
  const quads = surface.chains.reduce((sum, chain) => sum + (chain.sections - 1) * (RING_POINTS - 1), 0);
  const across = new Float32Array(vertices);
  const along = new Float32Array(vertices);
  const tiers = new Float32Array(vertices);
  const indices = new Uint32Array(quads * 6);
  let next = 0;
  for (const chain of surface.chains) {
    let distance = 0;
    for (let section = 0; section < chain.sections; section++) {
      const ring = (chain.first + section) * RING_POINTS;
      if (section > 0) {
        const centre = (ring + CENTRE) * 3;
        const before = centre - RING_POINTS * 3;
        distance += Math.hypot(surface.rings[centre] - surface.rings[before], surface.rings[centre + 2] - surface.rings[before + 2]);
      }
      for (let point = 0; point < RING_POINTS; point++) {
        across[ring + point] = ACROSS[point];
        along[ring + point] = distance;
        tiers[ring + point] = surface.tiers[chain.first + section];
      }
      if (section === chain.sections - 1) continue;
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
  return { positions: surface.rings, across, along, tiers, indices: indices.slice(0, next) };
}

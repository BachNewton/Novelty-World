import { createRng } from "@/shared/lib/seeded-random";
import { fbm, gradientNoise } from "./noise";

/*
 * Where rivers run: along the borders of a pattern of cells laid over the
 * world in a warped frame, so they wind, meet at junctions and part again,
 * and never close into rings. Some borders hold no river, so rivers start
 * at springs and the network has gaps between. Each river reach has its own
 * size. Pure: a point's nearest river is found from the cells round it alone.
 */

/** The spacing of the cells whose borders the rivers follow, in metres. */
const CELL = 1250;
/** The share of cell borders that hold a river. */
const KEEP = 0.42;

export interface RiverReach {
  /** How far the point is from the river's line, in metres. */
  distance: number;
  /** The reach's size, 0 (a stream) to 1 (a broad river). */
  size: number;
  /** The way the river's line runs (a unit vector; which way the water flows is the land's to say). */
  alongX: number;
  alongZ: number;
}

function hash2(seed: number, i: number, j: number): number {
  let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function makeRivers(seed: string) {
  const warp = gradientNoise(`${seed}/river-warp`);
  const base = Math.floor(createRng(`${seed}/rivers`).next() * 0x7fffffff);
  const pointX = (i: number, j: number) => (i + 0.15 + 0.7 * hash2(base, i, j)) * CELL;
  const pointZ = (i: number, j: number) => (j + 0.15 + 0.7 * hash2(base + 1, i, j)) * CELL;
  const cells: number[] = new Array(25 * 2);

  /** The nearest river reach to a point, or null when no kept border is near. */
  return (x: number, z: number, out: RiverReach): RiverReach | null => {
    const wx = x + 380 * fbm(warp, x / 1100, z / 1100, 3);
    const wz = z + 380 * fbm(warp, x / 1100 + 41.3, z / 1100 - 12.7, 3);
    const ci = Math.floor(wx / CELL);
    const cj = Math.floor(wz / CELL);
    let nearest = -1;
    let nearestDistance = Infinity;
    let k = 0;
    for (let dj = -2; dj <= 2; dj++) {
      for (let di = -2; di <= 2; di++) {
        const i = ci + di;
        const j = cj + dj;
        cells[k * 2] = i;
        cells[k * 2 + 1] = j;
        const d = Math.hypot(pointX(i, j) - wx, pointZ(i, j) - wz);
        if (d < nearestDistance) {
          nearestDistance = d;
          nearest = k;
        }
        k++;
      }
    }
    const ai = cells[nearest * 2];
    const aj = cells[nearest * 2 + 1];
    const ax = pointX(ai, aj);
    const az = pointZ(ai, aj);
    const pa = (wx - ax) ** 2 + (wz - az) ** 2;
    let best: RiverReach | null = null;
    for (let m = 0; m < 25; m++) {
      if (m === nearest) continue;
      const bi = cells[m * 2];
      const bj = cells[m * 2 + 1];
      // A border is the same for both cells it lies between, so it is named by the pair in a fixed order.
      const [li, lj, hi, hj] = ai < bi || (ai === bi && aj < bj) ? [ai, aj, bi, bj] : [bi, bj, ai, aj];
      const id = hash2(base + 7, li * 92821 + hi, lj * 68917 + hj);
      if (id > KEEP) continue;
      const bx = pointX(bi, bj);
      const bz = pointZ(bi, bj);
      const span = Math.hypot(bx - ax, bz - az);
      // How far the point lies from the border between the two cells (its perpendicular bisector).
      const distance = ((wx - bx) ** 2 + (wz - bz) ** 2 - pa) / (2 * span);
      if (best !== null && distance >= best.distance) continue;
      best = out;
      out.distance = distance;
      out.size = hash2(base + 11, li * 92821 + hi, lj * 68917 + hj);
      out.alongX = -(bz - az) / span;
      out.alongZ = (bx - ax) / span;
    }
    return best;
  };
}

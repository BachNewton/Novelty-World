import { isPaved } from "../art/surfaces/road-attributes";
import { RING_POINTS } from "../render/tile";
import type { World } from "../sim/world";

/*
 * The road as laid, read along a route: at any place, the nearest section of
 * the baked road surface, its middle, how far the carriageway and the whole
 * surface reach to either side of it, and whether it is sealed. The racing line
 * and the vetting tool read the road's real edges from it, which the GPS's line
 * (OpenStreetMap's, thinned) can't give. Every drivable section of every tile
 * with detail is put in a grid of cells once, so a route of thousands of reads
 * costs nothing a tile's worth of sections.
 */

export interface LaidPoint {
  x: number;
  y: number;
  z: number;
  /** Radians anticlockwise from north, the way the section's chain runs. */
  heading: number;
  /** From the middle to the carriageway's left and right edges, in the chain's own direction. */
  leftM: number;
  rightM: number;
  /** From the middle to the whole surface's outer left and right, shoulders included. */
  outerLeftM: number;
  outerRightM: number;
  paved: boolean;
  kind: string;
  /** Metres from the place asked about to the middle, across the road. */
  distance: number;
}

const CELL_M = 40;
/** A laid middle further than this from a place isn't the road under it. */
const WITHIN_M = 12;
const CENTRE = 2;
/** A section running further than this off the asked way is another road's: a side road at a junction, a parallel drive. */
const SAME_WAY_COSINE = Math.cos((35 * Math.PI) / 180);

interface Section {
  rings: Float32Array;
  /** The section's first float in `rings`. */
  at: number;
  /** The next section along the chain's first float, or the one before for a chain's last section: the way the chain runs here. */
  next: number;
  paved: boolean;
  kind: string;
}

const cellKey = (x: number, z: number) => `${Math.floor(x / CELL_M)},${Math.floor(z / CELL_M)}`;

export class LaidRoad {
  private readonly cells = new Map<string, Section[]>();

  constructor(world: World) {
    for (const { detail } of world.all()) {
      if (!detail) continue;
      const { rings, chains } = detail.surface;
      for (const chain of chains) {
        if (!chain.motor || chain.sections < 2) continue;
        // The ribbon's own class decides whether it's drawn sealed, as the tyres read it (`sim/road-grip.ts`).
        const paved = isPaved(chain, 0);
        for (let section = chain.first; section < chain.first + chain.sections; section++) {
          const last = section === chain.first + chain.sections - 1;
          const entry: Section = { rings, at: section * RING_POINTS * 3, next: (last ? section - 1 : section + 1) * RING_POINTS * 3, paved, kind: chain.kind };
          const key = cellKey(rings[entry.at + CENTRE * 3], rings[entry.at + CENTRE * 3 + 2]);
          const list = this.cells.get(key);
          if (list) list.push(entry);
          else this.cells.set(key, [entry]);
        }
      }
    }
  }

  /** The laid road under a place, running the way asked (either way along it counts), or null where none is laid within reach. */
  nearest(x: number, z: number, heading: number, withinM = WITHIN_M): LaidPoint | null {
    let best: { section: Section; distance: number; share: number } | null = null;
    const column = Math.floor(x / CELL_M);
    const row = Math.floor(z / CELL_M);
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        const list = this.cells.get(`${column + dc},${row + dr}`);
        if (!list) continue;
        for (const section of list) {
          const { rings, at, next } = section;
          const cx = rings[at + CENTRE * 3];
          const cz = rings[at + CENTRE * 3 + 2];
          const runX = rings[next + CENTRE * 3] - cx;
          const runZ = rings[next + CENTRE * 3 + 2] - cz;
          const run = runX * runX + runZ * runZ;
          if (run === 0) continue;
          // The place projected on to the stretch from this section's middle to the next's.
          const share = Math.max(0, Math.min(1, ((x - cx) * runX + (z - cz) * runZ) / run));
          const distance = Math.hypot(cx + share * runX - x, cz + share * runZ - z);
          if (distance > withinM || (best && distance >= best.distance)) continue;
          // A road line's heading points along (-sin, -cos).
          if (Math.abs((-runX * Math.sin(heading) - runZ * Math.cos(heading)) / Math.sqrt(run)) < SAME_WAY_COSINE) continue;
          best = { section, distance, share };
        }
      }
    }
    if (!best) return null;
    const { rings, at, next, paved, kind } = best.section;
    const { share } = best;
    const blend = (ring: number, axis: number) => rings[at + ring * 3 + axis] + share * (rings[next + ring * 3 + axis] - rings[at + ring * 3 + axis]);
    const cx = blend(CENTRE, 0);
    const cy = blend(CENTRE, 1);
    const cz = blend(CENTRE, 2);
    const across = (ring: number) => Math.hypot(blend(ring, 0) - cx, blend(ring, 2) - cz);
    // The chain's own way, turned to the way asked, so left and right are the route's.
    let runX = rings[next + CENTRE * 3] - rings[at + CENTRE * 3];
    let runZ = rings[next + CENTRE * 3 + 2] - rings[at + CENTRE * 3 + 2];
    if (next < at) [runX, runZ] = [-runX, -runZ];
    const chainHeading = Math.atan2(-runX, -runZ);
    const alongRoute = Math.cos(chainHeading - heading) >= 0;
    const [leftM, rightM, outerLeftM, outerRightM] = alongRoute ? [across(1), across(3), across(0), across(4)] : [across(3), across(1), across(4), across(0)];
    return { x: cx, y: cy, z: cz, heading: alongRoute ? chainHeading : chainHeading + Math.PI, leftM, rightM, outerLeftM, outerRightM, paved, kind, distance: best.distance };
  }
}

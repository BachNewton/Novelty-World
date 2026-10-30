import { RING_POINTS, type RoadSurface } from "../render/tile";

/*
 * The roads as lines to find and follow: the centre of every drivable ribbon,
 * for putting a car back on the nearest one and for steering along one.
 */

export interface RoadPoint {
  x: number;
  y: number;
  z: number;
  /** Radians anticlockwise from north, the way the chain runs. */
  heading: number;
  chain: number;
  /** Metres along the chain. */
  along: number;
  /** Metres from wherever was asked about. */
  distance: number;
}

interface Line {
  /** Scene x, y and z of each section's centre. */
  points: Float32Array;
  /** Metres along the line at each section. */
  lengths: Float32Array;
}

const CENTRE = 2;
const CELL_M = 64;
const cellKey = (x: number, z: number) => Math.floor(x / CELL_M) * 100000 + Math.floor(z / CELL_M);

export class RoadNet {
  private readonly lines = new Map<number, Line>();
  private readonly cells = new Map<number, [chain: number, segment: number][]>();

  constructor(surface: RoadSurface) {
    surface.chains.forEach((chain, index) => {
      if (!chain.motor || chain.sections < 2) return;
      const points = new Float32Array(chain.sections * 3);
      const lengths = new Float32Array(chain.sections);
      for (let section = 0; section < chain.sections; section++) {
        const at = ((chain.first + section) * RING_POINTS + CENTRE) * 3;
        points.set(surface.rings.subarray(at, at + 3), section * 3);
        if (section > 0) lengths[section] = lengths[section - 1] + Math.hypot(points[section * 3] - points[section * 3 - 3], points[section * 3 + 2] - points[section * 3 - 1]);
      }
      this.lines.set(index, { points, lengths });
      for (let segment = 0; segment < chain.sections - 1; segment++) {
        const steps = Math.ceil((lengths[segment + 1] - lengths[segment]) / (CELL_M / 2));
        for (let step = 0; step <= steps; step++) {
          const share = step / steps;
          const key = cellKey(points[segment * 3] + share * (points[segment * 3 + 3] - points[segment * 3]), points[segment * 3 + 2] + share * (points[segment * 3 + 5] - points[segment * 3 + 2]));
          const cell = this.cells.get(key);
          if (cell) cell.push([index, segment]);
          else this.cells.set(key, [[index, segment]]);
        }
      }
    });
  }

  private line(chain: number): Line {
    const line = this.lines.get(chain);
    if (!line) throw new Error(`no drivable road chain ${chain}`);
    return line;
  }

  /** The nearest point on any drivable road, searching outwards ring by ring of cells. */
  nearest(x: number, z: number): RoadPoint {
    let best: RoadPoint | null = null;
    for (let reach = 0; reach < 200 && (!best || best.distance > (reach - 1) * CELL_M); reach++) {
      for (let row = -reach; row <= reach; row++) {
        for (let column = -reach; column <= reach; column++) {
          if (Math.max(Math.abs(row), Math.abs(column)) !== reach) continue;
          for (const [chain, segment] of this.cells.get(cellKey(x + column * CELL_M, z + row * CELL_M)) ?? []) {
            const found = this.onSegment(chain, segment, x, z);
            if (!best || found.distance < best.distance) best = found;
          }
        }
      }
    }
    if (!best) throw new Error("no drivable road on this tile");
    return best;
  }

  private onSegment(chain: number, segment: number, x: number, z: number): RoadPoint {
    const { points, lengths } = this.line(chain);
    const fromX = points[segment * 3];
    const fromZ = points[segment * 3 + 2];
    const runX = points[segment * 3 + 3] - fromX;
    const runZ = points[segment * 3 + 5] - fromZ;
    const share = Math.max(0, Math.min(1, ((x - fromX) * runX + (z - fromZ) * runZ) / (runX * runX + runZ * runZ)));
    const onX = fromX + share * runX;
    const onZ = fromZ + share * runZ;
    return {
      x: onX,
      y: points[segment * 3 + 1] + share * (points[segment * 3 + 4] - points[segment * 3 + 1]),
      z: onZ,
      heading: Math.atan2(-runX, -runZ),
      chain,
      along: lengths[segment] + share * (lengths[segment + 1] - lengths[segment]),
      distance: Math.hypot(x - onX, z - onZ),
    };
  }

  /** The point a distance along a chain. */
  at(chain: number, along: number): RoadPoint {
    const { lengths } = this.line(chain);
    const clamped = Math.max(0, Math.min(lengths[lengths.length - 1], along));
    let low = 0;
    let high = lengths.length - 2;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (lengths[middle] <= clamped) low = middle;
      else high = middle - 1;
    }
    const { points } = this.line(chain);
    const share = (clamped - lengths[low]) / (lengths[low + 1] - lengths[low]);
    return this.onSegment(chain, low, points[low * 3] + share * (points[low * 3 + 3] - points[low * 3]), points[low * 3 + 2] + share * (points[low * 3 + 5] - points[low * 3 + 2]));
  }

  lengthOf(chain: number): number {
    const { lengths } = this.line(chain);
    return lengths[lengths.length - 1];
  }
}

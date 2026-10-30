import { RING_POINTS, type RoadSurface } from "../render/tile";

/*
 * The roads as lines to find and follow: the centre of every drivable ribbon.
 * A tile's lines are built apart from everything else (in a worker, in the page)
 * and are plain typed arrays; `RoadNet` joins the loaded tiles' into one, for
 * putting a car back on the nearest road.
 */

export interface RoadPoint {
  x: number;
  y: number;
  z: number;
  /** Radians anticlockwise from north, the way the line runs. */
  heading: number;
  /** Metres along the line. */
  along: number;
  /** Metres from wherever was asked about. */
  distance: number;
}

const CENTRE = 2;
/** Divides a tile exactly, so a search stepping by a cell reaches every cell of a neighbour too. */
const CELL_M = 60;
const FURTHEST_SEARCH_CELLS = 200;

/** A line through the scene, however it was made: one chain, or a route joined from many. */
export class RoadLine {
  /** Metres along the line at each point. */
  readonly lengths: Float32Array;

  constructor(
    /** Scene x, y and z of each point. */
    readonly points: Float32Array,
    lengths?: Float32Array,
  ) {
    this.lengths = lengths ?? new Float32Array(points.length / 3);
    if (lengths) return;
    for (let at = 1; at < this.lengths.length; at++) {
      this.lengths[at] = this.lengths[at - 1] + Math.hypot(points[at * 3] - points[at * 3 - 3], points[at * 3 + 2] - points[at * 3 - 1]);
    }
  }

  get length(): number {
    return this.lengths[this.lengths.length - 1];
  }

  /** The point a distance along the line. */
  at(along: number): RoadPoint {
    const { lengths, points } = this;
    const clamped = Math.max(0, Math.min(this.length, along));
    let low = 0;
    let high = lengths.length - 2;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (lengths[middle] <= clamped) low = middle;
      else high = middle - 1;
    }
    const share = (clamped - lengths[low]) / (lengths[low + 1] - lengths[low]);
    return onSegment(points, lengths, low, points[low * 3] + share * (points[low * 3 + 3] - points[low * 3]), points[low * 3 + 2] + share * (points[low * 3 + 5] - points[low * 3 + 2]));
  }
}

function onSegment(points: Float32Array, lengths: Float32Array, segment: number, x: number, z: number): RoadPoint {
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
    along: lengths[segment] + share * (lengths[segment + 1] - lengths[segment]),
    distance: Math.hypot(x - onX, z - onZ),
  };
}

/** One tile's lines end to end, and which segments cross each of its cells. */
export interface TileRoads {
  /** The tile's place on the lattice of tiles. */
  column: number;
  row: number;
  /** Scene x, y and z of each line's points, end to end. */
  points: Float32Array;
  /** Metres along its own line at each point. */
  lengths: Float32Array;
  /** Where each of the tile's chains starts in `points`, as a count of points, or -1 for one no car can use. */
  chainFirst: Int32Array;
  /** How many points each chain has. */
  chainPoints: Int32Array;
  /** Where each cell's list starts in `cellSegments`. */
  cellFirst: Int32Array;
  /** Each entry is a point index: the segment from it to the next. */
  cellSegments: Int32Array;
}

export function tileRoads(surface: RoadSurface, column: number, row: number, tileM: number): TileRoads {
  const drivable = surface.chains.filter((chain) => chain.motor && chain.sections >= 2);
  const total = drivable.reduce((sum, chain) => sum + chain.sections, 0);
  const points = new Float32Array(total * 3);
  const lengths = new Float32Array(total);
  const chainFirst = new Int32Array(surface.chains.length).fill(-1);
  const chainPoints = new Int32Array(surface.chains.length);
  const cellsAcross = Math.round(tileM / CELL_M);
  const lists = Array.from({ length: cellsAcross * cellsAcross }, (): number[] => []);
  const west = column * tileM;
  const north = row * tileM;
  let next = 0;
  surface.chains.forEach((chain, index) => {
    if (!chain.motor || chain.sections < 2) return;
    chainFirst[index] = next;
    chainPoints[index] = chain.sections;
    for (let section = 0; section < chain.sections; section++) {
      const at = ((chain.first + section) * RING_POINTS + CENTRE) * 3;
      const point = next + section;
      points.set(surface.rings.subarray(at, at + 3), point * 3);
      if (section > 0) lengths[point] = lengths[point - 1] + Math.hypot(points[point * 3] - points[point * 3 - 3], points[point * 3 + 2] - points[point * 3 - 1]);
    }
    for (let segment = next; segment < next + chain.sections - 1; segment++) {
      const steps = Math.ceil((lengths[segment + 1] - lengths[segment]) / (CELL_M / 2));
      for (let step = 0; step <= steps; step++) {
        const share = step / steps;
        const x = points[segment * 3] + share * (points[segment * 3 + 3] - points[segment * 3]);
        const z = points[segment * 3 + 2] + share * (points[segment * 3 + 5] - points[segment * 3 + 2]);
        const cellColumn = Math.max(0, Math.min(cellsAcross - 1, Math.floor((x - west) / CELL_M)));
        const cellRow = Math.max(0, Math.min(cellsAcross - 1, Math.floor((z - north) / CELL_M)));
        const list = lists[cellRow * cellsAcross + cellColumn];
        if (list[list.length - 1] !== segment) list.push(segment);
      }
    }
    next += chain.sections;
  });
  const cellFirst = new Int32Array(lists.length + 1);
  lists.forEach((list, cell) => {
    cellFirst[cell + 1] = cellFirst[cell] + list.length;
  });
  const cellSegments = new Int32Array(cellFirst[lists.length]);
  lists.forEach((list, cell) => {
    cellSegments.set(list, cellFirst[cell]);
  });
  return { column, row, points, lengths, chainFirst, chainPoints, cellFirst, cellSegments };
}

/** A chain's own line, to follow or to place a car on. */
export function chainLine(roads: TileRoads, chain: number): RoadLine {
  const first = roads.chainFirst[chain];
  if (first < 0) throw new Error(`chain ${chain} isn't a drivable road`);
  const count = roads.chainPoints[chain];
  return new RoadLine(roads.points.subarray(first * 3, (first + count) * 3), roads.lengths.subarray(first, first + count));
}

const tileKey = (column: number, row: number) => column * 4096 + row;

export class RoadNet {
  private readonly tiles = new Map<number, TileRoads>();

  constructor(private readonly tileM: number) {}

  add(roads: TileRoads): void {
    this.tiles.set(tileKey(roads.column, roads.row), roads);
  }

  remove(column: number, row: number): void {
    this.tiles.delete(tileKey(column, row));
  }

  /** The nearest point on any loaded drivable road, searching outwards ring by ring of cells. */
  nearest(x: number, z: number): RoadPoint | null {
    let best: RoadPoint | null = null;
    for (let reach = 0; reach < FURTHEST_SEARCH_CELLS && (!best || best.distance > (reach - 1) * CELL_M); reach++) {
      for (let row = -reach; row <= reach; row++) {
        for (let column = -reach; column <= reach; column++) {
          if (Math.max(Math.abs(row), Math.abs(column)) !== reach) continue;
          best = this.nearestInCell(x + column * CELL_M, z + row * CELL_M, x, z, best);
        }
      }
    }
    return best;
  }

  private nearestInCell(cellX: number, cellZ: number, x: number, z: number, best: RoadPoint | null): RoadPoint | null {
    const tileColumn = Math.floor(cellX / this.tileM);
    const tileRow = Math.floor(cellZ / this.tileM);
    const roads = this.tiles.get(tileKey(tileColumn, tileRow));
    if (!roads) return best;
    const cellsAcross = Math.round(this.tileM / CELL_M);
    const cell = Math.floor((cellZ - tileRow * this.tileM) / CELL_M) * cellsAcross + Math.floor((cellX - tileColumn * this.tileM) / CELL_M);
    let found = best;
    for (let entry = roads.cellFirst[cell]; entry < roads.cellFirst[cell + 1]; entry++) {
      const point = onSegment(roads.points, roads.lengths, roads.cellSegments[entry], x, z);
      if (!found || point.distance < found.distance) found = point;
    }
    return found;
  }
}

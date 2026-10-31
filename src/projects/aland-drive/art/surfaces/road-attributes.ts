import { RING_POINTS, ROAD_TIERS, type RoadSurface } from "../../render/tile";

/*
 * What a road's shader needs to know that its ribbon doesn't carry: whether it's
 * sealed, whether it's in town, how wide it is in metres, and how far along it
 * the nearest painted junction lies. Worked out from a tile's road surface and how
 * built up each of its cells is, a value per ribbon vertex.
 */

export const NO_MARK = 0;
export const GIVE_WAY = 1;
export const STOP = 2;
/** Added to a mark when a zebra crossing lies behind the line. */
export const ZEBRA = 4;
/** Further than anything paint could reach. */
export const FAR_FROM_MARK_M = 9999;

const PAVED_KINDS = new Set(["primary", "primary_link", "secondary", "secondary_link", "tertiary", "tertiary_link", "residential", "living_street"]);
const PAVED_IN_TOWN = new Set(["unclassified", "service", "cycleway", "footway", "pedestrian"]);
/** Vertices of building in a 600 m cell that make it town. */
const TOWN_VERTICES = [2500, 6000] as const;
const CELL_M = 600;
const GRID_M = 24;
const TOUCHING_M = 2.5;
const SHORTEST_MARKED_M = 25;
const STOP_EVERY = 5;

export interface BuiltCell {
  x: number;
  z: number;
  vertices: number;
}

export interface RoadAttributes {
  /** Per vertex: sealed 0 or 1, town 0 to 1, half width in metres, metres to the nearest mark. */
  surface: Float32Array;
  /** Per vertex: the shoulder's width in metres, then that mark's kind, negative when it's at the chain's start. */
  mark: Float32Array;
}

interface Segment {
  chain: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  halfWidth: number;
}

const centreOf = (rings: Float32Array, section: number) => {
  const at = (section * RING_POINTS + 2) * 3;
  return { x: rings[at], z: rings[at + 2] };
};

const halfWidthOf = (rings: Float32Array, section: number) => {
  const left = (section * RING_POINTS + 1) * 3;
  const right = (section * RING_POINTS + 3) * 3;
  return Math.hypot(rings[left] - rings[right], rings[left + 2] - rings[right + 2]) / 2;
};

const shoulderOf = (rings: Float32Array, section: number) => {
  const outer = section * RING_POINTS * 3;
  const edge = outer + 3;
  return Math.hypot(rings[outer] - rings[edge], rings[outer + 2] - rings[edge + 2]);
};

function distanceToSegment(x: number, z: number, { ax, az, bx, bz }: Segment): number {
  const [ux, uz] = [bx - ax, bz - az];
  const lengthSquared = ux * ux + uz * uz;
  const share = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * ux + (z - az) * uz) / lengthSquared));
  return Math.hypot(x - ax - ux * share, z - az - uz * share);
}

/** Every road's centre line in a grid, to find which road another ends on. */
function segmentGrid(surface: RoadSurface) {
  const cells = new Map<string, Segment[]>();
  surface.chains.forEach(({ first, sections }, chain) => {
    for (let section = first; section < first + sections - 1; section++) {
      const a = centreOf(surface.rings, section);
      const b = centreOf(surface.rings, section + 1);
      const segment = { chain, ax: a.x, az: a.z, bx: b.x, bz: b.z, halfWidth: halfWidthOf(surface.rings, section) };
      const keys = new Set([a, b, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }].map(({ x, z }) => `${Math.floor(x / GRID_M)},${Math.floor(z / GRID_M)}`));
      for (const key of keys) {
        const list = cells.get(key);
        if (list) list.push(segment);
        else cells.set(key, [segment]);
      }
    }
  });
  return cells;
}

/** The greatest road an end of a chain stops on, if any: greater roads come first, so it's the lowest chain. */
function roadEndedOn(cells: Map<string, Segment[]>, chain: number, x: number, z: number): number | null {
  let found: number | null = null;
  const column = Math.floor(x / GRID_M);
  const row = Math.floor(z / GRID_M);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      for (const segment of cells.get(`${column + dx},${row + dz}`) ?? []) {
        if (segment.chain >= chain || (found !== null && segment.chain >= found)) continue;
        if (distanceToSegment(x, z, segment) < segment.halfWidth + TOUCHING_M) found = segment.chain;
      }
    }
  }
  return found;
}

/** How built up a place is, 0 to 1, read smoothly across the 600 m cells so a kerb doesn't start on a cell's edge. */
function townReader(built: BuiltCell[]) {
  const counts = new Map(built.map(({ x, z, vertices }) => [`${Math.floor(x / CELL_M)},${Math.floor(z / CELL_M)}`, vertices]));
  const at = (column: number, row: number) => counts.get(`${column},${row}`) ?? 0;
  return (x: number, z: number) => {
    const u = x / CELL_M - 0.5;
    const v = z / CELL_M - 0.5;
    const [column, row] = [Math.floor(u), Math.floor(v)];
    const [shareX, shareZ] = [u - column, v - row];
    const top = at(column, row) * (1 - shareX) + at(column + 1, row) * shareX;
    const bottom = at(column, row + 1) * (1 - shareX) + at(column + 1, row + 1) * shareX;
    const vertices = top * (1 - shareZ) + bottom * shareZ;
    return Math.max(0, Math.min(1, (vertices - TOWN_VERTICES[0]) / (TOWN_VERTICES[1] - TOWN_VERTICES[0])));
  };
}

function markFor(chain: number, kind: string, town: number, onto: number, surface: RoadSurface): number {
  const greater = surface.chains[onto];
  if (ROAD_TIERS[surface.tiers[greater.first]] !== "main") return NO_MARK;
  const line = greater.kind === "primary" && chain % STOP_EVERY === 0 ? STOP : GIVE_WAY;
  return kind !== "cycleway" && town > 0.5 ? line + ZEBRA : line;
}

export function roadAttributes(surface: RoadSurface, built: BuiltCell[]): RoadAttributes {
  const vertices = surface.rings.length / 3;
  const shaded = new Float32Array(vertices * 4);
  const marks = new Float32Array(vertices * 2);
  const townAt = townReader(built);
  const grid = segmentGrid(surface);
  surface.chains.forEach(({ first, sections, kind, motor }, chain) => {
    const last = first + sections - 1;
    const start = centreOf(surface.rings, first);
    const end = centreOf(surface.rings, last);
    const distances = new Float32Array(sections);
    for (let section = 1; section < sections; section++) {
      const a = centreOf(surface.rings, first + section - 1);
      const b = centreOf(surface.rings, first + section);
      distances[section] = distances[section - 1] + Math.hypot(b.x - a.x, b.z - a.z);
    }
    const length = distances[sections - 1];
    const marked = motor && kind !== "track" && kind !== "service" && length >= SHORTEST_MARKED_M;
    const startOn = marked ? roadEndedOn(grid, chain, start.x, start.z) : null;
    const endOn = marked ? roadEndedOn(grid, chain, end.x, end.z) : null;
    const startMark = startOn === null ? NO_MARK : markFor(chain, kind, townAt(start.x, start.z), startOn, surface);
    const endMark = endOn === null ? NO_MARK : markFor(chain, kind, townAt(end.x, end.z), endOn, surface);
    for (let section = 0; section < sections; section++) {
      const { x, z } = centreOf(surface.rings, first + section);
      const town = townAt(x, z);
      const paved = PAVED_KINDS.has(kind) || (town > 0.5 && PAVED_IN_TOWN.has(kind)) ? 1 : 0;
      const halfWidth = halfWidthOf(surface.rings, first + section);
      const shoulder = shoulderOf(surface.rings, first + section);
      const toStart = startMark === NO_MARK ? FAR_FROM_MARK_M : distances[section];
      const toEnd = endMark === NO_MARK ? FAR_FROM_MARK_M : length - distances[section];
      const useEnd = toEnd <= toStart;
      for (let point = 0; point < RING_POINTS; point++) {
        const vertex = (first + section) * RING_POINTS + point;
        shaded.set([paved, town, halfWidth, Math.min(toStart, toEnd)], vertex * 4);
        marks.set([shoulder, useEnd ? endMark : -startMark], vertex * 2);
      }
    }
  });
  return { surface: shaded, mark: marks };
}

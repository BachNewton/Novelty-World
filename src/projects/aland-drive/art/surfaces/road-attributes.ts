import { RING_POINTS, ROAD_TIERS, type RoadChain, type RoadSurface } from "../../render/tile";

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
/**
 * Past a class's three bits, what a point of paving's own OSM way says its road's surface is, where it says: a road that
 * turns from asphalt to gravel is each along its own stretch (`SEALED_WAY`, `LOOSE_WAY` in `pipeline/paving.py`).
 */
export const SEALED_WAY = 0b01000;
export const LOOSE_WAY = 0b10000;
/** Past those, whether a point of paving lies on its own way's carriageway, where the paint at that road's end is laid: a mouth's fill beside it is bare (`ON_CARRIAGEWAY` in `pipeline/paving.py`). */
export const ON_CARRIAGEWAY = 0b100000;

const PAVED_KINDS = new Set(["primary", "primary_link", "secondary", "secondary_link", "tertiary", "tertiary_link", "residential", "living_street"]);
const PAVED_IN_TOWN = new Set(["unclassified", "service", "cycleway", "footway", "pedestrian"]);
/** Vertices of building in a 600 m cell that make it town. */
const TOWN_VERTICES = [2500, 6000] as const;
const CELL_M = 600;
const GRID_M = 24;
// A town street's: the pipeline's residential half-width.
const PAVED_AREA_HALF_WIDTH_M = 2.25;
const TOUCHING_M = 2.5;
const SHORTEST_MARKED_M = 25;
const STOP_EVERY = 5;
const APRON_SHOULDER_M = 1;
const NARROWEST_HALF_M = 0.1;
/** A road meeting another at a slant is no further from its edge than this many of that road's half-widths. */
const MOST_SLANT = 3;
/** A point of paving this far back along its road from its end is past anything painted there. */
const MARKS_REACH_M = 30;
/** A point this far past its carriageway's edge is still the edge's own, as the paving stores it. */
const ON_EDGE_M = 0.05;
/** A point of a road's own carriageway is no further than this past its edge from the road's middle, however the middle bends. */
const OWN_ASIDE_M = 1;

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

/** An end of a road that carries a mark: the road's middle back from it as far as paint reaches, and how far back the road it meets has its edge. */
interface MarkedEnd {
  /** x and z of each section's middle, from the end back. */
  line: number[];
  halfWidth: number;
  toEdge: number;
  /** As a vertex carries it: negative at the chain's start. */
  mark: number;
}

const centreOf = (rings: Float32Array, section: number) => {
  const at = (section * RING_POINTS + 2) * 3;
  return { x: rings[at], z: rings[at + 2] };
};

const halfWidthOf = (rings: Float32Array, section: number) => {
  const left = (section * RING_POINTS + 1) * 3;
  const right = (section * RING_POINTS + 3) * 3;
  // A ring's points can land together where a lesser road slides along a greater one's edge, and the shader divides by this.
  return Math.max(NARROWEST_HALF_M, Math.hypot(rings[left] - rings[right], rings[left + 2] - rings[right + 2]) / 2);
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

function nearestSegment(cells: Map<string, Segment[]>, x: number, z: number, of?: number): Segment | null {
  let found: Segment | null = null;
  let nearest = Infinity;
  const column = Math.floor(x / GRID_M);
  const row = Math.floor(z / GRID_M);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      for (const segment of cells.get(`${column + dx},${row + dz}`) ?? []) {
        if (of !== undefined && segment.chain !== of) continue;
        const distance = distanceToSegment(x, z, segment);
        if (distance < nearest) {
          nearest = distance;
          found = segment;
        }
      }
    }
  }
  return found;
}

/** OSM's surface where it gives one; otherwise a road's class and how built up the place is say whether it's sealed. */
export const isPaved = (chain: RoadChain, town: number) => chain.sealed ?? (PAVED_KINDS.has(chain.kind) || (town > 0.5 && PAVED_IN_TOWN.has(chain.kind)));

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
  const ends: MarkedEnd[][] = surface.chains.map(() => []);
  surface.chains.forEach((road, chain) => {
    const { first, sections, kind, motor } = road;
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
    if (startOn !== null && startMark !== NO_MARK) ends[chain].push(markedEnd(surface.rings, grid, first, 1, sections, startOn, -startMark));
    if (endOn !== null && endMark !== NO_MARK) ends[chain].push(markedEnd(surface.rings, grid, last, -1, sections, endOn, endMark));
    for (let section = 0; section < sections; section++) {
      const { x, z } = centreOf(surface.rings, first + section);
      const town = townAt(x, z);
      const paved = isPaved(road, town) ? 1 : 0;
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
  dressAprons(surface, grid, townAt, ends, shaded, marks);
  return { surface: shaded, mark: marks };
}

/**
 * A road's end on a greater road, as its paint needs it. A road laid as paving runs on to the line of the road it meets,
 * whether its own sections stop on that line or short of that road's paving, so its give-way line is measured back from
 * that road's edge, further along it the more the two slant.
 */
function markedEnd(rings: Float32Array, grid: Map<string, Segment[]>, section: number, inward: 1 | -1, sections: number, onto: number, mark: number): MarkedEnd {
  const line: number[] = [];
  for (let index = 0, travelled = 0; index < sections && travelled <= MARKS_REACH_M; index++) {
    const { x, z } = centreOf(rings, section + inward * index);
    if (index > 0) travelled += Math.hypot(x - line[line.length - 2], z - line[line.length - 1]);
    line.push(x, z);
  }
  const [at, next] = [centreOf(rings, section), centreOf(rings, section + inward)];
  const length = Math.hypot(next.x - at.x, next.z - at.z) || 1;
  const [backX, backZ] = [(next.x - at.x) / length, (next.z - at.z) / length];
  const met = nearestSegment(grid, at.x, at.z, onto);
  let toEdge = 0;
  if (met) {
    const [ux, uz] = [met.bx - met.ax, met.bz - met.az];
    const slant = Math.abs(backX * uz - backZ * ux) / (Math.hypot(ux, uz) || 1);
    toEdge = Math.min((met.halfWidth - distanceToSegment(at.x, at.z, met)) / Math.max(slant, 1 / MOST_SLANT), met.halfWidth * MOST_SLANT);
  }
  return { line, halfWidth: halfWidthOf(rings, section), toEdge, mark };
}

/**
 * How far back along its road from a marked end a place lies, and how far aside of the road's middle: measured along
 * the middle as it runs, since a straight line laid back from the end leaves a road's edge on its first bend, and the
 * paint with it. The middle runs on straight past both of its own ends.
 */
function backFrom({ line }: MarkedEnd, x: number, z: number): { back: number; aside: number } {
  let [aside, back, travelled] = [Infinity, 0, 0];
  for (let at = 0; at + 3 < line.length; at += 2) {
    const [ax, az, ux, uz] = [line[at], line[at + 1], line[at + 2] - line[at], line[at + 3] - line[at + 1]];
    const length = Math.hypot(ux, uz) || 1;
    const along = Math.max(at === 0 ? -Infinity : 0, Math.min(at + 4 >= line.length ? Infinity : length, ((x - ax) * ux + (z - az) * uz) / length));
    const off = Math.hypot(x - ax - (ux / length) * along, z - az - (uz / length) * along);
    if (off < aside) [aside, back] = [off, travelled + along];
    travelled += length;
  }
  return { back, aside };
}

/**
 * An apron has no chain of its own: it's the road it joins, bare, with no mark to reach. A car park or bus station is
 * paving of its own, as wide as a street, so its middle, far from any road, looks as its edge does.
 */
function dressAprons(surface: RoadSurface, grid: Map<string, Segment[]>, townAt: (x: number, z: number) => number, ends: MarkedEnd[][], shaded: Float32Array, marks: Float32Array) {
  const vertices = surface.rings.length / 3;
  // Where the paving says which of its points lie on their own way's carriageway, those carry that road's paint. Where
  // it doesn't, a point within the road's half-width of its middle does: its edge's own points and no more.
  const told = surface.aprons.classes.some((said) => (said & ON_CARRIAGEWAY) !== 0);
  for (let vertex = surface.aprons.firstPoint; vertex < vertices; vertex++) {
    const [x, z] = [surface.rings[vertex * 3], surface.rings[vertex * 3 + 2]];
    const town = townAt(x, z);
    marks.set([APRON_SHOULDER_M, NO_MARK], vertex * 2);
    if (vertex >= surface.aprons.firstAreaPoint) {
      shaded.set([1, town, PAVED_AREA_HALF_WIDTH_M, FAR_FROM_MARK_M], vertex * 4);
      continue;
    }
    // A point of paving names its way; an apron's is the nearest.
    const way = surface.aprons.ways.length ? surface.aprons.ways[vertex - surface.aprons.firstPoint] : -1;
    if (way >= 0) {
      const chain = surface.chains[way];
      const said = surface.aprons.classes[vertex - surface.aprons.firstPoint];
      const sealed = said & SEALED_WAY ? true : said & LOOSE_WAY ? false : isPaved(chain, town);
      // The paint at a road's end is on its own carriageway, measured back from the edge of the road it meets: a mouth's fill beside it is bare.
      let [toMark, mark] = [FAR_FROM_MARK_M, NO_MARK];
      for (const end of ends[way]) {
        const { back, aside } = backFrom(end, x, z);
        const onRoad = told ? (said & ON_CARRIAGEWAY) !== 0 && aside <= end.halfWidth + OWN_ASIDE_M : aside <= end.halfWidth + ON_EDGE_M;
        // Past the end too, where the road's paving runs on to the line of the road it meets: a point there with no mark
        // blended its triangle's paint away, and a give-way line was a stray tooth.
        if (onRoad && back >= -MARKS_REACH_M && back <= MARKS_REACH_M && back - end.toEdge < toMark) [toMark, mark] = [back - end.toEdge, end.mark];
      }
      shaded.set([sealed ? 1 : 0, town, halfWidthOf(surface.rings, chain.first), toMark], vertex * 4);
      marks.set([shoulderOf(surface.rings, chain.first), mark], vertex * 2);
      continue;
    }
    const road = nearestSegment(grid, x, z);
    if (!road) throw new Error(`an apron point at ${x}, ${z} has no road within ${GRID_M} m`);
    shaded.set([isPaved(surface.chains[road.chain], town) ? 1 : 0, town, road.halfWidth, FAR_FROM_MARK_M], vertex * 4);
  }
}

import type { BufferAttribute, BufferGeometry, InterleavedBufferAttribute } from "three";

/** Two faces closer than this in the same plane share depth to within what a GPU's rounding can tell apart, so they flicker in motion. */
const SAME_PLANE_M = 0.001;
const SAME_FACING = 0.9999;
/** Triangles meeting along an edge only touch: each is shrunk this far before they're tested for overlap. */
const TOUCH_M = 0.002;
/** Sight lines tried from each side of an overlap: one that leaves the model means some camera can see it. */
const SIGHT_LINES = 96;
/** How far off a face's plane a camera must look at it from, as the sine of the angle: 20°. */
const SIGHT_LOWEST = Math.sin((20 * Math.PI) / 180);
/** A sight line this long inside a room has room for a camera at its end. */
const ROOM_CLEAR_M = 0.5;
/** How far off the plane a sight line starts, so it can't hit the overlapping faces themselves. */
const SIGHT_START_M = 0.003;
/** Two faces whose every attribute agrees to this, everywhere they overlap, draw the same pixels: under a step of a colour byte, so a part or paint coded in a byte still counts as different. */
const SAME_LOOK = 0.003;
/** Normals this close light a face the same to the eye: under 6°. */
const SAME_NORMAL = 0.1;

type P2 = [number, number];
type P3 = [number, number, number];

/** Two triangles of one geometry that lie in one plane and cover some of the same area: z-fighting. */
export interface CoplanarOverlap {
  triangles: [number, number];
  /** What draws differently between the two: the attributes that disagree, or "geometries" for two drawn apart. */
  differs: string[];
  /** Which of the geometries checked together each triangle is from. */
  sources: [number, number];
  /** A way a camera can see the overlap from: the overlap's point plus this, any distance out. */
  seenAlong: P3;
  /** How much they share, in square metres. */
  area: number;
  /** The middle of where they overlap, in the model's metres. */
  at: P3;
}

interface Face {
  /** Which of the geometries checked together it's from. */
  source: number;
  triangle: number;
  corners: number[];
  points: P3[];
  /** The plane's normal turned to one side, whichever way the face looks, so faces back to back sort together. */
  unit: P3;
  offset: number;
}

const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function shrunk(corners: P2[]): P2[] {
  const middle: P2 = [(corners[0][0] + corners[1][0] + corners[2][0]) / 3, (corners[0][1] + corners[1][1] + corners[2][1]) / 3];
  return corners.map(([x, y]): P2 => {
    const away = Math.hypot(x - middle[0], y - middle[1]);
    const keep = away > TOUCH_M ? (away - TOUCH_M) / away : 0;
    return [middle[0] + (x - middle[0]) * keep, middle[1] + (y - middle[1]) * keep];
  });
}

const turn = (from: P2, to: P2, point: P2) => (to[0] - from[0]) * (point[1] - from[1]) - (to[1] - from[1]) * (point[0] - from[0]);

/** The middle of where two triangles in a plane overlap, or null where they don't, by clipping one by the other's edges. */
function overlapMiddle(a: P2[], b: P2[]): { area: number; middle: P2 } | null {
  const winding = Math.sign(turn(b[0], b[1], b[2]));
  let shape = a;
  for (let edge = 0; edge < 3 && shape.length > 0; edge++) {
    const [from, to] = [b[edge], b[(edge + 1) % 3]];
    const inside = (point: P2) => winding * turn(from, to, point);
    const kept: P2[] = [];
    shape.forEach((point, index) => {
      const next = shape[(index + 1) % shape.length];
      const [here, there] = [inside(point), inside(next)];
      if (here > 0) kept.push(point);
      if ((here > 0) !== (there > 0)) {
        const share = here / (here - there);
        kept.push([point[0] + (next[0] - point[0]) * share, point[1] + (next[1] - point[1]) * share]);
      }
    });
    shape = kept;
  }
  if (shape.length < 3) return null;
  let area = 0;
  for (let index = 0; index < shape.length; index++) area += turn([0, 0], shape[index], shape[(index + 1) % shape.length]);
  if (Math.abs(area) < 1e-10) return null;
  return { area: Math.abs(area) / 2, middle: [shape.reduce((sum, point) => sum + point[0], 0) / shape.length, shape.reduce((sum, point) => sum + point[1], 0) / shape.length] };
}

/** Whether a ray hits a triangle, by Möller and Trumbore's test. */
function hits(from: P3, way: P3, [p0, p1, p2]: P3[], within: number): boolean {
  const [edge1, edge2] = [sub(p1, p0), sub(p2, p0)];
  const across = cross(way, edge2);
  const det = dot(edge1, across);
  if (Math.abs(det) < 1e-12) return false;
  const offset = sub(from, p0);
  const u = dot(offset, across) / det;
  if (u < 0 || u > 1) return false;
  const up = cross(offset, edge1);
  const v = dot(way, up) / det;
  if (v < 0 || u + v > 1) return false;
  const along = dot(edge2, up) / det;
  return along > 0 && along < within;
}

/** Directions spread evenly over the half of a sphere facing the way given, from 20° off the plane up: a face seen more nearly edge-on covers next to no pixels. */
function hemisphere(normal: P3): P3[] {
  const across = cross(normal, Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
  const length = Math.hypot(...across);
  const x = across.map((value) => value / length) as P3;
  const y = cross(normal, x);
  return Array.from({ length: SIGHT_LINES }, (_, index) => {
    const height = SIGHT_LOWEST + ((index + 0.5) / SIGHT_LINES) * (1 - SIGHT_LOWEST);
    const ring = Math.sqrt(1 - height * height);
    const angle = index * Math.PI * (3 - Math.sqrt(5));
    return [0, 1, 2].map((axis) => normal[axis] * height + (x[axis] * Math.cos(angle) + y[axis] * Math.sin(angle)) * ring) as P3;
  });
}

/** The faces in a box, or two smaller boxes: a sight line skips every face in a box it misses. */
interface Box {
  low: P3;
  high: P3;
  faces: Face[];
  halves: [Box, Box] | null;
}

function boxOf(faces: Face[]): Box {
  const [low, high]: [P3, P3] = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
  for (const { points } of faces) {
    for (const point of points) {
      for (let axis = 0; axis < 3; axis++) {
        low[axis] = Math.min(low[axis], point[axis]);
        high[axis] = Math.max(high[axis], point[axis]);
      }
    }
  }
  if (faces.length <= 8) return { low, high, faces, halves: null };
  const longest = [0, 1, 2].reduce((most, axis) => (high[axis] - low[axis] > high[most] - low[most] ? axis : most), 0);
  const middle = (face: Face) => face.points[0][longest] + face.points[1][longest] + face.points[2][longest];
  const sorted = [...faces].sort((a, b) => middle(a) - middle(b));
  const half = sorted.length >> 1;
  return { low, high, faces: [], halves: [boxOf(sorted.slice(0, half)), boxOf(sorted.slice(half))] };
}

/** Whether a ray from a point meets a box, by the slabs between its faces. */
function meets({ low, high }: Box, from: P3, way: P3, within: number): boolean {
  let [near, far] = [0, within];
  for (let axis = 0; axis < 3; axis++) {
    const [a, b] = [(low[axis] - from[axis]) / way[axis], (high[axis] - from[axis]) / way[axis]];
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
  }
  return near <= far;
}

function blocked(box: Box, from: P3, way: P3, within: number): boolean {
  if (!meets(box, from, way, within)) return false;
  if (box.halves === null) return box.faces.some(({ points }) => hits(from, way, points, within));
  return blocked(box.halves[0], from, way, within) || blocked(box.halves[1], from, way, within);
}

/** Where a ray leaves a box, measured along it. */
function exitAlong({ low, high }: Box, from: P3, way: P3): number {
  let far = Infinity;
  for (let axis = 0; axis < 3; axis++) far = Math.min(far, Math.max((low[axis] - from[axis]) / way[axis], (high[axis] - from[axis]) / way[axis]));
  return far;
}

/** Where a camera can be: outside a model, above the ground it stands on; or inside a room, anywhere with space to stand. */
export interface Viewpoint {
  /** The model's ground, in its own metres: a camera is never under it. Null for a room, which has its own floor. */
  groundY: number | null;
}

/** Every way out from a point, to tell open air from air the model closes in: the 26 directions to a cube's faces, edges and corners. */
const ALL_WAYS: P3[] = [-1, 0, 1].flatMap((x) => [-1, 0, 1].flatMap((y) => [-1, 0, 1].map((z): P3 => [x, y, z]))).filter((way) => way.some((value) => value !== 0)).map((way) => way.map((value) => value / Math.hypot(...way)) as P3);
/** Air a camera can be in has this share of its ways out open, at least: inside a tower or under a closed roof, next to none are. */
const OPEN_AIR = 0.2;
/** How many points along a sight line, inside the model's box, are checked for open air. */
const AIR_SAMPLES = 24;

/** The share of ways out of a point that leave the model's box without meeting a face or the ground. */
function openness(point: P3, model: Box, groundY: number | null): number {
  const open = ALL_WAYS.filter((way) => {
    const exit = exitAlong(model, point, way);
    if (groundY !== null && way[1] < 0 && (point[1] - groundY) / -way[1] < exit) return false;
    return !blocked(model, point, way, exit);
  });
  return open.length / ALL_WAYS.length;
}

/** Whether a sight line runs through open air all the way out of the model's box, rather than through space the model closes in, where no camera can be. */
function throughOpenAir(from: P3, way: P3, exit: number, model: Box, groundY: number | null): boolean {
  for (let sample = 1; sample <= AIR_SAMPLES; sample++) {
    const along = (exit * sample) / (AIR_SAMPLES + 1);
    if (along < 0.05) continue;
    if (openness([0, 1, 2].map((axis) => from[axis] + way[axis] * along) as P3, model, groundY) < OPEN_AIR) return false;
  }
  return true;
}

/**
 * A sight line from a point on a plane, either side of it, that reaches somewhere a camera can be: out of the
 * model through open air, without meeting a face or going under the ground first, or for a room, clear for a camera's
 * room. Null when none does: nothing sees the point, sealed inside, under the ground or only from air the model closes in.
 */
function sightLine(point: P3, normal: P3, model: Box, { groundY }: Viewpoint): P3 | null {
  if (groundY !== null && point[1] < groundY) return null;
  for (const side of [normal, normal.map((value) => -value) as P3]) {
    const from = point.map((value, axis) => value + side[axis] * SIGHT_START_M) as P3;
    const clear = hemisphere(side).find((way) => {
      if (groundY === null) return !blocked(model, from, way, ROOM_CLEAR_M);
      const exit = exitAlong(model, from, way);
      if (way[1] < 0 && (from[1] - groundY) / -way[1] < exit) return false;
      return !blocked(model, from, way, exit) && throughOpenAir(from, way, exit, model, groundY);
    });
    if (clear !== undefined) return clear;
  }
  return null;
}

function faces(geometry: BufferGeometry, source: number): Face[] {
  const positions = geometry.getAttribute("position");
  const indices = geometry.index?.array ?? Array.from({ length: positions.count }, (_, index) => index);
  const corner = (index: number): P3 => [positions.getX(index), positions.getY(index), positions.getZ(index)];
  const found: Face[] = [];
  for (let first = 0; first < indices.length; first += 3) {
    const points = [corner(indices[first]), corner(indices[first + 1]), corner(indices[first + 2])];
    const normal = cross(sub(points[1], points[0]), sub(points[2], points[0]));
    const length = Math.hypot(...normal);
    if (length < 1e-9) continue;
    const side = Math.sign(normal.reduce((most, value) => (Math.abs(value) > Math.abs(most) ? value : most), 0));
    const unit = normal.map((value) => (side * value) / length) as P3;
    found.push({ source, triangle: first / 3, corners: [indices[first], indices[first + 1], indices[first + 2]], points, unit, offset: dot(unit, points[0]) });
  }
  return found;
}

type Attribute = BufferAttribute | InterleavedBufferAttribute;

/**
 * Whether two faces in one plane draw the same wherever they overlap: every attribute but the position is
 * interpolated linearly across a face, so they do if the first's values, carried on to the second's corners, are the
 * second's. A normal may point either way, since a face seen from behind is lit by its normal turned round.
 */
function differences(a: Face, b: Face, attributes: [string, Attribute][]): string[] {
  const [e1, e2] = [sub(a.points[1], a.points[0]), sub(a.points[2], a.points[0])];
  const [d11, d12, d22] = [dot(e1, e1), dot(e1, e2), dot(e2, e2)];
  const det = d11 * d22 - d12 * d12;
  const weights = b.points.map((point) => {
    const offset = sub(point, a.points[0]);
    const [d1, d2] = [dot(offset, e1), dot(offset, e2)];
    const v = (d22 * d1 - d12 * d2) / det;
    const w = (d11 * d2 - d12 * d1) / det;
    return [1 - v - w, v, w];
  });
  return attributes.filter(([name, attribute]) => {
    const value = (corner: number, component: number) => attribute.getComponent(corner, component);
    const agrees = (sign: number) =>
      weights.every((weight, corner) => {
        for (let component = 0; component < attribute.itemSize; component++) {
          const carried = weight.reduce((sum, share, index) => sum + share * value(a.corners[index], component), 0);
          if (Math.abs(carried - sign * value(b.corners[corner], component)) > (name === "normal" ? SAME_NORMAL : SAME_LOOK)) return false;
        }
        return true;
      });
    return !(agrees(1) || (name === "normal" && agrees(-1)));
  }).map(([name]) => name);
}

/**
 * Every pair of triangles that lie in one plane and overlap, whichever way each faces, where a camera outside the
 * model could see them and the two draw differently. Several geometries drawn in one place, a car's body and its
 * glass, are checked as one model, from wherever a camera can be.
 */
export function coplanarOverlaps(drawn: BufferGeometry | readonly BufferGeometry[], viewpoint: Viewpoint = { groundY: 0 }): CoplanarOverlap[] {
  const geometries = Array.isArray(drawn) ? drawn : [drawn as BufferGeometry];
  const sorted = geometries.flatMap((geometry, source) => faces(geometry, source)).sort((a, b) => a.offset - b.offset);
  const attributes = geometries.map((geometry) => (Object.entries(geometry.attributes) as [string, Attribute][]).filter(([name]) => name !== "position"));
  const found: CoplanarOverlap[] = [];
  let model: Box | undefined;
  for (let one = 0; one < sorted.length; one++) {
    const a = sorted[one];
    for (let other = one + 1; other < sorted.length && sorted[other].offset - a.offset <= SAME_PLANE_M; other++) {
      const b = sorted[other];
      if (dot(a.unit, b.unit) < SAME_FACING) continue;
      const differs = a.source === b.source ? differences(a, b, attributes[a.source]) : ["geometries"];
      if (differs.length === 0) continue;
      const along = cross(a.unit, Math.abs(a.unit[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
      const across = along.map((value) => value / Math.hypot(...along)) as P3;
      const up = cross(a.unit, across);
      const flat = (points: P3[]) => points.map((point): P2 => [dot(point, across), dot(point, up)]);
      const shared = overlapMiddle(shrunk(flat(a.points)), shrunk(flat(b.points)));
      if (shared === null) continue;
      const { middle, area } = shared;
      const at = [0, 1, 2].map((axis) => across[axis] * middle[0] + up[axis] * middle[1] + a.unit[axis] * a.offset) as P3;
      const seenAlong = sightLine(at, a.unit, (model ??= boxOf(sorted)), viewpoint);
      if (seenAlong !== null) found.push({ triangles: [a.triangle, b.triangle], sources: [a.source, b.source], differs, at, area, seenAlong });
    }
  }
  return found;
}

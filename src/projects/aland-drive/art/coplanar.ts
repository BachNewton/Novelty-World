import type { BufferGeometry } from "three";

/** Two faces closer than this in the same plane share depth to within what a GPU's rounding can tell apart, so they flicker in motion. */
const SAME_PLANE_M = 0.001;
const SAME_FACING = 0.9999;
/** Triangles meeting along an edge only touch: each is shrunk this far before they're tested for overlap. */
const TOUCH_M = 0.002;

type P2 = [number, number];
type P3 = [number, number, number];

/** Two triangles of one geometry that lie in one plane and cover some of the same area: z-fighting. */
export interface CoplanarOverlap {
  triangles: [number, number];
  /** Where the first triangle's middle is, in the model's metres. */
  at: P3;
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

/** Whether two triangles in a plane overlap, by the separating axis of each edge. */
function overlap(a: P2[], b: P2[]): boolean {
  for (const shape of [a, b]) {
    for (let edge = 0; edge < 3; edge++) {
      const [from, to] = [shape[edge], shape[(edge + 1) % 3]];
      const axis: P2 = [from[1] - to[1], to[0] - from[0]];
      const along = (point: P2) => point[0] * axis[0] + point[1] * axis[1];
      const [aLow, aHigh] = [Math.min(...a.map(along)), Math.max(...a.map(along))];
      const [bLow, bHigh] = [Math.min(...b.map(along)), Math.max(...b.map(along))];
      if (aHigh <= bLow || bHigh <= aLow) return false;
    }
  }
  return true;
}

/** Every pair of a geometry's triangles that lie in one plane and overlap, whichever way each faces. */
export function coplanarOverlaps(geometry: BufferGeometry): CoplanarOverlap[] {
  const positions = geometry.getAttribute("position");
  const indices = geometry.index?.array ?? Array.from({ length: positions.count }, (_, index) => index);
  const corner = (index: number): P3 => [positions.getX(index), positions.getY(index), positions.getZ(index)];
  const faces = [];
  for (let first = 0; first < indices.length; first += 3) {
    const points = [corner(indices[first]), corner(indices[first + 1]), corner(indices[first + 2])];
    const normal = cross(sub(points[1], points[0]), sub(points[2], points[0]));
    const length = Math.hypot(...normal);
    if (length < 1e-9) continue;
    const unit: P3 = [normal[0] / length, normal[1] / length, normal[2] / length];
    faces.push({ triangle: first / 3, points, unit, offset: dot(unit, points[0]) });
  }
  const found: CoplanarOverlap[] = [];
  for (let one = 0; one < faces.length; one++) {
    for (let other = one + 1; other < faces.length; other++) {
      const [a, b] = [faces[one], faces[other]];
      const facing = dot(a.unit, b.unit);
      if (Math.abs(facing) < SAME_FACING || Math.abs(a.offset - Math.sign(facing) * b.offset) > SAME_PLANE_M) continue;
      const across = cross(a.unit, Math.abs(a.unit[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
      const up = cross(a.unit, across);
      const flat = (points: P3[]) => points.map((point): P2 => [dot(point, across), dot(point, up)]);
      if (!overlap(shrunk(flat(a.points)), shrunk(flat(b.points)))) continue;
      const at = a.points.reduce((sum, point): P3 => [sum[0] + point[0] / 3, sum[1] + point[1] / 3, sum[2] + point[2] / 3], [0, 0, 0]);
      found.push({ triangles: [a.triangle, b.triangle], at });
    }
  }
  return found;
}

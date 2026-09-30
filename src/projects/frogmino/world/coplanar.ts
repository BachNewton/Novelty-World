import { boxPoint, type Placement, type Vec3, type WorldBox } from "./geometry";

// Finds z-fighting in a layout: two boxes whose faces look the same way and
// overlap in (nearly) the same plane, so the depth buffer can't tell which is
// in front. Faces that look opposite ways never fight, since one of the two
// is always turned away from the camera. It scans any boxes, the world's or a
// vehicle's parts.

export interface FaceClash<B extends Placement = WorldBox> {
  a: B;
  b: B;
  // How far apart the two faces' planes are, and how much of them overlaps.
  gap: number;
  area: number;
}

interface Face<B extends Placement> {
  index: number;
  box: B;
  normal: Vec3;
  offset: number;
  corners: Vec3[];
}

type Point = readonly [number, number];

// An unturned box from one corner to the other, such as a vehicle's part.
export function spanning(min: Vec3, max: Vec3): Placement {
  return {
    center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    yaw: 0,
    roll: 0,
  };
}

const NORMAL_GRAIN = 1e4;
// Faces that only touch along an edge share no area; floating point makes
// such touching edges overlap by a sliver far thinner than this.
const MIN_AREA = 1e-6;
// Planes laid exactly `minGap` apart count as far enough apart, and faces
// this close count as lying in one plane.
const GAP_TOLERANCE = 1e-9;
const PLANE_GRAIN = 1e-6;

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const minus = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => {
  const length = Math.sqrt(dot(a, a));
  return [a[0] / length, a[1] / length, a[2] / length];
};

function faces<B extends Placement>(box: B, index: number): Face<B>[] {
  const half = box.size.map((s) => s / 2);
  const result: Face<B>[] = [];
  for (let axis = 0; axis < 3; axis++) {
    const [j, k] = [(axis + 1) % 3, (axis + 2) % 3];
    for (const sign of [-1, 1]) {
      const local = (dj: number, dk: number): Vec3 => {
        const p = [0, 0, 0];
        p[axis] = sign * half[axis];
        p[j] = dj * half[j];
        p[k] = dk * half[k];
        return [p[0], p[1], p[2]];
      };
      const centre = boxPoint(box, local(0, 0));
      const normal = unit(minus(centre, box.center));
      const corners = [local(-1, -1), local(1, -1), local(1, 1), local(-1, 1)].map((p) => boxPoint(box, p));
      result.push({ index, box, normal, offset: dot(normal, centre), corners });
    }
  }
  return result;
}

// Twice the signed area of a polygon.
function signedArea(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [p, q] = [points[i], points[(i + 1) % points.length]];
    sum += p[0] * q[1] - q[0] * p[1];
  }
  return sum;
}

// The area two convex polygons share, by clipping one to the other.
function sharedArea(subject: readonly Point[], clip: readonly Point[]): number {
  const orient = Math.sign(signedArea(clip));
  let output: Point[] = [...subject];
  for (let i = 0; i < clip.length && output.length > 0; i++) {
    const [a, b] = [clip[i], clip[(i + 1) % clip.length]];
    const side = (p: Point): number => orient * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
    const input = output;
    output = [];
    for (let n = 0; n < input.length; n++) {
      const [p, q] = [input[n], input[(n + 1) % input.length]];
      const [sp, sq] = [side(p), side(q)];
      if (sp >= 0) output.push(p);
      if (sp >= 0 !== sq >= 0) {
        const t = sp / (sp - sq);
        output.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
  }
  return output.length < 3 ? 0 : Math.abs(signedArea(output)) / 2;
}

// Two faces' corners, flattened onto the first one's plane.
function flatten(a: Face<Placement>, b: Face<Placement>): [Point[], Point[]] {
  const u = unit(cross(a.normal, Math.abs(a.normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  const v = cross(a.normal, u);
  const flat = (face: Face<Placement>): Point[] => face.corners.map((p): Point => [dot(p, u), dot(p, v)]);
  return [flat(a), flat(b)];
}

function overlapArea(a: Face<Placement>, b: Face<Placement>): number {
  const [pa, pb] = flatten(a, b);
  return sharedArea(pa, pb);
}

// A face lying flat against another box's face, looking into it, and wholly
// covered by it, is buried: it can only be seen from inside that box.
function buried(face: Face<Placement>, against: readonly Face<Placement>[]): boolean {
  return against.some((other) => {
    if (other.index === face.index || dot(other.normal, face.normal) > -1 + 1e-9) return false;
    if (Math.abs(other.offset + face.offset) > PLANE_GRAIN) return false;
    const [mine, theirs] = flatten(face, other);
    return sharedArea(mine, theirs) >= Math.abs(signedArea(mine)) / 2 - MIN_AREA;
  });
}

// The heights the camera moves between. A face looking down from below the
// lowest, or up from above the highest, is always turned away from it, so it
// is never drawn and can't fight.
export interface EyeHeights {
  lowest: number;
  highest: number;
}

function seen(face: Face<Placement>, eye: EyeHeights): boolean {
  if (face.normal[1] < -0.5) return face.corners.some((p) => p[1] >= eye.lowest);
  if (face.normal[1] > 0.5) return face.corners.some((p) => p[1] <= eye.highest);
  return true;
}

// Every pair of boxes with faces looking the same way, overlapping, whose
// planes are less than `minGap` apart.
export function faceClashes<B extends Placement>(boxes: readonly B[], minGap: number, eye: EyeHeights): FaceClash<B>[] {
  const buckets = new Map<string, Face<B>[]>();
  const keyOf = (normal: Vec3, cell: number): string =>
    `${normal.map((n) => String(Math.round(n * NORMAL_GRAIN))).join(",")}|${String(cell)}`;
  const cellOf = (face: Face<B>): number => Math.floor(face.offset / minGap);
  const every = boxes.flatMap((box, index) => faces(box, index));
  const planeKey = (normal: Vec3, offset: number): string =>
    `${normal.map((n) => String(Math.round(n * NORMAL_GRAIN))).join(",")}|${String(Math.round(offset / PLANE_GRAIN))}`;
  const planes = new Map<string, Face<B>[]>();
  for (const face of every) {
    const key = planeKey(face.normal, face.offset);
    const plane = planes.get(key);
    if (plane === undefined) planes.set(key, [face]);
    else plane.push(face);
  }
  const facing = (face: Face<B>): Face<B>[] =>
    planes.get(planeKey([-face.normal[0], -face.normal[1], -face.normal[2]], -face.offset)) ?? [];
  const all = every.filter((face) => seen(face, eye) && !buried(face, facing(face)));
  for (const face of all) {
    const key = keyOf(face.normal, cellOf(face));
    const bucket = buckets.get(key);
    if (bucket === undefined) buckets.set(key, [face]);
    else bucket.push(face);
  }
  const clashes: FaceClash<B>[] = [];
  for (const a of all) {
    const cell = cellOf(a);
    for (const nearby of [cell - 1, cell, cell + 1]) {
      const bucket = buckets.get(keyOf(a.normal, nearby));
      if (bucket === undefined) continue;
      for (const b of bucket) {
        // Each pair once, and never a box against itself.
        if (b.index <= a.index) continue;
        const gap = Math.abs(a.offset - b.offset);
        if (gap >= minGap - GAP_TOLERANCE) continue;
        const area = overlapArea(a, b);
        if (area > MIN_AREA) clashes.push({ a: a.box, b: b.box, gap, area });
      }
    }
  }
  return clashes;
}

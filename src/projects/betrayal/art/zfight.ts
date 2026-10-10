import * as THREE from "three";
import { houseDepthStep } from "./house-camera";

/*
 * The z-fighting check: finds faces that lie in one plane, face the same way
 * and share area, so the depth buffer can't tell which is in front, and the
 * two shimmer through each other as the camera moves.
 *
 * "One plane" is what the house's depth buffer can't separate, not exact
 * equality: two faces nearer than `SAME_DEPTH` fight even though they don't
 * touch. The house sets its depth range from what it shows (see
 * `depthRange`), and `SAME_DEPTH` is a few of its depth steps at the
 * coarsest, anywhere in the camera's reach.
 *
 * Colour doesn't excuse a pair: in the house every face is lit from its own
 * place in the lightmap, so two faces of one colour still fight in light. Nor
 * does belonging to one piece or one mesh: a batch's boxes, or a wall's runs,
 * fight like any two pieces. A face fights only where it shows: a face turned
 * down, away from every camera, never does, nor does a patch buried in a
 * solid in front of it, nor a pair of faces neither of which writes depth.
 */

/** How many depth steps apart two faces must be for the buffer to keep them apart. */
const SEPARATION_STEPS = 4;
/** Faces nearer than this to one plane fight for the same depth. */
export const SAME_DEPTH = SEPARATION_STEPS * houseDepthStep();
/** Faces are filed by plane in slots this deep along their normal, so faces in one plane are found without testing every pair. */
const SLOT = 0.002;
/** Two normals closer than this (the cosine of the angle between them) are one direction. */
const PARALLEL = Math.cos(THREE.MathUtils.degToRad(0.5));
/** A face turned further down than this (the y of its normal) faces away from every camera. */
const FACING_DOWN = 0.5;
/** Shared patches smaller than this, in m², are rounding at a shared edge, not area. */
const SLIVER = 1e-7;
/** How far in front of a shared patch a solid is looked for that buries it. */
const BURIED = 0.003;

/** One triangle, in room or house coordinates, and what it belongs to. */
export interface PlaneFace<Owner> {
  owner: Owner;
  corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  /** Unit, facing out of the front. */
  normal: THREE.Vector3;
  writesDepth: boolean;
  /** How it draws, for the report. */
  colour: string;
}

export interface ZFight<Owner> {
  a: PlaneFace<Owner>;
  b: PlaneFace<Owner>;
  /** The area they share, in m². */
  area: number;
  /** How far apart their planes are there, in metres. */
  gap: number;
  /** The middle of the shared patch. */
  at: THREE.Vector3;
}

/** Two directions across a plane, square to each other and to its normal. */
export function basis(normal: THREE.Vector3): [THREE.Vector3, THREE.Vector3] {
  const u = new THREE.Vector3().crossVectors(Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0), normal).normalize();
  return [u, new THREE.Vector3().crossVectors(normal, u)];
}

export function area(polygon: THREE.Vector2[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function anticlockwise(polygon: THREE.Vector2[]): THREE.Vector2[] {
  return area(polygon) < 0 ? polygon.reverse() : polygon;
}

/** The part of a convex polygon inside another convex polygon (both anticlockwise). */
export function clip(subject: THREE.Vector2[], by: THREE.Vector2[]): THREE.Vector2[] {
  let output = subject;
  for (let i = 0; i < by.length && output.length; i++) {
    const a = by[i];
    const b = by[(i + 1) % by.length];
    const side = (p: THREE.Vector2) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j];
      const q = input[(j + 1) % input.length];
      const [dp, dq] = [side(p), side(q)];
      if (dp >= -1e-12) {
        output.push(p);
        if (dq < -1e-12) output.push(p.clone().lerp(q, dp / (dp - dq)));
      } else if (dq >= -1e-12) {
        output.push(p.clone().lerp(q, dp / (dp - dq)));
      }
    }
  }
  return output;
}

/** A face laid flat in its plane's 2D frame, with its bounds there, ready to compare. */
interface Laid<Owner> {
  face: PlaneFace<Owner>;
  offset: number;
  polygon: THREE.Vector2[];
  low: THREE.Vector2;
  high: THREE.Vector2;
}

/** Faces filed by direction and by slot along it, each laid flat in its direction's frame. */
function planeFiles<Owner>(faces: PlaneFace<Owner>[]) {
  const files = new Map<string, { direction: string; slot: number; basis: [THREE.Vector3, THREE.Vector3]; faces: Laid<Owner>[] }>();
  const bases = new Map<string, [THREE.Vector3, THREE.Vector3]>();
  for (const face of faces) {
    const n = face.normal;
    const direction = `${Math.round(n.x * 100)},${Math.round(n.y * 100)},${Math.round(n.z * 100)}`;
    const offset = n.dot(face.corners[0]);
    const slot = Math.floor(offset / SLOT);
    const key = `${direction}@${slot}`;
    let frame = bases.get(direction);
    if (!frame) bases.set(direction, (frame = basis(n)));
    const [u, v] = frame;
    const polygon = anticlockwise(face.corners.map((p) => new THREE.Vector2(p.dot(u), p.dot(v))));
    const low = new THREE.Vector2(Math.min(...polygon.map((p) => p.x)), Math.min(...polygon.map((p) => p.y)));
    const high = new THREE.Vector2(Math.max(...polygon.map((p) => p.x)), Math.max(...polygon.map((p) => p.y)));
    const laid = { face, offset, polygon, low, high };
    const file = files.get(key);
    if (file) file.faces.push(laid);
    else files.set(key, { direction, slot, basis: frame, faces: [laid] });
  }
  return files;
}

/**
 * Every pair of faces that fight: facing the same way, in one plane within
 * `tolerance`, sharing more than a sliver of area, the patch not `buried`.
 * `pairs` says which owners are compared at all.
 */
export function zFights<Owner>(
  faces: PlaneFace<Owner>[],
  { tolerance = SAME_DEPTH, buried = () => false, pairs = () => true }: { tolerance?: number; buried?: (point: THREE.Vector3) => boolean; pairs?: (a: Owner, b: Owner) => boolean } = {},
): ZFight<Owner>[] {
  if (tolerance >= SLOT) throw new Error(`A z-fighting tolerance of ${tolerance} m is wider than the slots faces are filed in`);
  const files = planeFiles(faces.filter((face) => face.normal.y >= -FACING_DOWN));
  const found: ZFight<Owner>[] = [];
  const compare = (one: Laid<Owner>, two: Laid<Owner>, [u, v]: [THREE.Vector3, THREE.Vector3]) => {
    const [a, b] = [one.face, two.face];
    if (one.low.x >= two.high.x || two.low.x >= one.high.x || one.low.y >= two.high.y || two.low.y >= one.high.y) return;
    if (!a.writesDepth && !b.writesDepth) return;
    if (a.normal.dot(b.normal) < PARALLEL) return;
    if (!pairs(a.owner, b.owner)) return;
    const shared = clip(one.polygon, two.polygon);
    if (shared.length < 3) return;
    const size = Math.abs(area(shared));
    if (size < SLIVER) return;
    // The patch on one face's plane, and how far the other's plane lies from it at each corner.
    const points = shared.map((p) => {
      const across = u.clone().multiplyScalar(p.x).addScaledVector(v, p.y);
      return across.addScaledVector(a.normal, one.offset - across.dot(a.normal));
    });
    const gap = Math.max(...points.map((p) => Math.abs(b.normal.dot(p) - two.offset)));
    if (gap > tolerance) return;
    const middle = points.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(points.length);
    // Buried only where the middle and every corner, drawn a little in towards it, lie inside a solid.
    const samples = [middle, ...points.map((p) => p.clone().lerp(middle, 0.1))];
    if (samples.every((p) => buried(p.clone().addScaledVector(a.normal, BURIED + gap)))) return;
    found.push({ a, b, area: size, gap, at: middle });
  };
  for (const file of files.values()) {
    // Pairs within the slot, and with the slot above: a plane that straddles two slots is met from the lower.
    const above = files.get(`${file.direction}@${file.slot + 1}`)?.faces ?? [];
    file.faces.forEach((one, i) => {
      for (let j = i + 1; j < file.faces.length; j++) compare(one, file.faces[j], file.basis);
      for (const two of above) compare(one, two, file.basis);
    });
  }
  return found;
}

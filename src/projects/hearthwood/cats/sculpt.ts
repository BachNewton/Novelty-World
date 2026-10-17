import * as THREE from "three";
import {
  ball,
  ellipsoid,
  gradient,
  occlusion,
  outsideBox,
  rod,
  roughened,
  settle,
  smoothMin,
  surfaceNet,
  turned,
  type Solid,
} from "@/shared/lib/three/sdf";
import { BONE_NAMES, EAR, EAR_SHAPE, FRONT_LEG, HIND_LEG, HIP, SHOULDER, SKULL, TAIL_ROOT, TAIL_SEGMENTS, TAIL_STEP, type BoneName, type Side, type Vec3 } from "./rig";

/*
 * The cat's body as smooth signed-distance forms round the rig's pivots, in
 * the bind pose, meshed into one skinned surface. Each form belongs to a bone
 * (or blends between two along its length), and each vertex of the mesh
 * follows the bones of the forms nearest it, softly, so the body bends
 * smoothly where its forms were blended: the shoulder into the chest, the
 * thigh into the haunch, the tail along its length.
 *
 * Two meshes make the cat: the body on a coarser grid, and the head with its
 * ears on a finer one, so the ears keep their edge. One sculpture per hair
 * length serves every cat; builds move the bones.
 */

/** Which bone a form follows: one, or two blended along an axis between two points. */
type Follows = BoneName | { from: BoneName; to: BoneName; start: Vec3; end: Vec3 };

interface Form {
  solid: Solid;
  follows: Follows;
  blend: number;
}

/** A surface's own region, for the coat shader: the body and legs, or the head and ears. */
export const PART = { body: 0, head: 1 } as const;

const WEIGHT_FALLOFF = 0.012;
const MAX_INFLUENCES = 4;
const OCCLUSION = { reach: 0.03, steps: 5, strength: 2, deepest: 0.6 };
const BODY_CELL = 0.011;
const HEAD_CELL = 0.0065;

const mirror = ([x, y, z]: Vec3): Vec3 => [-x, y, z];
const sides = ["L", "R"] as const;
const onSide = (side: Side, v: Vec3): Vec3 => (side === "L" ? v : mirror(v));

/** A cupped cone in an ear's own frame (base at the origin, tip up +y, open to +z), shrunk by `inset`. */
function earCone(x: number, y: number, z: number, inset: number, lift: number, forward: number): number {
  const { width, height, depth } = EAR_SHAPE;
  const t = Math.min(1, Math.max(0, (y - lift) / height));
  const r = Math.max(0.002, (width / 2) * (1 - t) + 0.005 * t - inset);
  const rz = r * depth;
  const radial = (Math.hypot(x / r, (z - forward) / rz) - 1) * rz;
  return Math.max(radial, lift - y, y - lift - height);
}

/** An ear: a rounded cone, cupped at the front, tipped and turned out. */
function ear(side: Side): Solid {
  const base = onSide(side, EAR);
  const { width, height, depth, splay, turn, cupInset, cupLift } = EAR_SHAPE;
  const [bx, by, bz] = base;
  const upright: Solid = {
    distance: (x, y, z) => {
      const px = x - bx;
      const py = y - by;
      const pz = z - bz;
      const outer = earCone(px, py, pz, 0, -0.01, 0);
      const cup = earCone(px, py, pz, cupInset, cupLift, width * depth * 0.42);
      return Math.max(outer, -cup);
    },
    min: [bx - width, by - 0.012, bz - width],
    max: [bx + width, by + height + 0.01, bz + width],
  };
  const mirrored = side === "L" ? 1 : -1;
  return turned(upright, base, [0, turn * mirrored, splay * mirrored]);
}

interface Look {
  longHair: boolean;
}

function bodyForms({ longHair }: Look): Form[] {
  const fluff = longHair ? 0.012 : 0;
  const forms: Form[] = [];
  const add = (solid: Solid, follows: Follows, blend: number) => forms.push({ solid, follows, blend });
  const back: Follows = { from: "pelvis", to: "chest", start: [0, 0, -0.07], end: [0, 0, 0.07] };

  add(ellipsoid([0, 0.218, 0.055], [0.074 + fluff, 0.08 + fluff, 0.1]), "chest", 0);
  add(ellipsoid([0, 0.218, -0.04], [0.068 + fluff, 0.072 + fluff, 0.1]), back, 0.04);
  add(ball([0, 0.226, -0.125], 0.058 + fluff), "pelvis", 0.04);
  add(ellipsoid([0, 0.2, 0.13], [0.058 + fluff, 0.07 + fluff, 0.055]), "chest", 0.03);
  for (const side of sides) {
    add(ball(onSide(side, [0.036, 0.243, 0.105]), 0.042), "chest", 0.03);
    add(ellipsoid(onSide(side, [0.036, 0.203, -0.095]), [0.046 + fluff, 0.07 + fluff, 0.068 + fluff]), "pelvis", 0.03);
  }
  add(rod([0, 0.24, 0.13], [0, 0.3, 0.208], 0.052 + fluff * 1.5, 0.042 + fluff), "neck", 0.03);
  if (longHair) {
    // The ruff round the neck and down the chest, and the britches behind the thighs.
    add(ellipsoid([0, 0.235, 0.155], [0.078, 0.085, 0.07]), "neck", 0.03);
    add(ellipsoid([0, 0.17, 0.135], [0.05, 0.06, 0.05]), "chest", 0.03);
    for (const side of sides) add(ellipsoid(onSide(side, [0.052, 0.15, -0.12]), [0.034, 0.055, 0.042]), `thigh${side}`, 0.025);
  }

  for (const side of sides) {
    const shoulder = onSide(side, SHOULDER);
    const elbow: Vec3 = [shoulder[0], shoulder[1] - FRONT_LEG[0], shoulder[2]];
    const wrist: Vec3 = [shoulder[0], elbow[1] - FRONT_LEG[1], shoulder[2]];
    add(rod([shoulder[0], shoulder[1] + 0.01, shoulder[2]], elbow, 0.034, 0.024), `upper${side}`, 0.03);
    add(rod(elbow, wrist, 0.022, 0.0175), `fore${side}`, 0.012);
    add(ellipsoid([wrist[0], wrist[1] - 0.022, wrist[2] + 0.012], [0.021, 0.014, 0.027]), `paw${side}`, 0.016);

    const hip = onSide(side, HIP);
    const knee: Vec3 = [hip[0], hip[1] - HIND_LEG[0], hip[2]];
    const hock: Vec3 = [hip[0], knee[1] - HIND_LEG[1], hip[2]];
    add(rod(hip, knee, 0.044 + fluff * 0.5, 0.026), `thigh${side}`, 0.03);
    add(rod(knee, hock, 0.022, 0.0155), `shin${side}`, 0.014);
    add(rod(hock, [hock[0], hock[1] - HIND_LEG[2] + 0.02, hock[2]], 0.0155, 0.016), `foot${side}`, 0.01);
    add(ellipsoid([hock[0], hock[1] - HIND_LEG[2] + 0.012, hock[2] + 0.012], [0.021, 0.014, 0.028]), `toe${side}`, 0.016);
  }

  const tailRadius = (i: number) => {
    const t = i / TAIL_SEGMENTS;
    return longHair ? 0.036 - 0.006 * t : 0.021 - 0.006 * t;
  };
  for (let i = 0; i < TAIL_SEGMENTS; i++) {
    const a: Vec3 = [TAIL_ROOT[0], TAIL_ROOT[1], TAIL_ROOT[2] - i * TAIL_STEP + (i === 0 ? 0.03 : 0)];
    const b: Vec3 = [TAIL_ROOT[0], TAIL_ROOT[1], TAIL_ROOT[2] - (i + 1) * TAIL_STEP + (i === TAIL_SEGMENTS - 1 ? 0.01 : 0)];
    add(rod(a, b, tailRadius(i), tailRadius(i + 1)), `tail${i}` as BoneName, i === 0 ? 0.03 : 0.01);
  }
  return forms;
}

function headForms({ longHair }: Look): Form[] {
  const forms: Form[] = [];
  const add = (solid: Solid, follows: Follows, blend: number) => forms.push({ solid, follows, blend });
  const [sx, sy, sz] = SKULL;
  add(ellipsoid(SKULL, [0.068, 0.06, 0.06]), "head", 0);
  for (const side of sides) {
    add(ellipsoid(onSide(side, [sx + 0.033, sy - 0.019, sz + 0.02]), [0.04 + (longHair ? 0.01 : 0), 0.034, 0.036]), "head", 0.025);
    add(ball(onSide(side, [sx + 0.0135, sy - 0.026, sz + 0.064]), 0.0175), "head", 0.016);
    add(ear(side), `ear${side}`, 0.01);
  }
  add(ellipsoid([sx, sy - 0.042, sz + 0.054], [0.016, 0.011, 0.014]), "head", 0.012);
  add(ellipsoid([sx, sy - 0.008, sz + 0.062], [0.013, 0.011, 0.012]), "head", 0.022);
  return forms;
}

function followsAt(follows: Follows, x: number, y: number, z: number, weight: number, out: Map<BoneName, number>) {
  const put = (bone: BoneName, w: number) => out.set(bone, (out.get(bone) ?? 0) + w);
  if (typeof follows === "string") return put(follows, weight);
  const { start, end } = follows;
  const ax = end[0] - start[0];
  const ay = end[1] - start[1];
  const az = end[2] - start[2];
  const t = Math.min(1, Math.max(0, ((x - start[0]) * ax + (y - start[1]) * ay + (z - start[2]) * az) / (ax * ax + ay * ay + az * az)));
  const s = t * t * (3 - 2 * t);
  put(follows.from, weight * (1 - s));
  put(follows.to, weight * s);
}

function distanceOf(forms: readonly Form[], roughness: number) {
  const smooth = (x: number, y: number, z: number) => {
    let d = Infinity;
    for (const form of forms) {
      if (outsideBox(x, y, z, form.solid.min, form.solid.max) > d + form.blend) continue;
      d = smoothMin(d, form.solid.distance(x, y, z), form.blend);
    }
    return d;
  };
  if (roughness === 0) return smooth;
  const all = { distance: smooth, min: [-1, -1, -1] as Vec3, max: [1, 1, 1] as Vec3 };
  return roughened(all, roughness, 0.05).distance;
}

/** A cat's mesh, ready to be a skinned geometry: indexed, with each vertex's bones and how hollow it lies. */
export interface CatMesh {
  positions: Float32Array;
  normals: Float32Array;
  /** Four bones per vertex, as indices into `BONE_NAMES`, and their weights. */
  skinIndex: Uint16Array;
  skinWeight: Float32Array;
  /** 1 in the open, less in a hollow. */
  occlusion: Float32Array;
  /** Which part a vertex is on (`PART`). */
  part: Float32Array;
  triangles: Uint32Array;
}

function meshForms(forms: readonly Form[], cell: number, part: number, roughness: number) {
  const distance = distanceOf(forms, roughness);
  const min = [0, 1, 2].map((i) => Math.min(...forms.map((f) => f.solid.min[i]))) as unknown as Vec3;
  const max = [0, 1, 2].map((i) => Math.max(...forms.map((f) => f.solid.max[i]))) as unknown as Vec3;
  const net = surfaceNet(distance, min, max, cell);
  settle(net.positions, distance, cell);
  const count = net.positions.length / 3;
  const normals = new Float32Array(count * 3);
  const skinIndex = new Uint16Array(count * MAX_INFLUENCES);
  const skinWeight = new Float32Array(count * MAX_INFLUENCES);
  const hollow = new Float32Array(count);
  const g = new THREE.Vector3();
  const weights = new Map<BoneName, number>();
  const nearness = new Float64Array(forms.length);
  for (let v = 0; v < count; v++) {
    const x = net.positions[v * 3];
    const y = net.positions[v * 3 + 1];
    const z = net.positions[v * 3 + 2];
    gradient(distance, x, y, z, cell * 0.25, g).normalize();
    normals.set([g.x, g.y, g.z], v * 3);
    hollow[v] = occlusion(distance, x, y, z, g, OCCLUSION);

    let nearest = Infinity;
    forms.forEach((form, i) => {
      nearness[i] = form.solid.distance(x, y, z);
      nearest = Math.min(nearest, nearness[i]);
    });
    weights.clear();
    forms.forEach((form, i) => {
      const w = Math.exp(-(nearness[i] - nearest) / WEIGHT_FALLOFF);
      if (w > 1e-3) followsAt(form.follows, x, y, z, w, weights);
    });
    const strongest = [...weights].sort((a, b) => b[1] - a[1]).slice(0, MAX_INFLUENCES);
    const total = strongest.reduce((sum, [, w]) => sum + w, 0);
    strongest.forEach(([bone, w], i) => {
      skinIndex[v * MAX_INFLUENCES + i] = BONE_NAMES.indexOf(bone);
      skinWeight[v * MAX_INFLUENCES + i] = w / total;
    });
  }
  return { positions: net.positions, normals, skinIndex, skinWeight, occlusion: hollow, part: new Float32Array(count).fill(part), triangles: net.triangles };
}

function concat<T extends Float32Array | Uint16Array>(a: T, b: T): T {
  const out = new (a.constructor as new (n: number) => T)(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

/** The cat's whole mesh for a hair length: body and head together. */
export function sculptCat(look: Look): CatMesh {
  const body = meshForms(bodyForms(look), BODY_CELL, PART.body, look.longHair ? 0.0028 : 0);
  const head = meshForms(headForms(look), HEAD_CELL, PART.head, 0);
  const offset = body.positions.length / 3;
  const triangles = new Uint32Array(body.triangles.length + head.triangles.length);
  triangles.set(body.triangles);
  triangles.set(head.triangles.map((i) => i + offset), body.triangles.length);
  return {
    positions: concat(body.positions, head.positions),
    normals: concat(body.normals, head.normals),
    skinIndex: concat(body.skinIndex, head.skinIndex),
    skinWeight: concat(body.skinWeight, head.skinWeight),
    occlusion: concat(body.occlusion, head.occlusion),
    part: concat(body.part, head.part),
    triangles,
  };
}

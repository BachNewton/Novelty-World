import * as THREE from "three";
import { gradient, occlusion, outsideBox, roughened, settle, smoothMin, surfaceNet, turned, type Solid } from "@/shared/lib/three/sdf";
import { BONE_NAMES, mirror, type BoneName, type Side, type Vec3 } from "./rig";

/*
 * An animal's body as smooth signed-distance forms round its skeleton's
 * pivots, in the bind pose, meshed into one skinned surface. Each form
 * belongs to a bone (or blends between two along its length), and each vertex
 * of the mesh follows the bones of the forms nearest it, softly, so the body
 * bends smoothly where its forms were blended: the shoulder into the chest,
 * the thigh into the haunch, the tail along its length.
 *
 * A species gives its forms in layers, each meshed on its own grid: the body
 * on a coarser one, the head on a finer one so the ears and face keep their
 * edges.
 */

/** Which bone a form follows: one, or two blended along an axis between two points. */
export type Follows = BoneName | { from: BoneName; to: BoneName; start: Vec3; end: Vec3 };

export interface Form {
  solid: Solid;
  follows: Follows;
  blend: number;
  /** A part of its own for the coat shader (a tongue), where the form is the surface's nearest; else its layer's. */
  part?: number;
}

/** A surface's own region, for the coat shader: the body and legs, or the head and ears. */
export const PART = { body: 0, head: 1, tongue: 2 } as const;

/** Forms meshed together on one grid: `cell` apart, roughened by up to `roughness` (a long coat's soft lumps). */
export interface Layer {
  forms: readonly Form[];
  cell: number;
  part: number;
  roughness: number;
}

const WEIGHT_FALLOFF = 0.012;
const MAX_INFLUENCES = 4;
const OCCLUSION = { reach: 0.03, steps: 5, strength: 2, deepest: 0.6 };

export const SIDES = ["L", "R"] as const;
export const onSide = (side: Side, v: Vec3): Vec3 => (side === "L" ? v : mirror(v));

/** An erect ear's shape: a cupped cone `width` across its base and `height`
 *  tall, its depth front to back a share of its width, tipped out by `splay`
 *  and turned out by `turn` (the right ear mirrors it), its cup shrunk by
 *  `cupInset` and starting `cupLift` up, its tip `tip` across. */
export interface EarShape {
  width: number;
  height: number;
  depth: number;
  splay: number;
  turn: number;
  cupInset: number;
  cupLift: number;
  tip: number;
}

/** A cupped cone in an ear's own frame (base at the origin, tip up +y, open to +z), shrunk by `inset`. */
function earCone(shape: EarShape, x: number, y: number, z: number, inset: number, lift: number, forward: number): number {
  const { width, height, depth, tip } = shape;
  const t = Math.min(1, Math.max(0, (y - lift) / height));
  const r = Math.max(0.002, (width / 2) * (1 - t) + tip * t - inset);
  const rz = r * depth;
  const radial = (Math.hypot(x / r, (z - forward) / rz) - 1) * rz;
  return Math.max(radial, lift - y, y - lift - height);
}

/** The cupped ear upright at the origin of its own frame, before it is placed and turned. */
export function uprightEar(shape: EarShape): Solid {
  const { width, height, depth, cupInset, cupLift } = shape;
  return {
    distance: (x, y, z) => Math.max(earCone(shape, x, y, z, 0, -0.01, 0), -earCone(shape, x, y, z, cupInset, cupLift, width * depth * 0.42)),
    min: [-width, -0.012, -width],
    max: [width, height + 0.01, width],
  };
}

/** A solid placed with its origin at `at`. */
export function placed(solid: Solid, at: Vec3): Solid {
  const [bx, by, bz] = at;
  return {
    distance: (x, y, z) => solid.distance(x - bx, y - by, z - bz),
    min: [solid.min[0] + bx, solid.min[1] + by, solid.min[2] + bz],
    max: [solid.max[0] + bx, solid.max[1] + by, solid.max[2] + bz],
  };
}

/** An erect ear on `side`, its base at `base` (the left ear's), tipped and turned out. */
export function cuppedEar(shape: EarShape, base: Vec3, side: Side): Solid {
  const at = onSide(side, base);
  const mirrored = side === "L" ? 1 : -1;
  return turned(placed(uprightEar(shape), at), at, [0, shape.turn * mirrored, shape.splay * mirrored]);
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

/** An animal's mesh, ready to be a skinned geometry: indexed, with each vertex's bones and how hollow it lies. */
export interface AnimalMesh {
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

function meshLayer({ forms, cell, part, roughness }: Layer): AnimalMesh {
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
  const parts = new Float32Array(count).fill(part);
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
      if (nearness[i] < nearest) {
        nearest = nearness[i];
        parts[v] = form.part ?? part;
      }
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
  return { positions: net.positions, normals, skinIndex, skinWeight, occlusion: hollow, part: parts, triangles: net.triangles };
}

function concat<T extends Float32Array | Uint16Array | Uint32Array>(arrays: readonly T[]): T {
  const out = new (arrays[0].constructor as new (n: number) => T)(arrays.reduce((n, a) => n + a.length, 0));
  let at = 0;
  for (const a of arrays) {
    out.set(a, at);
    at += a.length;
  }
  return out;
}

/** The whole mesh of an animal's layers, one surface each, in one skinned mesh. */
export function sculpt(layers: readonly Layer[]): AnimalMesh {
  const meshes = layers.map(meshLayer);
  let offset = 0;
  const triangles = meshes.map((mesh) => {
    const shifted = mesh.triangles.map((i) => i + offset);
    offset += mesh.positions.length / 3;
    return shifted;
  });
  return {
    positions: concat(meshes.map((m) => m.positions)),
    normals: concat(meshes.map((m) => m.normals)),
    skinIndex: concat(meshes.map((m) => m.skinIndex)),
    skinWeight: concat(meshes.map((m) => m.skinWeight)),
    occlusion: concat(meshes.map((m) => m.occlusion)),
    part: concat(meshes.map((m) => m.part)),
    triangles: concat(triangles),
  };
}

import type { Build } from "./cat";

/*
 * The cat's skeleton: the pivots its smooth body bends about, in metres, with
 * the cat facing +z, its left on +x, standing on y = 0. The body is sculpted
 * once round these pivots in the bind pose (legs straight down, tail straight
 * back, head level), and every pose turns them. A cat's build moves and
 * scales them, so one sculpture serves every cat of its hair length.
 */

export type Vec3 = readonly [number, number, number];

export const TAIL_SEGMENTS = 6;
export type TailBone = `tail${0 | 1 | 2 | 3 | 4 | 5 | 6}`;
export type Side = "L" | "R";
export type LegBone = `${"upper" | "fore" | "paw" | "thigh" | "shin" | "foot" | "toe"}${Side}`;
export type BoneName = "pelvis" | "chest" | "neck" | "head" | `ear${Side}` | LegBone | TailBone;

/** Where each pivot sits in the bind pose, and the bone it hangs from. */
interface BoneSpec {
  parent: BoneName | null;
  at: Vec3;
}

export const HIP: Vec3 = [0.05, 0.21, -0.1];
export const SHOULDER: Vec3 = [0.048, 0.205, 0.11];
/** Lengths of the leg's three segments, top first. The front leg is shoulder,
 *  elbow, wrist; the hind leg hip, knee, hock: longer than it stands, so it
 *  stands in the zigzag a cat's hind leg makes. The hind paw is a bone of its
 *  own at the foot's end, so it lies flat whether the foot stands or lies. */
export const FRONT_LEG = [0.08, 0.093, 0.032] as const;
export const HIND_LEG = [0.095, 0.085, 0.06] as const;
export const TAIL_ROOT: Vec3 = [0, 0.235, -0.17];
export const TAIL_STEP = 0.05;
export const HEAD: Vec3 = [0, 0.315, 0.215];
/** The middle of the skull, which the face is laid out from. */
export const SKULL: Vec3 = [0, 0.34, 0.245];
export const EAR: Vec3 = [0.04, 0.378, 0.232];
/** The left ear's shape: a cupped cone `width` across its base and `height`
 *  tall, its depth front to back a share of its width, tipped out by `splay`
 *  and turned out by `turn` (the right ear mirrors it). */
export const EAR_SHAPE = { width: 0.064, height: 0.062, depth: 0.62, splay: -0.3, turn: 0.32, cupInset: 0.0065, cupLift: 0.008 } as const;

const mirror = ([x, y, z]: Vec3): Vec3 => [-x, y, z];
const down = ([x, y, z]: Vec3, by: number): Vec3 => [x, y - by, z];

function legs(side: Side): [BoneName, BoneSpec][] {
  const flip = side === "L" ? (v: Vec3) => v : mirror;
  const shoulder = flip(SHOULDER);
  const elbow = down(shoulder, FRONT_LEG[0]);
  const wrist = down(elbow, FRONT_LEG[1]);
  const hip = flip(HIP);
  const knee = down(hip, HIND_LEG[0]);
  const hock = down(knee, HIND_LEG[1]);
  return [
    [`upper${side}`, { parent: "chest", at: shoulder }],
    [`fore${side}`, { parent: `upper${side}`, at: elbow }],
    [`paw${side}`, { parent: `fore${side}`, at: wrist }],
    [`thigh${side}`, { parent: "pelvis", at: hip }],
    [`shin${side}`, { parent: `thigh${side}`, at: knee }],
    [`foot${side}`, { parent: `shin${side}`, at: hock }],
    [`toe${side}`, { parent: `foot${side}`, at: down(hock, HIND_LEG[2]) }],
  ];
}

const tail = Array.from({ length: TAIL_SEGMENTS + 1 }, (_, i): [BoneName, BoneSpec] => [
  `tail${i}` as TailBone,
  { parent: i === 0 ? "pelvis" : (`tail${i - 1}` as TailBone), at: [TAIL_ROOT[0], TAIL_ROOT[1], TAIL_ROOT[2] - i * TAIL_STEP] },
]);

/** Every bone, each after its parent. */
export const BONES: ReadonlyMap<BoneName, BoneSpec> = new Map<BoneName, BoneSpec>([
  ["pelvis", { parent: null, at: [0, HIP[1], HIP[2]] }],
  ["chest", { parent: "pelvis", at: [0, 0.225, SHOULDER[2] - 0.01] }],
  ["neck", { parent: "chest", at: [0, 0.265, 0.165] }],
  ["head", { parent: "neck", at: HEAD }],
  ["earL", { parent: "head", at: EAR }],
  ["earR", { parent: "head", at: mirror(EAR) }],
  ...legs("L"),
  ...legs("R"),
  ...tail,
]);

export const BONE_NAMES: readonly BoneName[] = [...BONES.keys()];

/** A bone's place in its parent's frame, in the bind pose. */
export function bindOffset(name: BoneName): Vec3 {
  const spec = BONES.get(name);
  if (!spec) throw new Error(`No bone ${name}`);
  const parent = spec.parent ? BONES.get(spec.parent)?.at : [0, 0, 0];
  if (!parent) throw new Error(`No parent bone for ${name}`);
  return [spec.at[0] - parent[0], spec.at[1] - parent[1], spec.at[2] - parent[2]];
}

/** A cat's own rig: each bone's offset from its parent, and its own scale, from its build. */
export interface CatRig {
  offsets: ReadonlyMap<BoneName, Vec3>;
  scales: ReadonlyMap<BoneName, number>;
  /** The legs' segment lengths for this cat, for posing them. */
  front: readonly [number, number, number];
  hind: readonly [number, number, number];
}

export function rigOf(build: Build): CatRig {
  const offsets = new Map<BoneName, Vec3>();
  const scales = new Map<BoneName, number>();
  for (const name of BONE_NAMES) {
    const [x, y, z] = bindOffset(name);
    if (name === "chest") offsets.set(name, [x, y, z * build.body]);
    else if (name.startsWith("tail") && name !== "tail0") offsets.set(name, [x, y, z * build.tail]);
    else offsets.set(name, [x, y, z]);
  }
  for (const side of ["L", "R"] as const) {
    scales.set(`upper${side}`, build.legs);
    scales.set(`thigh${side}`, build.legs);
    scales.set(`ear${side}`, build.ears);
  }
  scales.set("head", build.head);
  const scaled = (lengths: readonly number[]) => lengths.map((l) => l * build.legs) as unknown as readonly [number, number, number];
  return { offsets, scales, front: scaled(FRONT_LEG), hind: scaled(HIND_LEG) };
}

/*
 * The four-legged animal's skeleton: the pivots its smooth body bends about,
 * with the animal facing +z, its left on +x, standing on y = 0. Every species
 * has the same bones in the same order, each at the place its own anatomy
 * puts it; a species without a use for one (a cat's jaw) simply has nothing
 * that follows it. The body is sculpted once round these pivots in the bind
 * pose (legs straight down, tail straight back, head level), and every pose
 * turns them. An animal's build moves and scales them, so one sculpture
 * serves every animal of its kind.
 */

export type Vec3 = readonly [number, number, number];

export const TAIL_SEGMENTS = 6;
export type TailBone = `tail${0 | 1 | 2 | 3 | 4 | 5 | 6}`;
export type Side = "L" | "R";
export type LegBone = `${"upper" | "fore" | "paw" | "thigh" | "shin" | "foot" | "toe"}${Side}`;
export type BoneName = "pelvis" | "chest" | "neck" | "head" | `ear${Side}` | LegBone | TailBone | "muzzle" | "jaw" | "tongue";

/** Where a species puts its pivots in the bind pose. */
export interface Anatomy {
  hip: Vec3;
  shoulder: Vec3;
  /** The legs' three segments, top first. The front leg is shoulder, elbow,
   *  wrist; the hind leg hip, knee, hock, with the hind paw a bone of its own
   *  at the foot's end, so it lies flat whether the foot stands or lies. */
  frontLeg: readonly [number, number, number];
  hindLeg: readonly [number, number, number];
  chest: Vec3;
  neck: Vec3;
  head: Vec3;
  ear: Vec3;
  /** The stop, where the muzzle leaves the skull; the jaw's hinge; the tongue's root. */
  muzzle: Vec3;
  jaw: Vec3;
  tongue: Vec3;
  tailRoot: Vec3;
  tailStep: number;
}

interface BoneSpec {
  parent: BoneName | null;
  at: Vec3;
}

export interface Skeleton {
  anatomy: Anatomy;
  /** Every bone, each after its parent, in `BONE_NAMES`' order. */
  bones: ReadonlyMap<BoneName, BoneSpec>;
}

export const mirror = ([x, y, z]: Vec3): Vec3 => [-x, y, z];
const down = ([x, y, z]: Vec3, by: number): Vec3 => [x, y - by, z];

function legs(anatomy: Anatomy, side: Side): [BoneName, BoneSpec][] {
  const flip = side === "L" ? (v: Vec3) => v : mirror;
  const shoulder = flip(anatomy.shoulder);
  const elbow = down(shoulder, anatomy.frontLeg[0]);
  const wrist = down(elbow, anatomy.frontLeg[1]);
  const hip = flip(anatomy.hip);
  const knee = down(hip, anatomy.hindLeg[0]);
  const hock = down(knee, anatomy.hindLeg[1]);
  return [
    [`upper${side}`, { parent: "chest", at: shoulder }],
    [`fore${side}`, { parent: `upper${side}`, at: elbow }],
    [`paw${side}`, { parent: `fore${side}`, at: wrist }],
    [`thigh${side}`, { parent: "pelvis", at: hip }],
    [`shin${side}`, { parent: `thigh${side}`, at: knee }],
    [`foot${side}`, { parent: `shin${side}`, at: hock }],
    [`toe${side}`, { parent: `foot${side}`, at: down(hock, anatomy.hindLeg[2]) }],
  ];
}

export function skeletonOf(anatomy: Anatomy): Skeleton {
  const { tailRoot, tailStep } = anatomy;
  const tail = Array.from({ length: TAIL_SEGMENTS + 1 }, (_, i): [BoneName, BoneSpec] => [
    `tail${i}` as TailBone,
    { parent: i === 0 ? "pelvis" : (`tail${i - 1}` as TailBone), at: [tailRoot[0], tailRoot[1], tailRoot[2] - i * tailStep] },
  ]);
  return {
    anatomy,
    bones: new Map<BoneName, BoneSpec>([
      ["pelvis", { parent: null, at: [0, anatomy.hip[1], anatomy.hip[2]] }],
      ["chest", { parent: "pelvis", at: anatomy.chest }],
      ["neck", { parent: "chest", at: anatomy.neck }],
      ["head", { parent: "neck", at: anatomy.head }],
      ["earL", { parent: "head", at: anatomy.ear }],
      ["earR", { parent: "head", at: mirror(anatomy.ear) }],
      ...legs(anatomy, "L"),
      ...legs(anatomy, "R"),
      ...tail,
      ["muzzle", { parent: "head", at: anatomy.muzzle }],
      ["jaw", { parent: "head", at: anatomy.jaw }],
      ["tongue", { parent: "jaw", at: anatomy.tongue }],
    ]),
  };
}

const SIDES = ["L", "R"] as const;
/** Every bone's name, in the order every species' skeleton and skin use. */
export const BONE_NAMES: readonly BoneName[] = [
  "pelvis",
  "chest",
  "neck",
  "head",
  "earL",
  "earR",
  ...SIDES.flatMap((s) => (["upper", "fore", "paw", "thigh", "shin", "foot", "toe"] as const).map((b): BoneName => `${b}${s}`)),
  ...Array.from({ length: TAIL_SEGMENTS + 1 }, (_, i) => `tail${i}` as TailBone),
  "muzzle",
  "jaw",
  "tongue",
];

export function boneAt(skeleton: Skeleton, name: BoneName): Vec3 {
  const spec = skeleton.bones.get(name);
  if (!spec) throw new Error(`No bone ${name}`);
  return spec.at;
}

/** A bone's place in its parent's frame, in the bind pose. */
export function bindOffset(skeleton: Skeleton, name: BoneName): Vec3 {
  const spec = skeleton.bones.get(name);
  if (!spec) throw new Error(`No bone ${name}`);
  const parent = spec.parent ? boneAt(skeleton, spec.parent) : [0, 0, 0];
  return [spec.at[0] - parent[0], spec.at[1] - parent[1], spec.at[2] - parent[2]];
}

/** One animal's own rig: each bone's offset from its parent and its own scale, from its build. */
export interface Rig {
  skeleton: Skeleton;
  offsets: ReadonlyMap<BoneName, Vec3>;
  /** Each bone's scale along its own axes; a bone not listed keeps its size. */
  scales: ReadonlyMap<BoneName, Vec3>;
  /** The legs' segment lengths for this animal, for posing them. */
  front: readonly [number, number, number];
  hind: readonly [number, number, number];
}

export const uniformScale = (s: number): Vec3 => [s, s, s];

import type { FigureSpec } from "./figure";

/*
 * A body as measurements and frames: the sizes a figure's parts come from, and the
 * small amount of vector work that puts them in a pose. No geometry is written here.
 * A figure faces +z with +y up and stands on its origin, so its left is +x.
 */

export type V3 = readonly [number, number, number];

export const add = (a: V3, b: V3, scale = 1): V3 => [a[0] + b[0] * scale, a[1] + b[1] * scale, a[2] + b[2] * scale];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const lengthOf = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const unit = (a: V3): V3 => {
  const length = lengthOf(a);
  return [a[0] / length, a[1] / length, a[2] / length];
};
export const lerp = (a: V3, b: V3, share: number): V3 => add(a, sub(b, a), share);
const ORIGIN: V3 = [0, 0, 0];

/** Where a part sits and which way it faces. */
export interface Frame {
  at: V3;
  x: V3;
  y: V3;
  z: V3;
}

export const UPRIGHT: Omit<Frame, "at"> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

/** A point given in a frame, as figure coordinates. */
export const inFrame = (frame: Frame, x: number, y: number, z: number): V3 => add(add(add(frame.at, frame.x, x), frame.y, y), frame.z, z);

/** Turns a frame about its own x: its top goes forward for a positive angle. */
export function pitched(frame: Frame, radians: number): Frame {
  const [cos, sin] = [Math.cos(radians), Math.sin(radians)];
  return { ...frame, y: add(add(ORIGIN, frame.y, cos), frame.z, sin), z: add(add(ORIGIN, frame.z, cos), frame.y, -sin) };
}

/** Turns a frame about its own y: its front goes to its left for a positive angle. */
export function yawed(frame: Frame, radians: number): Frame {
  const [cos, sin] = [Math.cos(radians), Math.sin(radians)];
  return { ...frame, z: add(add(ORIGIN, frame.z, cos), frame.x, sin), x: add(add(ORIGIN, frame.x, cos), frame.z, -sin) };
}

/** A frame whose y runs from one point to another, with x as level as it can be. */
export function frameAlong(from: V3, to: V3): Frame {
  const y = unit(sub(to, from));
  const x = unit(cross(y, Math.abs(y[2]) > 0.9 ? [0, 1, 0] : [0, 0, 1]));
  return { at: from, x, y, z: cross(x, y) };
}

/**
 * The middle joint of a two-part limb, reaching for a target from its root, bending
 * towards `bend`. A target out of reach is brought just inside it.
 */
export function reach(root: V3, target: V3, first: number, second: number, bend: V3): { joint: V3; end: V3 } {
  const way = sub(target, root);
  const distance = Math.min(lengthOf(way), (first + second) * 0.998);
  const along = unit(way);
  const end = add(root, along, distance);
  const near = (distance * distance + first * first - second * second) / (2 * distance);
  const height = Math.sqrt(Math.max(0, first * first - near * near));
  const off = unit(sub(bend, add(ORIGIN, along, dot(bend, along))));
  return { joint: add(add(root, along, near), off, height), end };
}

export interface Body {
  /** Everything scales with this: the figure's height over a nominal adult's. */
  scale: number;
  headM: number;
  /** The head's size over an adult's. */
  headScale: number;
  neckM: number;
  hipY: number;
  ankleY: number;
  thighM: number;
  shinM: number;
  upperArmM: number;
  forearmM: number;
  handM: number;
  /** From the hip joints up the spine, to the waist, the shoulders and the neck's root. */
  waistUp: number;
  shoulderUp: number;
  neckUp: number;
  hipX: number;
  hipZ: number;
  waistX: number;
  waistZ: number;
  chestX: number;
  chestZ: number;
  shoulderX: number;
  shoulderZ: number;
  armX: number;
  legX: number;
  thighR: number;
  calfR: number;
  armR: number;
  /** A forward stoop of the spine, in radians. */
  stoop: number;
}

const ADULT_M = 1.72;
const HEAD_M = 0.225;

/** The measurements of a person, on real ones: a head near one eighth of an adult's height, hip joints a little over half way up, and a child's head large to their body. */
export function measure({ heightM, build, frame, age }: FigureSpec): Body {
  const isChild = age === "child";
  const scale = heightM / ADULT_M;
  const headScale = isChild ? 0.8 + 0.1 * (heightM - 1) : scale;
  const headM = HEAD_M * headScale;
  const neckM = 0.06 * scale;
  const hipY = heightM * (isChild ? 0.49 : 0.522);
  const ankleY = 0.07 * scale;
  const legM = hipY - ankleY;
  const shoulderY = heightM - headM - neckM;
  const trunk = shoulderY - hipY;
  const girth = (isChild ? 0.82 : 0.88 + build * 0.42) * Math.sqrt(scale);
  const man = 1 - frame;
  const width = (feminine: number, masculine: number) => (feminine + (masculine - feminine) * man) * girth;
  const armM = heightM * (isChild ? 0.3 : 0.325);
  return {
    scale,
    headM,
    headScale,
    neckM,
    hipY,
    ankleY,
    thighM: legM * 0.51,
    shinM: legM * 0.49,
    upperArmM: armM * 0.54,
    forearmM: armM * 0.46,
    handM: heightM * 0.1,
    waistUp: trunk * 0.32,
    shoulderUp: trunk,
    neckUp: trunk + 0.012 * scale,
    hipX: width(0.178, 0.158),
    hipZ: width(0.122, 0.108),
    waistX: width(0.122, 0.14),
    waistZ: width(0.095, 0.1),
    chestX: width(0.148, 0.175),
    chestZ: width(0.112, 0.112),
    shoulderX: width(0.155, 0.195),
    shoulderZ: width(0.075, 0.088),
    armX: width(0.152, 0.192),
    legX: width(0.084, 0.082),
    thighR: 0.078 * girth,
    calfR: 0.052 * girth,
    armR: (0.04 + 0.006 * man) * girth,
    stoop: age === "older" ? 0.13 : 0,
  };
}

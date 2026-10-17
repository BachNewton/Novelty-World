import { TAIL_SEGMENTS, type BoneName, type Rig, type Side, type TailBone, type Vec3 } from "./rig";

/*
 * How a four-legged animal moves, as pure functions of its clock: nothing
 * here keeps state, so a frozen time always draws the same frame. A species
 * says what each of its activities looks like as a posture (where the body
 * sits, where each paw stands, how the head, ears, jaw and tail are held);
 * this blends postures as the animal changes from one activity to the next,
 * steps the paws of a gait, and only then solves the legs to reach their
 * paws, so the paws stay on the ground through every change.
 *
 * Angles are turns about the animal's own x axis (its left), in radians: a
 * positive turn tips a part's front down, so a leg hanging straight down
 * swings back, a tail lying straight back rises, and a jaw opens.
 */

export type Paw = { y: number; z: number; angle: number };
export type PawName = "frontL" | "frontR" | "hindL" | "hindR";

export interface Posture {
  pelvisY: number;
  pelvisZ: number;
  pitch: number;
  roll: number;
  /** The hips' swing side to side: a dog's wiggle. */
  yaw: number;
  chestPitch: number;
  chestYaw: number;
  neckPitch: number;
  headPitch: number;
  headYaw: number;
  headRoll: number;
  paws: Record<PawName, Paw>;
  /** Pitch of the tail's root, then the bend it adds at each segment. */
  tailRoot: number;
  tailBend: number;
  /** How much the last segments hook. */
  tailHook: number;
  /** The tail's slow side-to-side wave, and its sideways curl round the body. */
  tailSway: number;
  tailCurl: number;
  /** A wag: the tail swung fast side to side from its root, and how far the swing travels down it as a wave (0 stiff, 1 whipping). */
  tailWag: number;
  wagWhip: number;
  earsBack: number;
  earsOut: number;
  lids: number;
  /** How far the jaw is open, in radians, and how far the tongue is out, 0 to 1. */
  jaw: number;
  tongue: number;
}

/** What a species' pose is: each bone's turn from its bind pose (Euler XYZ),
 *  where the pelvis stands, how shut the eyes are and how far the tongue is out. */
export interface Pose {
  pelvis: Vec3;
  rotations: ReadonlyMap<BoneName, Vec3>;
  /** 0 open, 1 shut. */
  blink: number;
  /** 0 in, 1 out. */
  tongue: number;
}

/** Seconds a change of activity takes. */
export const TRANSITION = 0.9;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const smooth = (t: number) => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const frac = (v: number) => v - Math.floor(v);

/** A hash of two integers to [0, 1). */
export function hash(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A number for a seed string, for a pose's seed. */
export function motionSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * An occasional movement: in each window `every` seconds long, one happens
 * with probability `chance`, at a seeded moment, lasting `length` seconds.
 * Its amount rises and falls smoothly from 0 to 1 and back, and `value` is a
 * seeded number in [0, 1) for that one occurrence (which way to look).
 */
export function burst(seed: number, name: number, time: number, every: number, length: number, chance = 1): { amount: number; value: number } {
  const slot = Math.floor(time / every);
  const key = seed + name * 7919;
  if (hash(key, slot) >= chance) return { amount: 0, value: 0 };
  const start = slot * every + hash(key + 1, slot) * Math.max(0, every - length);
  const u = (time - start) / length;
  if (u <= 0 || u >= 1) return { amount: 0, value: hash(key + 2, slot) };
  const s = Math.sin(Math.PI * u);
  return { amount: s * s, value: hash(key + 2, slot) };
}

/** A slow wander in [−1, 1]: sines of unrelated periods. */
export function wander(seed: number, time: number, rate: number): number {
  const p = hash(seed, 3) * 100;
  return (Math.sin(time * rate + p) + 0.6 * Math.sin(time * rate * 2.31 + p * 1.7) + 0.3 * Math.sin(time * rate * 4.87 + p * 2.3)) / 1.9;
}

const rotate = (y: number, z: number, angle: number): [number, number] => [y * Math.cos(angle) - z * Math.sin(angle), y * Math.sin(angle) + z * Math.cos(angle)];
/** Where a segment at `angle` points: straight down at 0, back for positive. */
const direction = (angle: number): [number, number] => [-Math.cos(angle), -Math.sin(angle)];
const angleOf = (y: number, z: number) => Math.atan2(-z, -y);

/**
 * Two segments from `root` reaching for `target`, bending at their joint
 * forward (`bend` −1, a knee) or back (1, an elbow). Returns each segment's
 * angle, measured from straight down.
 */
export function reach(root: readonly [number, number], target: readonly [number, number], upper: number, lower: number, bend: 1 | -1): [number, number] {
  const vy = target[0] - root[0];
  const vz = target[1] - root[1];
  // Near full stretch the joint's angle turns ever faster for each millimetre, so the reach eases
  // towards straight instead of snapping to it: past 94% of it, the leg gains less the further it is asked.
  const full = upper + lower;
  const easing = full * 0.94;
  const wanted = Math.hypot(vy, vz);
  const eased = wanted <= easing ? wanted : easing + (full - easing) * 0.9 * (1 - Math.exp(-(wanted - easing) / (full - easing)));
  const d = Math.max(eased, Math.abs(upper - lower) + 1e-3);
  const base = angleOf(vy, vz);
  const inner = Math.acos(clamp((upper * upper + d * d - lower * lower) / (2 * upper * d), -1, 1));
  const a1 = base + bend * inner;
  const [dy, dz] = direction(base);
  const [ey, ez] = direction(a1);
  return [a1, angleOf(root[0] + dy * d - (root[0] + ey * upper), root[1] + dz * d - (root[1] + ez * upper))];
}

/** Where the shoulders are, from the pelvis and the body's pitch. */
export function shoulderAt(rig: Rig, hip: readonly [number, number], pitch: number, chestPitch: number): [number, number] {
  const { shoulder, chest: chestPivot } = rig.skeleton.anatomy;
  const chest = rig.offsets.get("chest") ?? [0, 0, 0.2];
  const chestAt = rotate(chest[1], chest[2], pitch);
  const offset = rotate(shoulder[1] - chestPivot[1], shoulder[2] - chestPivot[2], pitch + chestPitch);
  return [hip[0] + chestAt[0] + offset[0], hip[1] + chestAt[1] + offset[1]];
}

/** How a paw turns through its step: planted at `plant`, pushing off towards
 *  `push` from `pushStart` of the stance on at `pushRate`, folding by `fold` as it swings. */
export interface StepAngles {
  plant: number;
  push: number;
  pushStart: number;
  pushRate: number;
  fold: number;
}

/**
 * One paw through its step, `u` from 0 to 1 round its cycle: on the ground
 * for the first `duty` of it, sliding back under the body a stride long, then
 * lifted `lift` high and swung forward to land as the next stance begins.
 */
export function step(u: number, duty: number, stride: number, lift: number, home: number, angles: StepAngles): Paw {
  if (u < duty) {
    const s = u / duty;
    return { y: 0, z: home + stride * (0.5 - s), angle: mix(angles.plant, angles.push, smooth((s - angles.pushStart) * angles.pushRate)) };
  }
  const s = (u - duty) / (1 - duty);
  const up = Math.sin(Math.PI * s);
  const fold = Math.sin(Math.PI * Math.min(1, s * 1.1));
  return { y: lift * up, z: home + stride * (smooth(s) - 0.5), angle: mix(angles.push, angles.plant, smooth(s)) + angles.fold * fold };
}

/** A gait: when in its cycle each paw lands (0 to 1), the share of the cycle a paw is down, and the stride's length and lift. A walk, a trot, a bound or a hop is only a different table. */
export interface Gait {
  footfalls: Record<PawName, number>;
  duty: number;
  stride: number;
  lift: number;
}

/** All four paws at `phase` (strides travelled) through a gait, each about its home, stepping with its leg's angles. */
export function gaitPaws(phase: number, gait: Gait, homes: Record<PawName, number>, angles: { front: StepAngles; hind: StepAngles }): Record<PawName, Paw> {
  const paw = (name: PawName, hind: boolean) => step(frac(phase + gait.footfalls[name]), gait.duty, gait.stride, gait.lift, homes[name], hind ? angles.hind : angles.front);
  return { frontL: paw("frontL", false), frontR: paw("frontR", false), hindL: paw("hindL", true), hindR: paw("hindR", true) };
}

export function blendPosture(a: Posture, b: Posture, t: number, lift: number): Posture {
  const paw = (p: Paw, q: Paw): Paw => ({ y: mix(p.y, q.y, t), z: mix(p.z, q.z, t), angle: mix(p.angle, q.angle, t) });
  const out = { ...a };
  for (const key of Object.keys(a) as (keyof Posture)[]) {
    if (key === "paws") continue;
    (out[key] as number) = mix(a[key] as number, b[key] as number, t);
  }
  out.paws = {
    frontL: paw(a.paws.frontL, b.paws.frontL),
    frontR: paw(a.paws.frontR, b.paws.frontR),
    hindL: paw(a.paws.hindL, b.paws.hindL),
    hindR: paw(a.paws.hindR, b.paws.hindR),
  };
  // A paw rising off the ground between two postures would sink through it: lift it over.
  if (t > 0 && t < 1) for (const key of Object.keys(out.paws) as PawName[]) out.paws[key].y += Math.sin(Math.PI * t) * lift;
  return out;
}

/** A species' activity now and before, blended over `TRANSITION` from when it changed. */
export function blendedPosture<A extends string>(postures: Record<A, () => Posture>, activity: A, previous: A, time: number, since: number, lift: number): Posture {
  const now = postures[activity]();
  const t = smooth((time - since) / TRANSITION);
  return t >= 1 ? now : blendPosture(postures[previous](), now, t, lift);
}

/** What the solver needs beyond the posture: the animal's own tail rhythms and its ears' and eyes' turns. */
export interface Solve {
  time: number;
  seed: number;
  /** Radians a second of the tail's slow sway, and of a wag. */
  swayRate: number;
  wagRate: number;
  ears: Record<Side, Vec3>;
  blink: number;
}

/** The bones' turns that hold a posture, with the legs solved to their paws. */
export function solvePose(posture: Posture, rig: Rig, { time, seed, swayRate, wagRate, ears, blink }: Solve): Pose {
  const rotations = new Map<BoneName, Vec3>();
  const pitch = posture.pitch;
  rotations.set("pelvis", [pitch, posture.yaw, posture.roll]);
  rotations.set("chest", [posture.chestPitch, posture.chestYaw - posture.yaw, -posture.roll * 0.6]);
  rotations.set("neck", [posture.neckPitch, posture.headYaw * 0.4, 0]);
  rotations.set("head", [posture.headPitch, posture.headYaw * 0.6, posture.headRoll]);
  rotations.set("earL", ears.L);
  rotations.set("earR", ears.R);
  rotations.set("muzzle", [0, 0, 0]);
  rotations.set("jaw", [posture.jaw, 0, 0]);
  rotations.set("tongue", [posture.tongue * 0.25, 0, 0]);

  const hip: [number, number] = [posture.pelvisY, posture.pelvisZ];
  const chestPitch = pitch + posture.chestPitch;
  const shoulder = shoulderAt(rig, hip, pitch, posture.chestPitch);
  for (const side of ["L", "R"] as const) {
    const front = posture.paws[`front${side}`];
    const [, , paw] = rig.front;
    const [py, pz] = direction(front.angle);
    const wrist: [number, number] = [front.y - py * paw, front.z - pz * paw];
    const [a1, a2] = reach(shoulder, wrist, rig.front[0], rig.front[1], 1);
    rotations.set(`upper${side}`, [a1 - chestPitch, 0, 0]);
    rotations.set(`fore${side}`, [a2 - a1, 0, 0]);
    rotations.set(`paw${side}`, [front.angle - a2, 0, 0]);

    const hind = posture.paws[`hind${side}`];
    const [, , foot] = rig.hind;
    const [fy, fz] = direction(hind.angle);
    const hock: [number, number] = [hind.y - fy * foot, hind.z - fz * foot];
    const [b1, b2] = reach(hip, hock, rig.hind[0], rig.hind[1], -1);
    rotations.set(`thigh${side}`, [b1 - pitch, 0, 0]);
    rotations.set(`shin${side}`, [b2 - b1, 0, 0]);
    rotations.set(`foot${side}`, [hind.angle - b2, 0, 0]);
    rotations.set(`toe${side}`, [-hind.angle, 0, 0]);
  }

  const wag = Math.sin(time * wagRate + seed);
  for (let i = 0; i <= TAIL_SEGMENTS; i++) {
    const along = i / TAIL_SEGMENTS;
    const wave = Math.sin(time * swayRate - i * 0.7 + seed) * posture.tailSway * (0.35 + along);
    // A stiff wag swings the whole tail from its root; a whipping one carries on down it, a beat behind.
    const wagged = i === 0 ? wag * posture.tailWag : Math.sin(time * wagRate + seed - i * 0.55) * posture.tailWag * posture.wagWhip * 0.35;
    const bend = i === 0 ? posture.tailRoot : posture.tailBend + (i >= TAIL_SEGMENTS - 2 ? posture.tailHook : 0);
    rotations.set(`tail${i}` as TailBone, [bend, wave + wagged + (i === 0 ? 0 : posture.tailCurl), 0]);
  }
  return { pelvis: [0, posture.pelvisY, posture.pelvisZ], rotations, blink, tongue: posture.tongue };
}

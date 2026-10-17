import type { Personality } from "./cat";
import { HIP, TAIL_SEGMENTS, type BoneName, type CatRig, type Side, type TailBone, type Vec3 } from "./rig";

/*
 * How a cat moves, as pure functions of its clock: what it is doing, how far
 * it has walked and how fast, and who it is. Nothing here keeps state, so a
 * frozen time always draws the same frame.
 *
 * Every activity is a posture: where the body sits, where each paw stands,
 * how the head, ears and tail are held. Postures blend as the cat changes
 * from one activity to the next, and only then are the legs solved to reach
 * their paws, so the paws stay on the ground through every change.
 *
 * Angles are turns about the cat's own x axis (its left), in radians: a
 * positive turn tips a part's front down, so a leg hanging straight down
 * swings back, and a tail lying straight back rises.
 */

export type Activity = "stand" | "walk" | "sit" | "loaf";

export interface MotionInput {
  /** The cat's own clock, in seconds. */
  time: number;
  /** How far it has walked, in its own metres (world metres over its size): the stride follows it. */
  travelled: number;
  /** Its walking speed, in its own metres a second. */
  speed: number;
  activity: Activity;
  /** What it was doing before, and when it changed: the two blend over `TRANSITION`. */
  previous: Activity;
  since: number;
  /** How much its tail is up in greeting, 0 to 1. */
  greeting: number;
  personality: Personality;
  rig: CatRig;
  /** A number from the cat's seed, so no two cats fidget in step. */
  seed: number;
}

/** The pose to draw: each bone's turn from its bind pose (Euler XYZ), where the
 *  pelvis stands, and how shut the eyes are. */
export interface CatPose {
  pelvis: Vec3;
  rotations: ReadonlyMap<BoneName, Vec3>;
  /** 0 open, 1 shut. */
  blink: number;
}

/** Seconds a change of activity takes. */
export const TRANSITION = 0.9;

type Paw = { y: number; z: number; angle: number };

interface Posture {
  pelvisY: number;
  pelvisZ: number;
  pitch: number;
  roll: number;
  chestPitch: number;
  chestYaw: number;
  neckPitch: number;
  headPitch: number;
  headYaw: number;
  headRoll: number;
  paws: Record<"frontL" | "frontR" | "hindL" | "hindR", Paw>;
  /** Pitch of the tail's root, then the bend it adds at each segment. */
  tailRoot: number;
  tailBend: number;
  /** How much the last segments hook. */
  tailHook: number;
  /** The tail's side-to-side wave, and its sideways curl round the body. */
  tailSway: number;
  tailCurl: number;
  earsBack: number;
  earsOut: number;
  lids: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (t: number) => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const frac = (v: number) => v - Math.floor(v);

/** A hash of two integers to [0, 1). */
function hash(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A number for a seed string, for `MotionInput.seed`. */
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
function wander(seed: number, time: number, rate: number): number {
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
function shoulderAt(rig: CatRig, hip: readonly [number, number], pitch: number, chestPitch: number): [number, number] {
  const chest = rig.offsets.get("chest") ?? [0, 0, 0.2];
  const chestAt = rotate(chest[1], chest[2], pitch);
  const offset = rotate(-0.02, 0.01, pitch + chestPitch);
  return [hip[0] + chestAt[0] + offset[0], hip[1] + chestAt[1] + offset[1]];
}

interface Frame {
  input: MotionInput;
  /** Hip height standing, for this cat's legs. */
  hipHeight: number;
  frontZ: number;
  hindZ: number;
}

function frameOf(input: MotionInput): Frame {
  const { rig } = input;
  const legs = rig.hind[0] / 0.095;
  const chest = rig.offsets.get("chest") ?? [0, 0, 0.2];
  return { input, hipHeight: 0.205 * legs, hindZ: HIP[2], frontZ: HIP[2] + chest[2] + 0.01 };
}

function stand({ input, hipHeight, frontZ, hindZ }: Frame): Posture {
  const { time, seed, personality } = input;
  const bold = personality.boldness;
  const lazy = -personality.energy;
  const breath = Math.sin((time * Math.PI * 2) / (3.2 + lazy * 0.8));
  const shift = wander(seed, time, 0.35) * 0.012;
  const crouch = Math.max(0, -bold) * 0.016;
  return {
    pelvisY: hipHeight - crouch + breath * 0.0012,
    pelvisZ: HIP[2],
    pitch: 0.02,
    roll: shift * 1.5,
    chestPitch: -0.02 + breath * 0.012,
    chestYaw: 0,
    neckPitch: 0.02 - bold * 0.1 + crouch * 5,
    headPitch: 0.06,
    headYaw: 0,
    headRoll: 0,
    paws: {
      frontL: { y: 0, z: frontZ + 0.005, angle: 0 },
      frontR: { y: 0, z: frontZ + 0.005, angle: 0 },
      hindL: { y: 0, z: hindZ - 0.02, angle: -0.22 },
      hindR: { y: 0, z: hindZ - 0.02, angle: -0.22 },
    },
    tailRoot: -1.0 + bold * 0.35,
    tailBend: 0.2,
    tailHook: 0.15,
    tailSway: 0.12,
    tailCurl: 0,
    earsBack: Math.max(0, -bold) * 0.35,
    earsOut: Math.max(0, -bold) * 0.25,
    lids: Math.max(0, lazy) * 0.2,
  };
}

/** The four paws' order in a cat's walk, a lateral sequence: left hind, left fore, right hind, right fore. */
const WALK_ORDER = { hindL: 0, frontL: 0.25, hindR: 0.5, frontR: 0.75 } as const;

function walk(frame: Frame): Posture {
  const { input, hipHeight, frontZ, hindZ } = frame;
  const legs = frame.hipHeight / 0.205;
  const base = stand(frame);
  const speed = Math.max(input.speed, 0.05);
  const stride = 0.24 * legs * (0.85 + 0.2 * clamp(speed / 0.6, 0, 2));
  const phase = input.travelled / stride;
  const duty = clamp(0.66 - speed * 0.08, 0.5, 0.66);
  const lift = 0.03 * legs;
  const paw = (leg: keyof typeof WALK_ORDER, home: number, hind: boolean): Paw => {
    const u = frac(phase + WALK_ORDER[leg]);
    if (u < duty) {
      const s = u / duty;
      // Late in the stance the hock rises over the planted paw, and the wrist bends as the fore leg leans back.
      const angle = hind ? mix(-0.15, 0.35, smooth((s - 0.35) * 1.6)) : mix(0, -0.25, smooth((s - 0.6) * 2.5));
      return { y: 0, z: home + stride * (0.5 - s), angle };
    }
    const s = (u - duty) / (1 - duty);
    const up = Math.sin(Math.PI * s);
    // Each swing starts where its stance ended and lands as the next stance begins: a hind foot folds up behind, a fore paw flicks back.
    const fold = Math.sin(Math.PI * Math.min(1, s * 1.1));
    const angle = hind ? mix(0.35, -0.15, smooth(s)) + 0.5 * fold : mix(-0.25, 0, smooth(s)) + 0.9 * fold;
    return { y: lift * up, z: home + stride * (smooth(s) - 0.5), angle };
  };
  const step = Math.sin(phase * Math.PI * 4);
  const sway = Math.sin(phase * Math.PI * 2);
  return {
    ...base,
    pelvisY: hipHeight - 0.004 - 0.003 * step,
    pitch: 0.03,
    roll: sway * 0.04,
    chestYaw: sway * 0.05,
    neckPitch: base.neckPitch + 0.04,
    headPitch: base.headPitch + 0.02 * step,
    paws: {
      hindL: paw("hindL", hindZ - 0.02, true),
      hindR: paw("hindR", hindZ - 0.02, true),
      frontL: paw("frontL", frontZ + 0.01, false),
      frontR: paw("frontR", frontZ + 0.01, false),
    },
    tailRoot: -0.45 + input.personality.boldness * 0.3,
    tailBend: 0.16,
    tailSway: 0.08,
    lids: 0,
  };
}

function sit(frame: Frame): Posture {
  const { input } = frame;
  const legs = frame.hipHeight / 0.205;
  const base = stand(frame);
  const breath = Math.sin((input.time * Math.PI * 2) / 3.6);
  const pitch = -0.8;
  const pelvisY = 0.072 * legs;
  const curl = input.seed % 2 === 0 ? 1 : -1;
  const chestPitch = 0.12 + breath * 0.01;
  // The front paws stand under the raised shoulders.
  const [, shoulderZ] = shoulderAt(input.rig, [pelvisY, HIP[2] + 0.02], pitch, chestPitch);
  return {
    ...base,
    pelvisY,
    pelvisZ: HIP[2] + 0.02,
    pitch,
    roll: 0,
    chestPitch,
    neckPitch: 0.25 - input.personality.boldness * 0.08,
    headPitch: 0.42,
    paws: {
      frontL: { y: 0, z: shoulderZ + 0.01, angle: 0 },
      frontR: { y: 0, z: shoulderZ + 0.01, angle: 0 },
      hindL: { y: 0, z: HIP[2] + 0.08, angle: -Math.PI / 2 },
      hindR: { y: 0, z: HIP[2] + 0.08, angle: -Math.PI / 2 },
    },
    tailRoot: 0.55,
    tailBend: -0.02,
    tailHook: 0,
    tailSway: 0.03,
    tailCurl: 0.62 * curl,
    lids: base.lids + 0.1,
  };
}

function loaf(frame: Frame): Posture {
  const { input, frontZ, hindZ } = frame;
  const base = stand(frame);
  const breath = Math.sin((input.time * Math.PI * 2) / 4.2);
  const curl = input.seed % 2 === 0 ? 1 : -1;
  return {
    ...base,
    pelvisY: 0.083 + breath * 0.0015,
    pitch: 0.03,
    roll: 0,
    chestPitch: -0.03 + breath * 0.01,
    neckPitch: 0.15,
    headPitch: 0.05,
    paws: {
      frontL: { y: 0.025, z: frontZ + 0.0, angle: 1.7 },
      frontR: { y: 0.025, z: frontZ + 0.0, angle: 1.7 },
      hindL: { y: 0.0, z: hindZ + 0.07, angle: -Math.PI / 2 },
      hindR: { y: 0.0, z: hindZ + 0.07, angle: -Math.PI / 2 },
    },
    tailRoot: -0.32,
    tailBend: 0.02,
    tailHook: 0,
    tailSway: 0.025,
    tailCurl: 0.5 * curl,
    earsBack: base.earsBack * 0.5,
    lids: 0.35 + Math.max(0, -input.personality.energy) * 0.3,
  };
}

const POSTURES: Record<Activity, (frame: Frame) => Posture> = { stand, walk, sit, loaf };

function blendPosture(a: Posture, b: Posture, t: number): Posture {
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
  if (t > 0 && t < 1) for (const key of Object.keys(out.paws) as (keyof Posture["paws"])[]) out.paws[key].y += Math.sin(Math.PI * t) * 0.012;
  return out;
}

/** The idle's occasional movements, laid over any posture. */
function fidget(posture: Posture, input: MotionInput): Posture {
  const { time, seed, personality, activity } = input;
  const busy = (personality.energy + 1) / 2;
  const lookEvery = mix(9, 3.5, busy);
  const look = burst(seed, 1, time, lookEvery, mix(2.6, 1.6, busy), 0.85);
  const lookYaw = (look.value * 2 - 1) * 0.75 * look.amount * (activity === "walk" ? 0.4 : 1);
  const tilt = burst(seed, 2, time, 11, 2.2, 0.5);
  const twitch = burst(seed, 5, time, mix(6, 2, busy), 0.35, 0.8);
  const settle = activity === "loaf" ? 0.5 : 1;
  return {
    ...posture,
    headYaw: posture.headYaw + lookYaw * settle,
    headPitch: posture.headPitch - look.amount * 0.08 * (look.value - 0.3),
    headRoll: posture.headRoll + (tilt.value - 0.5) * 0.5 * tilt.amount,
    tailSway: posture.tailSway + twitch.amount * 0.12 * busy,
  };
}

function earTurns(side: Side, posture: Posture, input: MotionInput): Vec3 {
  const { time, seed, personality } = input;
  const busy = (personality.energy + 1) / 2;
  const flick = burst(seed, side === "L" ? 3 : 4, time, mix(7, 2.5, busy), 0.28, 0.75);
  const swivel = burst(seed, side === "L" ? 6 : 7, time, 8, 1.8, 0.5);
  const out = side === "L" ? -1 : 1;
  const back = posture.earsBack + flick.amount * 0.55;
  return [-back, swivel.amount * 0.6 * out * (swivel.value - 0.3), out * (posture.earsOut + flick.amount * 0.25)];
}

function blinkOf(posture: Posture, input: MotionInput): number {
  const { time, seed, personality } = input;
  const quick = burst(seed, 8, time, mix(5.5, 3, (personality.energy + 1) / 2), 0.17, 0.95).amount;
  const slow = personality.affection > 0 ? burst(seed, 9, time, 9, 1.4, personality.affection * 0.7).amount * 0.9 : 0;
  return clamp(Math.max(posture.lids, quick, slow), 0, 1);
}

/** The posture the cat holds at this moment: its activity, blended in from the last, with its fidgets. */
function postureAt(input: MotionInput): Posture {
  const frame = frameOf(input);
  const now = POSTURES[input.activity](frame);
  const t = smooth((input.time - input.since) / TRANSITION);
  const blended = t >= 1 ? now : blendPosture(POSTURES[input.previous](frame), now, t);
  const greeting = smooth(input.greeting);
  return fidget(
    {
      ...blended,
      tailRoot: mix(blended.tailRoot, 1.45 - blended.pitch, greeting),
      tailBend: mix(blended.tailBend, 0.02, greeting),
      tailHook: mix(blended.tailHook, 0.55, greeting),
      tailSway: mix(blended.tailSway, 0.05, greeting),
      tailCurl: mix(blended.tailCurl, 0, greeting),
      earsBack: blended.earsBack * (1 - greeting),
    },
    input,
  );
}

export function catPose(input: MotionInput): CatPose {
  const posture = postureAt(input);
  const { rig, time } = input;
  const rotations = new Map<BoneName, Vec3>();
  const pitch = posture.pitch;
  rotations.set("pelvis", [pitch, 0, posture.roll]);
  rotations.set("chest", [posture.chestPitch, posture.chestYaw, -posture.roll * 0.6]);
  rotations.set("neck", [posture.neckPitch, posture.headYaw * 0.4, 0]);
  rotations.set("head", [posture.headPitch, posture.headYaw * 0.6, posture.headRoll]);
  rotations.set("earL", earTurns("L", posture, input));
  rotations.set("earR", earTurns("R", posture, input));

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

  const swayRate = 1.3 + input.personality.energy * 0.5;
  for (let i = 0; i <= TAIL_SEGMENTS; i++) {
    const along = i / TAIL_SEGMENTS;
    const wave = Math.sin(time * swayRate - i * 0.7 + input.seed) * posture.tailSway * (0.35 + along);
    const bend = i === 0 ? posture.tailRoot : posture.tailBend + (i >= TAIL_SEGMENTS - 2 ? posture.tailHook : 0);
    rotations.set(`tail${i}` as TailBone, [bend, wave + (i === 0 ? 0 : posture.tailCurl), 0]);
  }
  return { pelvis: [0, posture.pelvisY, posture.pelvisZ], rotations, blink: blinkOf(posture, input) };
}

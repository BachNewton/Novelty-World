import { blendedPosture, clamp, gaitPaws, mix, smooth, solvePose, wander, type Gait, type PawName, type Pose, type Posture, type StepAngles } from "../animals/motion";
import { blinkOf, earTurns, lookRound, type Idle } from "../animals/idles";
import type { Rig } from "../animals/rig";
import type { DeerPersonality } from "./deer";
import { HIP } from "./rig";

/*
 * How a roe deer moves, on the shared four-legged motion: standing tall and
 * alert with its big ears turned out, a careful walk, a springy trot, a
 * bounding gallop with its legs gathered under it, grazing with its head
 * down to the grass (now and then lifting it to look round, chewing), and
 * lying bedded down with its legs folded under it and its head up.
 */

export type DeerActivity = "stand" | "walk" | "trot" | "run" | "graze" | "lie";
export const DEER_GAITS: readonly DeerActivity[] = ["walk", "trot", "run"];
export const DEER_ACTIVITIES: readonly DeerActivity[] = ["stand", "walk", "trot", "run", "graze", "lie"];

export interface DeerMotionInput {
  time: number;
  travelled: number;
  speed: number;
  activity: DeerActivity;
  previous: DeerActivity;
  since: number;
  greeting: number;
  personality: DeerPersonality;
  rig: Rig;
  seed: number;
}

interface Frame {
  input: DeerMotionInput;
  legs: number;
  hipHeight: number;
  frontZ: number;
  hindZ: number;
}

function frameOf(input: DeerMotionInput): Frame {
  const legs = input.rig.front[0] / 0.11;
  const chest = input.rig.offsets.get("chest") ?? [0, 0, 0.24];
  return { input, legs, hipHeight: 0.29 * legs, hindZ: HIP[2], frontZ: HIP[2] + chest[2] + 0.005 };
}

function stand({ input, hipHeight, frontZ, hindZ }: Frame): Posture {
  const breath = Math.sin((input.time * Math.PI * 2) / 3.2);
  return {
    pelvisY: hipHeight + breath * 0.001,
    pelvisZ: HIP[2],
    pitch: 0,
    roll: wander(input.seed, input.time, 0.3) * 0.012,
    yaw: 0,
    chestPitch: breath * 0.008,
    chestYaw: 0,
    neckPitch: -0.2 - input.personality.boldness * 0.05,
    headPitch: 0.3,
    headYaw: 0,
    headRoll: 0,
    paws: {
      frontL: { y: 0, z: frontZ, angle: 0 },
      frontR: { y: 0, z: frontZ, angle: 0 },
      hindL: { y: 0, z: hindZ - 0.03, angle: -0.3 },
      hindR: { y: 0, z: hindZ - 0.03, angle: -0.3 },
    },
    tailRoot: -0.4,
    tailBend: 0.1,
    tailHook: 0,
    tailSway: 0.02,
    tailCurl: 0,
    tailWag: 0,
    wagWhip: 0,
    earsBack: 0,
    earsOut: 0,
    lids: 0,
    jaw: 0,
    tongue: 0,
  };
}

const WALK_FRONT: StepAngles = { plant: 0, push: -0.3, pushStart: 0.55, pushRate: 2.4, fold: 1.3 };
const WALK_HIND: StepAngles = { plant: -0.25, push: 0.45, pushStart: 0.35, pushRate: 1.6, fold: 0.7 };
const RUN_FRONT: StepAngles = { plant: 0.15, push: -0.6, pushStart: 0.3, pushRate: 2, fold: 1.8 };
const RUN_HIND: StepAngles = { plant: -0.5, push: 0.7, pushStart: 0.2, pushRate: 1.6, fold: 1.1 };

const FOOTFALLS: Record<"walk" | "trot" | "run", Record<PawName, number>> = {
  walk: { hindL: 0, frontL: 0.25, hindR: 0.5, frontR: 0.75 },
  trot: { hindL: 0, frontR: 0.02, hindR: 0.5, frontL: 0.52 },
  // A roe deer's bound: both hind feet thrust together, the fore feet come down together.
  run: { hindL: 0, hindR: 0.04, frontL: 0.5, frontR: 0.54 },
};

function moving(gait: "walk" | "trot" | "run", frame: Frame): Posture {
  const { input, hipHeight, frontZ, hindZ, legs } = frame;
  const base = stand(frame);
  const speed = Math.max(input.speed, 0.05);
  const shape = {
    walk: { sweep: 0.2 * (0.85 + 0.2 * clamp(speed / 0.6, 0, 2)), duty: 0.62, lift: 0.05 },
    trot: { sweep: 0.24 * (0.9 + 0.12 * clamp(speed / 1.4, 0, 2)), duty: 0.44, lift: 0.07 },
    run: { sweep: 0.28 * (0.9 + 0.1 * clamp(speed / 3, 0, 2)), duty: 0.24, lift: 0.12 },
  }[gait];
  const g: Gait = { footfalls: FOOTFALLS[gait], duty: shape.duty, stride: shape.sweep * legs, lift: shape.lift * legs };
  const phase = (input.travelled * shape.duty) / g.stride;
  const cycle = phase * Math.PI * 2;
  const run = gait === "run";
  const flex = run ? Math.sin(cycle + 0.3) : 0;
  return {
    ...base,
    pelvisY: hipHeight + (run ? 0.04 * Math.max(0, Math.sin(cycle - 0.5)) * legs : gait === "trot" ? 0.006 * Math.abs(Math.sin(cycle)) : -0.003 * Math.sin(cycle * 2)),
    pitch: flex * 0.16,
    chestPitch: -flex * 0.18,
    neckPitch: base.neckPitch + (run ? 0.25 : gait === "trot" ? 0.1 : 0.05),
    headPitch: base.headPitch + (gait === "walk" ? 0.03 * Math.sin(cycle * 2) : -0.05),
    paws: gaitPaws(phase, g, { hindL: hindZ - 0.03, hindR: hindZ - 0.03, frontL: frontZ + 0.01, frontR: frontZ + 0.01 }, run ? { front: RUN_FRONT, hind: RUN_HIND } : { front: WALK_FRONT, hind: WALK_HIND }),
    tailRoot: run ? 0.6 : base.tailRoot,
    earsBack: run ? 0.5 : 0.1,
  };
}

/** Head down to the grass, nibbling, the front legs a little spread. */
function graze(frame: Frame): Posture {
  const base = stand(frame);
  const nibble = Math.sin(frame.input.time * 9 + frame.input.seed) * 0.03;
  return {
    ...base,
    pelvisY: base.pelvisY - 0.004,
    pitch: 0.04,
    neckPitch: 1.35,
    headPitch: 0.35 + nibble,
    paws: { ...base.paws, frontL: { ...base.paws.frontL, z: base.paws.frontL.z + 0.02 }, frontR: { ...base.paws.frontR, z: base.paws.frontR.z + 0.02 } },
    earsBack: 0.2,
  };
}

/** Bedded down: legs folded under, the head up and the ears turning. */
function lie(frame: Frame): Posture {
  const { frontZ, hindZ, legs } = frame;
  const base = stand(frame);
  const chew = Math.sin(frame.input.time * 4) * 0.015;
  return {
    ...base,
    pelvisY: 0.1 * legs,
    pitch: 0.02,
    neckPitch: -0.05,
    headPitch: 0.25 + chew,
    paws: {
      frontL: { y: 0.03, z: frontZ - 0.06, angle: -2.2 },
      frontR: { y: 0.03, z: frontZ - 0.06, angle: -2.2 },
      hindL: { y: 0, z: hindZ + 0.12 * legs, angle: -Math.PI / 2 },
      hindR: { y: 0, z: hindZ + 0.12 * legs, angle: -Math.PI / 2 },
    },
    lids: 0.25,
  };
}

/** A greeting from a deer that knows Elliott: its ears forward, its head stretched out to sniff. */
function greet(posture: Posture, amount: number): Posture {
  if (amount <= 0) return posture;
  return { ...posture, neckPitch: mix(posture.neckPitch, 0.35, amount), headPitch: mix(posture.headPitch, -0.15, amount), earsBack: mix(posture.earsBack, -0.15, amount) };
}

export function deerPose(input: DeerMotionInput): Pose {
  const frame = frameOf(input);
  const postures = {
    stand: () => stand(frame),
    walk: () => moving("walk", frame),
    trot: () => moving("trot", frame),
    run: () => moving("run", frame),
    graze: () => graze(frame),
    lie: () => lie(frame),
  };
  const blended = blendedPosture(postures, input.activity, input.previous, input.time, input.since, 0.02);
  const posture = greet(blended, smooth(input.greeting));
  const idle: Idle = { time: input.time, seed: input.seed, busy: 0.5 + 0.3 * Math.max(0, -input.personality.boldness) };
  const looked = lookRound(posture, idle, 0.7, true);
  return solvePose(looked, input.rig, {
    time: input.time,
    seed: input.seed,
    swayRate: 1.5,
    wagRate: 0,
    ears: { L: earTurns("L", looked, idle, 0.4), R: earTurns("R", looked, idle, 0.4) },
    blink: blinkOf(looked, idle),
  });
}

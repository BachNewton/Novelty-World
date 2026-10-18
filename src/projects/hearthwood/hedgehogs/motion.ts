import { blendedPosture, burst, clamp, gaitPaws, mix, smooth, solvePose, wander, type Gait, type Pose, type Posture, type StepAngles } from "../animals/motion";
import { blinkOf, lookRound, type Idle } from "../animals/idles";
import type { Rig, Vec3 } from "../animals/rig";
import type { HedgehogPersonality } from "./hedgehog";
import { HIP, SHOULDER } from "./rig";

/*
 * How a hedgehog moves, on the shared four-legged motion: standing with its
 * nose going, a quick-stepping trundle and, faster, a scurry, sitting up to
 * sniff the air, curled into a ball (startled, asleep, or riding in
 * Elliott's basket), and the same ball with its head poking out to peek. Its
 * snout is never still: it snuffles, twitches and lifts to the air.
 */

export type HedgehogActivity = "stand" | "walk" | "run" | "sit" | "lie" | "peek";
export const HEDGEHOG_GAITS: readonly HedgehogActivity[] = ["walk", "run"];
export const HEDGEHOG_ACTIVITIES: readonly HedgehogActivity[] = ["stand", "walk", "run", "sit", "lie", "peek"];

export interface HedgehogMotionInput {
  time: number;
  travelled: number;
  speed: number;
  activity: HedgehogActivity;
  previous: HedgehogActivity;
  since: number;
  greeting: number;
  personality: HedgehogPersonality;
  rig: Rig;
  seed: number;
}

const HIP_HEIGHT = 0.047;
const FRONT_Z = SHOULDER[2] + 0.004;
const HIND_Z = HIP[2] - 0.002;

function stand(input: HedgehogMotionInput): Posture {
  const { time, seed } = input;
  const breath = Math.sin((time * Math.PI * 2) / 1.6);
  // The nose always going: a quick twitch, and now and then a long snuffle along the ground.
  const snuffle = burst(seed, 10, time, 5, 2.4, 0.8).amount;
  const twitch = Math.sin(time * 17 + seed) * (0.03 + 0.05 * snuffle);
  return {
    pelvisY: HIP_HEIGHT + breath * 0.0006,
    pelvisZ: HIP[2],
    pitch: 0.04,
    roll: wander(seed, time, 0.5) * 0.02,
    yaw: 0,
    chestPitch: breath * 0.012,
    chestYaw: 0,
    neckPitch: 0.1 + snuffle * 0.25,
    headPitch: 0.08 + snuffle * 0.2 + twitch,
    headYaw: wander(seed + 3, time, 1.2) * 0.25 * snuffle,
    headRoll: 0,
    paws: {
      frontL: { y: 0, z: FRONT_Z, angle: 0 },
      frontR: { y: 0, z: FRONT_Z, angle: 0 },
      hindL: { y: 0, z: HIND_Z, angle: -0.15 },
      hindR: { y: 0, z: HIND_Z, angle: -0.15 },
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

const STEP_FRONT: StepAngles = { plant: 0, push: -0.3, pushStart: 0.5, pushRate: 2, fold: 0.8 };
const STEP_HIND: StepAngles = { plant: -0.1, push: 0.35, pushStart: 0.4, pushRate: 1.8, fold: 0.6 };

/** The trundle is a walk on short legs, lots of little steps; the scurry trots them in diagonal pairs. */
function moving(input: HedgehogMotionInput, gait: "walk" | "run"): Posture {
  const base = stand(input);
  const run = gait === "run";
  const duty = run ? 0.42 : 0.6;
  const g: Gait = {
    footfalls: run ? { hindL: 0, frontR: 0.02, hindR: 0.5, frontL: 0.52 } : { hindL: 0, frontL: 0.25, hindR: 0.5, frontR: 0.75 },
    duty,
    // Faster, its little legs reach further as well as quicker, as far as they can.
    stride: Math.min(0.07, (run ? 0.032 : 0.026) * (1 + Math.max(0, input.speed) * 1.5)),
    lift: run ? 0.012 : 0.009,
  };
  const phase = (input.travelled * duty) / g.stride;
  const cycle = phase * Math.PI * 2;
  return {
    ...base,
    pelvisY: HIP_HEIGHT - 0.001 + Math.abs(Math.sin(cycle)) * 0.0015,
    roll: Math.sin(cycle) * (run ? 0.05 : 0.07),
    chestYaw: Math.sin(cycle) * 0.06,
    neckPitch: 0.15,
    headPitch: 0.06 + Math.sin(cycle * 2) * 0.03,
    headYaw: 0,
    paws: gaitPaws(phase, g, { hindL: HIND_Z, hindR: HIND_Z, frontL: FRONT_Z, frontR: FRONT_Z }, { front: STEP_FRONT, hind: STEP_HIND }),
  };
}

/** Sitting back a little with its snout lifted to sniff the air. */
function sit(input: HedgehogMotionInput): Posture {
  const base = stand(input);
  const sniff = Math.sin(input.time * 15 + input.seed) * 0.05;
  return {
    ...base,
    pelvisY: HIP_HEIGHT - 0.004,
    pitch: -0.18,
    neckPitch: -0.35,
    headPitch: -0.35 + sniff,
    headYaw: wander(input.seed + 5, input.time, 0.6) * 0.3,
    paws: { ...base.paws, hindL: { y: 0, z: HIND_Z + 0.006, angle: -0.5 }, hindR: { y: 0, z: HIND_Z + 0.006, angle: -0.5 } },
  };
}

/** Rolled into a ball: the back bent right round, the head and legs tucked in under the spines. */
function curled(input: HedgehogMotionInput): Posture {
  const base = stand(input);
  const breath = Math.sin((input.time * Math.PI * 2) / 2.4);
  return {
    ...base,
    pelvisY: 0.034 + breath * 0.0008,
    pelvisZ: HIP[2] + 0.03,
    pitch: -1.2,
    roll: 0,
    chestPitch: 2.4 + breath * 0.02,
    chestYaw: 0,
    neckPitch: 0.9,
    headPitch: 0.7,
    headYaw: 0,
    paws: {
      frontL: { y: 0.03, z: FRONT_Z - 0.02, angle: -1.6 },
      frontR: { y: 0.03, z: FRONT_Z - 0.02, angle: -1.6 },
      hindL: { y: 0.026, z: HIND_Z + 0.03, angle: 1.4 },
      hindR: { y: 0.026, z: HIND_Z + 0.03, angle: 1.4 },
    },
    tailRoot: -1.2,
    tailSway: 0,
    lids: 0.9,
  };
}

/** The ball with its head poking out over the front to look about: riding in the basket. */
function peek(input: HedgehogMotionInput): Posture {
  const ball = curled(input);
  const twitch = Math.sin(input.time * 16 + input.seed) * 0.04;
  return { ...ball, chestPitch: ball.chestPitch - 0.7, neckPitch: -0.6, headPitch: -0.25 + twitch, headYaw: wander(input.seed + 7, input.time, 0.5) * 0.4, lids: 0 };
}

/** Greeting Elliott: the snout up and going, a happy little bob. */
function greet(posture: Posture, input: HedgehogMotionInput, amount: number): Posture {
  if (amount <= 0) return posture;
  const bob = Math.max(0, Math.sin(input.time * 6)) * 0.002;
  return {
    ...posture,
    pelvisY: posture.pelvisY + bob * amount,
    neckPitch: mix(posture.neckPitch, -0.25, amount),
    headPitch: mix(posture.headPitch, -0.2 + Math.sin(input.time * 18) * 0.05, amount),
  };
}

const earTurns = (posture: Posture): Vec3 => [-posture.earsBack, 0, 0];

export function hedgehogPose(input: HedgehogMotionInput): Pose {
  const postures = {
    stand: () => stand(input),
    walk: () => moving(input, "walk"),
    run: () => moving(input, "run"),
    sit: () => sit(input),
    lie: () => curled(input),
    peek: () => peek(input),
  };
  const blended = blendedPosture(postures, input.activity, input.previous, input.time, input.since, 0.004);
  // A ball doesn't greet; uncurled, it does.
  const open = input.activity === "lie" ? 0 : 1;
  const posture = greet(blended, input, smooth(input.greeting) * open);
  const idle: Idle = { time: input.time, seed: input.seed, busy: (input.personality.energy + 1) / 2 };
  const looked = lookRound(posture, idle, 0.5, true);
  return solvePose(looked, input.rig, {
    time: input.time,
    seed: input.seed,
    swayRate: 2,
    wagRate: 0,
    ears: { L: earTurns(looked), R: earTurns(looked) },
    blink: clamp(blinkOf(looked, idle), 0, 1),
  });
}

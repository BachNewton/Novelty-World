import { blendedPosture, gaitPaws, mix, smooth, solvePose, wander, type Gait, type PawName, type Pose, type Posture, type StepAngles } from "../animals/motion";
import { blinkOf, earTurns, lookRound, type Idle } from "../animals/idles";
import type { Rig } from "../animals/rig";
import type { HarePersonality } from "./hare";
import { HIP, SHOULDER } from "./rig";

/*
 * How a mountain hare moves, on the shared four-legged motion: crouched with
 * its long hind feet flat and its ears up, hopping (a gait of its own: the
 * forepaws come down one after the other, then the hind feet swing through
 * together, landing ahead of where the fore came down, the back curling and
 * stretching with each hop), sitting bolt upright to look about, and pressed
 * flat in its form with its ears laid back. Its nose twitches whatever it does.
 */

export type HareActivity = "stand" | "walk" | "run" | "sit" | "lie";
export const HARE_GAITS: readonly HareActivity[] = ["walk", "run"];
export const HARE_ACTIVITIES: readonly HareActivity[] = ["stand", "walk", "run", "sit", "lie"];

export interface HareMotionInput {
  time: number;
  travelled: number;
  speed: number;
  activity: HareActivity;
  previous: HareActivity;
  since: number;
  greeting: number;
  personality: HarePersonality;
  rig: Rig;
  seed: number;
}

const HIP_HEIGHT = 0.096;
const FRONT_Z = SHOULDER[2] + 0.01;
const HIND_Z = HIP[2] + 0.03;

function stand(input: HareMotionInput): Posture {
  const breath = Math.sin((input.time * Math.PI * 2) / 1.4);
  return {
    pelvisY: HIP_HEIGHT + breath * 0.0008,
    pelvisZ: HIP[2],
    pitch: -0.12,
    roll: wander(input.seed, input.time, 0.3) * 0.01,
    yaw: 0,
    chestPitch: 0.05 + breath * 0.01,
    chestYaw: 0,
    neckPitch: -0.2,
    headPitch: 0.25,
    headYaw: 0,
    headRoll: 0,
    paws: {
      frontL: { y: 0, z: FRONT_Z, angle: 0 },
      frontR: { y: 0, z: FRONT_Z, angle: 0 },
      // Long hind feet flat on the ground under the haunches.
      hindL: { y: 0, z: HIND_Z, angle: -Math.PI / 2 },
      hindR: { y: 0, z: HIND_Z, angle: -Math.PI / 2 },
    },
    tailRoot: 0.9,
    tailBend: 0.2,
    tailHook: 0,
    tailSway: 0,
    tailCurl: 0,
    tailWag: 0,
    wagWhip: 0,
    earsBack: 0.35,
    earsOut: 0.05,
    lids: 0,
    jaw: 0,
    tongue: 0,
  };
}

/** The hop: forepaws down one after the other, then both hind feet together, ahead of them. */
const HOP: Record<PawName, number> = { frontL: 0, frontR: 0.09, hindL: 0.42, hindR: 0.46 };
const HOP_FRONT: StepAngles = { plant: 0.15, push: -0.7, pushStart: 0.2, pushRate: 2, fold: 1.1 };
const HOP_HIND: StepAngles = { plant: -1.35, push: 0.3, pushStart: 0.25, pushRate: 1.6, fold: 0.4 };

function hopping(input: HareMotionInput, run: boolean): Posture {
  const base = stand(input);
  const speed = Math.max(0.2, input.speed);
  const duty = run ? 0.2 : 0.3;
  const g: Gait = { footfalls: HOP, duty, stride: Math.min(run ? 0.22 : 0.1, (run ? 0.08 : 0.05) * (1 + speed * 0.6)), lift: run ? 0.07 : 0.035 };
  const phase = (input.travelled * duty) / g.stride;
  const cycle = phase * Math.PI * 2;
  const flex = Math.sin(cycle + 0.6);
  return {
    ...base,
    pelvisY: HIP_HEIGHT + (run ? 0.03 : 0.016) * Math.max(0, Math.sin(cycle - 0.4)) + (run ? 0.01 : 0),
    pitch: -0.05 + flex * (run ? 0.3 : 0.18),
    chestPitch: -flex * (run ? 0.32 : 0.2),
    neckPitch: run ? 0.15 : -0.05,
    headPitch: run ? 0.0 : 0.2,
    paws: gaitPaws(phase, g, { frontL: FRONT_Z + 0.01, frontR: FRONT_Z + 0.01, hindL: HIND_Z + 0.03, hindR: HIND_Z + 0.03 }, { front: HOP_FRONT, hind: HOP_HIND }),
    earsBack: run ? 0.9 : 0.45,
  };
}

/** Bolt upright on its haunches to look round, the forepaws drawn up, the ears tall. */
function sit(input: HareMotionInput): Posture {
  const base = stand(input);
  return {
    ...base,
    pelvisY: 0.06,
    pelvisZ: HIP[2] + 0.02,
    pitch: -1.15,
    chestPitch: 0.1,
    neckPitch: 0.75,
    headPitch: 0.35,
    paws: {
      frontL: { y: 0.07, z: FRONT_Z - 0.06, angle: -0.9 },
      frontR: { y: 0.07, z: FRONT_Z - 0.06, angle: -0.9 },
      hindL: { y: 0, z: HIND_Z + 0.02, angle: -Math.PI / 2 },
      hindR: { y: 0, z: HIND_Z + 0.02, angle: -Math.PI / 2 },
    },
    tailRoot: 1.4,
    earsBack: 0.05,
  };
}

/** Pressed flat in its form, ears laid back along its back. */
function lie(input: HareMotionInput): Posture {
  const base = stand(input);
  return {
    ...base,
    pelvisY: 0.07,
    pitch: 0.02,
    chestPitch: 0,
    neckPitch: 0.05,
    headPitch: 0.1,
    paws: {
      frontL: { y: 0.004, z: FRONT_Z + 0.03, angle: -1.3 },
      frontR: { y: 0.004, z: FRONT_Z + 0.03, angle: -1.3 },
      hindL: { y: 0, z: HIND_Z, angle: -Math.PI / 2 },
      hindR: { y: 0, z: HIND_Z, angle: -Math.PI / 2 },
    },
    earsBack: 1.35,
    lids: 0.45,
  };
}

/** A greeting: up a little on its forelegs, ears tall and turned to Elliott, nose going. */
function greet(posture: Posture, amount: number): Posture {
  if (amount <= 0) return posture;
  return { ...posture, earsBack: mix(posture.earsBack, 0, amount), neckPitch: mix(posture.neckPitch, -0.35, amount) };
}

export function harePose(input: HareMotionInput): Pose {
  const postures = {
    stand: () => stand(input),
    walk: () => hopping(input, false),
    run: () => hopping(input, true),
    sit: () => sit(input),
    lie: () => lie(input),
  };
  const blended = blendedPosture(postures, input.activity, input.previous, input.time, input.since, 0.01);
  // The nose's twitch, a hare's whole face moving with it.
  const twitch = Math.sin(input.time * 19 + input.seed) * 0.018;
  const posture = greet({ ...blended, headPitch: blended.headPitch + twitch }, smooth(input.greeting));
  const idle: Idle = { time: input.time, seed: input.seed, busy: (input.personality.energy + 1) / 2 };
  const looked = lookRound(posture, idle, 0.6, true);
  return solvePose(looked, input.rig, {
    time: input.time,
    seed: input.seed,
    swayRate: 1,
    wagRate: 0,
    ears: { L: earTurns("L", looked, idle, 0.35), R: earTurns("R", looked, idle, 0.35) },
    blink: blinkOf(looked, idle),
  });
}

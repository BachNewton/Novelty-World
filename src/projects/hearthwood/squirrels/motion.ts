import { blendedPosture, burst, gaitPaws, mix, smooth, solvePose, type Gait, type Pose, type Posture, type StepAngles } from "../animals/motion";
import { blinkOf, earTurns, lookRound, type Idle } from "../animals/idles";
import type { Rig } from "../animals/rig";
import { HIP, SHOULDER } from "./rig";
import type { SquirrelPersonality } from "./squirrel";

/*
 * How a red squirrel moves, on the shared four-legged motion: crouched with
 * its tail curled up over its back in an S, bounding along the ground (the
 * hind feet landing ahead of the fore), sitting up on its haunches nibbling
 * at something held in its forepaws, flat on its belly to rest, and up a
 * trunk: climbing in bounds or clinging head-up with its tail laid flat and
 * its head turned to watch. The scene stands it on the trunk; this only
 * poses it there. Its tail flicks now and then whatever it does.
 */

export type SquirrelActivity = "stand" | "walk" | "run" | "sit" | "lie" | "climb" | "cling";
export const SQUIRREL_GAITS: readonly SquirrelActivity[] = ["walk", "run", "climb"];
export const SQUIRREL_ACTIVITIES: readonly SquirrelActivity[] = ["stand", "walk", "run", "sit", "lie", "climb", "cling"];

export interface SquirrelMotionInput {
  time: number;
  travelled: number;
  speed: number;
  activity: SquirrelActivity;
  previous: SquirrelActivity;
  since: number;
  greeting: number;
  personality: SquirrelPersonality;
  rig: Rig;
  seed: number;
}

const HIP_HEIGHT = 0.05;
const FRONT_Z = SHOULDER[2] + 0.004;
const HIND_Z = HIP[2] + 0.012;

function stand(input: SquirrelMotionInput): Posture {
  const breath = Math.sin((input.time * Math.PI * 2) / 0.9);
  return {
    pelvisY: HIP_HEIGHT + breath * 0.0004,
    pelvisZ: HIP[2],
    pitch: -0.08,
    roll: 0,
    yaw: 0,
    chestPitch: breath * 0.01,
    chestYaw: 0,
    neckPitch: -0.3,
    headPitch: 0.15,
    headYaw: 0,
    headRoll: 0,
    paws: {
      frontL: { y: 0, z: FRONT_Z, angle: 0 },
      frontR: { y: 0, z: FRONT_Z, angle: 0 },
      hindL: { y: 0, z: HIND_Z, angle: -Math.PI / 2 + 0.25 },
      hindR: { y: 0, z: HIND_Z, angle: -Math.PI / 2 + 0.25 },
    },
    // Up over the back in an S, its plume curling out at the end.
    tailRoot: 1.3,
    tailBend: 0.2,
    tailHook: -0.75,
    tailSway: 0.04,
    tailCurl: 0,
    tailWag: 0,
    wagWhip: 1,
    earsBack: 0,
    earsOut: 0,
    lids: 0,
    jaw: 0,
    tongue: 0,
  };
}

const BOUND_FRONT: StepAngles = { plant: 0.1, push: -0.6, pushStart: 0.3, pushRate: 2, fold: 1.2 };
const BOUND_HIND: StepAngles = { plant: -1.05, push: 0.2, pushStart: 0.2, pushRate: 1.6, fold: 0.15 };
/** The bound: the forepaws land, then the hind feet together ahead of where the fore came down. */
const BOUND = { frontL: 0, frontR: 0.06, hindL: 0.5, hindR: 0.53 };

function bounding(input: SquirrelMotionInput, climbing: boolean): Posture {
  const base = stand(input);
  const speed = Math.max(0.2, input.speed);
  const duty = 0.32;
  const g: Gait = { footfalls: BOUND, duty, stride: Math.min(0.09, 0.04 * (1 + speed)), lift: climbing ? 0.01 : 0.018 };
  const phase = (input.travelled * duty) / g.stride;
  const cycle = phase * Math.PI * 2;
  const flex = Math.sin(cycle + 0.4);
  return {
    ...base,
    pelvisY: HIP_HEIGHT - 0.004 + (climbing ? 0 : 0.012 * Math.max(0, Math.sin(cycle - 0.5))),
    pitch: flex * 0.25,
    chestPitch: -flex * 0.3,
    neckPitch: -0.1,
    headPitch: 0.05 - flex * 0.1,
    paws: gaitPaws(phase, g, { frontL: FRONT_Z + 0.01, frontR: FRONT_Z + 0.01, hindL: HIND_Z - 0.01, hindR: HIND_Z - 0.01 }, { front: BOUND_FRONT, hind: BOUND_HIND }),
    // Streaming out behind at speed, flat to the bark up a trunk.
    tailRoot: climbing ? -0.1 : 0.55,
    tailBend: climbing ? 0.02 : 0.05,
    tailHook: climbing ? 0 : 0.3,
  };
}

/** Up on its haunches, forepaws held to its mouth, nibbling. */
function sit(input: SquirrelMotionInput): Posture {
  const base = stand(input);
  const nibble = Math.sin(input.time * 22 + input.seed) * 0.04 * (0.5 + 0.5 * Math.sin(input.time * 1.3));
  return {
    ...base,
    pelvisY: 0.03,
    pelvisZ: HIP[2] + 0.01,
    pitch: -1.15,
    chestPitch: 0.15,
    neckPitch: 0.55,
    headPitch: 0.45 + nibble,
    paws: {
      frontL: { y: 0.062, z: FRONT_Z - 0.035, angle: -1.3 },
      frontR: { y: 0.062, z: FRONT_Z - 0.035, angle: -1.3 },
      hindL: { y: 0, z: HIND_Z + 0.03, angle: -Math.PI / 2 },
      hindR: { y: 0, z: HIND_Z + 0.03, angle: -Math.PI / 2 },
    },
    tailRoot: 1.0,
    tailBend: -0.1,
    tailHook: 0.6,
  };
}

function lie(input: SquirrelMotionInput): Posture {
  const base = stand(input);
  return {
    ...base,
    pelvisY: 0.03,
    pitch: 0,
    neckPitch: 0.1,
    headPitch: 0.1,
    paws: {
      frontL: { y: 0.004, z: FRONT_Z + 0.02, angle: -1.4 },
      frontR: { y: 0.004, z: FRONT_Z + 0.02, angle: -1.4 },
      hindL: { y: 0, z: HIND_Z + 0.01, angle: -Math.PI / 2 },
      hindR: { y: 0, z: HIND_Z + 0.01, angle: -Math.PI / 2 },
    },
    tailRoot: 0.3,
    tailBend: 0.12,
    tailHook: 0.2,
    lids: 0.4,
  };
}

/** Clinging to the bark head-up, the tail flat against it, the head turned to watch. */
function cling(input: SquirrelMotionInput): Posture {
  const base = stand(input);
  return {
    ...base,
    pelvisY: 0.04,
    pitch: 0.05,
    neckPitch: -0.45,
    headPitch: -0.1,
    headYaw: 0.7 * (input.seed % 2 === 0 ? 1 : -1),
    paws: {
      frontL: { y: 0, z: FRONT_Z + 0.012, angle: 0.3 },
      frontR: { y: 0, z: FRONT_Z + 0.012, angle: 0.3 },
      hindL: { y: 0, z: HIND_Z + 0.004, angle: -1.3 },
      hindR: { y: 0, z: HIND_Z + 0.004, angle: -1.3 },
    },
    tailRoot: -0.15,
    tailBend: 0.02,
    tailHook: -0.1,
  };
}

/** A greeting: up on its toes, ears forward, tail flicking. */
function greet(posture: Posture, amount: number): Posture {
  if (amount <= 0) return posture;
  return { ...posture, neckPitch: mix(posture.neckPitch, -0.45, amount), tailWag: Math.max(posture.tailWag, 0.35 * amount) };
}

export function squirrelPose(input: SquirrelMotionInput): Pose {
  const postures = {
    stand: () => stand(input),
    walk: () => bounding(input, false),
    run: () => bounding(input, false),
    sit: () => sit(input),
    lie: () => lie(input),
    climb: () => bounding(input, true),
    cling: () => cling(input),
  };
  const blended = blendedPosture(postures, input.activity, input.previous, input.time, input.since, 0.006);
  // The flick: a quick ripple of the tail, now and then, whatever it is doing.
  const flick = burst(input.seed, 13, input.time, 2.6, 0.45, 0.7).amount;
  const flicked = { ...blended, tailWag: blended.tailWag + flick * 0.5 };
  const posture = greet(flicked, smooth(input.greeting));
  const idle: Idle = { time: input.time, seed: input.seed, busy: (input.personality.energy + 1) / 2 };
  const looked = lookRound(posture, idle, 0.8, true);
  return solvePose(looked, input.rig, {
    time: input.time,
    seed: input.seed,
    swayRate: 2.2,
    wagRate: 24,
    ears: { L: earTurns("L", looked, idle, 0.3), R: earTurns("R", looked, idle, 0.3) },
    blink: blinkOf(looked, idle),
  });
}

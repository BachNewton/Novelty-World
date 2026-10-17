import { blendedPosture, burst, clamp, gaitPaws, mix, shoulderAt, smooth, solvePose, wander, type Pose, type Posture } from "../animals/motion";
import type { Rig, Side, Vec3 } from "../animals/rig";
import type { Personality } from "./cat";
import { HIP } from "./rig";

/*
 * How a cat moves, on the shared four-legged motion (`animals/motion.ts`):
 * its postures for standing, walking, sitting and loafing, the tail up in
 * greeting, and its fidgets, as pure functions of its clock.
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
  rig: Rig;
  /** A number from the cat's seed, so no two cats fidget in step. */
  seed: number;
}

export type CatPose = Pose;

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

const STILL = { yaw: 0, tailWag: 0, wagWhip: 0, jaw: 0, tongue: 0 } as const;

function stand({ input, hipHeight, frontZ, hindZ }: Frame): Posture {
  const { time, seed, personality } = input;
  const bold = personality.boldness;
  const lazy = -personality.energy;
  const breath = Math.sin((time * Math.PI * 2) / (3.2 + lazy * 0.8));
  const shift = wander(seed, time, 0.35) * 0.012;
  const crouch = Math.max(0, -bold) * 0.016;
  return {
    ...STILL,
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
// Late in the stance the hock rises over the planted paw, and the wrist bends as the fore leg leans back;
// each swing lands as the next stance begins: a hind foot folds up behind, a fore paw flicks back.
const HIND_STEP = { plant: -0.15, push: 0.35, pushStart: 0.35, pushRate: 1.6, fold: 0.5 };
const FRONT_STEP = { plant: 0, push: -0.25, pushStart: 0.6, pushRate: 2.5, fold: 0.9 };

function walk(frame: Frame): Posture {
  const { input, hipHeight, frontZ, hindZ } = frame;
  const legs = frame.hipHeight / 0.205;
  const base = stand(frame);
  const speed = Math.max(input.speed, 0.05);
  const stride = 0.24 * legs * (0.85 + 0.2 * clamp(speed / 0.6, 0, 2));
  const phase = input.travelled / stride;
  const duty = clamp(0.66 - speed * 0.08, 0.5, 0.66);
  const lift = 0.03 * legs;
  const bob = Math.sin(phase * Math.PI * 4);
  const sway = Math.sin(phase * Math.PI * 2);
  return {
    ...base,
    pelvisY: hipHeight - 0.004 - 0.003 * bob,
    pitch: 0.03,
    roll: sway * 0.04,
    chestYaw: sway * 0.05,
    neckPitch: base.neckPitch + 0.04,
    headPitch: base.headPitch + 0.02 * bob,
    paws: gaitPaws(
      phase,
      { footfalls: WALK_ORDER, duty, stride, lift },
      { hindL: hindZ - 0.02, hindR: hindZ - 0.02, frontL: frontZ + 0.01, frontR: frontZ + 0.01 },
      { front: FRONT_STEP, hind: HIND_STEP },
    ),
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
  const postures = { stand: () => stand(frame), walk: () => walk(frame), sit: () => sit(frame), loaf: () => loaf(frame) };
  const blended = blendedPosture(postures, input.activity, input.previous, input.time, input.since, 0.012);
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
  return solvePose(posture, input.rig, {
    time: input.time,
    seed: input.seed,
    swayRate: 1.3 + input.personality.energy * 0.5,
    wagRate: 0,
    ears: { L: earTurns("L", posture, input), R: earTurns("R", posture, input) },
    blink: blinkOf(posture, input),
  });
}

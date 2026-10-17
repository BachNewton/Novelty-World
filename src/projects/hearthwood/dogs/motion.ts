import { blendedPosture, burst, clamp, gaitPaws, mix, shoulderAt, smooth, solvePose, wander, type Gait, type PawName, type Pose, type Posture, type StepAngles } from "../animals/motion";
import type { Rig, Side, Vec3 } from "../animals/rig";
import type { EarType, Personality, TailType } from "./dog";
import { HIP } from "./rig";

/*
 * How a dog moves, on the shared four-legged motion (`animals/motion.ts`):
 * standing, a walk, a trot and a bounding run, sitting and lying down, and a
 * happy greeting with its tail going, as pure functions of its clock. Its
 * idles are a dog's: panting, ear flicks, a head tilted at something, a look
 * round, and its nose down to the ground. Its personality colours all of it:
 * a bold dog carries its head and tail high, a shy one low with its ears back;
 * a playful dog bounces, wags and looks about more; a cuddly one wags at
 * nothing much.
 */

export type DogActivity = "stand" | "walk" | "trot" | "run" | "sit" | "lie";
export const GAITS: readonly DogActivity[] = ["walk", "trot", "run"];

export interface DogMotionInput {
  /** The dog's own clock, in seconds. */
  time: number;
  /** How far it has moved, in its own metres (world metres over its size): the stride follows it. */
  travelled: number;
  /** In its own metres a second. */
  speed: number;
  activity: DogActivity;
  previous: DogActivity;
  since: number;
  /** How far into a happy greeting, 0 to 1. */
  greeting: number;
  personality: Personality;
  rig: Rig;
  tail: TailType;
  ears: EarType;
  /** A number from the dog's seed, so no two dogs fidget in step. */
  seed: number;
}

interface Frame {
  input: DogMotionInput;
  legs: number;
  hipHeight: number;
  frontZ: number;
  hindZ: number;
}

function frameOf(input: DogMotionInput): Frame {
  const { rig } = input;
  const legs = rig.front[0] / 0.088;
  const chest = rig.offsets.get("chest") ?? [0, 0, 0.23];
  return { input, legs, hipHeight: 0.226 * legs, hindZ: HIP[2], frontZ: HIP[2] + chest[2] + 0.005 };
}

/** How each kind of tail hangs at rest: its root's pitch, the bend at each segment, the hook at its end, how stiff its wag is. */
const CARRIAGE: Record<TailType, { root: number; bend: number; hook: number; whip: number }> = {
  // Up and over the back, curling down onto it.
  curled: { root: 2.0, bend: 0.62, hook: 0.25, whip: 0.15 },
  plumed: { root: -1.05, bend: 0.2, hook: 0.16, whip: 1 },
  sabre: { root: -1.25, bend: 0.17, hook: 0.12, whip: 1 },
  straight: { root: -0.45, bend: 0.03, hook: 0, whip: 1 },
};

/** How high the tail is held for the dog's mood: a bold dog's higher, a shy one's tucked. A curl only loosens. */
function tailRootFor(tail: TailType, lift: number): number {
  const { root } = CARRIAGE[tail];
  return tail === "curled" ? root - Math.max(0, -lift) * 0.7 : root + lift * 0.3;
}

function stand({ input, hipHeight, frontZ, hindZ, legs }: Frame): Posture {
  const { time, seed, personality, tail } = input;
  const bold = personality.boldness;
  const calm = -personality.playfulness;
  const breath = Math.sin((time * Math.PI * 2) / (2.6 + calm * 0.6));
  const shift = wander(seed, time, 0.4) * 0.01;
  const crouch = Math.max(0, -bold) * 0.018 * legs;
  const carriage = CARRIAGE[tail];
  // A happy dog's tail is seldom quite still.
  const content = clamp(0.06 + Math.max(0, personality.affection) * 0.12 + Math.max(0, personality.playfulness) * 0.1, 0, 0.3);
  return {
    pelvisY: hipHeight - crouch + breath * 0.0012,
    pelvisZ: HIP[2],
    pitch: crouch * 0.6,
    roll: shift * 1.5,
    yaw: 0,
    chestPitch: breath * 0.01,
    chestYaw: 0,
    neckPitch: -0.22 - bold * 0.12 + crouch * 6,
    headPitch: 0.16 + Math.max(0, -bold) * 0.12,
    headYaw: 0,
    headRoll: 0,
    paws: {
      frontL: { y: 0, z: frontZ, angle: 0 },
      frontR: { y: 0, z: frontZ, angle: 0 },
      hindL: { y: 0, z: hindZ - 0.035, angle: -0.28 },
      hindR: { y: 0, z: hindZ - 0.035, angle: -0.28 },
    },
    tailRoot: tailRootFor(tail, bold),
    tailBend: carriage.bend,
    tailHook: carriage.hook,
    tailSway: 0.04,
    tailCurl: tail === "curled" ? (seed % 2 === 0 ? 0.1 : -0.1) : 0,
    tailWag: content,
    wagWhip: carriage.whip,
    earsBack: Math.max(0, -bold) * 0.45,
    earsOut: Math.max(0, -bold) * 0.2,
    lids: Math.max(0, calm) * 0.12,
    jaw: 0,
    tongue: 0,
  };
}

const FRONT_STEP: StepAngles = { plant: 0, push: -0.3, pushStart: 0.55, pushRate: 2.4, fold: 1.0 };
const HIND_STEP: StepAngles = { plant: -0.2, push: 0.4, pushStart: 0.35, pushRate: 1.6, fold: 0.6 };
const RUN_FRONT: StepAngles = { plant: 0.1, push: -0.5, pushStart: 0.3, pushRate: 2, fold: 1.3 };
const RUN_HIND: StepAngles = { plant: -0.4, push: 0.6, pushStart: 0.2, pushRate: 1.6, fold: 0.8 };

/** Footfalls in each gait: the walk a lateral sequence like a cat's, the trot in diagonal pairs, the run a rotary gallop, hinds then fores. */
const FOOTFALLS: Record<"walk" | "trot" | "run", Record<PawName, number>> = {
  walk: { hindL: 0, frontL: 0.25, hindR: 0.5, frontR: 0.75 },
  trot: { hindL: 0, frontR: 0.02, hindR: 0.5, frontL: 0.52 },
  run: { hindL: 0, hindR: 0.1, frontL: 0.45, frontR: 0.56 },
};

function moving(gait: "walk" | "trot" | "run", frame: Frame): Posture {
  const { input, hipHeight, frontZ, hindZ, legs } = frame;
  const base = stand(frame);
  const speed = Math.max(input.speed, 0.05);
  const { personality } = input;
  const play = Math.max(0, personality.playfulness);
  // A paw on the ground stays planted, so it sweeps back only as far as the body goes while it is down:
  // the sweep is the cycle's length times the share of it the paw is down.
  const shape = {
    walk: { sweep: 0.17 * (0.85 + 0.2 * clamp(speed / 0.6, 0, 2)), duty: clamp(0.66 - speed * 0.08, 0.52, 0.66), lift: 0.032 },
    trot: { sweep: 0.2 * (0.9 + 0.12 * clamp(speed / 1.2, 0, 2)), duty: 0.46, lift: 0.045 },
    run: { sweep: 0.22 * (0.9 + 0.1 * clamp(speed / 2.4, 0, 2)), duty: 0.3, lift: 0.07 },
  }[gait];
  const g: Gait = { footfalls: FOOTFALLS[gait], duty: shape.duty, stride: shape.sweep * legs, lift: shape.lift * legs };
  const phase = (input.travelled * shape.duty) / g.stride;
  const cycle = phase * Math.PI * 2;
  const run = gait === "run";
  const paws = gaitPaws(
    phase,
    g,
    { hindL: hindZ - 0.035, hindR: hindZ - 0.035, frontL: frontZ + 0.01, frontR: frontZ + 0.01 },
    run ? { front: RUN_FRONT, hind: RUN_HIND } : { front: FRONT_STEP, hind: HIND_STEP },
  );
  // The walk rocks gently with each step; the trot springs once each diagonal pair pushes off; the run flexes the whole spine.
  const bob = gait === "walk" ? -0.003 * Math.sin(cycle * 2) : gait === "trot" ? 0.006 * Math.abs(Math.sin(cycle)) * (1 + play * 0.6) - 0.004 : 0.016 * Math.sin(cycle - 0.6);
  const sway = Math.sin(cycle);
  const flex = run ? Math.sin(cycle + 0.3) : 0;
  const level = gait === "walk" ? 0 : run ? 0.55 : 0.25;
  const carriage = CARRIAGE[input.tail];
  return {
    ...base,
    pelvisY: hipHeight - 0.004 * legs + bob * legs - (run ? 0.012 * legs : 0),
    pitch: (run ? 0.06 : 0.02) + flex * 0.12,
    roll: sway * (gait === "walk" ? 0.035 : 0.015),
    chestPitch: -flex * 0.18,
    chestYaw: sway * (gait === "walk" ? 0.05 : 0.02),
    neckPitch: base.neckPitch + (gait === "walk" ? 0.06 : run ? 0.35 : 0.18),
    headPitch: base.headPitch + (gait === "walk" ? 0.015 * Math.sin(cycle * 2) : run ? -0.2 - flex * 0.1 : -0.05),
    paws,
    // At speed the tail streams out behind, a curl loosening into a flag.
    tailRoot: mix(base.tailRoot, input.tail === "curled" ? 1.4 : -0.1 + personality.boldness * 0.2, level),
    tailBend: mix(base.tailBend, input.tail === "curled" ? 0.4 : 0.05, level),
    tailHook: carriage.hook * (1 - level),
    tailWag: base.tailWag * (run ? 0.2 : 0.8) + (gait === "trot" ? play * 0.12 : 0),
    tailSway: 0.04 + (run ? 0.1 : 0),
    earsBack: base.earsBack + level * 0.45,
    lids: 0,
    jaw: run ? 0.3 : gait === "trot" ? 0.12 : 0,
    tongue: run ? 1 : gait === "trot" ? 0.5 : 0,
  };
}

function sit(frame: Frame): Posture {
  const { input, legs } = frame;
  const base = stand(frame);
  const pitch = -0.72;
  const pelvisY = 0.078 * legs;
  const chestPitch = 0.1;
  const curl = input.seed % 2 === 0 ? 1 : -1;
  // The front paws stand under the raised shoulders.
  const [, shoulderZ] = shoulderAt(input.rig, [pelvisY, HIP[2] + 0.02], pitch, chestPitch);
  const curled = input.tail === "curled";
  return {
    ...base,
    pelvisY,
    pelvisZ: HIP[2] + 0.02,
    pitch,
    roll: 0,
    chestPitch,
    neckPitch: 0.05 - input.personality.boldness * 0.1,
    headPitch: 0.55,
    paws: {
      frontL: { y: 0, z: shoulderZ + 0.012, angle: 0 },
      frontR: { y: 0, z: shoulderZ + 0.012, angle: 0 },
      hindL: { y: 0, z: HIP[2] + 0.085 * legs, angle: -Math.PI / 2 },
      hindR: { y: 0, z: HIP[2] + 0.085 * legs, angle: -Math.PI / 2 },
    },
    // A curled tail stays on the back; any other lies out on the ground beside the dog, its wag sweeping it.
    tailRoot: curled ? 2.4 : 0.62,
    tailBend: curled ? 0.45 : -0.03,
    tailHook: 0,
    tailCurl: curled ? base.tailCurl : 0.45 * curl,
    wagWhip: curled ? 0.15 : 0.6,
  };
}

function lie(frame: Frame): Posture {
  const { input, frontZ, hindZ, legs } = frame;
  const base = stand(frame);
  const breath = Math.sin((input.time * Math.PI * 2) / 3.4);
  const curl = input.seed % 2 === 0 ? 1 : -1;
  const curled = input.tail === "curled";
  return {
    ...base,
    pelvisY: 0.088 + breath * 0.0015,
    pitch: 0.02,
    roll: 0,
    chestPitch: -0.02 + breath * 0.01,
    neckPitch: 0.05 - input.personality.boldness * 0.08,
    headPitch: 0.15,
    // Down like a sphinx: the forearms flat on the ground, paws out in front.
    paws: {
      frontL: { y: 0.012, z: frontZ + 0.12 * legs, angle: -1.45 },
      frontR: { y: 0.012, z: frontZ + 0.12 * legs, angle: -1.45 },
      hindL: { y: 0, z: hindZ + 0.075 * legs, angle: -Math.PI / 2 },
      hindR: { y: 0, z: hindZ + 0.075 * legs, angle: -Math.PI / 2 },
    },
    tailRoot: curled ? 2.2 : -0.25,
    tailBend: curled ? 0.5 : 0.04,
    tailHook: 0,
    tailCurl: curled ? base.tailCurl : 0.5 * curl,
    tailWag: base.tailWag * 0.6,
    wagWhip: curled ? 0.15 : 0.6,
    earsBack: base.earsBack * 0.6,
    lids: 0.15 + Math.max(0, -input.personality.playfulness) * 0.3,
  };
}

/** A happy greeting: the tail up and going, the hips wiggling with it, ears soft, a grin. */
function greet(posture: Posture, input: DogMotionInput, amount: number): Posture {
  if (amount <= 0) return posture;
  const { time, personality, tail } = input;
  const play = (personality.playfulness + 1) / 2;
  const wiggle = Math.sin(time * wagRateOf(input) + input.seed + Math.PI) * 0.09 * (0.5 + play);
  const bounce = Math.max(0, Math.sin(time * 5.5)) * 0.008 * play * (input.activity === "stand" ? 1 : 0);
  return {
    ...posture,
    pelvisY: posture.pelvisY + bounce * amount,
    yaw: posture.yaw + wiggle * amount * (input.activity === "stand" ? 1 : 0.3),
    neckPitch: posture.neckPitch - 0.08 * amount,
    tailRoot: mix(posture.tailRoot, tail === "curled" ? posture.tailRoot : tailRootFor(tail, 0.9), amount),
    tailWag: mix(posture.tailWag, (tail === "curled" ? 0.35 : 0.6) + play * 0.25, amount),
    earsBack: mix(posture.earsBack, 0.55, amount),
    earsOut: mix(posture.earsOut, 0.15, amount),
    jaw: Math.max(posture.jaw, 0.16 * amount),
    tongue: Math.max(posture.tongue, 0.7 * amount),
    lids: mix(posture.lids, 0.18, amount),
  };
}

const wagRateOf = (input: DogMotionInput) => 13 + input.personality.playfulness * 3;

/** The idle's occasional movements, laid over any posture. */
function fidget(posture: Posture, input: DogMotionInput): Posture {
  const { time, seed, personality, activity } = input;
  const busy = (personality.playfulness + 1) / 2;
  const still = activity === "stand" || activity === "sit" || activity === "lie";
  const look = burst(seed, 1, time, mix(8, 3.5, busy), mix(2.4, 1.5, busy), 0.85);
  const lookYaw = (look.value * 2 - 1) * 0.8 * look.amount * (still ? 1 : 0.3);
  // The head tilt at something heard, the most doggish of looks.
  const tilt = burst(seed, 2, time, 9, 2.0, mix(0.35, 0.75, busy));
  const tiltRoll = (tilt.value < 0.5 ? -1 : 1) * 0.38 * tilt.amount * (still ? 1 : 0);
  // Nose down to the ground, snuffling, while standing.
  const sniff = activity === "stand" ? burst(seed, 10, time, 13, 3.2, 0.55).amount * (1 - smooth(input.greeting)) : 0;
  const snuffle = Math.sin(time * 19) * 0.035 * sniff;
  const pant = still ? burst(seed, 11, time, 11, 5, mix(0.3, 0.7, busy)).amount : 0;
  const pantBreath = Math.sin(time * 16) * 0.006 * Math.max(pant, posture.tongue);
  return {
    ...posture,
    chestPitch: posture.chestPitch + pantBreath,
    neckPitch: posture.neckPitch + sniff * 1.05,
    headYaw: posture.headYaw + lookYaw * (1 - sniff),
    headPitch: posture.headPitch - look.amount * 0.06 * (look.value - 0.3) + sniff * 0.35 + snuffle - tilt.amount * 0.05,
    headRoll: posture.headRoll + tiltRoll,
    jaw: Math.max(posture.jaw, pant * 0.24) * (1 - sniff),
    tongue: Math.max(posture.tongue, pant) * (1 - sniff),
  };
}

function earTurns(side: Side, posture: Posture, input: DogMotionInput, gaitBob: number): Vec3 {
  const { time, seed, personality, ears } = input;
  const busy = (personality.playfulness + 1) / 2;
  const out = side === "L" ? -1 : 1;
  if (ears === "drop") {
    // A dropped ear hangs and swings: back as the dog speeds up or is pleased, out a little as it bobs or tilts its head.
    const swing = gaitBob * 0.25 + posture.headRoll * -0.5 * out;
    return [posture.earsBack * 0.6, 0, -out * (posture.earsOut * 0.5 + swing * out)];
  }
  const flick = burst(seed, side === "L" ? 3 : 4, time, mix(7, 3, busy), 0.25, 0.7);
  const swivel = burst(seed, side === "L" ? 6 : 7, time, 7, 1.6, 0.55);
  const soft = ears === "fold" ? 0.6 : 1;
  const back = (posture.earsBack + flick.amount * 0.45) * soft;
  return [-back, swivel.amount * 0.55 * out * (swivel.value - 0.3), out * (posture.earsOut + flick.amount * 0.2)];
}

function blinkOf(posture: Posture, input: DogMotionInput): number {
  const quick = burst(input.seed, 8, input.time, mix(5, 3, (input.personality.playfulness + 1) / 2), 0.16, 0.95).amount;
  return clamp(Math.max(posture.lids, quick), 0, 1);
}

export function dogPose(input: DogMotionInput): Pose {
  const frame = frameOf(input);
  const postures = {
    stand: () => stand(frame),
    walk: () => moving("walk", frame),
    trot: () => moving("trot", frame),
    run: () => moving("run", frame),
    sit: () => sit(frame),
    lie: () => lie(frame),
  };
  const blended = blendedPosture(postures, input.activity, input.previous, input.time, input.since, 0.016);
  const posture = fidget(greet(blended, input, smooth(input.greeting)), input);
  const gaitBob = GAITS.includes(input.activity) ? Math.sin((input.travelled / 0.3) * Math.PI * 2) : 0;
  return solvePose(posture, input.rig, {
    time: input.time,
    seed: input.seed,
    swayRate: 1.1,
    wagRate: wagRateOf(input),
    ears: { L: earTurns("L", posture, input, gaitBob), R: earTurns("R", posture, input, gaitBob) },
    blink: blinkOf(posture, input),
  });
}

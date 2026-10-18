import { blendedPosture, blendPosture, clamp, gaitPaws, mix, shoulderAt, smooth, solvePose, wander, type Gait, type Paw, type PawName, type Pose, type Posture, type StepAngles } from "../animals/motion";
import { blinkOf, earTurns, keyed, lookRound, occasion, type Idle } from "../animals/idles";
import type { Rig } from "../animals/rig";
import type { FoxPersonality } from "./fox";
import { HIP } from "./rig";

/*
 * How a fox moves, on the shared four-legged motion (`animals/motion.ts`):
 * standing alert with its brush held low, a walk, the light floating trot a
 * fox crosses country in with its tail streamed out behind, a gallop,
 * sitting with its brush round its paws, lying curled, and the mousing
 * pounce: ears forward, a listen, a leap straight up and a dive nose-first
 * into the grass. A shy fox crouches with its ears back; a playful one
 * pounces at nothing much. A greeting is a fox's: head low, ears soft, a
 * slow low wag and a grin.
 */

export type FoxActivity = "stand" | "walk" | "trot" | "run" | "sit" | "lie" | "pounce";
export const FOX_GAITS: readonly FoxActivity[] = ["walk", "trot", "run"];
export const FOX_ACTIVITIES: readonly FoxActivity[] = ["stand", "walk", "trot", "run", "sit", "lie", "pounce"];

export interface FoxMotionInput {
  time: number;
  /** How far it has moved, in its own metres (world metres over its size): the stride follows it. */
  travelled: number;
  /** In its own metres a second. */
  speed: number;
  activity: FoxActivity;
  previous: FoxActivity;
  since: number;
  /** How far into a greeting, 0 to 1. */
  greeting: number;
  personality: FoxPersonality;
  rig: Rig;
  seed: number;
}

interface Frame {
  input: FoxMotionInput;
  legs: number;
  hipHeight: number;
  frontZ: number;
  hindZ: number;
}

function frameOf(input: FoxMotionInput): Frame {
  const legs = input.rig.front[0] / 0.086;
  const chest = input.rig.offsets.get("chest") ?? [0, 0, 0.25];
  return { input, legs, hipHeight: 0.222 * legs, hindZ: HIP[2], frontZ: HIP[2] + chest[2] + 0.005 };
}

/** A posture moved by some amounts: its numbers added to, its paws shifted. */
function shifted(base: Posture, by: Partial<Omit<Posture, "paws">>, paws: Partial<Record<PawName, Partial<Paw>>> = {}): Posture {
  const out = { ...base, paws: { ...base.paws } };
  for (const [key, value] of Object.entries(by) as [keyof Omit<Posture, "paws">, number][]) out[key] = base[key] + value;
  for (const [name, change] of Object.entries(paws) as [PawName, Partial<Paw>][]) {
    const paw = base.paws[name];
    out.paws[name] = { y: paw.y + (change.y ?? 0), z: paw.z + (change.z ?? 0), angle: paw.angle + (change.angle ?? 0) };
  }
  return out;
}

function stand({ input, hipHeight, frontZ, hindZ, legs }: Frame): Posture {
  const { time, seed, personality } = input;
  const bold = personality.boldness;
  const breath = Math.sin((time * Math.PI * 2) / 2.8);
  const shift = wander(seed, time, 0.4) * 0.01;
  const crouch = Math.max(0, -bold) * 0.016 * legs;
  return {
    pelvisY: hipHeight - crouch + breath * 0.0011,
    pelvisZ: HIP[2],
    pitch: crouch * 0.5,
    roll: shift * 1.4,
    yaw: 0,
    chestPitch: breath * 0.01,
    chestYaw: 0,
    neckPitch: -0.28 - bold * 0.1 + crouch * 6,
    headPitch: 0.2 + Math.max(0, -bold) * 0.1,
    headYaw: 0,
    headRoll: 0,
    paws: {
      frontL: { y: 0, z: frontZ, angle: 0 },
      frontR: { y: 0, z: frontZ, angle: 0 },
      hindL: { y: 0, z: hindZ - 0.03, angle: -0.26 },
      hindR: { y: 0, z: hindZ - 0.03, angle: -0.26 },
    },
    // The brush hangs low behind, curving up towards its tip; lower still when shy.
    tailRoot: -0.7 + bold * 0.2,
    tailBend: 0.07,
    tailHook: 0.12,
    tailSway: 0.05,
    tailCurl: 0,
    tailWag: 0,
    wagWhip: 0.6,
    earsBack: Math.max(0, -bold) * 0.5,
    earsOut: Math.max(0, -bold) * 0.2,
    lids: 0,
    jaw: 0,
    tongue: 0,
  };
}

const WALK_FRONT: StepAngles = { plant: 0, push: -0.3, pushStart: 0.55, pushRate: 2.4, fold: 1.0 };
const WALK_HIND: StepAngles = { plant: -0.2, push: 0.4, pushStart: 0.35, pushRate: 1.6, fold: 0.6 };
// The trot reaches long and folds the paws up neatly, each swing a quick flick.
const TROT_FRONT: StepAngles = { plant: 0.05, push: -0.45, pushStart: 0.5, pushRate: 2.2, fold: 1.25 };
const TROT_HIND: StepAngles = { plant: -0.25, push: 0.5, pushStart: 0.3, pushRate: 1.8, fold: 0.85 };
const RUN_FRONT: StepAngles = { plant: 0.1, push: -0.5, pushStart: 0.3, pushRate: 2, fold: 1.3 };
const RUN_HIND: StepAngles = { plant: -0.4, push: 0.6, pushStart: 0.2, pushRate: 1.6, fold: 0.8 };

/** Footfalls: the walk a lateral sequence, the trot in diagonal pairs, the run a rotary gallop. */
const FOOTFALLS: Record<"walk" | "trot" | "run", Record<PawName, number>> = {
  walk: { hindL: 0, frontL: 0.25, hindR: 0.5, frontR: 0.75 },
  trot: { hindL: 0, frontR: 0.01, hindR: 0.5, frontL: 0.51 },
  run: { hindL: 0, hindR: 0.1, frontL: 0.45, frontR: 0.56 },
};

function moving(gait: "walk" | "trot" | "run", frame: Frame): Posture {
  const { input, hipHeight, frontZ, hindZ, legs } = frame;
  const base = stand(frame);
  const speed = Math.max(input.speed, 0.05);
  // A planted paw sweeps back only as far as the body goes while it is down.
  const shape = {
    walk: { sweep: 0.16 * (0.85 + 0.2 * clamp(speed / 0.6, 0, 2)), duty: clamp(0.66 - speed * 0.08, 0.52, 0.66), lift: 0.03 },
    // A fox's trot floats: a short time down, a long reach, each paw lifted neatly.
    trot: { sweep: 0.17 * (0.9 + 0.12 * clamp(speed / 1.4, 0, 2)), duty: 0.4, lift: 0.04 },
    run: { sweep: 0.22 * (0.9 + 0.1 * clamp(speed / 2.6, 0, 2)), duty: 0.28, lift: 0.07 },
  }[gait];
  const g: Gait = { footfalls: FOOTFALLS[gait], duty: shape.duty, stride: shape.sweep * legs, lift: shape.lift * legs };
  const phase = (input.travelled * shape.duty) / g.stride;
  const cycle = phase * Math.PI * 2;
  const run = gait === "run";
  const angles = run ? { front: RUN_FRONT, hind: RUN_HIND } : gait === "trot" ? { front: TROT_FRONT, hind: TROT_HIND } : { front: WALK_FRONT, hind: WALK_HIND };
  const paws = gaitPaws(phase, g, { hindL: hindZ - 0.03, hindR: hindZ - 0.03, frontL: frontZ + 0.01, frontR: frontZ + 0.01 }, angles);
  const bob = gait === "walk" ? -0.003 * Math.sin(cycle * 2) : gait === "trot" ? 0.005 * Math.abs(Math.sin(cycle)) - 0.002 : 0.016 * Math.sin(cycle - 0.6);
  const sway = Math.sin(cycle);
  const flex = run ? Math.sin(cycle + 0.3) : 0;
  // At speed the brush streams straight out behind, level with the back.
  const level = gait === "walk" ? 0.3 : 1;
  return {
    ...base,
    pelvisY: hipHeight - 0.004 * legs + bob * legs - (run ? 0.014 * legs : 0),
    pitch: (run ? 0.06 : 0.02) + flex * 0.12,
    roll: sway * (gait === "walk" ? 0.03 : 0.012),
    chestPitch: -flex * 0.18,
    chestYaw: sway * (gait === "walk" ? 0.05 : 0.015),
    neckPitch: base.neckPitch + (gait === "walk" ? 0.1 : run ? 0.42 : 0.26),
    headPitch: base.headPitch + (gait === "walk" ? 0.015 * Math.sin(cycle * 2) : run ? -0.2 - flex * 0.1 : -0.08),
    paws,
    tailRoot: mix(base.tailRoot, run ? -0.08 : -0.2, level),
    tailBend: mix(base.tailBend, run ? 0.0 : 0.02, level),
    tailHook: mix(base.tailHook, 0.08, level),
    tailSway: 0.04 + (run ? 0.08 : 0.02),
    earsBack: base.earsBack + (run ? 0.5 : gait === "trot" ? 0.12 : 0),
    jaw: run ? 0.22 : 0,
    tongue: run ? 0.6 : 0,
  };
}

function sit(frame: Frame): Posture {
  const { input, legs } = frame;
  const base = stand(frame);
  const pitch = -0.74;
  const pelvisY = 0.075 * legs;
  const chestPitch = 0.1;
  const curl = input.seed % 2 === 0 ? 1 : -1;
  // The front paws stand under the raised shoulders.
  const [, shoulderZ] = shoulderAt(input.rig, [pelvisY, HIP[2] + 0.02], pitch, chestPitch);
  return {
    ...base,
    pelvisY,
    pelvisZ: HIP[2] + 0.02,
    pitch,
    roll: 0,
    chestPitch,
    neckPitch: 0.02 - input.personality.boldness * 0.08,
    headPitch: 0.55,
    paws: {
      frontL: { y: 0, z: shoulderZ + 0.012, angle: 0 },
      frontR: { y: 0, z: shoulderZ + 0.012, angle: 0 },
      hindL: { y: 0, z: HIP[2] + 0.085 * legs, angle: -Math.PI / 2 },
      hindR: { y: 0, z: HIP[2] + 0.085 * legs, angle: -Math.PI / 2 },
    },
    // The brush laid on the ground and curled round towards the front paws.
    tailRoot: 0.66,
    tailBend: -0.04,
    tailHook: 0,
    tailCurl: 0.5 * curl,
    tailSway: 0.02,
  };
}

function lie(frame: Frame): Posture {
  const { input, frontZ, hindZ, legs } = frame;
  const base = stand(frame);
  const breath = Math.sin((input.time * Math.PI * 2) / 3.8);
  const curl = input.seed % 2 === 0 ? 1 : -1;
  // Curled up: the body bent round to one side, the head turned back along it and laid down, the brush wrapped round.
  return {
    ...base,
    pelvisY: 0.074 + breath * 0.0015,
    pitch: 0.03,
    roll: 0.05 * curl,
    yaw: 0.32 * curl,
    chestPitch: -0.02 + breath * 0.01,
    chestYaw: -0.3 * curl,
    neckPitch: 0.18,
    headPitch: -0.02,
    headYaw: -0.75 * curl,
    headRoll: 0.2 * curl,
    paws: {
      frontL: { y: 0.01, z: frontZ + 0.1 * legs, angle: -1.45 },
      frontR: { y: 0.01, z: frontZ + 0.1 * legs, angle: -1.45 },
      hindL: { y: 0, z: hindZ + 0.075 * legs, angle: -Math.PI / 2 },
      hindR: { y: 0, z: hindZ + 0.075 * legs, angle: -Math.PI / 2 },
    },
    tailRoot: -0.15,
    tailBend: 0.02,
    tailHook: 0,
    tailCurl: 0.42 * -curl,
    tailSway: 0.012,
    earsBack: 0.35,
    lids: 0.75,
  };
}

/** The mouse pounce, through its phase: the listen with ears forward, the spring, the arc, the dive nose-first, and back up. */
function pounceAt(frame: Frame, phase: number): Posture {
  const base = stand(frame);
  const l = frame.legs;
  const listen = shifted(base, { pelvisY: -0.02 * l, pitch: -0.06, neckPitch: 0.34, headPitch: 0.3, earsBack: -0.25 - base.earsBack, tailRoot: -0.15 }, { hindL: { z: 0.04 }, hindR: { z: 0.04 } });
  const tilt = shifted(listen, { headRoll: 0.22, neckPitch: 0.05 });
  const spring = shifted(base, { pelvisY: 0.07 * l, pelvisZ: 0.03, pitch: -0.5, neckPitch: 0.1, earsBack: -base.earsBack }, {
    hindL: { z: 0.05, angle: 0.6 },
    hindR: { z: 0.05, angle: 0.6 },
    frontL: { y: 0.07, z: 0.06, angle: -0.8 },
    frontR: { y: 0.07, z: 0.06, angle: -0.8 },
  });
  const apex = shifted(base, { pelvisY: 0.16 * l, pelvisZ: 0.06, pitch: 0.35, neckPitch: 0.45, headPitch: 0.2, tailRoot: 0.55 }, {
    hindL: { y: 0.15, z: 0.03, angle: 0.9 },
    hindR: { y: 0.15, z: 0.03, angle: 0.9 },
    frontL: { y: 0.13, z: 0.12, angle: -0.5 },
    frontR: { y: 0.13, z: 0.12, angle: -0.5 },
  });
  const dive = shifted(base, { pelvisY: 0.12 * l, pelvisZ: 0.09, pitch: 0.8, neckPitch: 0.45, headPitch: 0.35, tailRoot: 0.9 }, {
    hindL: { y: 0.1, z: 0.06, angle: 0.7 },
    hindR: { y: 0.1, z: 0.06, angle: 0.7 },
    frontL: { y: 0.0, z: 0.2, angle: -0.3 },
    frontR: { y: 0.0, z: 0.2, angle: -0.3 },
  });
  // Nose in the snow, tail up: the moment everyone who has watched a fox hunt remembers.
  const nose = shifted(base, { pelvisY: 0.03 * l, pelvisZ: 0.09, pitch: 0.42, neckPitch: 0.5, headPitch: 0.42, tailRoot: 1.35, tailBend: -0.05 }, {
    hindL: { z: 0.1 },
    hindR: { z: 0.1 },
    frontL: { z: 0.18, angle: -0.2 },
    frontR: { z: 0.18, angle: -0.2 },
  });
  return keyed(
    [
      [0, base],
      [0.18, listen],
      [0.36, tilt],
      [0.44, listen],
      [0.5, spring],
      [0.58, apex],
      [0.66, dive],
      [0.74, nose],
      [0.84, nose],
      [1, base],
    ],
    phase,
  );
}

/** Seconds a pounce takes, from the listen to standing again. */
const POUNCE_LENGTH = 3.4;

/** A greeting: head low, ears soft and back, a slow low wag, the hips swinging with it, and a grin. */
function greet(posture: Posture, input: FoxMotionInput, amount: number): Posture {
  if (amount <= 0) return posture;
  const wiggle = Math.sin(input.time * 7 + input.seed + Math.PI) * 0.06;
  return {
    ...posture,
    yaw: posture.yaw + wiggle * amount * (input.activity === "stand" ? 1 : 0.3),
    neckPitch: posture.neckPitch + 0.12 * amount,
    tailRoot: mix(posture.tailRoot, -0.45, amount),
    tailWag: mix(posture.tailWag, 0.4, amount),
    earsBack: mix(posture.earsBack, 0.6, amount),
    earsOut: mix(posture.earsOut, 0.25, amount),
    jaw: Math.max(posture.jaw, 0.12 * amount),
    tongue: Math.max(posture.tongue, 0.35 * amount),
    lids: mix(posture.lids, 0.3, amount),
  };
}

function postureAt(input: FoxMotionInput): Posture {
  const frame = frameOf(input);
  const loop = (input.time - input.since) / POUNCE_LENGTH;
  const play = (input.personality.playfulness + 1) / 2;
  // Standing about, now and then it hears something in the grass and pounces on it, a playful fox more often; never while greeting.
  const standing = () => {
    const still = stand(frame);
    const pouncing = occasion(input.seed, 20, input.time, 18, POUNCE_LENGTH, 0.15 + 0.4 * play);
    return pouncing === null ? still : blendPosture(still, pounceAt(frame, pouncing), 1 - smooth(input.greeting), 0);
  };
  const postures = {
    stand: standing,
    walk: () => moving("walk", frame),
    trot: () => moving("trot", frame),
    run: () => moving("run", frame),
    sit: () => sit(frame),
    lie: () => lie(frame),
    // Asked to pounce, it pounces again and again.
    pounce: () => pounceAt(frame, loop - Math.floor(loop)),
  };
  const posture = blendedPosture(postures, input.activity, input.previous, input.time, input.since, 0.016);
  return greet(posture, input, smooth(input.greeting));
}

export function foxPose(input: FoxMotionInput): Pose {
  const posture = postureAt(input);
  const idle: Idle = { time: input.time, seed: input.seed, busy: (input.personality.playfulness + 1) / 2 };
  // Looking round is laid over every activity alike, so a change of activity never cuts a look short.
  const looked = lookRound(posture, idle, 0.6, true);
  return solvePose(looked, input.rig, {
    time: input.time,
    seed: input.seed,
    swayRate: 1.2,
    wagRate: 9,
    ears: { L: earTurns("L", looked, idle), R: earTurns("R", looked, idle) },
    blink: blinkOf(looked, idle),
  });
}

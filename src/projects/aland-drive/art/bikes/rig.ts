import type { Point } from "../cars/mesh";
import { add, apply, chain, cross, dot, HIDDEN, IDENTITY, mix, mul, rotAxis, rotX, rotY, rotZ, scale, sub, translate, unit, type Mat } from "./mat";
import { layoutOf, type BikeLayout, type BikeSpec } from "./specs";

/*
 * The whole rig: every rigid part's matrix from a small set of numbers, with no
 * renderer. Feet stay on the pedals and hands on the bar by two-bone reaching,
 * so pedalling, standing, coasting, stopping and steering all come from where
 * the pelvis and the pedals are, and no pose is authored limb by limb.
 */

export const PARTS = ["frame", "steer", "wheelFront", "wheelRear", "crank", "pedalLeft", "pedalRight", "pelvis", "torso", "head", "hairShort", "hairLong", "helmet", "upperArmLeft", "upperArmRight", "foreArmLeft", "foreArmRight", "thighLeft", "thighRight", "shinLeft", "shinRight", "footLeft", "footRight"] as const;
export type Part = (typeof PARTS)[number];

export const CRANK_M = 0.17;
const PEDAL_OUT_M = 0.135;

export const BODY = {
  thighM: 0.44,
  shinM: 0.45,
  upperArmM: 0.29,
  /** To the middle of the closed hand. */
  foreArmM: 0.345,
  torsoM: 0.5,
  hipHalfM: 0.095,
  shoulderHalfM: 0.175,
  /** From the ball of the foot, on the pedal, to the ankle. */
  ankleUpM: 0.095,
  ankleBackM: 0.115,
} as const;

/** What the game knows each frame. */
export interface RideInput {
  speedMS: number;
  /** The bars' angle, positive to the right. */
  steer: number;
  /** The bike's lean, positive to the right. */
  lean: number;
  /** How hard the rider is pushing, 0 to 1. */
  effort: number;
  /** Where the head looks, on top of the turn it makes by itself: positive right and up. */
  headYaw: number;
  headPitch: number;
}

/** What builds up from frame to frame: where the ride has got to, with no clock in it. */
export interface RideMotion {
  /** Radians rolled by the wheels. */
  wheel: number;
  /** Radians the right crank has turned, from level and forward. */
  crank: number;
  coast: number;
  stand: number;
  stop: number;
}

export interface RiderOptions {
  rider: boolean;
  helmet: boolean;
  hair: "short" | "long";
  /** Hides the head and body, for a camera at the eyes. */
  firstPerson?: boolean;
}

export const restMotion = (): RideMotion => ({ wheel: 0, crank: 0.5, coast: 0, stand: 0, stop: 0 });
export const stillInput = (): RideInput => ({ speedMS: 6, steer: 0, lean: 0, effort: 0.5, headYaw: 0, headPitch: 0 });

const CADENCE_LIMIT_RAD_S = 12;
const BLEND_PER_S = 6;
const LEVEL_PER_S = 4;
const STOPPED_MS = 0.35;
const STAND_EFFORT = 0.8;
const STAND_BELOW_MS = 7.5;
const COAST_EFFORT = 0.05;
/** The right pedal, up and forward, ready to push off from a stop. */
const STOPPED_CRANK = -0.75;

const wrapPi = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** Moves the cycle on. It changes `motion` and nothing else, so the same inputs give the same ride. */
export function stepMotion(motion: RideMotion, input: RideInput, spec: BikeSpec, seconds: number) {
  const ease = 1 - Math.exp(-BLEND_PER_S * seconds);
  const towards = (from: number, to: number) => from + (to - from) * ease;
  const { speedMS, effort } = input;
  motion.stop = towards(motion.stop, speedMS < STOPPED_MS ? 1 : 0);
  motion.coast = towards(motion.coast, effort < COAST_EFFORT ? 1 : 0);
  motion.stand = towards(motion.stand, effort > STAND_EFFORT && speedMS < STAND_BELOW_MS && speedMS >= STOPPED_MS ? 1 : 0);
  motion.wheel += (speedMS / spec.wheelRadiusM) * seconds;
  const rate = Math.min(CADENCE_LIMIT_RAD_S, (speedMS / spec.gearM) * Math.PI * 2);
  motion.crank += rate * (1 - motion.coast) * (1 - motion.stop) * seconds;
  const settle = 1 - Math.exp(-LEVEL_PER_S * seconds);
  if (motion.stop > 0.5) motion.crank += wrapPi(STOPPED_CRANK - motion.crank) * settle * motion.stop;
  else if (motion.coast > 0.5) motion.crank -= (Math.atan2(Math.sin(motion.crank * 2), Math.cos(motion.crank * 2)) / 2) * settle * motion.coast;
}

/** A knee or elbow: reaches from `root` towards `target`, bending towards `pole`. */
export function reach(root: Point, target: Point, upperM: number, lowerM: number, pole: Point) {
  const along = sub(target, root);
  const wanted = Math.hypot(...along);
  const length = Math.min(upperM + lowerM - 1e-4, Math.max(Math.abs(upperM - lowerM) + 1e-4, wanted));
  const dir = scale(along, 1 / wanted);
  const x = (upperM * upperM - lowerM * lowerM + length * length) / (2 * length);
  const out = Math.sqrt(Math.max(0, upperM * upperM - x * x));
  const bend = unit(sub(pole, scale(dir, dot(pole, dir))));
  return { joint: add(add(root, scale(dir, x)), scale(bend, out)), tip: add(root, scale(dir, length)), short: Math.abs(wanted - length) };
}

/** A part hanging down -y from `from`, laid along the bone to `to`. */
function aim(from: Point, to: Point): Mat {
  const y = unit(sub(from, to));
  const x = unit(sub([1, 0, 0], scale(y, y[0])));
  const z = cross(x, y);
  return [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, from[0], from[1], from[2], 1];
}

const layouts = new WeakMap<BikeSpec, BikeLayout>();
function layout(spec: BikeSpec) {
  const known = layouts.get(spec);
  if (known) return known;
  const made = layoutOf(spec);
  layouts.set(spec, made);
  return made;
}

export interface Pose {
  /** One matrix per entry of `PARTS`. */
  matrices: Mat[];
  /** How far short of a pedal or a grip any limb fell: near 0 on a rider who fits the bike. */
  reachShort: number;
  /** Between the eyes, in the same frame as the matrices. */
  eye: Point;
}

const FOOT_DOWN_X_M = -0.27;
const HIP_JOINT_Y_M = -0.03;
const LEG_SLACK_M = 0.012;
/** More than the overreach: the hips drop straight down, and the leg isn't quite vertical. */
const HIP_DROP_SHARE = 1.15;
const SHOULDERS_FOLLOW_BARS = 0.6;

/** On the head, from the neck: a little behind the real eyes, or the bars fall out of the bottom of the frame. */
const EYE: Point = [0, 0.16, 0.06];

const armPole = (side: number): Point => [side * 0.7, -0.6, 0.45];
const legPole = (side: number): Point => [side * 0.16, 0.1, -1];

export function poseBike(spec: BikeSpec, input: RideInput, motion: RideMotion, options: RiderOptions): Pose {
  const l = layout(spec);
  const { crank, wheel, coast, stand, stop } = motion;
  const pedalling = (1 - coast) * (1 - stop);
  const swing = Math.sin(crank);

  // The lean's pivot is the line of the tyres, so the wheels stay on the road. A stop leans on the foot put down.
  const leaned = input.lean - 0.1 * stop + stand * pedalling * 0.08 * swing;
  const root = rotZ(-leaned);

  const steerAt = chain(translate(l.headBottom), rotAxis(l.steerAxis, -input.steer), translate(scale(l.headBottom, -1)));
  const pedalAt = (angle: number, side: number): Point => [side * PEDAL_OUT_M, l.bb[1] - Math.sin(angle) * CRANK_M, l.bb[2] - Math.cos(angle) * CRANK_M];
  const pedalRight = pedalAt(crank, 1);
  const pedalLeft = pedalAt(crank + Math.PI, -1);

  const footTilt = (angle: number) => (-0.14 + 0.2 * Math.sin(angle)) * (1 - coast);
  const ankleOn = (pedal: Point, tilt: number): Point => add(pedal, [0, BODY.ankleUpM * Math.cos(tilt) - BODY.ankleBackM * Math.sin(tilt), BODY.ankleUpM * Math.sin(tilt) + BODY.ankleBackM * Math.cos(tilt)]);
  const tiltRight = footTilt(crank);
  const tiltLeft = footTilt(crank + Math.PI) * (1 - stop);

  const onRoad = (x: number) => (BODY.ankleUpM + x * Math.sin(leaned)) / Math.cos(leaned);
  const footDown: Point = [FOOT_DOWN_X_M, onRoad(FOOT_DOWN_X_M), l.bb[2] - 0.2];
  const ankleRight = ankleOn(pedalRight, tiltRight);
  const ankleLeft = mix(ankleOn(pedalLeft, tiltLeft), footDown, stop);

  // Up off the saddle, but no further than the lower leg lets: the hips ride down with each stroke.
  const wantedHip = add(l.hip, [-0.05 * stop - stand * pedalling * 0.05 * swing, 0.17 * stand - 0.03 * stop, -0.24 * stand - 0.09 * stop]);
  const overreach = (side: number, ankle: Point) => Math.hypot(...sub(add(wantedHip, [side * BODY.hipHalfM, HIP_JOINT_Y_M, 0]), ankle)) - (BODY.thighM + BODY.shinM - LEG_SLACK_M);
  const hip = add(wantedHip, [0, -Math.max(0, overreach(1, ankleRight), overreach(-1, ankleLeft)) * HIP_DROP_SHARE, 0]);
  const back = ((spec.torsoLeanDeg + 8 * stand - (spec.torsoLeanDeg - 12) * stop * 0.4) * Math.PI) / 180;
  const cornerBody = input.lean * 0.3;
  const rock = (0.035 + 0.05 * stand) * pedalling * swing;

  const pelvis = chain(translate(hip), rotZ(-cornerBody * 0.5 + rock), rotX(-back * 0.55));
  const torso = chain(pelvis, rotX(-back * 0.45), rotZ(-cornerBody * 0.5 - rock * 1.4), rotY(rock * 0.8 - input.steer * SHOULDERS_FOLLOW_BARS));
  const neck = apply(torso, [0, BODY.torsoM + 0.015, -0.005]);
  const lookYaw = input.headYaw + input.steer * 0.9 + input.lean * 0.5;
  const head = chain(translate(neck), rotZ(cornerBody + leaned * 0.7), rotY(-lookYaw), rotX(back * 0.72 + input.headPitch));

  const matrices = new Array<Mat>(PARTS.length).fill(HIDDEN);
  const set = (part: Part, m: Mat) => {
    matrices[PARTS.indexOf(part)] = m;
  };
  set("frame", IDENTITY);
  set("steer", steerAt);
  set("wheelFront", chain(steerAt, translate(l.frontAxle), rotX(-wheel)));
  set("wheelRear", chain(translate(l.rearAxle), rotX(-wheel)));
  set("crank", chain(translate(l.bb), rotX(-crank)));
  set("pedalRight", chain(translate(pedalRight), rotX(tiltRight)));
  set("pedalLeft", chain(translate(pedalLeft), rotX(tiltLeft)));

  let reachShort = 0;
  if (options.rider) {
    if (!options.firstPerson) {
      set("pelvis", pelvis);
      set("torso", torso);
      set("head", head);
      set(options.hair === "long" ? "hairLong" : "hairShort", head);
      if (options.helmet) set("helmet", head);
    }

    const leg = (side: 1 | -1, ankle: Point, tilt: number, names: readonly [Part, Part, Part]) => {
      const joint = apply(pelvis, [side * BODY.hipHalfM, HIP_JOINT_Y_M, 0]);
      const { joint: knee, tip, short } = reach(joint, ankle, BODY.thighM, BODY.shinM, legPole(side));
      reachShort = Math.max(reachShort, short);
      set(names[0], aim(joint, knee));
      set(names[1], aim(knee, tip));
      set(names[2], chain(translate(tip), rotX(tilt)));
    };
    leg(1, ankleRight, tiltRight, ["thighRight", "shinRight", "footRight"]);
    leg(-1, ankleLeft, tiltLeft, ["thighLeft", "shinLeft", "footLeft"]);

    const arm = (side: 1 | -1, names: readonly [Part, Part]) => {
      const shoulder = apply(torso, [side * BODY.shoulderHalfM, BODY.torsoM * 0.92, 0]);
      const grip = apply(steerAt, [side * l.grip[0], l.grip[1], l.grip[2]]);
      const { joint: elbow, tip, short } = reach(shoulder, grip, BODY.upperArmM, BODY.foreArmM, armPole(side));
      reachShort = Math.max(reachShort, short);
      set(names[0], aim(shoulder, elbow));
      set(names[1], aim(elbow, tip));
    };
    arm(1, ["upperArmRight", "foreArmRight"]);
    arm(-1, ["upperArmLeft", "foreArmLeft"]);
  }

  return { matrices: matrices.map((m) => (m === HIDDEN ? m : mul(root, m))), reachShort, eye: apply(mul(root, head), EYE) };
}

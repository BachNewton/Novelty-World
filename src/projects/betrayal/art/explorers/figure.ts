import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import type { PaletteKey } from "../palette";
import { cylinder, flat, group } from "../shapes";

/** The height of the base's top, where a figure's feet stand. */
export const BASE_TOP = 0.08;

/** The round base every explorer miniature stands on, the same as the scale pawn's. */
export function figureBase(rim: PaletteKey = "boneDark"): THREE.Mesh {
  return cylinder(0.36, BASE_TOP, flat(rim), [0, 0, 0], { top: 0.34, sides: 12 });
}

/**
 * How tall a figure stands off its base, from the character's real height:
 * every explorer is scaled alike, so they keep their true heights against
 * one another, and Longfellow's 5'11" stands 1.5 m off his base, a little
 * under the 1.6 m the rooms are judged against.
 */
export function miniatureHeight(feet: number, inches: number): number {
  return ((feet * 12 + inches) / 71) * 1.5;
}

/** How a figure walks: metres per step (a stride cycle is two steps) and how
 *  high the miniature hops off the floor at each one. A longer step at the
 *  house's one walking pace is a slower cadence, a shorter one a quicker. A
 *  figure's run is its walk scaled by the shared run factors below, so the
 *  cadence and bounce that give a walk its character carry into the run. */
export interface Walking {
  step: number;
  hop: number;
}

/** Longfellow's walk, and any figure's that declares none. */
export const ADULT_WALK: Walking = { step: 0.55, hop: 0.04 };

/** How a figure crosses the house: every figure walks at one pace and runs at
 *  another. Once the haunt starts heroes run and the traitor walks calmly;
 *  in a hidden-traitor haunt everyone runs, since a gait must never give the
 *  traitor away. Monsters keep their own movement. */
export type Pace = "walk" | "run";

/** How much longer a running step is than the figure's walking step. */
export const RUN_STRIDE = 1.5;
/** How much further the legs swing running than walking. A runner's feet
 *  leave the floor, so a run's swing isn't set by planted feet, and straight
 *  legs swung a whole running step would goose-step. */
const RUN_SWING = 1.3;
/** How much higher a running figure bounds than it hops walking. */
const RUN_HOP = 2.2;
/** How much further the arms pump running than they swing walking. */
const RUN_ARM = 1.9;
/** How far a runner leans into the run, from the waist. */
const RUN_LEAN = 0.26;
/** The elbow bent near square, the forearm forward, for pumping arms. */
const RUN_ELBOW = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1.45);

/** Metres per step at a pace, from a figure's walking step. */
export function stepLength(step: number, running = false): number {
  return running ? step * RUN_STRIDE : step;
}

/** Declares how a figure walks, as `animated` declares how it moves. */
export function walks<T extends THREE.Object3D>(figure: T, walking: Walking): T {
  figure.userData.walking = walking;
  return figure;
}

export function walkingOf(figure: THREE.Object3D): Walking {
  return (figure.userData as { walking?: Walking }).walking ?? ADULT_WALK;
}

/** How high a walking miniature is off the floor: it hops at every step, and bounds running. */
export function hopHeight({ hop }: Walking, { phase, amount, running = false }: Stride): number {
  return Math.abs(Math.sin(phase)) * hop * (running ? RUN_HOP : 1) * amount;
}

/** How far a leg `leg` metres long swings forward and back from the hip:
 *  walking, so that a foot planted on the floor travels a whole step while it
 *  is down; running, further. */
export function legSwing({ step }: Walking, leg: number, running = false): number {
  return Math.asin(Math.min(1, step / (2 * leg))) * (running ? RUN_SWING : 1);
}

/** Swings a piece built in place about a hip at `at`, turning it `angle`
 *  forward. At rest its transform is exactly the identity, so a figure that
 *  never walks is drawn exactly as it was built. */
export function swing(piece: THREE.Object3D, at: THREE.Vector3, angle: number) {
  piece.rotation.x = angle;
  piece.position.copy(at).sub(at.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), angle));
}

/** How a figure moves its legs at a moment: `phase` runs on with the distance
 *  covered (a full turn is two steps), `amount` eases from 0, standing, to 1,
 *  in full stride, and `running` says the stride is a run. */
export interface Stride {
  phase: number;
  amount: number;
  running?: boolean;
}

/** Where a figure is in its stride at a moment on the stage's clock. A figure
 *  that is never walked stands still. */
export type Gait = (seconds: number) => Stride;

export const STANDING: Gait = () => ({ phase: 0, amount: 0 });

/** What a two-legged figure moves when it walks or runs. */
export interface StrideRig {
  walking: Walking;
  /** The right leg, then the left, each built in place in the body's frame. */
  legs: readonly [THREE.Object3D, THREE.Object3D];
  /** The right shoe, then the left, built in place on the figure, so the body's sway leaves them planted. */
  shoes: readonly [THREE.Object3D, THREE.Object3D];
  /** The hips, in the body's frame and in the figure's. */
  hipInBody: THREE.Vector3;
  hipInFigure: THREE.Vector3;
  /** From the hip to the floor, which with the step sets how far the legs swing. */
  leg: number;
  /** The arms that swing, each with its side (−1 is the right) and how far it swings walking. */
  arms: readonly { limb: Limb; side: -1 | 1; swing: number }[];
  /** What leans into the stride, and how far walking. */
  chest: THREE.Object3D;
  lean: number;
}

const ACROSS = new THREE.Vector3(1, 0, 0);
const turn = new THREE.Quaternion();

/**
 * Walks or runs a figure, after its idle has posed it: the legs and shoes
 * swing from the hips so planted feet travel a whole step, the free arms
 * swing against the legs, and the chest leans in. Running, the step is longer
 * (so the legs swing further), the arms pump with the elbows bent and the
 * chest leans well forward. Returns the step, from −1 to 1, for the figure's
 * own touches (a roll, a bounce of pigtails). At `amount` 0 every piece it
 * moves is back as built.
 */
export function stride(rig: StrideRig, { phase, amount, running = false }: Stride): number {
  const step = Math.sin(phase) * amount;
  const run = running ? amount : 0;
  const angle = step * legSwing(rig.walking, rig.leg, running);
  swing(rig.legs[0], rig.hipInBody, angle);
  swing(rig.legs[1], rig.hipInBody, -angle);
  swing(rig.shoes[0], rig.hipInFigure, angle);
  swing(rig.shoes[1], rig.hipInFigure, -angle);
  for (const { limb, side, swing: reachOut } of rig.arms) {
    if (run > 0) limb.elbow.quaternion.slerp(RUN_ELBOW, run);
    limb.shoulder.quaternion.premultiply(turn.setFromAxisAngle(ACROSS, side * step * reachOut * (1 + run * (RUN_ARM - 1))));
  }
  rig.chest.rotation.x += rig.lean * amount + run * RUN_LEAN;
  return step;
}

/** An arm built from its two meshes: the upper arm hangs from the shoulder at
 *  `at` (in its parent's frame) and the forearm from the elbow, `upper` below. */
export function arm(upperArm: THREE.Object3D, forearm: THREE.Object3D, at: THREE.Vector3, upper: number): Limb {
  const elbow = group(forearm);
  elbow.position.y = -upper;
  const shoulder = group(upperArm, elbow);
  shoulder.position.copy(at);
  return { shoulder, elbow, at };
}

/** A limb's two rotations: the shoulder (or hip) and the elbow (or knee). */
export interface Reach {
  shoulder: THREE.Quaternion;
  elbow: THREE.Quaternion;
}

const DOWN = new THREE.Vector3(0, -1, 0);

/** A two-bone arm: the shoulder pivot, the elbow pivot inside it, and where
 *  the shoulder sits in its parent's frame. */
export interface Limb {
  shoulder: THREE.Group;
  elbow: THREE.Group;
  at: THREE.Vector3;
}

/** Blends a limb between two poses: 0 is `from`, 1 is `to`. */
export function pose(limb: Limb, from: Reach, to: Reach, amount: number) {
  limb.shoulder.quaternion.slerpQuaternions(from.shoulder, to.shoulder, amount);
  limb.elbow.quaternion.slerpQuaternions(from.elbow, to.elbow, amount);
}

/** Where the end of a limb is, in its parent's frame, as it is posed now:
 *  for something held to follow the hand without turning with the forearm. */
export function limbEnd(limb: Limb, upper: number, lower: number): THREE.Vector3 {
  const forearm = DOWN.clone().multiplyScalar(lower).applyQuaternion(limb.elbow.quaternion).add(new THREE.Vector3(0, -upper, 0));
  return forearm.applyQuaternion(limb.shoulder.quaternion).add(limb.shoulder.position);
}

/**
 * Two-bone reach: the rotations that put the end of a limb hanging straight
 * down from `from` (upper bone `upper` long, lower bone `lower`) on `target`,
 * with the joint bending towards `bendTowards`. All in the parent's frame.
 * A target out of reach is reached for as far as the limb goes.
 */
export function reach(from: THREE.Vector3, target: THREE.Vector3, upper: number, lower: number, bendTowards: THREE.Vector3): Reach {
  const toTarget = target.clone().sub(from);
  const distance = THREE.MathUtils.clamp(toTarget.length(), Math.abs(upper - lower) + 1e-3, upper + lower - 1e-3);
  const direction = toTarget.normalize();
  const cosine = (upper * upper + distance * distance - lower * lower) / (2 * upper * distance);
  const axis = direction.clone().cross(bendTowards).normalize();
  const upperDirection = direction.clone().applyAxisAngle(axis, Math.acos(THREE.MathUtils.clamp(cosine, -1, 1)));
  const shoulder = new THREE.Quaternion().setFromUnitVectors(DOWN, upperDirection);
  const joint = from.clone().addScaledVector(upperDirection, upper);
  const end = from.clone().addScaledVector(direction, distance);
  const lowerDirection = end.sub(joint).normalize().applyQuaternion(shoulder.clone().invert());
  return { shoulder, elbow: new THREE.Quaternion().setFromUnitVectors(DOWN, lowerDirection) };
}

export interface BurstTiming {
  /** Seconds per slot; at most one burst starts in each. */
  every: number;
  /** How long one burst lasts, in seconds; less than `every`. */
  lasts: number;
  /** The chance a slot has a burst at all. */
  chance: number;
}

/**
 * An occasional movement at irregular times, as a pure function of the clock:
 * time is cut into slots, and the seed decides for each slot whether a burst
 * happens and when in the slot it starts. `amount` eases from 0 up to 1, holds,
 * and eases back; `progress` runs from 0 to 1 through the burst, for a motion
 * inside it; `pick` is a seeded value in [0, 1) for that burst, to vary it.
 */
export function burst(seconds: number, seed: string, { every, lasts, chance }: BurstTiming): { amount: number; progress: number; pick: number } {
  const slot = Math.floor(seconds / every);
  for (const k of [slot, slot - 1]) {
    const rng = createRng(`${seed}:${k}`);
    if (rng.next() >= chance) continue;
    const start = k * every + rng.next() * (every - lasts);
    const t = (seconds - start) / lasts;
    if (t < 0 || t > 1) continue;
    const ease = (x: number) => THREE.MathUtils.smootherstep(x, 0, 1);
    return { amount: t < 0.3 ? ease(t / 0.3) : t > 0.7 ? ease((1 - t) / 0.3) : 1, progress: t, pick: rng.next() };
  }
  return { amount: 0, progress: 0, pick: 0 };
}

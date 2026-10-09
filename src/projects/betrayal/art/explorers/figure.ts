import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import type { PaletteKey } from "../palette";
import { cylinder, flat } from "../shapes";

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
 *  house's one walking pace is a slower cadence, a shorter one a quicker. */
export interface Walking {
  step: number;
  hop: number;
}

/** Longfellow's walk, and any figure's that declares none. */
export const ADULT_WALK: Walking = { step: 0.55, hop: 0.04 };

/** Declares how a figure walks, as `animated` declares how it moves. */
export function walks<T extends THREE.Object3D>(figure: T, walking: Walking): T {
  figure.userData.walking = walking;
  return figure;
}

export function walkingOf(figure: THREE.Object3D): Walking {
  return (figure.userData as { walking?: Walking }).walking ?? ADULT_WALK;
}

/** How high a walking miniature is off the floor: it hops at every step. */
export function hopHeight({ hop }: Walking, { phase, amount }: Stride): number {
  return Math.abs(Math.sin(phase)) * hop * amount;
}

/** How far a leg `leg` metres long swings forward and back from the hip, so
 *  that a foot planted on the floor travels a whole step while it is down. */
export function legSwing({ step }: Walking, leg: number): number {
  return Math.asin(Math.min(1, step / (2 * leg)));
}

/** Swings a piece built in place about a hip at `at`, turning it `angle`
 *  forward. At rest its transform is exactly the identity, so a figure that
 *  never walks is drawn exactly as it was built. */
export function swing(piece: THREE.Object3D, at: THREE.Vector3, angle: number) {
  piece.rotation.x = angle;
  piece.position.copy(at).sub(at.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), angle));
}

/** How a figure moves its legs at a moment: `phase` runs on with the distance
 *  walked (a full turn is two steps), and `amount` eases from 0, standing,
 *  to 1, in full stride. */
export interface Stride {
  phase: number;
  amount: number;
}

/** Where a figure is in its stride at a moment on the stage's clock. A figure
 *  that is never walked stands still. */
export type Gait = (seconds: number) => Stride;

export const STANDING: Gait = () => ({ phase: 0, amount: 0 });

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

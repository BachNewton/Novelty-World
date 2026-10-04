import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import type { PaletteKey } from "../palette";
import { cylinder, flat } from "../shapes";

/** The round base every explorer miniature stands on, the same as the scale pawn's. */
export function figureBase(rim: PaletteKey = "boneDark"): THREE.Mesh {
  return cylinder(0.36, 0.08, flat(rim), [0, 0, 0], { top: 0.34, sides: 12 });
}

/** A limb's two rotations: the shoulder (or hip) and the elbow (or knee). */
export interface Reach {
  shoulder: THREE.Quaternion;
  elbow: THREE.Quaternion;
}

const DOWN = new THREE.Vector3(0, -1, 0);

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
 * and eases back; `pick` is a seeded value in [0, 1) for that burst, to vary it.
 */
export function burst(seconds: number, seed: string, { every, lasts, chance }: BurstTiming): { amount: number; pick: number } {
  const slot = Math.floor(seconds / every);
  for (const k of [slot, slot - 1]) {
    const rng = createRng(`${seed}:${k}`);
    if (rng.next() >= chance) continue;
    const start = k * every + rng.next() * (every - lasts);
    const t = (seconds - start) / lasts;
    if (t < 0 || t > 1) continue;
    const ease = (x: number) => THREE.MathUtils.smootherstep(x, 0, 1);
    return { amount: t < 0.3 ? ease(t / 0.3) : t > 0.7 ? ease((1 - t) / 0.3) : 1, pick: rng.next() };
  }
  return { amount: 0, pick: 0 };
}

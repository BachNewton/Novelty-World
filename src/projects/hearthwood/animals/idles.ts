import { blendPosture, burst, clamp, hash, mix, smooth, type Posture } from "./motion";
import type { Side, Vec3 } from "./rig";

/*
 * The occasional movements every wild animal makes over whatever it is
 * doing, as pure functions of its clock: a look round, an ear flicked or
 * turned to a sound, and a blink. A species says how busy it is (0 a calm
 * one, 1 a restless one) and how far each movement goes; the seeds keep any
 * two animals out of step. The cats and dogs keep fidgets of their own,
 * written before these.
 */

export interface Idle {
  time: number;
  seed: number;
  /** 0 calm to 1 restless: how often it looks, flicks and blinks. */
  busy: number;
}

/** A look round now and then: the head turned (and a little up or down) while it lasts, less while moving. */
export function lookRound(posture: Posture, idle: Idle, reach: number, still: boolean): Posture {
  const look = burst(idle.seed, 1, idle.time, mix(8, 3, idle.busy), mix(2.4, 1.4, idle.busy), 0.85);
  const yaw = (look.value * 2 - 1) * reach * look.amount * (still ? 1 : 0.3);
  return { ...posture, headYaw: posture.headYaw + yaw, headPitch: posture.headPitch - look.amount * 0.06 * (look.value - 0.3) };
}

/** An erect ear's turns: back by the posture, flicked now and then, swivelled out towards a sound. */
export function earTurns(side: Side, posture: Posture, idle: Idle, flickBy = 0.5): Vec3 {
  const flick = burst(idle.seed, side === "L" ? 3 : 4, idle.time, mix(7, 2.5, idle.busy), 0.26, 0.75);
  const swivel = burst(idle.seed, side === "L" ? 6 : 7, idle.time, 7.5, 1.7, 0.55);
  const out = side === "L" ? -1 : 1;
  const back = posture.earsBack + flick.amount * flickBy;
  return [-back, swivel.amount * 0.55 * out * (swivel.value - 0.3), out * (posture.earsOut + flick.amount * flickBy * 0.4)];
}

/** How shut the eyes are: the posture's lids, or a quick blink. */
export function blinkOf(posture: Posture, idle: Idle): number {
  const quick = burst(idle.seed, 8, idle.time, mix(5.5, 3, idle.busy), 0.16, 0.95).amount;
  return clamp(Math.max(posture.lids, quick), 0, 1);
}

/**
 * How far through an occasional set piece the animal is (a fox's pounce, a
 * hare sitting up): in each window `every` seconds long one happens with
 * probability `chance`, at a seeded moment, lasting `length` seconds. Null
 * outside one, else 0 to 1 through it. Like `burst`, but with its phase, for
 * movements made of several steps.
 */
export function occasion(seed: number, name: number, time: number, every: number, length: number, chance: number): number | null {
  const slot = Math.floor(time / every);
  const key = seed + name * 7919;
  if (hash(key, slot) >= chance) return null;
  const start = slot * every + hash(key + 1, slot) * Math.max(0, every - length);
  const u = (time - start) / length;
  return u <= 0 || u >= 1 ? null : u;
}

/** A movement of several held shapes, `keys` at phases from 0 to 1 in order, eased from each to the next at `phase`. */
export function keyed(keys: readonly (readonly [number, Posture])[], phase: number): Posture {
  for (let i = 1; i < keys.length; i++) {
    const [at, posture] = keys[i];
    if (phase <= at) {
      const [from, before] = keys[i - 1];
      return blendPosture(before, posture, smooth((phase - from) / Math.max(1e-6, at - from)), 0);
    }
  }
  return keys[keys.length - 1][1];
}

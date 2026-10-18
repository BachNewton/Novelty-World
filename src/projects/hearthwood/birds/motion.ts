import { burst, clamp } from "../animals/motion";
import type { BirdMode } from "../gameplay/birds";

/*
 * How a songbird moves, as pure functions of its clock: sitting, its head
 * turning in quick snaps as a bird's does, its tail flicking; on the ground,
 * hopping with both feet and pecking; in the air, flapping in bursts and
 * folding its wings between them, so it bounds along as small birds do, and
 * spreading them to flare as it lands. Fluffed up and still when the birds
 * are hardly about.
 */

export interface BirdPose {
  /** The body's rise, in metres, and its turn nose-down (positive), radians. */
  bob: number;
  pitch: number;
  headYaw: number;
  headPitch: number;
  /** How far the wings are open, 0 folded to 1 spread, and their beat about the body's long axis, radians, up positive. */
  wingOpen: number;
  wingBeat: number;
  /** The tail's cock up (positive) and how far it fans. */
  tailPitch: number;
  tailFan: number;
  /** The legs: 0 standing, 1 tucked up for flight. */
  tuck: number;
  /** How fluffed up it sits, 0 sleek to 1 a round ball. */
  fluff: number;
}

export interface BirdMotionInput {
  mode: BirdMode;
  time: number;
  seed: number;
  /** How far through its flight, 0 to 1, while flying. */
  flight: number;
  /** How far through a hop, 0 to 1, or null. */
  hop: number | null;
  /** How busy the birds are, 0 (roosting) to 1. */
  about: number;
}

/** A head turned in snaps: held one way, then quickly another. */
function snappyLook(seed: number, time: number, every: number): number {
  const slot = Math.floor(time / every + (seed % 7) * 0.13);
  const into = time / every + (seed % 7) * 0.13 - slot;
  const h = (n: number) => (((Math.imul(seed + n * 7919, 0x27d4eb2d) ^ Math.imul(slot, 0x165667b1)) >>> 0) / 4294967296) * 2 - 1;
  const t = clamp(into / 0.12, 0, 1);
  return h(1) * 0.9 + (h(2) - h(1)) * 0.9 * t * t * (3 - 2 * t);
}

export function birdPose({ mode, time, seed, flight, hop, about }: BirdMotionInput): BirdPose {
  const fluff = clamp(1 - about * 1.6, 0, 1);
  if (mode === "flying") {
    // Bursts of quick beats with the wings folded between them, then spread wide to land.
    const cycle = (time * 2.4 + (seed % 100) * 0.01) % 1;
    const beating = cycle < 0.62 ? 1 : 0;
    const flare = clamp((flight - 0.82) / 0.18, 0, 1);
    const beat = Math.sin(time * 34 + seed) * 0.95 * beating * (1 - flare);
    return {
      bob: Math.sin(time * 34 + seed) * 0.004 * beating,
      pitch: -0.1 - flare * 0.5,
      headYaw: 0,
      headPitch: -0.15,
      wingOpen: Math.max(beating, flare, 0.15),
      wingBeat: beat + flare * 0.4,
      tailPitch: flare * 0.5,
      tailFan: 0.4 + flare * 0.6,
      tuck: 1 - flare,
      fluff: 0,
    };
  }
  const look = snappyLook(seed, time, 1.4 - 0.8 * about);
  const flick = burst(seed, 31, time, 3.5, 0.25, 0.6 * about).amount;
  if (mode === "ground") {
    const peck = burst(seed, 32, time, 1.6, 0.35, 0.75).amount;
    const hopping = hop === null ? 0 : Math.sin(Math.PI * hop);
    return {
      bob: hopping * 0.004,
      pitch: 0.25 + peck * 0.35,
      headYaw: look * 0.6 * (1 - peck),
      headPitch: peck * 0.9 - 0.1,
      wingOpen: hopping * 0.15,
      wingBeat: 0,
      tailPitch: 0.35 + flick * 0.4,
      tailFan: flick * 0.4,
      tuck: hopping * 0.4,
      fluff: fluff * 0.5,
    };
  }
  const breath = Math.sin(time * 4 + seed) * 0.0015;
  return {
    bob: breath,
    pitch: -0.15 + fluff * 0.1,
    headYaw: look * (1 - fluff * 0.7),
    headPitch: -0.1 + fluff * 0.35,
    wingOpen: flick * 0.25,
    wingBeat: flick * 0.25,
    tailPitch: 0.1 + flick * 0.5,
    tailFan: flick * 0.5,
    tuck: 0,
    fluff,
  };
}

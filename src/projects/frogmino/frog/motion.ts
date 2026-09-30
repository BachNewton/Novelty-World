import { createRng } from "@/shared/lib/seeded-random";
import type { Vec3 } from "../vehicles/parts";

// The frog's life, as a pure function of time: breathing, blinking, the
// throat puffing, and the reactions to a hop, a landing and a bonk. Every
// cell only ever shrinks toward its own anchor, never grows, so no motion
// can reach into an empty cell; the throat is the one part that grows, and
// only by as much as its cell has room for. It is all kept subtle, so
// nothing pulls the eye from reading the next row.

export type FrogAction = "idle" | "hop" | "land" | "bonk";

export interface FrogMotion {
  // Each cell's scale about its anchor, every axis at most 1.
  cell: Vec3;
  // The eyeball's scale in its bump: 1 is open, EYES_SHUT hides it.
  eyeball: number;
  // The dazed pupils' circling, as an angle and a radius across the eye top.
  pupilOrbit: { angle: number; radius: number } | null;
  // The throat's puff, from 1 up to THROAT_PUFF.
  throat: number;
  // How far the legs are tucked up into the body, from 0 (standing) to 1
  // (gone): they tuck away for the whole hop, so a frog riding a vehicle
  // sits on its roof rather than standing in it.
  tuck: number;
}

export interface FrogMotionInput {
  // Seconds on any steady clock.
  time: number;
  action: FrogAction;
  // Seconds since the action began.
  since: number;
  // Tells frogs apart, so two frogs never blink in step.
  seed: number;
  sleepy: boolean;
}

// The eyeball sinks this far into its bump to close: small enough to hide
// inside it, so the bump shows as a closed lid.
export const EYES_SHUT = 0.6;
export const THROAT_PUFF = 1.25;
export const PUPIL_ORBIT = 0.045;

const BREATH = { hz: 0.45, depth: 0.018 };
const SLEEPY_BREATH = { hz: 0.22, depth: 0.035 };

// One blink somewhere in each slot, sometimes two in quick succession.
const BLINK_SLOT = 3.6;
const BLINK_DURATION = 0.14;
const DOUBLE_BLINK_GAP = 0.26;
const DOUBLE_BLINK_CHANCE = 0.3;

const PUFF_SLOT = 5.2;
const PUFF_DURATION = 0.7;

// Takeoff narrows the frog as it stretches up and tucks its legs away until
// it lands; a landing puts them down again and squashes it; a bonk flattens it against the row, then leaves it dazed
// with circling pupils and drooping lids.
export const HOP_DURATION = 0.24;
const HOP_NARROW = 0.08;
const TUCK_TIME = 0.1;
export const LAND_DURATION = 0.22;
const LAND_SQUASH = 0.1;
export const BONK_DURATION = 1.5;
const BONK_FLATTEN_TIME = 0.35;
const BONK_FLATTEN = 0.4;
const BONK_SQUASH = 0.08;
const DAZED_EYES = 0.85;
const DAZED_TURNS_PER_SECOND = 2.2;

function slotRandom(seed: number, what: string, slot: number): number {
  return createRng(`${String(seed)}:${what}:${String(slot)}`).next();
}

// A bump from 0 up to 1 and back over `duration`, `t` into it.
function pulse(t: number, duration: number): number {
  return t >= 0 && t < duration ? Math.sin((Math.PI * t) / duration) : 0;
}

// How closed the eyes are from blinking, 0 open to 1 shut.
function blink(time: number, seed: number): number {
  const slot = Math.floor(time / BLINK_SLOT);
  const at = slot * BLINK_SLOT + slotRandom(seed, "blink", slot) * (BLINK_SLOT - BLINK_DURATION - DOUBLE_BLINK_GAP);
  const twice = slotRandom(seed, "double", slot) < DOUBLE_BLINK_CHANCE;
  const first = pulse(time - at, BLINK_DURATION);
  const second = twice ? pulse(time - at - DOUBLE_BLINK_GAP, BLINK_DURATION) : 0;
  return Math.max(first, second);
}

function puff(time: number, seed: number): number {
  const slot = Math.floor(time / PUFF_SLOT);
  const at = slot * PUFF_SLOT + slotRandom(seed, "puff", slot) * (PUFF_SLOT - PUFF_DURATION);
  return pulse(time - at, PUFF_DURATION) ** 2;
}

export function frogMotion({ time, action, since, seed, sleepy }: FrogMotionInput): FrogMotion {
  const breath = sleepy ? SLEEPY_BREATH : BREATH;
  // Seeded phase, so a row of frogs doesn't breathe in unison.
  const phase = slotRandom(seed, "breath", 0) * 2 * Math.PI;
  const breathing = breath.depth * (0.5 + 0.5 * Math.sin(2 * Math.PI * breath.hz * time + phase));
  let [x, y, z] = [1, 1 - breathing, 1];
  let tuck = 0;
  let pupilOrbit: FrogMotion["pupilOrbit"] = null;
  let eyeball = sleepy ? EYES_SHUT : 1 - (1 - EYES_SHUT) * blink(time, seed);

  if (action === "hop") {
    const lift = pulse(since, HOP_DURATION);
    x *= 1 - HOP_NARROW * lift;
    tuck = Math.min(1, since / TUCK_TIME);
  } else if (action === "land") {
    y *= 1 - LAND_SQUASH * pulse(since, LAND_DURATION);
    tuck = 1 - Math.min(1, since / TUCK_TIME);
  } else if (action === "bonk" && since < BONK_DURATION) {
    const left = (1 - Math.min(1, since / BONK_FLATTEN_TIME)) ** 2;
    z *= 1 - BONK_FLATTEN * left;
    y *= 1 - BONK_SQUASH * left;
    if (!sleepy) eyeball = DAZED_EYES;
    const fade = 1 - since / BONK_DURATION;
    pupilOrbit = { angle: 2 * Math.PI * DAZED_TURNS_PER_SECOND * since, radius: PUPIL_ORBIT * fade };
  }

  return {
    cell: [x, y, z],
    eyeball,
    pupilOrbit,
    throat: sleepy ? 1 : 1 + (THROAT_PUFF - 1) * puff(time, seed),
    tuck,
  };
}

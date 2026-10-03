import { createRng } from "@/shared/lib/seeded-random";
import type { Vec3 } from "../vehicles/parts";

// The frog's life, as a pure function of time: breathing, blinking, the
// throat puffing, the reactions to a hop, a landing and a bonk, and the small
// hop of an everyday move. Every
// cell only ever shrinks toward its own anchor, never grows, so no motion
// can reach into an empty cell; the throat is the one part that grows, and
// only by as much as its cell has room for. It is all kept subtle, so
// nothing pulls the eye from reading the next row.

export type FrogAction = "idle" | "hop" | "land" | "bonk";

// The dazed pupils' circling: how far each is tipped off its gaze, and which
// way round.
export interface PupilOrbit {
  angle: number;
  radius: number;
}

// An everyday move's hop (a jump or a slide), which plays over whatever
// action is playing: `since` its start, `duration` long.
export interface MoveHop {
  since: number;
  duration: number;
}
export interface FrogMotion {
  // Each cell's scale about its anchor, every axis at most 1.
  cell: Vec3;
  // The eyeball's scale in its bump: 1 is open, EYES_SHUT hides it.
  eyeball: number;
  // The pupils' scale about their own middles: they shrink away as the lid
  // closes over them, ahead of the white.
  pupil: number;
  // The dazed pupils' circling.
  pupilOrbit: PupilOrbit | null;
  // The throat's puff, from 1 up to THROAT_PUFF.
  throat: number;
  // How far the legs are tucked up into the body, from 0 (standing) to 1
  // (gone): they tuck away for the whole hop, so a frog riding a vehicle
  // sits on its roof rather than standing in it.
  tuck: number;
  // How far the hind legs are kicked out behind, from 0 (folded) to 1: they
  // kick out as the frog takes off and fold back as it lands.
  kick: number;
}

export interface FrogMotionInput {
  // Seconds on any steady clock.
  time: number;
  action: FrogAction;
  // Seconds since the action began.
  since: number;
  // Tells frogs apart, so two frogs never blink in step.
  seed: number;
  // The latest move's hop; null for none.
  move?: MoveHop | null;
}

// The eyeball sinks this far into its bump to close: small enough to hide
// inside it, so the bump shows as a closed lid.
export const EYES_SHUT = 0.6;
export const THROAT_PUFF = 1.25;
export const PUPIL_ORBIT = 0.02;

const BREATH = { hz: 0.45, depth: 0.018 };

// One blink somewhere in each slot, sometimes two in quick succession.
const BLINK_SLOT = 3.6;
const BLINK_DURATION = 0.14;
const DOUBLE_BLINK_GAP = 0.26;
const DOUBLE_BLINK_CHANCE = 0.3;

const PUFF_SLOT = 5.2;
const PUFF_DURATION = 0.7;

// Takeoff narrows the frog as it stretches up, kicks its hind legs out
// behind and then tucks its legs away until it lands; a landing puts them
// down again, still kicked out, folds them back and squashes it; a bonk
// flattens it against the row, then leaves it dazed with circling pupils and
// drooping lids.
export const HOP_DURATION = 0.24;
const HOP_NARROW = 0.08;
const TUCK_TIME = 0.1;
const TAKEOFF_KICK = 0.2;
export const LAND_DURATION = 0.22;
const LANDING_KICK = 0.6;
const LAND_SQUASH = 0.1;
export const BONK_DURATION = 1.5;
const BONK_FLATTEN_TIME = 0.35;
const BONK_FLATTEN = 0.4;
const BONK_SQUASH = 0.08;
// The dazed lids droop only this far: any further and the white's rim would
// cross the lid's skin at too shallow an angle to draw cleanly.
export const DAZED_EYES = 0.9;
const DAZED_TURNS_PER_SECOND = 2.2;

// A move's hop narrows the frog a touch, draws its legs a little up and
// kicks its hind legs out behind while it is in the air, folding them back
// as it comes down, and squashes it a touch as it lands. Held moves chain,
// each taking off as the last lands, so the landing squash shows only after
// the last of them.
const MOVE_NARROW = 0.05;
const MOVE_TUCK = 0.3;
const MOVE_KICK = 0.6;
const MOVE_SQUASH = 0.06;
export const MOVE_LANDING = 0.12;

// A pupil stands just proud of its white, so as the eye shuts it would still
// show after the lid had covered the white round it. It shrinks away instead,
// from its full size with the eye open as far as the dazed lids leave it, to
// nothing just before the white goes under.
const PUPIL_GONE = 0.8;

// A kicked-out hind leg stretches back along the road and lifts off it,
// about its hip: never across or up, so it stays in the clearance under the
// bottom row, seen head-on.
const KICK_STRETCH = 0.8;
const KICK_LIFT = 0.4;

// A leg's scale about its hip: tucked away, and for a hind leg kicked out.
export function legScale({ tuck, kick }: FrogMotion, hind: boolean): Vec3 {
  const size = 1 - tuck;
  const out = hind ? kick : 0;
  return [size, size * (1 - KICK_LIFT * out), size * (1 + KICK_STRETCH * out)];
}

export function pupilScale(eyeball: number): number {
  return Math.min(1, Math.max(0, (eyeball - PUPIL_GONE) / (DAZED_EYES - PUPIL_GONE)));
}

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

export function frogMotion({ time, action, since, seed, move = null }: FrogMotionInput): FrogMotion {
  // Seeded phase, so a row of frogs doesn't breathe in unison.
  const phase = slotRandom(seed, "breath", 0) * 2 * Math.PI;
  const breathing = BREATH.depth * (0.5 + 0.5 * Math.sin(2 * Math.PI * BREATH.hz * time + phase));
  let [x, y, z] = [1, 1 - breathing, 1];
  let tuck = 0;
  let kick = 0;
  let pupilOrbit: FrogMotion["pupilOrbit"] = null;
  let eyeball = 1 - (1 - EYES_SHUT) * blink(time, seed);

  if (action === "hop") {
    const lift = pulse(since, HOP_DURATION);
    x *= 1 - HOP_NARROW * lift;
    kick = pulse(since, TAKEOFF_KICK);
    tuck = Math.min(1, Math.max(0, (since - TAKEOFF_KICK / 2) / TUCK_TIME));
  } else if (action === "land") {
    y *= 1 - LAND_SQUASH * pulse(since, LAND_DURATION);
    tuck = 1 - Math.min(1, since / TUCK_TIME);
    kick = LANDING_KICK * Math.max(0, 1 - since / LAND_DURATION);
  } else if (action === "bonk" && since < BONK_DURATION) {
    const left = (1 - Math.min(1, since / BONK_FLATTEN_TIME)) ** 2;
    z *= 1 - BONK_FLATTEN * left;
    y *= 1 - BONK_SQUASH * left;
    eyeball = DAZED_EYES;
    const fade = 1 - since / BONK_DURATION;
    pupilOrbit = { angle: 2 * Math.PI * DAZED_TURNS_PER_SECOND * since, radius: PUPIL_ORBIT * fade };
  }

  if (move !== null) {
    const air = pulse(move.since, move.duration);
    x *= 1 - MOVE_NARROW * air;
    z *= 1 - MOVE_NARROW * air;
    y *= 1 - MOVE_SQUASH * pulse(move.since - move.duration, MOVE_LANDING);
    tuck = Math.max(tuck, MOVE_TUCK * air);
    kick = Math.max(kick, MOVE_KICK * air);
  }

  return {
    cell: [x, y, z],
    eyeball,
    pupil: pupilScale(eyeball),
    pupilOrbit,
    throat: 1 + (THROAT_PUFF - 1) * puff(time, seed),
    tuck,
    kick,
  };
}

import { hash } from "../animals/motion";
import type { Species } from "../engine/strays";
import { walk, type WalkGround } from "./walking";

/*
 * How a cat, a dog, a fox or a hedgehog gets about, as rules shared by strays and companions:
 * its place and heading, what it is doing (standing, walking, trotting,
 * running, sitting or lying down), and steering over the land by the
 * walking rules (no deep water, no cliffs; a cat keeps its paws drier than a
 * dog), turning as an animal turns rather than on the spot, easing its pace
 * up and down, and keeping clear of Elliott and of other animals, so it
 * never walks through anyone. Its choices are seeded, so a frame-rate's
 * worth of steps comes out the same however it is cut up.
 */

/** What an animal is doing, as its body shows it. A cat trots as a quick walk, and lies down as a loaf; a hedgehog lying down is curled in a ball. */
export type Doing = "stand" | "walk" | "trot" | "run" | "sit" | "lie";

/** What behaviour knows of an animal: its species, its size in the world, and its nature from its personality. */
export interface Nature {
  species: Species;
  /** The body's scale: 1 for an average cat or a small dog, up to 2 for a big dog. */
  size: number;
  /** Shy (−1) to bold (1). */
  boldness: number;
  /** Lazy or calm (−1) to busy or playful (1). */
  energy: number;
  /** Aloof or independent (−1) to cuddly (1). */
  affection: number;
  /** A number from its seed, for its own choices. */
  seed: number;
}

export interface Body {
  x: number;
  z: number;
  /** The way it faces, in radians from +z towards +x. */
  heading: number;
  /** Its pace over the ground now, in metres a second. */
  speed: number;
  /** How far it has gone over the ground, in metres: its stride follows it. */
  travelled: number;
  /** The posture it holds while still. */
  rest: "stand" | "sit" | "lie";
  /** Greeting until this time (seconds): a cat's tail up and slow blink, a dog's wag and wiggle. */
  greetUntil: number;
}

/** Where an animal is asked to go this step, and how fast; or to stay, holding a posture and maybe facing a way. */
export type Aim = { go: { x: number; z: number }; pace: number; arrive?: number } | { stay: "stand" | "sit" | "lie"; face?: number | null };

/** Something to keep clear of: Elliott, another animal. */
export interface Obstacle {
  x: number;
  z: number;
  /** How close it lets anything come, in metres. */
  clear: number;
}

/** The fastest each species goes, in metres a second: quicker than Elliott's run, so it can always catch up. */
export const TOP_SPEED: Record<Species, number> = { cat: 8, dog: 9.5, fox: 9.5, hedgehog: 2 };
/** How quickly it turns, in radians a second, and changes pace, in metres a second each second. */
const TURN: Record<Species, number> = { cat: 6, dog: 4.5, fox: 5.5, hedgehog: 3.5 };
const ACCELERATION = 7;
const DECELERATION = 9;
/** Within this of where it is going, it has arrived. */
const ARRIVED = 0.35;

/** A seeded number in [0, 1) for one of an animal's choices. */
export function choice(nature: Nature, name: number, count: number): number {
  return hash(nature.seed + name * 7919, count);
}

const turnBetween = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** The ground an animal walks on: Elliott's rules, with a cat refusing water a dog would wade. */
export function animalGround(ground: WalkGround, species: Species): WalkGround {
  if (species === "dog" || species === "fox") return ground;
  // A cat or a hedgehog keeps its paws out of anything deeper than a puddle: its water stands higher than it is.
  return { heightAt: ground.heightAt, waterAt: (x, z) => ground.waterAt(x, z) + 0.3 };
}

/** What its body shows for its pace: still, a walk, a trot or a run, by its species and size. */
export function doingFor(nature: Nature, body: Body): Doing {
  const own = body.speed / nature.size;
  if (own < 0.06) return body.rest;
  if (nature.species === "cat") return body.speed < 1.4 ? "walk" : "run";
  if (nature.species === "hedgehog") return body.speed < 0.9 ? "walk" : "run";
  return own < 0.95 ? "walk" : own < 2.3 ? "trot" : "run";
}

/** Whether it is greeting now. */
export const greeting = (body: Body, time: number) => time < body.greetUntil;

/** A push away from whatever it is too close to, as a way to go: zero when clear of everything. */
function clearOf(body: Body, obstacles: readonly Obstacle[]): { x: number; z: number } {
  let x = 0;
  let z = 0;
  for (const o of obstacles) {
    const dx = body.x - o.x;
    const dz = body.z - o.z;
    const d = Math.hypot(dx, dz);
    if (d >= o.clear || d === 0) continue;
    const push = (o.clear - d) / o.clear;
    x += (dx / d) * push;
    z += (dz / d) * push;
  }
  return { x, z };
}

/** How far it went this step. */
export interface Stepped {
  moved: number;
  /** How far it was asked to go. */
  asked: number;
}

/**
 * One step of an animal's body towards its aim: it turns towards the way to
 * go, eases its pace towards the one asked (slowing as it arrives), steps as
 * far as the land lets it, and is pushed clear of anything too close. Asked
 * to stay, it slows to a stop and settles into its posture, turning to face
 * the way asked.
 */
export function stepBody(body: Body, nature: Nature, aim: Aim, ground: WalkGround, obstacles: readonly Obstacle[], seconds: number): Stepped {
  if (seconds <= 0) return { moved: 0, asked: 0 };
  const push = clearOf(body, obstacles);
  let wantX = push.x * 1.5;
  let wantZ = push.z * 1.5;
  let pace = Math.hypot(wantX, wantZ) > 0 ? 1.2 : 0;
  if ("go" in aim) {
    const dx = aim.go.x - body.x;
    const dz = aim.go.z - body.z;
    const d = Math.hypot(dx, dz);
    const arrive = aim.arrive ?? ARRIVED;
    if (d > arrive) {
      wantX += dx / d;
      wantZ += dz / d;
      const round = roundAhead(body, dx / d, dz / d, obstacles);
      wantX += round.x;
      wantZ += round.z;
      // It slows as it comes in, so it never overshoots.
      pace = Math.max(pace, Math.min(aim.pace, TOP_SPEED[nature.species], 0.6 + (d - arrive) * 2.2));
    }
  }
  const wantLength = Math.hypot(wantX, wantZ);
  if (wantLength > 0 && pace > 0) {
    const to = Math.atan2(wantX, wantZ);
    const turn = turnBetween(body.heading, to);
    const maxTurn = TURN[nature.species] * seconds;
    body.heading += Math.max(-maxTurn, Math.min(maxTurn, turn));
    // It slows into a sharp turn rather than skidding round it.
    pace *= Math.max(0.25, Math.cos(Math.min(Math.abs(turn), Math.PI / 2)));
  } else if ("stay" in aim && aim.face !== undefined && aim.face !== null && body.speed < 0.3) {
    const turn = turnBetween(body.heading, aim.face);
    const maxTurn = TURN[nature.species] * 0.5 * seconds;
    body.heading += Math.max(-maxTurn, Math.min(maxTurn, turn));
  }
  if ("stay" in aim) body.rest = aim.stay;
  else if (pace > 0) body.rest = "stand";
  const change = pace > body.speed ? ACCELERATION : DECELERATION;
  body.speed = pace > body.speed ? Math.min(pace, body.speed + change * seconds) : Math.max(pace, body.speed - change * seconds);
  if (body.speed <= 0) return { moved: 0, asked: 0 };
  const asked = body.speed * seconds;
  const to = walk(ground, body, Math.sin(body.heading) * asked, Math.cos(body.heading) * asked);
  const moved = Math.hypot(to.x - body.x, to.z - body.z);
  body.x = to.x;
  body.z = to.z;
  body.travelled += moved;
  // Brought up short by the land, it slows rather than treading the air.
  if (moved < asked * 0.5) body.speed = Math.max(0, moved / seconds);
  keepOut(body, ground, obstacles);
  return { moved, asked };
}

/** A way round whatever is close ahead on the way it wants to go: aside, on the side it is already on. */
function roundAhead(body: Body, wayX: number, wayZ: number, obstacles: readonly Obstacle[]): { x: number; z: number } {
  let x = 0;
  let z = 0;
  for (const o of obstacles) {
    const ox = o.x - body.x;
    const oz = o.z - body.z;
    const d = Math.hypot(ox, oz);
    const reach = o.clear * 2.5;
    if (d >= reach || d === 0 || ox * wayX + oz * wayZ <= 0) continue;
    // Its side of the way: the sign of the turn from the way to the obstacle, and aside is the other way.
    const side = wayX * oz - wayZ * ox > 0 ? -1 : 1;
    const strength = (1 - d / reach) * 1.4;
    x += -wayZ * side * strength;
    z += wayX * side * strength;
  }
  return { x, z };
}

/** However it got there, it never stands inside what it keeps clear of: it is moved out to the edge, as far as the land lets it. */
function keepOut(body: Body, ground: WalkGround, obstacles: readonly Obstacle[]): void {
  for (const o of obstacles) {
    const dx = body.x - o.x;
    const dz = body.z - o.z;
    const d = Math.hypot(dx, dz);
    const edge = o.clear * 0.75;
    if (d >= edge) continue;
    const ux = d === 0 ? Math.sin(body.heading + Math.PI) : dx / d;
    const uz = d === 0 ? Math.cos(body.heading + Math.PI) : dz / d;
    const to = walk(ground, body, ux * (edge - d), uz * (edge - d));
    body.x = to.x;
    body.z = to.z;
  }
}

export function bodyAt(x: number, z: number, heading: number, rest: Body["rest"] = "stand"): Body {
  return { x, z, heading, speed: 0, travelled: 0, rest, greetUntil: -Infinity };
}

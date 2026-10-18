import type { Species } from "../engine/strays";
import { stepBody, type Body, type Nature, type Obstacle } from "./behaviour";
import type { Leader } from "./companions";
import { canStand, walk, type WalkGround } from "./walking";

/*
 * Companions helping with a mystery, as rules: now and then, while a clue
 * Elliott could examine lies within some tens of metres of them, a following
 * companion notices it and goes over to it ahead of them. A dog follows its
 * nose there and sits by it with its tail going, looking back at Elliott; a
 * cat slinks over and sits beside it, tail up; a fox noses about it; a
 * hedgehog trundles there and snuffles. The one best suited goes, a dog
 * first for its nose. It is gentle, never nagging: one companion at a time,
 * a while between, once for each clue, and again only after Elliott has
 * wandered off from it and a good while has passed. It never takes a
 * companion far from Elliott, nor anywhere the walking rules don't let it
 * walk straight to, and it gives up as soon as Elliott has found the clue,
 * walks off, or keeps them waiting long.
 */

/** A clue there is to examine, where it lies. */
export interface ClueAt {
  key: string;
  x: number;
  z: number;
}

/** A following companion that might notice a clue. */
export interface Helper {
  key: string;
  nature: Nature<Species>;
  body: Body;
  /** On the ground and about its own business: not in the basket, not at play. */
  free: boolean;
}

/** A companion off to a clue: going there, or by it. */
export interface Sniff {
  clue: string;
  at: { x: number; z: number };
  /** Where it sits or stands, beside the clue on Elliott's side. */
  spot: { x: number; z: number };
  phase: "going" | "by";
  /** When it took up this phase. */
  since: number;
  /** How long it has been brought up short going there, and how long Elliott has stood by the clue, in seconds. */
  stuck: number;
  found: number;
}

/** A clue some companion has helped with: when, and whether Elliott has wandered off from it since. */
interface Helped {
  x: number;
  z: number;
  at: number;
  wandered: boolean;
}

/** What the companions keep of the clues, between steps. */
export interface Noticing {
  /** The companion off to a clue now, by its key, if any. */
  sniffs: Map<string, Sniff>;
  helped: Map<string, Helped>;
  /** When a companion may next notice a clue. */
  next: number;
}

export const NOTICING = {
  /** A clue within this of Elliott can be noticed, in metres. */
  reach: 25,
  /** A companion within this of Elliott can notice one. */
  near: 14,
  /** Elliott further than this from the clue, and the companion comes back; and they have wandered off from it. */
  leash: 32,
  /** Elliott within this of the clue has found it. */
  found: 2.4,
  /** Seconds before the first notice, between one and the next, and before a clue is noticed again. */
  first: 8,
  gap: 25,
  again: 120,
  /** The longest it goes, or waits by a clue, in seconds. */
  going: 25,
  waiting: 40,
} as const;

/** How much better suited each kind is to finding a clue, as metres of distance it is worth: a dog's nose first. */
const SUITED: Record<Species, number> = { dog: 0, fox: 6, cat: 10, hedgehog: 14 };
/** Each kind's own pace on the way there, in metres a second: a dog's nose-down walk, a cat's slink, a hedgehog's trundle. */
const PACE: Record<Species, number> = { dog: 1.7, fox: 1.8, cat: 1.3, hedgehog: 0.8 };
/** How it waits by a clue: sitting or standing, facing Elliott or the clue, and greeting (a dog's tail going, a cat's tail up). */
const BY: Record<Species, { rest: "sit" | "stand"; face: "elliott" | "clue"; greet: boolean }> = {
  dog: { rest: "sit", face: "elliott", greet: true },
  cat: { rest: "sit", face: "elliott", greet: true },
  fox: { rest: "stand", face: "clue", greet: false },
  hedgehog: { rest: "stand", face: "clue", greet: false },
};

export function noticing(time = 0): Noticing {
  return { sniffs: new Map(), helped: new Map(), next: time + NOTICING.first };
}

const distance = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/** Whether the walking rules take a body straight from one spot to another. */
function walksTo(ground: WalkGround, from: { x: number; z: number }, to: { x: number; z: number }): boolean {
  return distance(walk(ground, from, to.x - from.x, to.z - from.z), to) < 0.4;
}

/**
 * Where a companion waits by a clue: beside it on Elliott's side, a little
 * round so it never hides the clue, on ground it can stand on and walk
 * straight to from where it is; null where there is none.
 */
export function bySpot(clue: { x: number; z: number }, elliott: { x: number; z: number }, from: { x: number; z: number }, nature: Nature<Species>, ground: WalkGround): { x: number; z: number } | null {
  const toward = Math.atan2(elliott.x - clue.x, elliott.z - clue.z);
  const r = 0.3 + 0.22 * nature.size;
  for (const turn of [0.85, -0.85, 1.6, -1.6, 0]) {
    const spot = { x: clue.x + Math.sin(toward + turn) * r, z: clue.z + Math.cos(toward + turn) * r };
    if (canStand(ground, spot.x, spot.z) && walksTo(ground, from, spot)) return spot;
  }
  return null;
}

/** Whether a clue is there to be noticed now: never helped with, or helped long ago and wandered off from since. */
function noticeable(state: Noticing, clue: string, time: number): boolean {
  const helped = state.helped.get(clue);
  return helped === undefined || (helped.wandered && time - helped.at > NOTICING.again);
}

/** The companion best suited to a clue to notice now, and where it would wait by it; null when there is none, or it isn't time. */
export function chooseHelp(state: Noticing, clues: readonly ClueAt[], helpers: readonly Helper[], leader: Leader, groundOf: (species: Species) => WalkGround, time: number): { helper: string; clue: ClueAt; spot: { x: number; z: number } } | null {
  if (state.sniffs.size > 0 || time < state.next || leader.aloft) return null;
  const options: { helper: Helper; clue: ClueAt; score: number }[] = [];
  for (const clue of clues) {
    const far = distance(clue, leader);
    if (far > NOTICING.reach || far < NOTICING.found || !noticeable(state, clue.key, time)) continue;
    for (const helper of helpers) {
      if (!helper.free || distance(helper.body, leader) > NOTICING.near) continue;
      options.push({ helper, clue, score: SUITED[helper.nature.species] + distance(helper.body, clue) });
    }
  }
  options.sort((a, b) => a.score - b.score);
  for (const { helper, clue } of options) {
    const spot = bySpot(clue, leader, helper.body, helper.nature, groundOf(helper.nature.species));
    if (spot) return { helper: helper.key, clue, spot };
  }
  return null;
}

/** A companion is done with its clue: it is helped, and the next notice waits a while. */
export function finishSniff(state: Noticing, helper: string, time: number): void {
  const sniff = state.sniffs.get(helper);
  if (!sniff) return;
  state.sniffs.delete(helper);
  state.helped.set(sniff.clue, { ...sniff.at, at: time, wandered: false });
  state.next = time + NOTICING.gap;
}

/**
 * One step of the companions' noticing: a companion whose clue has been
 * examined or has gone, or who is no longer free, is done with it; the clues
 * helped with learn whether Elliott has wandered off; and, when it is time,
 * the one best suited notices a clue.
 */
export function stepNoticing(state: Noticing, clues: readonly ClueAt[], helpers: readonly Helper[], leader: Leader, groundOf: (species: Species) => WalkGround, time: number): void {
  for (const [key, sniff] of state.sniffs) {
    const helper = helpers.find((h) => h.key === key);
    if (!helper?.free || !clues.some((c) => c.key === sniff.clue)) finishSniff(state, key, time);
  }
  for (const helped of state.helped.values()) if (distance(helped, leader) > NOTICING.leash) helped.wandered = true;
  const help = chooseHelp(state, clues, helpers, leader, groundOf, time);
  if (help) state.sniffs.set(help.helper, { clue: help.clue.key, at: { x: help.clue.x, z: help.clue.z }, spot: help.spot, phase: "going", since: time, stuck: 0, found: 0 });
}

/**
 * One step of a companion off to its clue: going there at its own pace (or
 * Elliott's, if they are walking, so it keeps ahead), then waiting by it as
 * its kind does. Returns "done" without moving it once it is through: Elliott
 * has stood by the clue a moment, walked off, or kept it waiting long, or it
 * was brought up short on the way.
 */
export function stepSniff(body: Body, sniff: Sniff, nature: Nature<Species>, leader: Leader, ground: WalkGround, obstacles: readonly Obstacle[], time: number, seconds: number): "going" | "by" | "done" {
  sniff.found = distance(leader, sniff.at) < NOTICING.found ? sniff.found + seconds : 0;
  const long = sniff.phase === "going" ? NOTICING.going : NOTICING.waiting;
  if (sniff.found > 1.5 || distance(leader, sniff.at) > NOTICING.leash || time - sniff.since > long || sniff.stuck > 2) return "done";
  const { species } = nature;
  if (sniff.phase === "going" && distance(body, sniff.spot) < 0.35) {
    sniff.phase = "by";
    sniff.since = time;
  }
  if (sniff.phase === "going") {
    const step = stepBody(body, nature, { go: sniff.spot, pace: Math.max(PACE[species], leader.speed * 1.15), arrive: 0.15 }, ground, obstacles, seconds);
    sniff.stuck = step.asked > 0.01 && step.moved < step.asked * 0.3 ? sniff.stuck + seconds : 0;
    return "going";
  }
  const by = BY[species];
  const look = by.face === "elliott" ? leader : sniff.at;
  stepBody(body, nature, { stay: by.rest, face: Math.atan2(look.x - body.x, look.z - body.z) }, ground, obstacles, seconds);
  if (by.greet) body.greetUntil = Math.max(body.greetUntil, time + 0.4);
  return "by";
}

/** How far down a companion's nose is to the ground, 0 to 1: a dog's, all the way there. */
export function noseDown(sniff: Sniff | undefined, species: Species): number {
  return species === "dog" && sniff?.phase === "going" ? 1 : 0;
}

/** Whether some companion waits by a clue now. */
export function companionBy(state: Noticing, clue: string): boolean {
  for (const sniff of state.sniffs.values()) if (sniff.clue === clue && sniff.phase === "by") return true;
  return false;
}

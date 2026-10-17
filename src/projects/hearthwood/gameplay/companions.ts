import type { Species } from "../engine/strays";
import { choice, stepBody, type Aim, type Body, type Nature, type Obstacle } from "./behaviour";
import { canStand, type WalkGround } from "./walking";

/*
 * The companions: the cats, dogs, foxes and hedgehogs Elliott has befriended, who follow them.
 * Each keeps near Elliott at a distance of its own (a cuddly one close, an
 * independent one further out, a cat further than a dog), on a side of its
 * own behind them, so they spread out rather than queue. Walking, they keep
 * up, now and then nosing off to something nearby and running to catch up;
 * when Elliott stops they come in and sit, and lie down if Elliott stays;
 * by the campfire they settle round the fire. Left far behind (after a long
 * glide on the broom, or stuck on the far side of a lake) they come running
 * from out of sight: one that is far off and out of view is put on Elliott's
 * trail behind them, out of view too, so nothing ever appears or vanishes
 * where Elliott can see it. They keep clear of Elliott and of each other,
 * and never stand in Elliott's way.
 *
 * At most `FOLLOWING` follow at once; the rest wait at camp, napping by the
 * fire, and petting one there brings it along, sending the one who has
 * walked longest back to rest in its place.
 */

/** How many companions follow at once; the rest wait at camp. */
export const FOLLOWING = 3;

/** A companion as kept: who it is and what Elliott named it. */
export interface Companion {
  /** The stray it was, which is also its seed's place in the world. */
  id: string;
  species: Species;
  seed: string;
  name: string;
  /** Following Elliott, or waiting at camp. */
  following: boolean;
  /** When it last came along, as a count, so the one who has walked longest can be sent to rest. */
  joined: number;
}

/** Where Elliott is, and how they are going, as a companion follows them. */
export interface Leader {
  x: number;
  z: number;
  heading: number;
  speed: number;
  /** In a hop or on the broom. */
  aloft: boolean;
}

/** What a companion's mind keeps between steps. */
export interface FollowMind {
  /** Off nosing at a spot until a time, or null. */
  nosing: { x: number; z: number; until: number } | null;
  /** When it next thinks of nosing about. */
  nextNose: number;
  /** How long Elliott has been still, in seconds. */
  still: number;
  /** How long it has been brought up short while trying to go somewhere, in seconds. */
  stuck: number;
  picks: number;
}

/** Where the campfire is, for settling round it. */
export interface Hearth {
  x: number;
  z: number;
}

export interface FollowContext {
  leader: Leader;
  hearth: Hearth;
  /** Its place among the companions following, for its side and its spot by the fire. */
  index: number;
  count: number;
  time: number;
  ground: WalkGround;
  obstacles: readonly Obstacle[];
  /** Whether a point on the ground is in Elliott's view (the camera's), so nothing is moved where it can be seen. */
  seen: (x: number, z: number) => boolean;
}

/** Beyond this, in metres, a companion out of view is put back on Elliott's trail. */
export const LEFT_BEHIND = 40;
/** How far behind Elliott a companion is put when it catches up from out of view, in metres. */
const TRAIL = { near: 16, far: 26 } as const;
/** Elliott within this of the fire, still, and the companions settle round it. */
const BY_THE_FIRE = 7;
/** How far from the fire they settle, in metres. */
const FIRESIDE = 2.4;
/** Elliott still this long and they come in and sit; this long and they lie down. */
const SETTLE = { sit: 1.2, lie: 14 } as const;

export function followMind(seedTime = 0): FollowMind {
  return { nosing: null, nextNose: seedTime + 8, still: 0, stuck: 0, picks: 0 };
}

/** How far from Elliott it likes to keep, in metres. */
export function keepsNear(nature: Nature): number {
  const base = { cat: 3.2, dog: 2.4 + 0.4 * nature.size, fox: 3.8, hedgehog: 1.5 }[nature.species];
  return Math.max(1.4, base - 1.1 * nature.affection);
}

/** The side of Elliott it keeps to, as a turn from straight behind them: alternating left and right, further round for each. */
function sideOf(index: number): number {
  const step = 0.55 + 0.25 * Math.floor(index / 2);
  return index % 2 === 0 ? -step : step;
}

/** Its spot by the fire: round the far side from where the seats are, each its own. */
export function firesideSpot(hearth: Hearth, index: number, count: number): { x: number; z: number; face: number } {
  const angle = Math.PI * 0.35 + (index + 0.5) * ((Math.PI * 1.3) / Math.max(count, 3));
  const x = hearth.x + Math.cos(angle) * FIRESIDE;
  const z = hearth.z + Math.sin(angle) * FIRESIDE;
  return { x, z, face: Math.atan2(hearth.x - x, hearth.z - z) };
}

/** Where it keeps while Elliott walks: behind them, on its own side, at its own distance. */
function trailSpot(leader: Leader, nature: Nature, index: number): { x: number; z: number } {
  const angle = leader.heading + Math.PI + sideOf(index);
  const distance = keepsNear(nature);
  return { x: leader.x + Math.sin(angle) * distance, z: leader.z + Math.cos(angle) * distance };
}

/**
 * A spot on Elliott's trail behind them, out of view and on ground it can
 * stand on, for a companion to come running from; null when there is none
 * this step (it tries again on the next).
 */
export function catchUpSpot(leader: Leader, ground: WalkGround, seen: (x: number, z: number) => boolean, index: number): { x: number; z: number } | null {
  for (let k = 0; k < 9; k++) {
    const spread = (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * 0.28 + sideOf(index) * 0.3;
    const angle = leader.heading + Math.PI + spread;
    const r = TRAIL.near + ((k * 3) % (TRAIL.far - TRAIL.near));
    const x = leader.x + Math.sin(angle) * r;
    const z = leader.z + Math.cos(angle) * r;
    if (canStand(ground, x, z) && !seen(x, z)) return { x, z };
  }
  return null;
}

/** One step of a companion following Elliott: what it aims for, and its body moved by it. */
export function stepCompanion(body: Body, mind: FollowMind, nature: Nature, context: FollowContext, seconds: number): void {
  const { leader, hearth, index, count, time, ground, obstacles, seen } = context;
  const d = Math.hypot(body.x - leader.x, body.z - leader.z);

  // Far behind and out of sight: back on Elliott's trail, out of sight too, to come running.
  if (!leader.aloft && (d > LEFT_BEHIND || (mind.stuck > 2.5 && d > 10)) && !seen(body.x, body.z)) {
    const spot = catchUpSpot(leader, ground, seen, index);
    if (spot) {
      body.x = spot.x;
      body.z = spot.z;
      body.heading = Math.atan2(leader.x - spot.x, leader.z - spot.z);
      mind.stuck = 0;
      mind.nosing = null;
    }
  }

  const moving = leader.speed > 0.4 || leader.aloft;
  mind.still = moving ? 0 : mind.still + seconds;
  const busy = (nature.energy + 1) / 2;
  let aim: Aim;

  if (moving) {
    // Now and then, while Elliott walks, it noses off to something just aside of the way.
    if (mind.nosing === null && time >= mind.nextNose && d < keepsNear(nature) + 3 && !leader.aloft) {
      mind.picks++;
      const side = choice(nature, 11, mind.picks) < 0.5 ? -1 : 1;
      const ahead = 3 + 4 * choice(nature, 12, mind.picks);
      const out = 2.5 + 3 * choice(nature, 13, mind.picks);
      mind.nosing = {
        x: leader.x + Math.sin(leader.heading) * ahead + Math.cos(leader.heading) * out * side,
        z: leader.z + Math.cos(leader.heading) * ahead - Math.sin(leader.heading) * out * side,
        until: time + 1.5 + 2 * choice(nature, 14, mind.picks),
      };
    }
    if (mind.nosing && (time > mind.nosing.until + 6 || d > keepsNear(nature) + 10)) {
      mind.nosing = null;
      mind.nextNose = time + (18 - 10 * busy) * (0.6 + 0.8 * choice(nature, 15, mind.picks));
    }
    if (mind.nosing) {
      const there = Math.hypot(body.x - mind.nosing.x, body.z - mind.nosing.z) < 0.6;
      if (there && time > mind.nosing.until) {
        mind.nosing = null;
        mind.nextNose = time + (18 - 10 * busy) * (0.6 + 0.8 * choice(nature, 15, mind.picks));
      }
    }
    if (mind.nosing) {
      const there = Math.hypot(body.x - mind.nosing.x, body.z - mind.nosing.z) < 0.6;
      aim = there ? { stay: "stand", face: null } : { go: mind.nosing, pace: Math.max(leader.speed * 1.3, { cat: 2.5, dog: 3, fox: 3.2, hedgehog: 1.2 }[nature.species]) };
      if (there) mind.nosing.until = Math.min(mind.nosing.until, time + 3);
    } else {
      const spot = leader.aloft ? { x: leader.x, z: leader.z } : trailSpot(leader, nature, index);
      const gap = Math.hypot(body.x - spot.x, body.z - spot.z);
      // Close in, it keeps Elliott's pace; behind, it runs to catch up, the further the faster.
      const pace = leader.speed * (gap < 1 ? 1 : 1.15) + Math.max(0, gap - 1) * 1.6;
      aim = { go: spot, pace, arrive: 0.5 };
    }
  } else {
    mind.nosing = null;
    const byFire = Math.hypot(leader.x - hearth.x, leader.z - hearth.z) < BY_THE_FIRE;
    if (byFire && mind.still > SETTLE.sit) {
      const spot = firesideSpot(hearth, index, count);
      const there = Math.hypot(body.x - spot.x, body.z - spot.z) < 0.5;
      aim = there ? { stay: mind.still > SETTLE.sit + 4 ? "lie" : "sit", face: spot.face } : { go: spot, pace: 1.4 + 1.6 * Math.min(1, Math.hypot(body.x - spot.x, body.z - spot.z) / 6), arrive: 0.3 };
    } else {
      const near = keepsNear(nature);
      const face = Math.atan2(leader.x - body.x, leader.z - body.z);
      if (d > near + 0.8) {
        const toward = { x: leader.x + ((body.x - leader.x) / d) * near, z: leader.z + ((body.z - leader.z) / d) * near };
        aim = { go: toward, pace: 1.2 + Math.max(0, d - near) * 1.5, arrive: 0.4 };
      } else {
        const lie = mind.still > SETTLE.lie * (0.5 + busy);
        aim = { stay: mind.still < SETTLE.sit ? "stand" : lie ? "lie" : "sit", face };
      }
    }
  }

  const before = { x: body.x, z: body.z };
  const step = stepBody(body, nature, aim, ground, obstacles, seconds);
  // Brought up short by the land while it was trying to get somewhere: stuck, a while on.
  mind.stuck = "go" in aim && step.asked > 0.02 && step.moved < step.asked * 0.3 ? mind.stuck + seconds : 0;
  if (Math.hypot(body.x - before.x, body.z - before.z) > 0.5) mind.stuck = 0;
}

/** The companions who follow, in the order they keep their sides: the earliest to join first. */
export function followers(companions: readonly Companion[]): Companion[] {
  return companions.filter((c) => c.following).sort((a, b) => a.joined - b.joined);
}

/** A newly befriended animal joins: it follows, and if too many now follow, the one who has walked longest goes to rest at camp. */
export function join(companions: readonly Companion[], joining: Omit<Companion, "following" | "joined">): Companion[] {
  const joined = Math.max(0, ...companions.map((c) => c.joined)) + 1;
  return comeAlong([...companions, { ...joining, following: false, joined }], joining.id);
}

/** A companion waiting at camp comes along; if too many now follow, the one who has walked longest goes to rest. */
export function comeAlong(companions: readonly Companion[], id: string): Companion[] {
  const joined = Math.max(0, ...companions.map((c) => c.joined)) + 1;
  let out = companions.map((c) => (c.id === id ? { ...c, following: true, joined } : c));
  const walking = followers(out);
  if (walking.length > FOLLOWING) {
    const longest = walking[0].id;
    out = out.map((c) => (c.id === longest ? { ...c, following: false } : c));
  }
  return out;
}

/** Renames a companion. */
export function rename(companions: readonly Companion[], id: string, name: string): Companion[] {
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new Error("A companion's name can't be empty");
  return companions.map((c) => (c.id === id ? { ...c, name: trimmed } : c));
}

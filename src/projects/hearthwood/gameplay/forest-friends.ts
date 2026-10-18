import type { FriendSpecies, Trunk } from "../engine/wildlife";
import type { Bond } from "./befriending";
import { choice, stepBody, type Aim, type Body, type Nature, type Obstacle } from "./behaviour";
import type { Elliott } from "./roaming";
import type { WalkGround } from "./walking";

/*
 * A forest friend's day, as rules: a red squirrel, a mountain hare or a roe
 * deer that stays home but comes to know Elliott. Round its home it goes
 * about its own life: the squirrel noses about the foot of its tree, sits up
 * to nibble and now and then runs up the trunk and down again; the hare
 * grazes, hops a little way, sits up to look round and lies up in its form;
 * the deer grazes its meadow round dawn and dusk and lies up in its bed in
 * the woods through the day and the night.
 *
 * A stranger keeps its distance: come too near and it is off, the squirrel
 * up its tree to cling there and watch, the hare and the deer bounding away
 * to stop at a safe distance and look back, further if Elliott came
 * running. Elliott being calm near it (walking or still, never running) for
 * a while counts as a visit, and each visit lets Elliott a little nearer;
 * after three visits it knows them. A treat held out to a hare or a squirrel
 * near enough wins it at once. Known, it comes out to greet Elliott when
 * they come by instead of fleeing, then goes back about its day. Nothing is
 * hunted or harmed, and knowing Elliott is never forgotten: as with the
 * strays, warmth only grows. Its knowing is kept as a bond's warmth (a third
 * for each visit), so it is kept on the device as a stray's is.
 */

/** A squirrel up its trunk: how high it is, where it is going, which way round the trunk it clings, and how long it stays. */
export interface Climb {
  height: number;
  goal: number;
  /** Which way out from the trunk it faces, in radians from +z towards +x. */
  side: number;
  until: number;
}

export interface FriendMind {
  plan: Aim;
  until: number;
  picks: number;
  /** When it last greeted Elliott. */
  greeted: number;
  climb: Climb | null;
}

/** What a friend keeps to: its home, how far it roams, a squirrel's trunk, a deer's bed in the woods. */
export interface FriendHome {
  home: { x: number; z: number };
  roam: number;
  trunk: Trunk | null;
  bed: { x: number; z: number } | null;
}

export function friendMind(): FriendMind {
  return { plan: { stay: "stand" }, until: -Infinity, picks: 0, greeted: -Infinity, climb: null };
}

/** Within this of Elliott a friend notices them, in metres. */
export const FRIEND_NOTICE: Record<FriendSpecies, number> = { squirrel: 18, hare: 30, deer: 45 };
/** How near a stranger lets Elliott come before it is off, in metres, and how far it runs on past that. */
const FLEE: Record<FriendSpecies, { near: number; on: number; pace: number }> = {
  squirrel: { near: 9, on: 0, pace: 4.5 },
  hare: { near: 16, on: 10, pace: 9 },
  deer: { near: 28, on: 16, pace: 9.5 },
};
/** A visit: Elliott calm within `near` metres for `calm` seconds; it ends once they are further than `gone`. */
export const KNOWING = { near: 22, calm: 12, gone: 55, visits: 3 } as const;
/** How near a known friend comes to greet Elliott, in metres, and how long before it greets them again, in seconds. */
const GREET = { near: 2.3, again: 45, length: 4 } as const;
/** How fast a squirrel climbs, metres a second, and how high it goes when fleeing. */
const CLIMB = { up: 1.6, down: 1.1, flee: 3.2 } as const;
/** Running at a stranger startles it this much sooner. */
const STARTLE = 1.6;

export const knows = (bond: Bond) => bond.warmth >= 1;
/** How many visits it remembers. */
export const visitsOf = (bond: Bond) => Math.round(bond.warmth * KNOWING.visits);

/**
 * Elliott near, or not, for some seconds: calm near it, a visit's time
 * builds, and once it is long enough the friend knows Elliott a third
 * better; going well away ends the visit. The bond's `visit` holds this
 * visit's calm seconds, past `KNOWING.calm` once it has counted.
 */
export function beKnown(bond: Bond, distance: number, calm: boolean, seconds: number): Bond {
  if (knows(bond)) return bond;
  if (distance > KNOWING.gone) return bond.visit === 0 ? bond : { ...bond, visit: 0 };
  if (distance > KNOWING.near || !calm || seconds <= 0) return bond;
  const visit = bond.visit + seconds;
  const counted = bond.visit < KNOWING.calm && visit >= KNOWING.calm;
  return { warmth: counted ? Math.min(1, bond.warmth + 1 / KNOWING.visits + 1e-6) : bond.warmth, visit };
}

/** A treat held out near enough: a hare or a squirrel knows Elliott at once. A deer takes no treats. */
export function takesTreats(species: FriendSpecies): boolean {
  return species !== "deer";
}

/** How near a stranger lets Elliott come, closing with each visit. */
export function fleesWithin(species: FriendSpecies, bond: Bond, calm: boolean): number {
  if (knows(bond)) return 0;
  const base = FLEE[species].near * (1 - 0.28 * visitsOf(bond));
  return calm ? base : base * STARTLE;
}

/** Whether a stranger is near enough, and still enough, for a treat to be held out to it. */
export const treatReach = 3.2;

/** Whether a squirrel is up its tree. */
export const climbing = (mind: FriendMind) => mind.climb !== null && mind.climb.height > 0.02;

function homeward(body: Body, home: { x: number; z: number }, roam: number): boolean {
  return Math.hypot(body.x - home.x, body.z - home.z) > roam * 1.6;
}

/** The next thing it does round home on its own, and for how long. */
function idlePlan(species: FriendSpecies, nature: Nature, body: Body, place: FriendHome, abroad: number, picks: number): { plan: Aim; seconds: number } {
  const roll = choice(nature, 21, picks);
  const along = (low: number, high: number) => low + (high - low) * choice(nature, 22, picks);
  const angle = choice(nature, 23, picks) * Math.PI * 2;
  const reach = Math.sqrt(choice(nature, 24, picks));
  const near = (centre: { x: number; z: number }, r: number) => ({ x: centre.x + Math.cos(angle) * r * reach, z: centre.z + Math.sin(angle) * r * reach });
  switch (species) {
    case "squirrel":
      if (homeward(body, place.home, place.roam) || roll < 0.45) return { plan: { go: near(place.home, place.roam), pace: 1.6 }, seconds: along(2, 5) };
      if (roll < 0.85) return { plan: { stay: "sit", face: angle }, seconds: along(3, 8) };
      return { plan: { stay: "stand", face: angle }, seconds: along(1, 3) };
    case "hare":
      if (homeward(body, place.home, place.roam) || roll < 0.3) return { plan: { go: near(place.home, place.roam), pace: 0.7 }, seconds: along(3, 7) };
      if (roll < 0.55) return { plan: { stay: "sit", face: angle }, seconds: along(3, 6) };
      if (roll < 0.75) return { plan: { stay: "lie", face: angle }, seconds: along(8, 20) };
      return { plan: { stay: "stand", face: angle }, seconds: along(4, 10) };
    case "deer": {
      // Through the day and the night it lies up in its bed; at dawn and dusk it is out on its meadow, grazing.
      const bed = place.bed ?? place.home;
      if (abroad < 0.35) {
        const atBed = Math.hypot(body.x - bed.x, body.z - bed.z) < 2;
        return atBed ? { plan: { stay: "lie", face: angle }, seconds: along(20, 40) } : { plan: { go: bed, pace: 1.1 }, seconds: 30 };
      }
      if (homeward(body, place.home, place.roam) || roll < 0.35) return { plan: { go: near(place.home, place.roam), pace: 0.9 }, seconds: along(5, 10) };
      if (roll < 0.85) return { plan: { stay: "sit", face: angle }, seconds: along(6, 14) };
      return { plan: { stay: "stand", face: angle }, seconds: along(3, 6) };
    }
  }
}

/** Where a hare or a deer bounds off to: on away from Elliott, but not too far from home. */
function awayFrom(body: Body, elliott: Elliott, distance: number, home: { x: number; z: number }, roam: number): { x: number; z: number } {
  const d = Math.max(0.01, Math.hypot(body.x - elliott.x, body.z - elliott.z));
  let x = elliott.x + ((body.x - elliott.x) / d) * distance;
  let z = elliott.z + ((body.z - elliott.z) / d) * distance;
  const fromHome = Math.hypot(x - home.x, z - home.z);
  const limit = roam * 3;
  if (fromHome > limit) {
    x = home.x + ((x - home.x) / fromHome) * limit;
    z = home.z + ((z - home.z) / fromHome) * limit;
  }
  return { x, z };
}

/** A squirrel's climb for a step: up towards its goal or down, and off the trunk once it is down and its time is up. */
function stepClimb(mind: FriendMind, trunk: Trunk, time: number, seconds: number): void {
  const climb = mind.climb;
  if (!climb) return;
  const goal = Math.min(climb.goal, trunk.bare);
  climb.height = climb.height < goal ? Math.min(goal, climb.height + CLIMB.up * seconds) : Math.max(goal, climb.height - CLIMB.down * seconds);
  if (time >= climb.until) climb.goal = 0;
  if (climb.goal === 0 && climb.height <= 0) mind.climb = null;
}

/** Up the tree, facing out on the side away from what it is getting away from. */
function climbUp(mind: FriendMind, body: Body, trunk: Trunk, away: { x: number; z: number } | null, goal: number, until: number): void {
  const side = away ? Math.atan2(trunk.x - away.x, trunk.z - away.z) : body.heading + Math.PI;
  mind.climb = { height: mind.climb?.height ?? 0, goal, side, until };
}

/**
 * One step of a forest friend: what it does, and its body moved by it.
 * `abroad` is how far into its waking hours a deer is (dawn and dusk);
 * `bond` is how well it knows Elliott, which `beKnown` keeps.
 */
export function stepFriend(
  species: FriendSpecies,
  body: Body,
  mind: FriendMind,
  nature: Nature,
  bond: Bond,
  place: FriendHome,
  elliott: Elliott,
  abroad: number,
  time: number,
  ground: WalkGround,
  obstacles: readonly Obstacle[],
  seconds: number,
): void {
  const d = Math.hypot(body.x - elliott.x, body.z - elliott.z);
  const noticing = !elliott.aloft && d < FRIEND_NOTICE[species];
  const flee = fleesWithin(species, bond, elliott.calm);
  const { trunk } = place;
  let aim: Aim | null = null;

  if (trunk) stepClimb(mind, trunk, time, seconds);
  if (climbing(mind)) {
    // Up the tree it clings and watches; known, or once Elliott is well off, it comes down when its time is up.
    if (noticing && d < flee + 4 && mind.climb) mind.climb.until = Math.max(mind.climb.until, time + 3);
    if (knows(bond) && noticing && mind.climb) mind.climb.goal = 0;
    body.speed = 0;
    return;
  }

  if (noticing && knows(bond)) {
    // A friend comes out to greet Elliott, and then goes back about its day.
    const greetingDue = time - mind.greeted > GREET.again;
    if (greetingDue && d > GREET.near + 0.4) {
      aim = { go: { x: elliott.x + ((body.x - elliott.x) / d) * GREET.near, z: elliott.z + ((body.z - elliott.z) / d) * GREET.near }, pace: species === "deer" ? 1.4 : species === "hare" ? 1.6 : 2.2, arrive: 0.4 };
    } else if (greetingDue) {
      mind.greeted = time;
      body.greetUntil = time + GREET.length;
    }
    if (time < body.greetUntil) aim = { stay: species === "hare" ? "sit" : "stand", face: Math.atan2(elliott.x - body.x, elliott.z - body.z) };
  } else if (noticing && d < flee) {
    if (species === "squirrel" && trunk) {
      const atTrunk = Math.hypot(body.x - trunk.x, body.z - trunk.z) < trunk.radius + 0.5;
      if (atTrunk) {
        climbUp(mind, body, trunk, elliott, CLIMB.flee + choice(nature, 25, mind.picks) * 1.5, time + 8);
        body.speed = 0;
        return;
      }
      aim = { go: { x: trunk.x, z: trunk.z }, pace: FLEE.squirrel.pace, arrive: trunk.radius + 0.3 };
    } else {
      aim = { go: awayFrom(body, elliott, flee + FLEE[species].on, place.home, place.roam), pace: FLEE[species].pace, arrive: 1 };
    }
    mind.until = -Infinity;
  } else if (noticing && d < flee + FLEE[species].on + 6) {
    // Safe again, it stops and looks back: a hare sitting up, a deer standing tall.
    aim = { stay: species === "hare" ? "sit" : "stand", face: Math.atan2(elliott.x - body.x, elliott.z - body.z) };
  }

  if (aim === null) {
    const arrived = "go" in mind.plan && Math.hypot(mind.plan.go.x - body.x, mind.plan.go.z - body.z) < 0.6;
    if (time >= mind.until || arrived) {
      mind.picks++;
      // Now and then, a squirrel runs up its tree for the joy of it.
      if (species === "squirrel" && trunk && choice(nature, 26, mind.picks) < 0.12 && Math.hypot(body.x - trunk.x, body.z - trunk.z) < trunk.radius + 1) {
        climbUp(mind, body, trunk, null, 1.5 + choice(nature, 27, mind.picks) * 2, time + 4 + choice(nature, 28, mind.picks) * 5);
        body.speed = 0;
        return;
      }
      const next = idlePlan(species, nature, body, place, abroad, mind.picks);
      mind.plan = next.plan;
      mind.until = time + next.seconds;
    }
    aim = mind.plan;
  }
  stepBody(body, nature, aim, ground, obstacles, seconds);
}

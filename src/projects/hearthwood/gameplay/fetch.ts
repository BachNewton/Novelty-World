import { NOT_PLAYING, type DogPlay } from "../dogs/motion";
import { stepBody, type Body, type Nature, type Obstacle } from "./behaviour";
import { canStand, type WalkGround } from "./walking";
import type { Point3 } from "./offering";

/*
 * Fetch, as rules. Elliott throws a stick where they look (or face): it
 * flies a short arc, the same however the frames are cut, and comes down on
 * the ground, or on water, where it floats; on water too deep to wade it
 * washes to the nearest shore, and one with no shore near is simply gone
 * (a stick out of reach is just a new stick next time). A dog friendly
 * enough to play bounds after it at a gallop, picks it up in its jaws,
 * trots back with a happy wag, drops it at Elliott's feet and sits looking
 * up, waiting for the next throw; a companion play-bows first. A cat
 * watches a stick fly and land, and a playful one goes to bat at it, but a
 * cat never fetches.
 */

/** The throw: how fast the stick leaves the hand (metres a second), how steeply above the way Elliott looks, and the gravity it falls under. */
export const THROW = { speed: 10, lift: 0.5, gravity: 9.8 } as const;
/** The stick's flight is worked out on a fixed grid of moments this far apart, in seconds, so it lands the same at any frame rate. */
const TICK = 1 / 120;
/** How fast a floating stick washes towards the shore, in metres a second, and how far off a shore is looked for, in metres. */
const DRIFT = 0.7;
const SHORE_SEARCH = 36;
/** How steeply the stick tumbles end over end in flight, in radians a second. */
export const TUMBLE = 11;

/** A stick out of Elliott's hand: in the air, floating on water (washing to `shore`, or bobbing where a dog can wade to it), or lying on the ground. */
export type Stick =
  | { phase: "flying"; from: Point3; velocity: Point3; age: number }
  | { phase: "floating"; x: number; z: number; shore: { x: number; z: number } | null; age: number }
  | { phase: "lying"; x: number; z: number; age: number };

/** Where a thrown stick is, and which way it points: its heading along the ground, and (in the air) how far it has tumbled. */
export interface StickPlace {
  x: number;
  y: number;
  z: number;
  heading: number;
  tumble: number;
}

/** What a stick lands on: the ground, and the water over it. */
export type StickGround = WalkGround;

/** A stick thrown from a point along a way (a unit vector): up at `lift` radians above it, never down. */
export function throwStick(from: Point3, way: Point3): Stick {
  const level = Math.hypot(way.x, way.z);
  const heading = level > 1e-6 ? Math.atan2(way.x, way.z) : 0;
  const pitch = Math.atan2(way.y, Math.max(1e-6, level));
  const up = Math.min(1.1, Math.max(0.2, pitch + THROW.lift));
  const along = Math.cos(up) * THROW.speed;
  return { phase: "flying", from: { ...from }, velocity: { x: Math.sin(heading) * along, y: Math.sin(up) * THROW.speed, z: Math.cos(heading) * along }, age: 0 };
}

/** Where a flying stick is at an age of its flight. */
function flownTo(stick: Extract<Stick, { phase: "flying" }>, age: number): Point3 {
  return {
    x: stick.from.x + stick.velocity.x * age,
    y: stick.from.y + stick.velocity.y * age - 0.5 * THROW.gravity * age * age,
    z: stick.from.z + stick.velocity.z * age,
  };
}

const surfaceAt = (ground: StickGround, x: number, z: number) => Math.max(ground.heightAt(x, z), ground.waterAt(x, z));

/** The nearest spot round a point that a walker can stand on, or null with none near. */
export function nearestShore(ground: StickGround, x: number, z: number): { x: number; z: number } | null {
  for (let r = 1; r <= SHORE_SEARCH; r += 1) {
    const ways = Math.max(8, Math.round(r * 4));
    for (let k = 0; k < ways; k++) {
      const angle = (k / ways) * Math.PI * 2;
      const sx = x + Math.cos(angle) * r;
      const sz = z + Math.sin(angle) * r;
      if (canStand(ground, sx, sz)) return { x: sx, z: sz };
    }
  }
  return null;
}

/** A stick come down at a point: on dry ground it lies there; on water it floats, washing to the shore if the water is too deep to wade. */
export function stickDownAt(ground: StickGround, x: number, z: number): Stick | null {
  if (ground.waterAt(x, z) <= ground.heightAt(x, z)) return { phase: "lying", x, z, age: 0 };
  if (canStand(ground, x, z)) return { phase: "floating", x, z, shore: null, age: 0 };
  const shore = nearestShore(ground, x, z);
  return shore === null ? null : { phase: "floating", x, z, shore, age: 0 };
}

/**
 * A thrown stick some seconds on: flying along its arc to where it comes
 * down, washing ashore, or lying still. Null once it is gone: washed off
 * with no shore near.
 */
export function stepStick(stick: Stick, ground: StickGround, seconds: number): Stick | null {
  if (seconds <= 0) return stick;
  switch (stick.phase) {
    case "flying": {
      const end = stick.age + seconds;
      // The grid's moments, from the last one passed: the same whichever frames the flight was cut into.
      for (let tick = Math.floor(stick.age / TICK) + 1; tick * TICK <= end; tick++) {
        const at = flownTo(stick, tick * TICK);
        if (at.y > surfaceAt(ground, at.x, at.z) || stick.velocity.y > THROW.gravity * tick * TICK) continue;
        const landed = stickDownAt(ground, at.x, at.z);
        return landed && stepStick(landed, ground, end - tick * TICK);
      }
      return { ...stick, age: end };
    }
    case "floating": {
      const age = stick.age + seconds;
      if (stick.shore === null) return { ...stick, age };
      const dx = stick.shore.x - stick.x;
      const dz = stick.shore.z - stick.z;
      const d = Math.hypot(dx, dz);
      const go = DRIFT * seconds;
      if (go >= d) return { phase: "lying", x: stick.shore.x, z: stick.shore.z, age: 0 };
      return { ...stick, x: stick.x + (dx / d) * go, z: stick.z + (dz / d) * go, age };
    }
    case "lying":
      return { ...stick, age: stick.age + seconds };
  }
}

/** Where a thrown stick is drawn: along its arc tumbling end over end, on the water, or lying on the ground, turned by `turn` (its own). */
export function stickPlace(stick: Stick, ground: StickGround, turn: number): StickPlace {
  switch (stick.phase) {
    case "flying": {
      const at = flownTo(stick, stick.age);
      return { ...at, heading: Math.atan2(stick.velocity.x, stick.velocity.z), tumble: stick.age * TUMBLE };
    }
    case "floating":
      return { x: stick.x, y: ground.waterAt(stick.x, stick.z), z: stick.z, heading: turn + stick.age * 0.15, tumble: 0 };
    case "lying":
      return { x: stick.x, y: ground.heightAt(stick.x, stick.z), z: stick.z, heading: turn, tumble: 0 };
  }
}

/** Whether a dog could take the stick now: down, and somewhere it can stand. */
export function within(stick: Stick, ground: StickGround): boolean {
  return stick.phase !== "flying" && (stick.phase === "lying" || stick.shore === null) && canStand(ground, stick.x, stick.z);
}

/** What a dog is doing in a game of fetch. */
export type FetchPhase = "chase" | "pick" | "carry" | "drop" | "bow" | "wait" | "ready" | "back";

export interface FetchMind {
  phase: FetchPhase;
  /** When the phase began and when a timed one ends, in seconds of the animals' clock. */
  since: number;
  until: number;
  /** A companion's joy: it play-bows. */
  companion: boolean;
}

/** What happened in a step: the stick taken up in its jaws, laid at Elliott's feet, or the game over for now. */
export type FetchEvent = "picked" | "dropped" | "done" | null;

/** How long each timed part takes, in seconds: picking the stick up, dropping it, a play bow, and how long a dog waits for the next throw before it goes back to its day. */
const TIMES = { pick: 0.55, drop: 0.6, bow: 1.4, wait: 12, ready: 14, chase: 22 } as const;
/** Elliott further than this from a waiting dog, in metres, and it gives up waiting. */
const WANDERED = 7;

/** A dog's mind as it sets off after a stick. */
export function fetchMind(time: number, companion: boolean): FetchMind {
  return { phase: "chase", since: time, until: time + TIMES.chase, companion };
}

const playful = (nature: Nature) => (nature.energy + 1) / 2;

/** How far ahead of its body a dog's mouth is, in metres, for its size. */
export const mouthReach = (nature: Nature) => 0.3 * nature.size;

/** Where a dog brings the stick: in front of Elliott, on its own side of them, close enough to be at their feet. */
function atTheirFeet(body: Body, nature: Nature, elliott: { x: number; z: number }): { x: number; z: number } {
  const d = Math.max(0.01, Math.hypot(body.x - elliott.x, body.z - elliott.z));
  const near = 1.25 + 0.22 * nature.size;
  return { x: elliott.x + ((body.x - elliott.x) / d) * near, z: elliott.z + ((body.z - elliott.z) / d) * near };
}

/** Where the dog's mouth is: where a stick it drops lands. */
export function mouthAt(body: Body, nature: Nature): { x: number; z: number } {
  const reach = mouthReach(nature);
  return { x: body.x + Math.sin(body.heading) * reach, z: body.z + Math.cos(body.heading) * reach };
}

const switchTo = (mind: FetchMind, phase: FetchPhase, time: number, length = 0) => {
  mind.phase = phase;
  mind.since = time;
  mind.until = time + length;
};

/**
 * One step of a dog playing fetch. `stick` is the stick it is after while
 * it chases (null once it is gone), and whether Elliott has taken it up
 * again while it waits; the scene moves the stick as the events say.
 */
export function stepFetcher(
  body: Body,
  mind: FetchMind,
  nature: Nature,
  stick: { x: number; z: number; within: boolean } | null,
  elliott: { x: number; z: number; holding: boolean },
  time: number,
  ground: WalkGround,
  obstacles: readonly Obstacle[],
  seconds: number,
): FetchEvent {
  const toElliott = Math.atan2(elliott.x - body.x, elliott.z - body.z);
  const fromElliott = Math.hypot(body.x - elliott.x, body.z - elliott.z);
  const happy = () => {
    body.greetUntil = Math.max(body.greetUntil, time + 0.3);
  };
  let event: FetchEvent = null;
  switch (mind.phase) {
    case "chase": {
      if (stick === null || time > mind.until) {
        switchTo(mind, "back", time);
        break;
      }
      const reach = mouthReach(nature);
      const d = Math.hypot(stick.x - body.x, stick.z - body.z);
      if (stick.within && d < reach + 0.25) {
        switchTo(mind, "pick", time, TIMES.pick);
        break;
      }
      // At a gallop, the more playful the faster; it slows only to put its mouth to the stick.
      const pace = 6.2 + 2.6 * playful(nature);
      stepBody(body, nature, { go: stick, pace, arrive: reach }, ground, obstacles, seconds);
      return null;
    }
    case "pick":
      if (time >= mind.until) {
        switchTo(mind, "carry", time);
        event = "picked";
      }
      stepBody(body, nature, { stay: "stand", face: stick ? Math.atan2(stick.x - body.x, stick.z - body.z) : null }, ground, obstacles, seconds);
      return event;
    case "carry": {
      happy();
      const spot = atTheirFeet(body, nature, elliott);
      if (Math.hypot(spot.x - body.x, spot.z - body.z) < 0.45) {
        switchTo(mind, "drop", time, TIMES.drop);
        break;
      }
      // A happy trot back, quicker from further off.
      const pace = Math.min(1.75 * nature.size + Math.max(0, fromElliott - 8) * 0.3, 5.5);
      stepBody(body, nature, { go: spot, pace, arrive: 0.35 }, ground, obstacles, seconds);
      return null;
    }
    case "drop":
      happy();
      if (time >= mind.until) {
        switchTo(mind, mind.companion ? "bow" : "wait", time, mind.companion ? TIMES.bow : TIMES.wait);
        event = "dropped";
      }
      break;
    case "bow":
      happy();
      if (elliott.holding) switchTo(mind, "ready", time, TIMES.ready);
      else if (time >= mind.until) switchTo(mind, "wait", time, TIMES.wait);
      break;
    case "wait":
      happy();
      if (elliott.holding) switchTo(mind, mind.companion ? "bow" : "ready", time, mind.companion ? TIMES.bow : TIMES.ready);
      else if (time >= mind.until || fromElliott > WANDERED) event = "done";
      break;
    case "ready":
      happy();
      if (time >= mind.until || fromElliott > WANDERED || !elliott.holding) event = "done";
      break;
    case "back": {
      const spot = atTheirFeet(body, nature, elliott);
      if (Math.hypot(spot.x - body.x, spot.z - body.z) < 0.5 || time > mind.since + TIMES.chase) return "done";
      stepBody(body, nature, { go: spot, pace: 1.6 * nature.size, arrive: 0.4 }, ground, obstacles, seconds);
      return null;
    }
  }
  // Still, it faces Elliott: standing to drop the stick and while the next throw is held ready, sitting looking up to wait.
  const rest = mind.phase === "wait" ? "sit" : "stand";
  stepBody(body, nature, { stay: rest, face: toElliott }, ground, obstacles, seconds);
  return event;
}

/** Whether a fetching dog has the stick in its jaws now. */
export const carrying = (mind: FetchMind | null) => mind !== null && (mind.phase === "carry" || mind.phase === "drop");

/** What a fetching dog's body shows, as it eases towards it. */
export function playOf(mind: FetchMind | null, time: number): DogPlay {
  if (mind === null) return NOT_PLAYING;
  const into = (length: number) => Math.min(1, (time - mind.since) / length);
  switch (mind.phase) {
    case "pick":
      return { carrying: into(TIMES.pick) > 0.6 ? 1 : 0, stoop: 1, bow: 0 };
    case "carry":
      return { carrying: 1, stoop: 0, bow: 0 };
    case "drop":
      return { carrying: into(TIMES.drop) < 0.6 ? 1 : 0, stoop: 1, bow: 0 };
    case "bow":
      return { carrying: 0, stoop: 0, bow: into(TIMES.bow) < 0.75 ? 1 : 0 };
    default:
      return NOT_PLAYING;
  }
}

/** How quickly a dog's play eases from one hold to the next, per second. */
export const PLAY_EASE = 7;

/** A dog's play eased towards what it is doing, some seconds on. */
export function easePlay(now: DogPlay, goal: DogPlay, seconds: number): DogPlay {
  const k = 1 - Math.exp(-PLAY_EASE * seconds);
  return { carrying: now.carrying + (goal.carrying - now.carrying) * k, stoop: now.stoop + (goal.stoop - now.stoop) * k, bow: now.bow + (goal.bow - now.bow) * k };
}

/** How far off a cat watches a stick fly and land, and how near a playful one comes to bat at it, in metres; how long a landed stick holds its eye, in seconds. */
const CAT_WATCH = { far: 10, bat: 5, interest: 6 } as const;

/** What a cat does about a stick nearby: watch it, go over to bat at it, or nothing; and whether its paw reached it this step. */
export function catAtStick(body: Body, nature: Nature, stick: Stick, place: { x: number; z: number }, batted: boolean, ground: WalkGround, obstacles: readonly Obstacle[], seconds: number): "watch" | "bat" | null {
  const d = Math.hypot(place.x - body.x, place.z - body.z);
  const fresh = stick.phase === "flying" || (stick.phase === "lying" && stick.age < CAT_WATCH.interest);
  if (!fresh || d > CAT_WATCH.far) return null;
  const face = Math.atan2(place.x - body.x, place.z - body.z);
  if (!batted && stick.phase === "lying" && nature.energy > 0.15 && d < CAT_WATCH.bat) {
    const reach = 0.28 * nature.size;
    if (d < reach + 0.2) return "bat";
    stepBody(body, nature, { go: place, pace: 1.1, arrive: reach }, ground, obstacles, seconds);
    return "watch";
  }
  stepBody(body, nature, { stay: nature.boldness > 0 ? "sit" : "stand", face }, ground, obstacles, seconds);
  return "watch";
}

/** A stick batted by a cat's paw: knocked a little way on, away from the cat. */
export function batStick(stick: Stick, from: { x: number; z: number }, ground: WalkGround): Stick {
  if (stick.phase !== "lying") return stick;
  const d = Math.max(0.01, Math.hypot(stick.x - from.x, stick.z - from.z));
  const x = stick.x + ((stick.x - from.x) / d) * 0.3;
  const z = stick.z + ((stick.z - from.z) / d) * 0.3;
  return canStand(ground, x, z) ? { ...stick, x, z } : stick;
}

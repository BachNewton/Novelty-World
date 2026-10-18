import { describe, expect, it } from "vitest";
import { firstBond, fetched, isWon, pet, playsFetch, type Temper } from "./befriending";
import { bodyAt, doingFor, type Body, type Nature } from "./behaviour";
import { carrying, catAtStick, fetchMind, nearestShore, playOf, stepFetcher, stepStick, stickPlace, throwStick, THROW, within, type FetchEvent, type FetchMind, type Stick } from "./fetch";
import type { WalkGround } from "./walking";

/** Level meadow, with a lake two metres deep where x > 40 and a shallow pool (20 cm) round (0, -20). */
const ground: WalkGround = {
  heightAt: (x, z) => (x > 40 ? -2 : Math.hypot(x, z + 20) < 3 ? -0.2 : 0),
  waterAt: () => 0,
};

const dog = (over: Partial<Nature> = {}): Nature => ({ species: "dog", size: 1.8, boldness: 0.4, energy: 0.3, affection: 0.3, seed: 23, ...over });
const cat = (over: Partial<Nature> = {}): Nature => ({ species: "cat", size: 1.3, boldness: 0.4, energy: 0.5, affection: 0.3, seed: 11, ...over });

const DT = 1 / 30;

/** A stick stepped until it comes to rest, in steps of `step` seconds. */
function settle(stick: Stick, step: number, seconds = 30): Stick | null {
  let s: Stick | null = stick;
  for (let t = 0; t < seconds && s !== null && s.phase !== "lying"; t += step) s = stepStick(s, ground, step);
  return s;
}

describe("a thrown stick", () => {
  it("flies a short arc the way Elliott looks and comes down on the ground some metres off", () => {
    const stick = settle(throwStick({ x: 0, y: 1.4, z: 0 }, { x: 0, y: 0, z: 1 }), DT);
    expect(stick?.phase).toBe("lying");
    if (stick?.phase !== "lying") return;
    expect(Math.abs(stick.x)).toBeLessThan(1e-6);
    expect(stick.z).toBeGreaterThan(7);
    expect(stick.z).toBeLessThan(14);
  });

  it("lands in the same place however the frames are cut", () => {
    const thrown = throwStick({ x: 1, y: 1.2, z: 2 }, { x: 0.6, y: 0.2, z: 0.77 });
    const a = settle(thrown, 1 / 144);
    const b = settle(thrown, 1 / 20);
    const c = settle(thrown, 0.37);
    for (const other of [b, c]) {
      expect(other?.phase).toBe("lying");
      if (other?.phase !== "lying" || a?.phase !== "lying") return;
      expect(other.x).toBe(a.x);
      expect(other.z).toBe(a.z);
    }
  });

  it("goes further thrown upwards than down at the feet, and is never thrown into the ground", () => {
    const reach = (y: number) => {
      const s = settle(throwStick({ x: 0, y: 1.4, z: 0 }, { x: 0, y, z: Math.sqrt(1 - y * y) }), DT);
      return s?.phase === "lying" ? s.z : NaN;
    };
    expect(reach(0.4)).toBeGreaterThan(reach(-0.9));
    expect(reach(-0.9)).toBeGreaterThan(2);
  });

  it("is up in the air along the way, tumbling end over end", () => {
    const stick = stepStick(throwStick({ x: 0, y: 1.4, z: 0 }, { x: 0, y: 0, z: 1 }), ground, 0.5);
    expect(stick?.phase).toBe("flying");
    if (!stick) return;
    const at = stickPlace(stick, ground, 0);
    expect(at.y).toBeGreaterThan(1.4);
    expect(at.tumble).toBeGreaterThan(1);
  });

  it("floats where it falls in water a dog can wade, and a dog can take it there", () => {
    const stick = settle(throwStick({ x: 0, y: 1.3, z: -27 }, { x: 0, y: -0.3, z: 0.95 }), DT, 3);
    expect(stick?.phase).toBe("floating");
    if (!stick) return;
    expect(within(stick, ground)).toBe(true);
  });

  it("washes to the nearest shore from water too deep to wade, where it lies", () => {
    let stick: Stick | null = throwStick({ x: 36, y: 1.4, z: 0 }, { x: 1, y: 0, z: 0 });
    for (let t = 0; t < 3 && stick?.phase === "flying"; t += DT) stick = stepStick(stick, ground, DT);
    expect(stick?.phase).toBe("floating");
    if (!stick) return;
    expect(within(stick, ground)).toBe(false);
    const ashore = settle(stick, DT, 60);
    expect(ashore?.phase).toBe("lying");
    if (ashore?.phase !== "lying") return;
    expect(ashore.x).toBeLessThanOrEqual(40.5);
    expect(within(ashore, ground)).toBe(true);
  });

  it("is simply gone from water with no shore near", () => {
    const sea: WalkGround = { heightAt: () => -5, waterAt: () => 0 };
    expect(nearestShore(sea, 0, 0)).toBeNull();
    let stick: Stick | null = throwStick({ x: 0, y: 1.4, z: 0 }, { x: 0, y: 0, z: 1 });
    for (let t = 0; t < 4 && stick !== null; t += DT) stick = stepStick(stick, sea, DT);
    expect(stick).toBeNull();
  });
});

/** A dog playing fetch with Elliott standing at the origin, the stick lying at a point: the events of its game, in order, and its body throughout. */
function play(nature: Nature, stickAt: { x: number; z: number }, companion: boolean, seconds = 20, holdAgainAt = Infinity) {
  const body: Body = bodyAt(0, 2, 0);
  const mind: FetchMind = fetchMind(0, companion);
  const events: FetchEvent[] = [];
  const phases = new Set<string>();
  let stick: { x: number; z: number; within: boolean } | null = { ...stickAt, within: true };
  let fastest = 0;
  let gaits = new Set<string>();
  for (let time = 0; time < seconds && !events.includes("done"); time += DT) {
    const event = stepFetcher(body, mind, nature, stick, { x: 0, z: 0, holding: time > holdAgainAt }, time, ground, [{ x: 0, z: 0, clear: 1.2 }], DT);
    phases.add(mind.phase);
    if (mind.phase === "chase") fastest = Math.max(fastest, body.speed);
    if (mind.phase === "carry" || mind.phase === "chase") gaits.add(`${mind.phase}:${doingFor(nature, body)}`);
    if (event === "picked") stick = null;
    if (event) events.push(event);
  }
  gaits = new Set([...gaits].filter((g) => !g.endsWith(":stand") && !g.endsWith(":walk")));
  return { body, mind, events, phases, fastest, gaits };
}

describe("a dog playing fetch", () => {
  it("bounds after the stick at a gallop, picks it up, trots back and drops it at Elliott's feet, then sits waiting", () => {
    const game = play(dog(), { x: 3, z: 14 }, false, 25);
    expect(game.events.slice(0, 2)).toEqual(["picked", "dropped"]);
    expect(game.gaits.has("chase:run")).toBe(true);
    expect(game.gaits.has("carry:trot")).toBe(true);
    const fromElliott = Math.hypot(game.body.x, game.body.z);
    expect(fromElliott).toBeLessThan(2.4);
    expect(fromElliott).toBeGreaterThan(1.1);
    expect(game.phases.has("wait")).toBe(true);
    expect(game.phases.has("bow")).toBe(false);
  });

  it("runs faster the more playful it is", () => {
    expect(play(dog({ energy: 1 }), { x: 0, z: 25 }, false).fastest).toBeGreaterThan(play(dog({ energy: -1 }), { x: 0, z: 25 }, false).fastest);
  });

  it("as a companion, play-bows for joy once it has brought the stick back", () => {
    expect(play(dog(), { x: 3, z: 14 }, true, 25).phases.has("bow")).toBe(true);
  });

  it("gets ready for the next throw when Elliott takes the stick up again, and goes back to its day if none comes", () => {
    const game = play(dog(), { x: 3, z: 14 }, false, 60, 9);
    expect(game.phases.has("ready")).toBe(true);
    expect(game.events.at(-1)).toBe("done");
  });

  it("gives up on a stick it can't reach, and comes back without it", () => {
    const body: Body = bodyAt(0, 2, 0);
    const mind = fetchMind(0, false);
    const events: FetchEvent[] = [];
    for (let time = 0; time < 60 && !events.includes("done"); time += DT) {
      const event = stepFetcher(body, mind, dog(), { x: 60, z: 0, within: false }, { x: 0, z: 0, holding: false }, time, ground, [], DT);
      if (event) events.push(event);
    }
    expect(events).toEqual(["done"]);
    expect(Math.hypot(body.x, body.z)).toBeLessThan(3);
  });

  it("holds the stick in its jaws from picking it up until it drops it, nose down to do each", () => {
    const mind = fetchMind(0, false);
    expect(carrying(mind)).toBe(false);
    mind.phase = "carry";
    expect(carrying(mind)).toBe(true);
    expect(playOf(mind, 1).carrying).toBe(1);
    mind.phase = "pick";
    mind.since = 0;
    expect(playOf(mind, 0.05)).toEqual({ carrying: 0, stoop: 1, bow: 0 });
  });
});

describe("fetch as befriending", () => {
  const shyDog: Temper = { species: "dog", boldness: -0.7, affection: 0.2 };
  const warmEnough = { warmth: 0.7, visit: 0 };

  it("is played only by a dog warm enough for a pet", () => {
    expect(playsFetch(firstBond(shyDog), shyDog)).toBe(false);
    expect(playsFetch(warmEnough, shyDog)).toBe(true);
    expect(playsFetch(warmEnough, { species: "cat", boldness: 1, affection: 1 })).toBe(false);
  });

  it("warms a dog a good deal for each stick it brings back, a playful dog more: a game of fetch wins most dogs", () => {
    // Just warm enough to play, as a shy dog first is.
    const start = { warmth: 0.5, visit: 0 };
    expect(fetched(start, shyDog, 1).warmth).toBeGreaterThan(fetched(start, shyDog, -1).warmth);
    expect(fetched(start, shyDog, -1).warmth - start.warmth).toBeGreaterThan(0.3);
    let calm = start;
    for (let n = 0; n < 2; n++) calm = fetched(calm, shyDog, -1);
    expect(isWon(calm)).toBe(true);
    expect(isWon(fetched(start, shyDog, 1))).toBe(true);
  });

  it("warms more than a pet does, for a shy dog", () => {
    expect(fetched(warmEnough, shyDog, 0).warmth).toBeGreaterThanOrEqual(pet(warmEnough, shyDog).warmth);
  });

  it("can't be played by a dog not yet warm enough", () => {
    expect(() => fetched(firstBond(shyDog), shyDog, 0)).toThrow();
  });
});

describe("a cat and a stick", () => {
  it("watches a stick fly, and a playful one goes over to bat at it once it lands; it never carries it", () => {
    const body = bodyAt(0, 0, 0);
    const flying = throwStick({ x: 2, y: 1.4, z: 0 }, { x: 0, y: 0, z: 1 });
    expect(catAtStick(body, cat(), flying, stickPlace(flying, ground, 0), false, ground, [], DT)).toBe("watch");
    const lying: Stick = { phase: "lying", x: 2.5, z: 2, age: 0 };
    let doing: ReturnType<typeof catAtStick> = null;
    for (let t = 0; t < 10 && doing !== "bat"; t += DT) doing = catAtStick(body, cat(), lying, lying, false, ground, [], DT);
    expect(doing).toBe("bat");
    expect(catAtStick(body, cat({ energy: -0.8 }), { ...lying, age: 3 }, lying, false, ground, [], DT)).toBe("watch");
    expect(catAtStick(body, cat(), { ...lying, age: 30 }, lying, false, ground, [], DT)).toBeNull();
  });
});

it("throws at the throw's own speed", () => {
  const stick = throwStick({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 });
  if (stick.phase !== "flying") throw new Error("A stick thrown is flying");
  expect(Math.hypot(stick.velocity.x, stick.velocity.y, stick.velocity.z)).toBeCloseTo(THROW.speed);
});

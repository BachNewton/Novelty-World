import { describe, expect, it } from "vitest";
import { firstBond, keepsOff, type Temper } from "./befriending";
import { animalGround, bodyAt, doingFor, stepBody, type Body, type Nature, type Obstacle } from "./behaviour";
import { catchUpSpot, comeAlong, firesideSpot, FOLLOWING, followers, followMind, join, keepsNear, LEFT_BEHIND, rename, stepCompanion, type Companion, type FollowContext, type Leader } from "./companions";
import { noFriends, parseFriends, serializeFriends } from "./friends";
import { NAMES, suggestedNames } from "./names";
import { stepStray, strayMind, type Elliott } from "./roaming";
import type { WalkGround } from "./walking";

/** Level meadow, with a lake (two metres deep) where x > 40, and a shallow ford (20 cm at its deepest) where -22 < x < -8. */
const ground: WalkGround = {
  heightAt: (x) => (x > 40 ? -2 : x > -22 && x < -8 ? -0.2 * Math.sin((Math.PI * (x + 22)) / 14) : 0),
  waterAt: () => 0,
};

const cat = (over: Partial<Nature> = {}): Nature => ({ species: "cat", size: 1, boldness: 0, energy: 0, affection: 0, seed: 11, ...over });
const dog = (over: Partial<Nature> = {}): Nature => ({ species: "dog", size: 1.6, boldness: 0.4, energy: 0.3, affection: 0.3, seed: 23, ...over });
const temperOf = (nature: Nature): Temper => ({ species: nature.species, boldness: nature.boldness, affection: nature.affection });

const DT = 1 / 30;

describe("an animal's body", () => {
  it("never walks into deep water, however it is asked", () => {
    const body = bodyAt(30, 0, Math.PI / 2);
    for (let t = 0; t < 10; t += DT) stepBody(body, cat(), { go: { x: 80, z: 0 }, pace: 3 }, animalGround(ground, "cat"), [], DT);
    expect(body.x).toBeLessThanOrEqual(40.5);
  });

  it("is a cat that keeps out of a ford a dog wades through", () => {
    const asked = { go: { x: -30, z: 0 }, pace: 2 };
    const kitty = bodyAt(-5, 0, -Math.PI / 2);
    const pup = bodyAt(-5, 0, -Math.PI / 2);
    for (let t = 0; t < 20; t += DT) {
      stepBody(kitty, cat(), asked, animalGround(ground, "cat"), [], DT);
      stepBody(pup, dog(), asked, animalGround(ground, "dog"), [], DT);
    }
    expect(kitty.x).toBeGreaterThan(-12);
    expect(pup.x).toBeLessThan(-25);
  });

  it("turns as an animal turns, easing its pace, and shows its gait for its pace", () => {
    const body = bodyAt(0, 0, 0);
    stepBody(body, dog(), { go: { x: 0, z: -20 }, pace: 6 }, ground, [], DT);
    expect(Math.abs(body.heading)).toBeLessThan(0.5);
    for (let t = 0; t < 3; t += DT) stepBody(body, dog(), { go: { x: 0, z: -60 }, pace: 6 }, ground, [], DT);
    expect(body.speed).toBeGreaterThan(5);
    expect(doingFor(dog(), body)).toBe("run");
    for (let t = 0; t < 3; t += DT) stepBody(body, dog(), { stay: "sit" }, ground, [], DT);
    expect(doingFor(dog(), body)).toBe("sit");
  });

  it("keeps clear of what it is told to", () => {
    const body = bodyAt(0, 0, 0);
    const elliott: Obstacle = { x: 0, z: 5, clear: 1 };
    let nearest = Infinity;
    for (let t = 0; t < 6; t += DT) {
      stepBody(body, cat(), { go: { x: 0, z: 10 }, pace: 1.5 }, ground, [elliott], DT);
      nearest = Math.min(nearest, Math.hypot(body.x - elliott.x, body.z - elliott.z));
    }
    expect(nearest).toBeGreaterThan(0.6);
  });
});

describe("a stray", () => {
  const home = { x: 0, z: 0 };
  const run = (nature: Nature, elliott: Elliott, seconds: number, body: Body = bodyAt(0, 0, 0)) => {
    const mind = strayMind();
    const temper = temperOf(nature);
    const bond = firstBond(temper);
    for (let t = 0; t < seconds; t += DT) stepStray(body, mind, nature, temper, bond, home, 8, elliott, false, t, ground, [{ x: elliott.x, z: elliott.z, clear: 1 }], DT);
    return { body, keep: keepsOff(temper, bond) };
  };

  it("wanders round its home on its own, never far", () => {
    const far: Elliott = { x: 500, z: 500, speed: 0, calm: true, aloft: false };
    const body = bodyAt(0, 0, 0);
    const mind = strayMind();
    const nature = cat({ energy: 0.9 });
    let furthest = 0;
    let moved = 0;
    for (let t = 0; t < 300; t += DT) {
      const before = { x: body.x, z: body.z };
      stepStray(body, mind, nature, temperOf(nature), firstBond(temperOf(nature)), home, 8, far, false, t, ground, [], DT);
      moved += Math.hypot(body.x - before.x, body.z - before.z);
      furthest = Math.max(furthest, Math.hypot(body.x, body.z));
    }
    expect(moved).toBeGreaterThan(10);
    expect(furthest).toBeLessThan(8 * 1.9 + 1);
  });

  it("keeps its distance when shy, and watches", () => {
    const shy = cat({ boldness: -0.8 });
    const { body, keep } = run(shy, { x: 3, z: 0, speed: 0, calm: true, aloft: false }, 6);
    expect(Math.hypot(body.x - 3, body.z)).toBeGreaterThan(keep - 1);
  });

  it("comes to see when it is a friendly dog, stopping short of Elliott", () => {
    const { body } = run(dog(), { x: 15, z: 0, speed: 0, calm: true, aloft: false }, 6);
    const d = Math.hypot(body.x - 15, body.z);
    expect(d).toBeLessThan(2.5);
    expect(d).toBeGreaterThan(0.6);
  });
});

describe("a companion", () => {
  const context = (leader: Leader, over: Partial<FollowContext> = {}): FollowContext => ({
    leader,
    hearth: { x: 500, z: 500 },
    index: 0,
    count: 1,
    time: 0,
    ground,
    obstacles: [{ x: leader.x, z: leader.z, clear: 0.95 }],
    seen: () => true,
    ...over,
  });

  it("keeps near Elliott as they walk, never walking into them", () => {
    for (const nature of [cat({ affection: 0.8 }), dog({ affection: -0.6 })]) {
      const body = bodyAt(0, -2, 0);
      const mind = followMind();
      let furthest = 0;
      let nearest = Infinity;
      for (let t = 0; t < 40; t += DT) {
        // Elliott walks north along z at a walk, out of the lake's way.
        const leader: Leader = { x: 0, z: t * 3.4, heading: 0, speed: 3.4, aloft: false };
        stepCompanion(body, mind, nature, context(leader, { time: t }), DT);
        const d = Math.hypot(body.x - leader.x, body.z - leader.z);
        if (t > 3) furthest = Math.max(furthest, d);
        nearest = Math.min(nearest, d);
      }
      expect(furthest).toBeLessThan(keepsNear(nature) + 12);
      expect(nearest).toBeGreaterThan(0.6);
    }
  });

  it("sits when Elliott stops, and lies down if they stay", () => {
    const nature = dog({ energy: -0.5 });
    const body = bodyAt(0, -3, 0);
    const mind = followMind();
    const leader: Leader = { x: 0, z: 0, heading: 0, speed: 0, aloft: false };
    for (let t = 0; t < 4; t += DT) stepCompanion(body, mind, nature, context(leader, { time: t }), DT);
    expect(doingFor(nature, body)).toBe("sit");
    for (let t = 4; t < 40; t += DT) stepCompanion(body, mind, nature, context(leader, { time: t }), DT);
    expect(doingFor(nature, body)).toBe("lie");
  });

  it("settles round the campfire with Elliott there", () => {
    const hearth = { x: 0, z: 0 };
    const leader: Leader = { x: 1.5, z: -1.5, heading: 0, speed: 0, aloft: false };
    const body = bodyAt(-6, 4, 0);
    const mind = followMind();
    for (let t = 0; t < 20; t += DT) stepCompanion(body, mind, cat(), context(leader, { hearth, time: t, index: 1, count: 2 }), DT);
    const spot = firesideSpot(hearth, 1, 2);
    expect(Math.hypot(body.x - spot.x, body.z - spot.z)).toBeLessThan(1.2);
    expect(["sit", "lie"]).toContain(doingFor(cat(), body));
  });

  it("left far behind out of sight, comes running from Elliott's trail, out of sight too; in sight, it is never moved", () => {
    const leader: Leader = { x: 0, z: 0, heading: 0, speed: 0, aloft: false };
    const behind = bodyAt(-200, 0, 0);
    stepCompanion(behind, followMind(), cat(), context(leader, { seen: (_, z) => z > 0 }), DT);
    const d = Math.hypot(behind.x, behind.z);
    expect(d).toBeLessThan(LEFT_BEHIND);
    expect(behind.z).toBeLessThan(0);
    const inSight = bodyAt(-200, 0, 0);
    stepCompanion(inSight, followMind(), cat(), context(leader, { seen: () => true }), DT);
    expect(inSight.x).toBeLessThan(-199);
  });

  it("is never put where it couldn't stand", () => {
    const facingTheLake: Leader = { x: 38, z: 0, heading: Math.PI / 2, speed: 0, aloft: false };
    const backToTheLake: Leader = { ...facingTheLake, heading: -Math.PI / 2 };
    for (let i = 0; i < 4; i++) {
      const spot = catchUpSpot(facingTheLake, ground, () => false, i);
      expect(spot !== null && spot.x < 38).toBe(true);
      // With the lake behind, there is nowhere on the trail to come from: it tries again later.
      expect(catchUpSpot(backToTheLake, ground, () => false, i)?.x ?? 0).toBeLessThan(40);
    }
  });
});

describe("the companions as kept", () => {
  const animal = (id: string): Omit<Companion, "following" | "joined"> => ({ id, species: "cat", seed: `seed ${id}`, name: id });

  it(`follow ${FOLLOWING} at a time; the one who has walked longest goes to rest as another joins, and comes along again when petted`, () => {
    let companions: Companion[] = [];
    for (const id of ["a", "b", "c", "d"]) companions = join(companions, animal(id));
    expect(followers(companions).map((c) => c.id)).toEqual(["b", "c", "d"]);
    companions = comeAlong(companions, "a");
    expect(followers(companions).map((c) => c.id)).toEqual(["c", "d", "a"]);
    expect(companions.find((c) => c.id === "b")?.following).toBe(false);
  });

  it("keep their names, which can't be empty", () => {
    const companions = rename(join([], animal("a")), "a", "  Mirri ");
    expect(companions[0].name).toBe("Mirri");
    expect(() => rename(companions, "a", "  ")).toThrow();
  });

  it("are kept on the device and read back as they were, and anything else is refused", () => {
    const friends = { companions: join([], animal("a")), warmth: { "3,4/0": 0.4 } };
    expect(parseFriends(serializeFriends(friends))).toEqual(friends);
    expect(parseFriends(serializeFriends(noFriends()))).toEqual(noFriends());
    expect(() => parseFriends('{"companions":[{"id":"a"}],"warmth":{}}')).toThrow();
    expect(() => parseFriends('{"companions":[],"warmth":{"a":2}}')).toThrow();
  });
});

describe("names", () => {
  it("are suggested from the species' list, the same for the same animal, never one already taken", () => {
    const names = suggestedNames("dog", "a dog", ["Watson"]);
    expect(names).toEqual(suggestedNames("dog", "a dog", ["Watson"]));
    expect(names).not.toContain("Watson");
    for (const name of names) expect(NAMES.dog).toContain(name);
  });
});

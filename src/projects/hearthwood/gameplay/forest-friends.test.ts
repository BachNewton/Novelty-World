import { describe, expect, it } from "vitest";
import type { Trunk } from "../engine/wildlife";
import { bodyAt, type Nature } from "./behaviour";
import { beKnown, climbing, fleesWithin, friendMind, knows, stepFriend, visitsOf, type FriendHome } from "./forest-friends";
import type { Elliott } from "./roaming";
import type { WalkGround } from "./walking";

const ground: WalkGround = { heightAt: () => 0, waterAt: () => -1 };
const DT = 1 / 20;
const nature = (species: Nature["species"]): Nature => ({ species, size: 1.3, boldness: 0, energy: 0, affection: 0, seed: 9 });
const stranger = { warmth: 0, visit: 0 };
const known = { warmth: 1, visit: 0 };
const place: FriendHome = { home: { x: 0, z: 0 }, roam: 10, trunk: null, bed: { x: 30, z: 0 } };
const walking = (x: number, z: number): Elliott => ({ x, z, speed: 2, calm: true, aloft: false });

describe("coming to know a forest friend", () => {
  it("takes three calm visits, each counted once however long it lasts", () => {
    let bond = stranger;
    const visit = () => {
      for (let t = 0; t < 40; t += 1) bond = beKnown(bond, 10, true, 1);
      bond = beKnown(bond, 80, true, 1);
    };
    visit();
    expect(visitsOf(bond)).toBe(1);
    visit();
    expect(visitsOf(bond)).toBe(2);
    expect(knows(bond)).toBe(false);
    visit();
    expect(knows(bond)).toBe(true);
  });

  it("isn't helped by running near it, or by staying far off", () => {
    let bond = stranger;
    for (let t = 0; t < 60; t += 1) bond = beKnown(bond, 10, false, 1);
    for (let t = 0; t < 60; t += 1) bond = beKnown(bond, 40, true, 1);
    expect(bond.warmth).toBe(0);
  });

  it("lets Elliott nearer with each visit, and right up once it knows them", () => {
    expect(fleesWithin("hare", { warmth: 1 / 3 + 1e-6, visit: 0 }, true)).toBeLessThan(fleesWithin("hare", stranger, true));
    expect(fleesWithin("hare", stranger, false)).toBeGreaterThan(fleesWithin("hare", stranger, true));
    expect(fleesWithin("deer", known, true)).toBe(0);
  });
});

describe("a forest friend's day", () => {
  it("is a hare bounding off from a stranger who comes too near, to stop and look back", () => {
    const body = bodyAt(0, 0, 0);
    const mind = friendMind();
    for (let t = 0; t < 6; t += DT) stepFriend("hare", body, mind, nature("hare"), stranger, place, walking(6, 0), 0, t, ground, [], DT);
    expect(Math.hypot(body.x - 6, body.z)).toBeGreaterThan(14);
    expect(body.speed).toBeLessThan(0.5);
  });

  it("is a hare that knows Elliott coming to greet them instead", () => {
    const body = bodyAt(0, 0, 0);
    const mind = friendMind();
    let greeted = false;
    for (let t = 0; t < 8; t += DT) {
      stepFriend("hare", body, mind, nature("hare"), known, place, walking(8, 0), 0, t, ground, [], DT);
      greeted ||= t < body.greetUntil;
    }
    expect(Math.hypot(body.x - 8, body.z)).toBeLessThan(3.2);
    expect(greeted).toBe(true);
  });

  it("is a squirrel running to its tree and up it when a stranger comes near, and down again once they have gone", () => {
    const trunk: Trunk = { x: 2, z: 0, y: 0, radius: 0.3, height: 12, bare: 6 };
    const squirrelPlace: FriendHome = { home: { x: 2, z: 0 }, roam: 6, trunk, bed: null };
    const body = bodyAt(0, 0, 0);
    const mind = friendMind();
    for (let t = 0; t < 5; t += DT) stepFriend("squirrel", body, mind, nature("squirrel"), stranger, squirrelPlace, walking(-4, 0), 0, t, ground, [], DT);
    expect(climbing(mind)).toBe(true);
    expect(mind.climb?.height).toBeGreaterThan(2);
    for (let t = 5; t < 40; t += DT) stepFriend("squirrel", body, mind, nature("squirrel"), stranger, squirrelPlace, walking(-60, 0), 0, t, ground, [], DT);
    expect(climbing(mind)).toBe(false);
  });

  it("is a deer lying up in its bed through the day and out on its meadow at dusk", () => {
    const body = bodyAt(0, 0, 0);
    const mind = friendMind();
    const far = walking(-200, 0);
    for (let t = 0; t < 60; t += DT) stepFriend("deer", body, mind, nature("deer"), stranger, place, far, 0, t, ground, [], DT);
    expect(Math.hypot(body.x - 30, body.z)).toBeLessThan(2.5);
    expect(body.rest).toBe("lie");
    for (let t = 60; t < 160; t += DT) stepFriend("deer", body, mind, nature("deer"), stranger, place, far, 1, t, ground, [], DT);
    expect(Math.hypot(body.x, body.z)).toBeLessThan(place.roam * 1.7);
  });
});

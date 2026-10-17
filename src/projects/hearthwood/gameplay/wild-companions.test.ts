import { describe, expect, it } from "vitest";
import { allowsPet, bePatient, favouriteTreat, firstBond, giveTreat, isWon, keepsOff, petWarmth, TREATS, type Bond, type Temper } from "./befriending";
import { bodyAt, type Nature } from "./behaviour";
import type { Leader } from "./companions";
import { hopAt, RIDE, stepRide, walkingRide, type Ride } from "./riding";
import { stepStray, strayMind, type Elliott } from "./roaming";
import type { WalkGround } from "./walking";

const ground: WalkGround = { heightAt: () => 0, waterAt: () => -1 };
const fox: Temper = { species: "fox", boldness: -0.3, affection: 0 };
const cat: Temper = { species: "cat", boldness: -0.3, affection: 0 };
const hedgehog: Temper = { species: "hedgehog", boldness: -0.2, affection: 0 };

/** How many seconds of calm company, in visits of `visit` seconds with Elliott going away between them, until an animal allows a pet. */
function secondsToPet(temper: Temper, visit = 120): number {
  let bond: Bond = firstBond(temper);
  for (let t = 0; t < 4000; t++) {
    if (allowsPet(bond, temper)) return t;
    bond = bePatient(bond, temper, 5, true, 1);
    if (t % visit === visit - 1) bond = bePatient(bond, temper, 40, true, 1);
  }
  return Infinity;
}

describe("befriending a fox", () => {
  it("takes more patience than a cat, over a few visits", () => {
    expect(secondsToPet(fox)).toBeGreaterThan(secondsToPet(cat) * 1.8);
    expect(secondsToPet(fox)).toBeGreaterThan(120);
    expect(secondsToPet(fox)).toBeLessThan(4000);
  });

  it("keeps further off than a cat as a stranger", () => {
    expect(keepsOff(fox, firstBond(fox))).toBeGreaterThan(keepsOff(cat, firstBond(cat)));
  });

  it("is helped by treats, its favourite most, though even that doesn't win it at once", () => {
    const favourite = favouriteTreat("a fox");
    const other = TREATS.find((k) => k !== favourite) ?? favourite;
    const loved = giveTreat(firstBond(fox), fox, favourite, favourite);
    const liked = giveTreat(firstBond(fox), fox, other, favourite);
    expect(loved.relish).toBe("loved");
    expect(isWon(loved.bond)).toBe(false);
    expect(loved.bond.warmth).toBeGreaterThan(liked.bond.warmth);
    expect(liked.bond.warmth).toBeGreaterThan(0);
  });
});

describe("befriending a hedgehog", () => {
  it("allows a pet soon, and is won at once by its favourite", () => {
    expect(petWarmth(hedgehog)).toBeLessThan(petWarmth(fox));
    const favourite = favouriteTreat("a hedgehog");
    expect(isWon(giveTreat(firstBond(hedgehog), hedgehog, favourite, favourite).bond)).toBe(true);
  });

  it("curls up where it is when Elliott comes running, rather than running off", () => {
    const nature: Nature = { species: "hedgehog", size: 1.2, boldness: -0.2, energy: 0, affection: 0, seed: 3 };
    const body = bodyAt(0, 0, 0);
    const mind = strayMind();
    const elliott: Elliott = { x: 0, z: 3, speed: 6, calm: false, aloft: false };
    for (let t = 0; t < 2; t += 1 / 30) stepStray(body, mind, nature, hedgehog, firstBond(hedgehog), { x: 0, z: 0 }, 6, elliott, false, t, ground, [], 1 / 30);
    expect(body.rest).toBe("lie");
    expect(Math.hypot(body.x, body.z)).toBeLessThan(0.3);
  });
});

describe("a hedgehog riding in the basket", () => {
  const leader = (speed: number, aloft = false): Leader => ({ x: 0, z: 0, heading: 0, speed, aloft });
  const run = (ride: Ride, who: Leader, seconds: number, distance = 1, from = 0): Ride => {
    let r = ride;
    for (let t = 0; t < seconds; t += 0.05) r = stepRide(r, who, distance, { x: 1, z: 0 }, from + t, 0.05);
    return r;
  };

  it("walks along on a short stroll, and hops up into the basket on a long walk", () => {
    expect(run(walkingRide(), leader(3), RIDE.longWalk - 1).phase).toBe("walking");
    const longer = run(walkingRide(), leader(3), RIDE.longWalk + 0.5);
    expect(longer.phase).toBe("hopping-in");
  });

  it("hops up at once when Elliott runs or takes off, if it is near enough", () => {
    expect(run(walkingRide(), leader(6), 0.1).phase).toBe("hopping-in");
    expect(run(walkingRide(), leader(0, true), 0.1).phase).toBe("hopping-in");
    expect(run(walkingRide(), leader(6), 0.1, RIDE.reach + 1).phase).toBe("walking");
  });

  it("rides once the hop is done, and hops down beside Elliott a while after they stop", () => {
    const riding = run(run(walkingRide(), leader(6), 0.1), leader(6), RIDE.hop + 0.2, 1, 0.1);
    expect(riding.phase).toBe("riding");
    const stopped = run(riding, leader(0), RIDE.getDown + 0.3, 1, 2);
    expect(stopped.phase).toBe("hopping-out");
    expect(stopped.landing).toEqual({ x: 1, z: 0 });
    expect(run(stopped, leader(0), RIDE.hop + 0.1, 1, 5).phase).toBe("walking");
  });

  it("keeps riding through a short pause", () => {
    const riding: Ride = { phase: "riding", since: 0, landing: null, moving: 10, still: 0 };
    expect(run(riding, leader(0), RIDE.getDown - 0.5).phase).toBe("riding");
  });

  it("arcs up and back down over its hop", () => {
    const hop: Ride = { phase: "hopping-in", since: 0, landing: null, moving: 0, still: 0 };
    expect(hopAt(hop, 0).along).toBe(0);
    expect(hopAt(hop, RIDE.hop).along).toBe(1);
    expect(hopAt(hop, RIDE.hop / 2).lift).toBeGreaterThan(0.3);
  });
});

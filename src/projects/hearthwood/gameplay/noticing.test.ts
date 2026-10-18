import { describe, expect, it } from "vitest";
import type { Species } from "../engine/strays";
import { animalGround, bodyAt, doingFor, greeting, type Nature } from "./behaviour";
import type { Leader } from "./companions";
import { companionBy, finishSniff, noseDown, NOTICING, noticing, stepNoticing, stepSniff, type ClueAt, type Helper, type Noticing } from "./noticing";
import type { WalkGround } from "./walking";

/** A level meadow, a lake two metres deep where x > 40, and a cliff five metres high along z = -20. */
const ground: WalkGround = {
  heightAt: (x, z) => (x > 40 ? -2 : z < -20 ? 5 : 0),
  waterAt: () => 0,
};
const groundOf = (species: Species) => animalGround(ground, species);

const nature = (species: Species, over: Partial<Nature<Species>> = {}): Nature<Species> => ({ species, size: species === "dog" ? 1.8 : species === "hedgehog" ? 0.6 : 1.3, boldness: 0, energy: 0, affection: 0, seed: 7, ...over });
const helper = (key: string, species: Species, x: number, z: number, free = true): Helper => ({ key, nature: nature(species), body: bodyAt(x, z, 0, "sit"), free });
const still = (x: number, z: number): Leader => ({ x, z, heading: 0, speed: 0, aloft: false });

const DT = 1 / 20;

/** Steps the noticing and every companion off to a clue for some seconds from `from`, Elliott where `leader` says at each moment. */
function play(state: Noticing, clues: ClueAt[], helpers: Helper[], leader: (t: number) => Leader, from: number, seconds: number): void {
  for (let t = from; t < from + seconds; t += DT) {
    const lead = leader(t);
    stepNoticing(state, clues, helpers, lead, groundOf, t);
    for (const h of helpers) {
      const sniff = state.sniffs.get(h.key);
      if (sniff && stepSniff(h.body, sniff, h.nature, lead, groundOf(h.nature.species), [], t, DT) === "done") finishSniff(state, h.key, t);
    }
  }
}

describe("a companion noticing a clue", () => {
  const clue: ClueAt = { key: "beekeeper/fur", x: 12, z: 6 };

  it("is a dog before a cat, even a cat nearer the clue; it follows its nose there and sits by it, tail going, looking back at Elliott", () => {
    const state = noticing(0);
    const dog = helper("dog", "dog", -2, -2);
    const cat = helper("cat", "cat", 2, 2);
    let nose = 0;
    for (let t = 0; t < 20; t += DT) {
      play(state, [clue], [dog, cat], () => still(0, 0), t, DT);
      nose = Math.max(nose, noseDown(state.sniffs.get("dog"), "dog"));
    }
    expect(state.sniffs.has("cat")).toBe(false);
    expect(state.sniffs.get("dog")?.phase).toBe("by");
    expect(nose).toBe(1);
    expect(Math.hypot(dog.body.x - clue.x, dog.body.z - clue.z)).toBeLessThan(1.2);
    expect(doingFor(dog.nature, dog.body)).toBe("sit");
    expect(greeting(dog.body, 20)).toBe(true);
    const toElliott = Math.atan2(-dog.body.x, -dog.body.z);
    expect(Math.abs(Math.atan2(Math.sin(dog.body.heading - toElliott), Math.cos(dog.body.heading - toElliott)))).toBeLessThan(0.3);
    expect(companionBy(state, clue.key)).toBe(true);
    expect(noseDown(state.sniffs.get("dog"), "dog")).toBe(0);
  });

  it("is a cat, slinking over to sit beside it with its tail up, when no dog follows", () => {
    const state = noticing(0);
    const cat = helper("cat", "cat", 2, 2);
    play(state, [clue], [cat], () => still(0, 0), 0, 25);
    expect(state.sniffs.get("cat")?.phase).toBe("by");
    expect(doingFor(cat.nature, cat.body)).toBe("sit");
    expect(greeting(cat.body, 25)).toBe(true);
    expect(noseDown(state.sniffs.get("cat"), "cat")).toBe(0);
  });

  it("is a fox or a hedgehog standing by it, nosing at it", () => {
    for (const species of ["fox", "hedgehog"] as const) {
      const state = noticing(0);
      const animal = helper(species, species, 1, 1);
      play(state, [clue], [animal], () => still(0, 0), 0, 40);
      expect(state.sniffs.get(species)?.phase).toBe("by");
      expect(doingFor(animal.nature, animal.body)).toBe("stand");
      const toClue = Math.atan2(clue.x - animal.body.x, clue.z - animal.body.z);
      expect(Math.abs(Math.atan2(Math.sin(animal.body.heading - toClue), Math.cos(animal.body.heading - toClue)))).toBeLessThan(0.4);
    }
  });

  it("waits a while first, and never notices a clue out of reach, or with no companion near Elliott, or with Elliott on the broom", () => {
    const early = noticing(0);
    play(early, [clue], [helper("dog", "dog", 1, 1)], () => still(0, 0), 0, NOTICING.first - 1);
    expect(early.sniffs.size).toBe(0);

    const far = noticing(0);
    play(far, [{ key: "far", x: NOTICING.reach + 3, z: 0 }], [helper("dog", "dog", 1, 1)], () => still(0, 0), 0, 30);
    expect(far.sniffs.size).toBe(0);

    const strayed = noticing(0);
    play(strayed, [clue], [helper("dog", "dog", -NOTICING.near - 4, 0)], () => still(0, 0), 0, 30);
    expect(strayed.sniffs.size).toBe(0);

    const aloft = noticing(0);
    play(aloft, [clue], [helper("dog", "dog", 1, 1)], () => ({ ...still(0, 0), aloft: true }), 0, 30);
    expect(aloft.sniffs.size).toBe(0);
  });

  it("never sends a companion across water or up a cliff it can't walk", () => {
    const lake = noticing(0);
    play(lake, [{ key: "across the lake", x: 50, z: 0 }], [helper("dog", "dog", 36, 0)], () => still(34, 0), 0, 30);
    expect(lake.sniffs.size).toBe(0);
    expect(lake.helped.size).toBe(0);

    const cliff = noticing(0);
    play(cliff, [{ key: "up the cliff", x: 0, z: -28 }], [helper("dog", "dog", 0, -12)], () => still(0, -10), 0, 30);
    expect(cliff.sniffs.size).toBe(0);
  });

  it("goes back to Elliott once they have found the clue, and helps with it only once while they stay about", () => {
    const state = noticing(0);
    const dog = helper("dog", "dog", 1, 1);
    play(state, [clue], [dog], () => still(0, 0), 0, 20);
    expect(state.sniffs.get("dog")?.phase).toBe("by");
    // Elliott walks over to the clue and stands by it.
    play(state, [clue], [dog], () => still(clue.x - 1.5, clue.z), 20, 3);
    expect(state.sniffs.size).toBe(0);
    expect(state.helped.has(clue.key)).toBe(true);
    // Back where they were and staying about: the clue is never noticed again.
    play(state, [clue], [dog], () => still(0, 0), 23, 300);
    expect(state.sniffs.size).toBe(0);
  });

  it("is noticed again after Elliott has wandered off from it and a good while has passed", () => {
    const state = noticing(0);
    const dog = helper("dog", "dog", 1, 1);
    play(state, [clue], [dog], () => still(0, 0), 0, 20);
    finishSniff(state, "dog", 20);
    // Off out of the clue's reach, the dog brought along with them.
    const away = still(-40, 0);
    play(state, [clue], [dog], () => away, 20, 1);
    Object.assign(dog.body, { x: 1, z: 1 });
    play(state, [clue], [dog], () => still(0, 0), 21, NOTICING.again - 10);
    expect(state.sniffs.size).toBe(0);
    play(state, [clue], [dog], () => still(0, 0), 21 + NOTICING.again - 10, 30);
    expect(state.sniffs.has("dog")).toBe(true);
  });

  it("gives up as Elliott walks off, never far from them, and the next waits a while", () => {
    const state = noticing(0);
    const dog = helper("dog", "dog", 1, 1);
    const other: ClueAt = { key: "beekeeper/mitten", x: -10, z: 4 };
    // Elliott walks steadily away along -z once the dog has gone.
    const leader = (t: number): Leader => (t < 12 ? still(0, 0) : { x: 0, z: -(t - 12) * 3.4, heading: Math.PI, speed: 3.4, aloft: false });
    let furthest = 0;
    let gaveUp = -1;
    for (let t = 0; t < 40; t += DT) {
      play(state, [clue, other], [dog], leader, t, DT);
      const lead = leader(t);
      if (state.sniffs.has("dog")) furthest = Math.max(furthest, Math.hypot(dog.body.x - lead.x, dog.body.z - lead.z));
      if (gaveUp < 0 && t > 12 && state.sniffs.size === 0) gaveUp = t;
    }
    expect(gaveUp).toBeGreaterThan(12);
    expect(furthest).toBeLessThan(NOTICING.leash + 4);
    expect(state.helped.size).toBe(1);
  });

  it("is one companion at a time, done with its clue once examined or once it is no longer free", () => {
    const state = noticing(0);
    const dog = helper("dog", "dog", 1, 1);
    const cat = helper("cat", "cat", -1, 1);
    const fur = { key: "a/fur", x: 10, z: 5 };
    const mitten = { key: "a/mitten", x: -8, z: 8 };
    play(state, [fur, mitten], [dog, cat], () => still(0, 0), 0, 12);
    expect(state.sniffs.size).toBe(1);
    // The fur examined: the dog is done, and the cat waits its turn.
    play(state, [mitten], [dog, cat], () => still(0, 0), 12, 1);
    expect(state.sniffs.size).toBe(0);
    play(state, [mitten], [dog, cat], () => still(0, 0), 13, NOTICING.gap + 2);
    expect(state.sniffs.size).toBe(1);
    const [who] = [...state.sniffs.keys()];
    const busy = who === "dog" ? { ...dog, free: false } : { ...cat, free: false };
    play(state, [mitten], [busy, who === "dog" ? cat : dog], () => still(0, 0), 13 + NOTICING.gap + 2, DT);
    expect(state.sniffs.has(who)).toBe(false);
  });
});

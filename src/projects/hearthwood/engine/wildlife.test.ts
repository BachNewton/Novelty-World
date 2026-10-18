import { describe, expect, it } from "vitest";
import { emptySample } from "./land";
import { birdsAbout, butterfliesAbout, butterfliesIn, coatSeason, deerAbroad, FRIEND_CELL, friendsInCell, friendsNear, perchesIn, songbirdsIn, type Friend } from "./wildlife";
import { createWorld } from "./world";

const world = createWorld("first-valley");
const campCell = { cx: Math.floor(world.home.x / FRIEND_CELL), cz: Math.floor(world.home.z / FRIEND_CELL) };
const cells: { cx: number; cz: number; friends: Friend[] }[] = [];
for (let dz = -5; dz <= 5; dz++) for (let dx = -5; dx <= 5; dx++) cells.push({ cx: campCell.cx + dx, cz: campCell.cz + dz, friends: friendsInCell(world, campCell.cx + dx, campCell.cz + dz) });
const all = cells.flatMap((c) => c.friends);
const woodsAt = (x: number, z: number) => {
  const s = world.sampleAt(x, z, emptySample());
  return world.woodlandAt(x, z, s, world.regionAt(x, z, s), 0);
};

describe("the forest friends by area", () => {
  it("are the same every time a cell is asked for", () => {
    expect(friendsInCell(world, 2, -1)).toEqual(friendsInCell(createWorld("first-valley"), 2, -1));
  });

  it("hold squirrels, hares and deer round camp, each with an id of its own", () => {
    for (const species of ["squirrel", "hare", "deer"]) expect(all.filter((f) => f.species === species).length).toBeGreaterThan(2);
    expect(new Set(all.map((f) => f.id)).size).toBe(all.length);
  });

  it("put each squirrel at the foot of a climbable tree, with bare trunk to run up", () => {
    for (const squirrel of all.filter((f) => f.species === "squirrel")) {
      expect(squirrel.trunk).not.toBeNull();
      expect(squirrel.trunk?.bare).toBeGreaterThanOrEqual(2);
      expect(squirrel.home.x).toBe(squirrel.trunk?.x);
    }
  });

  it("put hares out in the open and deer at the woods' edge, with a bed in thicker woods", () => {
    const hares = all.filter((f) => f.species === "hare");
    expect(hares.reduce((sum, h) => sum + woodsAt(h.home.x, h.home.z), 0) / hares.length).toBeLessThan(0.25);
    for (const deer of all.filter((f) => f.species === "deer")) {
      if (!deer.bed) throw new Error("a deer without a bed");
      expect(woodsAt(deer.bed.x, deer.bed.z)).toBeGreaterThanOrEqual(woodsAt(deer.home.x, deer.home.z) - 0.05);
    }
  });

  it("near a point are those whose homes lie within the radius", () => {
    const near = friendsNear(world, world.home.x, world.home.z, 250);
    for (const friend of near) expect(Math.hypot(friend.home.x - world.home.x, friend.home.z - world.home.z)).toBeLessThanOrEqual(250);
  });
});

describe("the wild animals' year and day", () => {
  it("turns a hare white for winter and brown for summer, and the squirrels' and deer's coats with it", () => {
    expect(coatSeason(15).white).toBe(1);
    expect(coatSeason(190).white).toBe(0);
    expect(coatSeason(15).winter).toBe(1);
    expect(coatSeason(190).winter).toBe(0);
    expect(coatSeason(300).white).toBeGreaterThan(0);
    expect(coatSeason(300).white).toBeLessThan(1);
  });

  it("brings the deer out round dawn and dusk, and beds them down through the day and the night", () => {
    expect(deerAbroad(2)).toBeGreaterThan(0.9);
    expect(deerAbroad(35)).toBe(0);
    expect(deerAbroad(-20)).toBe(0);
  });

  it("quietens the birds at night and in the rain", () => {
    expect(birdsAbout(30, 0)).toBeGreaterThan(0.7);
    expect(birdsAbout(-15, 0)).toBe(0);
    expect(birdsAbout(30, 1)).toBeLessThan(birdsAbout(30, 0) * 0.4);
  });

  it("puts butterflies on the wing only on warm, bright summer days", () => {
    const july = 190;
    expect(butterfliesAbout(july, 45, 21, 0, 0.1)).toBeGreaterThan(0.6);
    expect(butterfliesAbout(15, 10, -5, 0, 0.1)).toBe(0);
    expect(butterfliesAbout(july, 45, 21, 0.8, 0.9)).toBe(0);
    expect(butterfliesAbout(july, -5, 14, 0, 0.1)).toBe(0);
  });
});

describe("the songbirds and butterflies of a chunk", () => {
  const chunk = { x: Math.floor(world.home.x / 64) + 1, z: Math.floor(world.home.z / 64) };
  const perches = Array.from({ length: 9 }, (_, i) => perchesIn(world, chunk.x + (i % 3) - 1, chunk.z + Math.floor(i / 3) - 1)).flat();

  it("perch on rocks, bushes and twigs out from the crowns, with ground beside them above the water", () => {
    expect(new Set(perches.map((p) => p.kind)).size).toBeGreaterThanOrEqual(3);
    for (const p of perches.filter((q) => q.kind === "ground")) expect(p.y).toBeGreaterThan(world.waterAt(p.x, p.z));
    for (const p of perches.filter((q) => q.kind === "crown")) expect(p.twig).toBeDefined();
  });

  it("start each songbird up on a perch, never on the ground", () => {
    const own = perchesIn(world, chunk.x, chunk.z);
    for (const bird of songbirdsIn(world, chunk.x, chunk.z, own)) expect(own[bird.perch].kind).not.toBe("ground");
  });

  it("dance butterflies over the meadow flowers", () => {
    const butterflies = Array.from({ length: 25 }, (_, i) => butterfliesIn(world, chunk.x + (i % 5) - 2, chunk.z + Math.floor(i / 5) - 2)).flat();
    expect(butterflies.length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";
import { canStand } from "../gameplay/walking";
import { storyOf } from "../stories/library";
import { emptySample } from "./land";
import { isGiverCell, PEOPLE_CELL, peopleInCell, peopleNear, wayTo, type Person } from "./people";
import { createWorld } from "./world";

const world = createWorld("first-valley");

/** A block of cells round camp: enough for who stands where to show. */
const cells: { cx: number; cz: number; people: Person[] }[] = [];
const campCell = { cx: Math.floor(world.home.x / PEOPLE_CELL), cz: Math.floor(world.home.z / PEOPLE_CELL) };
for (let dz = -5; dz <= 5; dz++) {
  for (let dx = -5; dx <= 5; dx++) {
    const cx = campCell.cx + dx;
    const cz = campCell.cz + dz;
    cells.push({ cx, cz, people: peopleInCell(world, cx, cz) });
  }
}
const all = cells.flatMap((c) => c.people);

describe("people by area", () => {
  it("are the same every time a cell is asked for", () => {
    const busy = cells.find((c) => c.people.length > 0);
    if (!busy) throw new Error("Nobody near camp");
    expect(peopleInCell(createWorld("first-valley"), busy.cx, busy.cz)).toEqual(busy.people);
  });

  it("are met now and then: about one cell in five round camp has someone", () => {
    const perCell = all.length / cells.length;
    expect(perCell).toBeGreaterThan(0.1);
    expect(perCell).toBeLessThan(0.45);
  });

  it("include camp's neighbour, a short walk from the fire, carrying the first story with their lost cat nearby", () => {
    const [first] = peopleInCell(world, campCell.cx, campCell.cz);
    expect(first.role).toBe("cottager");
    expect(first.story).toBe("cat-who-chose");
    const d = Math.hypot(first.x - world.home.x, first.z - world.home.z);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(200);
    expect(first.pet?.species).toBe("cat");
    expect(first.homes.map((h) => h.kind)).toEqual(["cottage"]);
  });

  it("stand where a person can stand, each carrying a story their role fits", () => {
    for (const person of all) {
      expect(canStand(world, person.x, person.z)).toBe(true);
      const story = storyOf(person.story);
      expect(story.roles).toContain(person.role);
    }
  });

  it("keep their lost animal on dry ground a walk away, under an id of its own", () => {
    for (const person of all.filter((p) => p.pet)) {
      const pet = person.pet;
      if (!pet) continue;
      const d = Math.hypot(pet.home.x - person.x, pet.home.z - person.z);
      expect(d).toBeGreaterThan(40);
      expect(d).toBeLessThan(105);
      expect(canStand(world, pet.home.x, pet.home.z)).toBe(true);
      expect(pet.id).toBe(`lost/${person.id}`);
    }
  });

  it("each has an id and seed of its own", () => {
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
    expect(new Set(all.map((p) => p.seed)).size).toBe(all.length);
  });

  it("near a point are those within the radius, a note's friend included though they stand outside their giver's cell", () => {
    const { x, z } = world.home;
    const near = peopleNear(world, x, z, 500);
    for (const person of near) expect(Math.hypot(person.x - x, person.z - z)).toBeLessThanOrEqual(500);
    const ids = new Set(near.map((p) => p.id));
    for (const person of all) if (Math.hypot(person.x - x, person.z - z) < 500) expect(ids.has(person.id)).toBe(true);
  });

  it("pair a note's giver with the friend it goes to, each pointing at the other", () => {
    let pair: Person[] | null = null;
    for (let r = 0; r < 30 && pair === null; r++) {
      for (let k = 0; k < 8 * (r + 1) && pair === null; k++) {
        const angle = (k / (8 * (r + 1))) * Math.PI * 2;
        const cx = Math.round(Math.cos(angle) * r);
        const cz = Math.round(Math.sin(angle) * r);
        if (!isGiverCell(world.seed, cx, cz)) continue;
        const found = peopleInCell(world, cx, cz);
        if (found.length === 2) pair = found;
      }
    }
    if (pair === null) throw new Error("No note's giver within 30 cells");
    const [giver, friend] = pair;
    expect(storyOf(giver.story).kind).toBe("help");
    expect(storyOf(friend.story).kind).toBe("receive");
    expect(giver.partner?.id).toBe(friend.id);
    expect(friend.partner?.id).toBe(giver.id);
    expect(Math.hypot(giver.x - friend.x, giver.z - friend.z)).toBeGreaterThan(200);
  });

  it("keep a sauna by any water to plunge into, a river's bank as well as a lake's, its hut on dry, level ground", () => {
    const saunaKeepers = all.filter((p) => p.role === "sauna-keeper");
    const s = emptySample();
    const byRiver = saunaKeepers.some((p) =>
      Array.from({ length: 16 }, (_, k) => (k / 16) * Math.PI * 2).some((a) =>
        [4, 8, 12].some((r) => {
          const land = world.sampleAt(p.x + Math.sin(a) * r, p.z + Math.cos(a) * r, s);
          return land.river > 0.05 && land.water - land.height > 0.25;
        }),
      ),
    );
    expect(byRiver).toBe(true);
    for (const person of saunaKeepers) {
      const [hut] = person.homes;
      expect(hut.kind).toBe("sauna");
      const footing = Array.from({ length: 8 }, (_, k) => world.sampleAt(hut.x + Math.cos((k / 8) * Math.PI * 2) * 2.7, hut.z + Math.sin((k / 8) * Math.PI * 2) * 2.7, emptySample()));
      for (const land of footing) {
        expect(land.height - land.water).toBeGreaterThan(0.45);
        expect(land.river).toBeLessThan(0.02);
      }
      const heights = footing.map((land) => land.height);
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(1.4);
    }
  });

  it("share a tarn by the seed: a fisher on its lip, or a sauna keeper with their hut just beyond it", () => {
    const tarns = [
      { dx: -14, dz: 0 },
      { dx: -5, dz: 8 },
    ].map(({ dx, dz }) => ({ place: world.placeIn(campCell.cx + dx, campCell.cz + dz), people: peopleInCell(world, campCell.cx + dx, campCell.cz + dz) }));
    for (const { place, people } of tarns) {
      expect(place?.kind).toBe("tarn");
      expect(people).toHaveLength(1);
      if (!place) continue;
      expect(Math.hypot(people[0].x - place.x, people[0].z - place.z)).toBeLessThan(40);
    }
    expect(tarns.map((t) => t.people[0].role).sort()).toEqual(["fisher", "sauna-keeper"]);
  });

  it("name a way as the compass does, north being -z", () => {
    expect(wayTo({ x: 0, z: 0 }, { x: 0, z: -10 })).toBe("the north");
    expect(wayTo({ x: 0, z: 0 }, { x: 10, z: 10 })).toBe("the south-east");
  });
});

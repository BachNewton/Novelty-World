import { describe, expect, it } from "vitest";
import { createWorld } from "../engine/world";
import { PLANT_CHUNK } from "../engine/life";
import { TREE_KINDS, type PlantKind } from "../engine/regions";
import { BESIDE, besideCamp, CAMP_REACH, homeCamp, packUp, partedBy, pitch, pitchTrouble, siteAhead, type PitchGround } from "./camp";

const world = createWorld("first-valley");
const ground: PitchGround = { ...world, forageNear: () => false, folkNear: () => false };

/** The first spot along a line out from home where camp can be pitched, and the first where it can't, for each trouble. */
function along(heading: number, want: "ok" | "wet" | "steep" | "cluttered", reach = 3000): { x: number; z: number } {
  for (let r = 0; r < reach; r += 3) {
    const x = world.home.x + Math.sin(heading) * r;
    const z = world.home.z + Math.cos(heading) * r;
    if ((pitchTrouble(ground, x, z) ?? "ok") === want) return { x, z };
  }
  throw new Error(`Nowhere ${want} within ${reach} m along ${heading}`);
}

describe("camp", () => {
  it("starts every world at its home camp, with Elliott beside the fire where the first walk always began", () => {
    const camp = homeCamp(world);
    expect(camp.carried).toBe(false);
    expect(camp.site).toEqual({ x: world.home.x, y: world.home.y, z: world.home.z, turn: 0 });
    const start = besideCamp(camp.site);
    expect(start.x).toBeCloseTo(world.home.x + 3.4);
    expect(start.z).toBeCloseTo(world.home.z + 1.5);
    expect(start.heading).toBeCloseTo(Math.atan2(-3.4, -1.5));
  });

  it("is pitched a few steps in front of Elliott, turned so they stand beside it as at home", () => {
    for (const heading of [0, 1.1, -2.4, 3]) {
      const walker = { x: 120, z: -40, heading };
      const site = siteAhead(walker);
      expect(Math.hypot(site.x - walker.x, site.z - walker.z)).toBeCloseTo(BESIDE.out);
      const beside = besideCamp({ ...site, y: 0 });
      expect(beside.x).toBeCloseTo(walker.x);
      expect(beside.z).toBeCloseTo(walker.z);
      expect(Math.cos(beside.heading - heading)).toBeCloseTo(1);
    }
  });

  it("packs up and pitches again, one at a time", () => {
    const carried = packUp(homeCamp(world));
    expect(carried.carried).toBe(true);
    expect(() => packUp(carried)).toThrow();
    const site = { x: 10, y: 2, z: 20, turn: 0.5 };
    expect(pitch(carried, site)).toEqual({ site, carried: false });
    expect(() => pitch(pitch(carried, site), site)).toThrow();
  });

  it("can be pitched again at home", () => {
    expect(pitchTrouble(ground, world.home.x, world.home.z)).toBeNull();
  });

  it("is never pitched in water, on steep ground or among trees, rocks and bushes", () => {
    const wet = along(0.3, "wet");
    const under = Array.from({ length: 24 }, (_, k) => world.sampleAt(wet.x + Math.cos(k) * (k % 3) * 2.2, wet.z + Math.sin(k) * (k % 3) * 2.2));
    expect(under.some((land) => land.water > land.height - 0.3 || land.river > 0)).toBe(true);
    const cluttered = along(2.1, "cluttered");
    const near = [-1, 0, 1].flatMap((dz) => [-1, 0, 1].flatMap((dx) => world.plantsIn(Math.floor(cluttered.x / PLANT_CHUNK) + dx, Math.floor(cluttered.z / PLANT_CHUNK) + dz).plants));
    expect(near.some((p) => p.kind !== "flowers" && p.kind !== "heather" && p.kind !== "fern" && Math.hypot(p.x - cluttered.x, p.z - cluttered.z) < CAMP_REACH + 3)).toBe(true);
    for (const heading of [0.3, 1.2, 2.1, 4]) {
      const ok = along(heading, "ok");
      const trees = [-1, 0, 1].flatMap((dz) => [-1, 0, 1].flatMap((dx) => world.plantsIn(Math.floor(ok.x / PLANT_CHUNK) + dx, Math.floor(ok.z / PLANT_CHUNK) + dz).plants));
      expect(trees.filter((p) => (TREE_KINDS as readonly PlantKind[]).includes(p.kind) && Math.hypot(p.x - ok.x, p.z - ok.z) < CAMP_REACH)).toEqual([]);
    }
  });

  it("keeps off forage and anyone's home", () => {
    expect(pitchTrouble({ ...ground, forageNear: () => true }, world.home.x, world.home.z)).toBe("cluttered");
    expect(pitchTrouble({ ...ground, folkNear: () => true }, world.home.x, world.home.z)).toBe("cluttered");
  });

  it("parts only the ground plants within its things", () => {
    const site = { x: 0, z: 0 };
    expect(partedBy(site, { kind: "flowers", x: 2, z: 1 })).toBe(true);
    expect(partedBy(site, { kind: "heather", x: 7, z: 0 })).toBe(false);
    expect(partedBy(site, { kind: "rock", x: 1, z: 0 })).toBe(false);
  });

});

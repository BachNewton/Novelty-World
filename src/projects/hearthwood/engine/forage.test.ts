import { describe, expect, it } from "vitest";
import { dayOfYear, FORAGE_FORM, inSeason, makeForage, SEASON_SHIFT, SEASONS, type ForageSpot } from "./forage";
import { PLANT_CHUNK } from "./life";
import { FORAGE_KINDS, mainRegion, REGIONS, type ForageKind, type PlantKind, type Region } from "./regions";
import { createWorld } from "./world";

const world = createWorld("first-valley");
const forage = makeForage(world);

/** The chunk deepest in each region within a few kilometres of the origin. */
function heartOfEachRegion(): Record<Region, { cx: number; cz: number; share: number }> {
  const best: Partial<Record<Region, { cx: number; cz: number; share: number }>> = {};
  for (let z = -6000; z <= 6000; z += 400) {
    for (let x = -6000; x <= 6000; x += 400) {
      const weights = world.regionAt(x, z);
      const region = mainRegion(weights);
      const share = weights[REGIONS.indexOf(region)];
      const land = world.sampleAt(x, z);
      if (land.height < land.water + 1 || land.height > 240) continue;
      const known = best[region];
      if (known === undefined || share > known.share) best[region] = { cx: Math.floor(x / PLANT_CHUNK), cz: Math.floor(z / PLANT_CHUNK), share };
    }
  }
  return Object.fromEntries(
    REGIONS.map((region) => {
      const found = best[region];
      if (found === undefined) throw new Error(`No ${region} within a few kilometres of the origin`);
      return [region, found];
    }),
  ) as Record<Region, { cx: number; cz: number; share: number }>;
}

const hearts = heartOfEachRegion();
/** A block of five by five chunks in the heart of each region. */
const sampled: Record<Region, ForageSpot[]> = Object.fromEntries(
  REGIONS.map((region) => {
    const { cx, cz } = hearts[region];
    const spots: ForageSpot[] = [];
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) spots.push(...forage.spotsIn(cx + dx, cz + dz).spots);
    return [region, spots];
  }),
) as Record<Region, ForageSpot[]>;
/** Cloudberries and funnel chanterelles keep to scarcer ground: the chunks of the first few spots of it out from the origin. */
function spotsWhere(fits: (land: ReturnType<typeof world.sampleAt>, x: number, z: number) => boolean): ForageSpot[] {
  const spots: ForageSpot[] = [];
  let found = 0;
  for (let r = 200; r < 8000 && found < 6; r += 200) {
    for (let a = 0; a < 24 && found < 6; a++) {
      const x = Math.cos((a / 24) * Math.PI * 2) * r;
      const z = Math.sin((a / 24) * Math.PI * 2) * r;
      const land = world.sampleAt(x, z);
      if (land.height < land.water || !fits(land, x, z)) continue;
      found++;
      spots.push(...forage.spotsIn(Math.floor(x / PLANT_CHUNK), Math.floor(z / PLANT_CHUNK)).spots);
    }
  }
  return spots;
}

const bogs = spotsWhere((land) => land.wetness > 0.7 && land.height - land.water < 3);
const dampWoods = spotsWhere((land, x, z) => land.wetness > 0.4 && land.height - land.water > 2 && world.regionAt(x, z, land)[REGIONS.indexOf("highlands")] > 0.5 && world.woodlandAt(x, z, land, world.regionAt(x, z, land), 0) > 0.7);
const everything = [...Object.values(sampled).flat(), ...bogs, ...dampWoods].filter((s, i, all) => all.findIndex((o) => o.id === s.id) === i);
const ofKind = (kind: ForageKind) => everything.filter((s) => s.kind === kind);

const TREE_GROUP: Partial<Record<PlantKind, string>> = { conifer: "spruce", pine: "pine", birch: "birch", aspen: "birch", broadleaf: "broadleaf", maple: "broadleaf" };

/** The share of each kind of tree within 10 m of a spot. */
function treesBy(spot: ForageSpot): Record<string, number> {
  const counts: Record<string, number> = { spruce: 0, pine: 0, birch: 0, broadleaf: 0 };
  let total = 0;
  const cx = Math.floor(spot.x / PLANT_CHUNK);
  const cz = Math.floor(spot.z / PLANT_CHUNK);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      for (const p of world.plantsIn(cx + dx, cz + dz).plants) {
        const group = TREE_GROUP[p.kind];
        if (group === undefined || Math.hypot(p.x - spot.x, p.z - spot.z) > 10) continue;
        counts[group]++;
        total++;
      }
    }
  }
  for (const g of Object.keys(counts)) counts[g] = total > 0 ? counts[g] / total : 0;
  return counts;
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

describe("what there is to pick", () => {
  it("comes out the same from the same seed, whatever was asked for first", () => {
    const again = makeForage(createWorld("first-valley"));
    const { cx, cz } = hearts.highlands;
    again.spotsIn(cx + 5, cz - 3);
    expect(again.spotsIn(cx, cz)).toEqual(forage.spotsIn(cx, cz));
  });

  it("names every spot by its chunk and its place there, once", () => {
    const ids = everything.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const { cx, cz } = hearts.birchvale;
    forage.spotsIn(cx, cz).spots.forEach((s, i) => {
      expect(s.id).toBe(`${cx},${cz}/${i}`);
    });
  });

  it("grows every kind somewhere, and something in every region", () => {
    for (const kind of FORAGE_KINDS) expect(ofKind(kind).length, kind).toBeGreaterThan(0);
    for (const region of REGIONS) expect(sampled[region].length, region).toBeGreaterThan(40);
  });

  it("grows in patches, as a real forest does", () => {
    for (const kind of FORAGE_KINDS) {
      const spots = ofKind(kind);
      const nearest = spots.map((s) => Math.min(...spots.filter((o) => o !== s).map((o) => Math.hypot(o.x - s.x, o.z - s.z))));
      expect(mean(nearest.filter(Number.isFinite)), kind).toBeLessThan(3);
    }
  });

  it("keeps each kind to its own ground", () => {
    const conifers = (s: ForageSpot) => treesBy(s).spruce + treesBy(s).pine;
    expect(mean(ofKind("bilberry").map(conifers))).toBeGreaterThan(0.6);
    expect(mean(ofKind("fly-agaric").map((s) => treesBy(s).birch))).toBeGreaterThan(0.5);
    // Damp conifer woods, with more spruce than the conifer woods round about have.
    expect(mean(ofKind("funnel-chanterelle").map(conifers))).toBeGreaterThan(0.7);
    expect(mean(ofKind("funnel-chanterelle").map((s) => treesBy(s).spruce))).toBeGreaterThan(mean(ofKind("bilberry").map((s) => treesBy(s).spruce)));
    for (const s of ofKind("cloudberry")) {
      const land = world.sampleAt(s.x, s.z);
      expect(land.wetness).toBeGreaterThan(0.4);
      expect(land.height - land.water).toBeLessThan(6);
    }
    const wooded = (s: ForageSpot) => world.woodlandAt(s.x, s.z, world.sampleAt(s.x, s.z), world.regionAt(s.x, s.z), 0);
    expect(mean(ofKind("chanterelle").map(wooded))).toBeGreaterThan(0.5);
    expect(mean(ofKind("wild-strawberry").map(wooded))).toBeLessThan(0.75);
    for (const s of everything) {
      const land = world.sampleAt(s.x, s.z);
      expect(land.height, s.id).toBeGreaterThan(land.water);
      expect(s.y).toBeCloseTo(land.height, 5);
    }
  });
});

describe("the seasons", () => {
  it("has nothing ripe in winter", () => {
    for (const kind of FORAGE_KINDS) {
      for (let day = 0; day < 365; day++) {
        const winter = day < 120 || day > 335;
        if (winter) for (const shift of [-SEASON_SHIFT, 0, SEASON_SHIFT]) expect(inSeason(kind, day, shift), `${kind} on ${day}`).toBe(false);
      }
    }
  });

  it("begins with wild strawberries, then the berries, then the mushrooms, with funnel chanterelles last", () => {
    const first = (kind: ForageKind) => SEASONS[kind][0];
    const last = (kind: ForageKind) => SEASONS[kind][1];
    for (const kind of FORAGE_KINDS) if (kind !== "wild-strawberry") expect(first(kind)).toBeGreaterThan(first("wild-strawberry"));
    for (const kind of FORAGE_KINDS) if (kind !== "funnel-chanterelle") expect(last(kind)).toBeLessThan(last("funnel-chanterelle"));
    const berries = FORAGE_KINDS.filter((k) => FORAGE_FORM[k] === "berry" && k !== "lingonberry");
    const mushrooms = FORAGE_KINDS.filter((k) => FORAGE_FORM[k] === "mushroom");
    expect(mean(berries.map(last))).toBeLessThan(mean(mushrooms.map(last)));
  });

  it("follows the year round, whatever the count of days", () => {
    expect(dayOfYear(365 + 200)).toBe(200);
    expect(dayOfYear(-1)).toBe(364);
    expect(inSeason("bilberry", 365 * 3 + 220)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { biomeAt } from "./ground";
import { sample, slopeAt } from "./grid";
import { ALTITUDE } from "./land";
import { lineLength } from "./paths";
import { generateValley } from "./valley";
import { canStand, WALK_LIMITS } from "./walking";
import { lakeDistance, WATER_LEVEL } from "./water";

const SEEDS = ["first-valley", "b", "e"];
const valleys = SEEDS.map((seed) => generateValley(seed));
const [first] = valleys;

describe("generateValley", () => {
  it("makes the same valley from the same seed", () => {
    const again = generateValley("first-valley");
    expect(again.heights.values).toEqual(first.heights.values);
    expect(again.plants).toEqual(first.plants);
    expect(again.trails).toEqual(first.trails);
  });

  it("makes a different valley from another seed", () => {
    expect(valleys[1].heights.values).not.toEqual(first.heights.values);
  });

  it.each(SEEDS.map((seed, i) => [seed, valleys[i]] as const))("%s: rises from a floor to a rim the walker can't climb", (_, valley) => {
    expect(sample(valley.heights, valley.camp.x, valley.camp.z)).toBeLessThan(ALTITUDE.forest);
    const reach = -valley.heights.origin - 12;
    for (let k = 0; k < 32; k++) {
      const angle = (k / 32) * Math.PI * 2;
      let blocked = false;
      for (let r = 0; r <= reach && !blocked; r += 2) {
        blocked = !canStand(valley.heights, Math.cos(angle) * r, Math.sin(angle) * r) && sample(valley.heights, Math.cos(angle) * r, Math.sin(angle) * r) > WALK_LIMITS.ceiling;
      }
      expect(blocked, `the rim is open at ${angle.toFixed(2)} rad`).toBe(true);
    }
  });

  it.each(SEEDS.map((seed, i) => [seed, valleys[i]] as const))("%s: runs its stream always downhill into the lake, over a waterfall", (_, valley) => {
    const { points, waterfall } = valley.stream;
    for (let k = 1; k < points.length; k++) expect(points[k].surface).toBeLessThanOrEqual(points[k - 1].surface);
    const mouth = points[points.length - 1];
    expect(lakeDistance(valley.lake, mouth.x, mouth.z)).toBeLessThan(1);
    expect(waterfall.top - waterfall.bottom).toBeGreaterThan(3);
    // Over the falls' lip the water drops through the height of a cliff in a metre, so only the stream either side of it sits in its bed.
    points.forEach((p, k) => {
      if (Math.abs(k - waterfall.index) > 3) expect(sample(valley.heights, p.x, p.z)).toBeLessThan(p.surface);
    });
  });

  it.each(SEEDS.map((seed, i) => [seed, valleys[i]] as const))("%s: pitches camp on dry, level meadow, clear of trees", (_, valley) => {
    const { camp } = valley;
    expect(biomeAt(valley, camp.x, camp.z)).toBe("meadow");
    expect(slopeAt(valley.heights, camp.x, camp.z)).toBeLessThan(0.1);
    expect(sample(valley.heights, camp.x, camp.z)).toBeGreaterThan(WATER_LEVEL + 1);
    const trees = valley.plants.filter((p) => p.kind !== "flowers" && Math.hypot(p.x - camp.x, p.z - camp.z) < camp.clearing - 3);
    expect(trees).toEqual([]);
  });

  it.each(SEEDS.map((seed, i) => [seed, valleys[i]] as const))("%s: lays a walkable trail from camp to each of its places", (_, valley) => {
    expect(valley.places.map((p) => p.kind).sort()).toEqual(["hilltop", "stone-circle", "waterfall"]);
    for (const place of valley.places) {
      const trail = valley.trails.find((t) => t.to === place.kind);
      if (!trail) throw new Error(`No trail to the ${place.kind}`);
      const start = trail.points[0];
      const end = trail.points[trail.points.length - 1];
      expect(Math.hypot(start.x - valley.camp.x, start.z - valley.camp.z)).toBeLessThan(3);
      expect(Math.hypot(end.x - place.visitX, end.z - place.visitZ)).toBeLessThan(3);
      expect(lineLength(trail.points)).toBeGreaterThan(40);
      for (const p of trail.points) expect(sample(valley.heights, p.x, p.z)).toBeLessThan(WALK_LIMITS.ceiling);
    }
  });

  it.each(SEEDS.map((seed, i) => [seed, valleys[i]] as const))("%s: keeps plants off the trails and out of the water", (_, valley) => {
    for (const p of valley.plants) {
      if (p.kind !== "flowers") expect(sample(valley.trailDistance, p.x, p.z)).toBeGreaterThan(1.5);
      expect(lakeDistance(valley.lake, p.x, p.z)).toBeGreaterThan(1);
      expect(sample(valley.streamDistance, p.x, p.z)).toBeGreaterThan(1);
    }
  });

  it("grows a forest of several kinds, densest between the floor and the treeline", () => {
    const trees = first.plants.filter((p) => p.kind === "conifer" || p.kind === "broadleaf" || p.kind === "birch");
    expect(trees.length).toBeGreaterThan(2000);
    const inBand = trees.filter((p) => p.y > ALTITUDE.forest && p.y < ALTITUDE.treeline + 10).length;
    expect(inBand / trees.length).toBeGreaterThan(0.5);
    const conifersHigh = trees.filter((p) => p.y > ALTITUDE.treeline - 15);
    expect(conifersHigh.filter((p) => p.kind === "conifer").length / conifersHigh.length).toBeGreaterThan(0.6);
  });

  it("sets biomes by altitude and water", () => {
    const { lake, heights } = first;
    expect(biomeAt(first, lake.x, lake.z)).toBe("lake");
    const middle = first.stream.points[Math.floor(first.stream.points.length / 2)];
    expect(biomeAt(first, middle.x, middle.z)).toBe("stream");
    const corner = -heights.origin - 4;
    expect(["rock", "snow"]).toContain(biomeAt(first, corner, corner));
  });
});

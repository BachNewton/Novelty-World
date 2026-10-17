import { describe, expect, it } from "vitest";
import { canStand, WALK_LIMITS } from "../gameplay/walking";
import { emptySample, TERRACE } from "./land";
import { PLANT_CHUNK } from "./life";
import { PLACE_CELL } from "./places";
import { mainRegion, REGIONS, TREE_KINDS, type PlantKind } from "./regions";
import { landTile } from "./tiles";
import { createWorld } from "./world";

const world = createWorld("first-valley");
const other = createWorld("another-world");
const isTree = (kind: PlantKind) => (TREE_KINDS as readonly PlantKind[]).includes(kind);

describe("the world", () => {
  it("comes out the same from the same seed, whatever was asked for first", () => {
    const again = createWorld("first-valley");
    // The second world works out other chunks and places first; its answers must not depend on that.
    again.plantsIn(9, -4);
    again.placesNear(3000, 3000, 600);
    expect(again.camp).toEqual(world.camp);
    for (const [x, z] of [[0, 0], [1234.5, -987.25], [-4000, 2500]]) expect(again.heightAt(x, z)).toBe(world.heightAt(x, z));
    expect(again.plantsIn(2, 3)).toEqual(world.plantsIn(2, 3));
    expect(again.placeIn(4, -2)).toEqual(world.placeIn(4, -2));
  });

  it("comes out different from another seed", () => {
    expect(other.heightAt(1500, 1500)).not.toBe(world.heightAt(1500, 1500));
  });

  it("pitches camp on dry, level greenwood meadow near the origin, clear of trees", () => {
    const { camp } = world;
    expect(Math.hypot(camp.x, camp.z)).toBeLessThan(200);
    const at = world.sampleAt(camp.x, camp.z);
    expect(at.height - at.water).toBeGreaterThan(1.5);
    expect(mainRegion(world.regionAt(camp.x, camp.z))).toBe("greenwood");
    for (let k = 0; k < 8; k++) {
      const angle = (k / 8) * Math.PI * 2;
      expect(Math.abs(world.heightAt(camp.x + Math.cos(angle) * 6, camp.z + Math.sin(angle) * 6) - camp.y)).toBeLessThan(0.3);
    }
    expect(canStand(world, camp.x + 3, camp.z)).toBe(true);
    const near = [-1, 0, 1].flatMap((dz) => [-1, 0, 1].flatMap((dx) => world.plantsIn(Math.floor(camp.x / PLANT_CHUNK) + dx, Math.floor(camp.z / PLANT_CHUNK) + dz).plants));
    expect(near.filter((p) => isTree(p.kind) && Math.hypot(p.x - camp.x, p.z - camp.z) < camp.clearing - 2)).toEqual([]);
  });

  it("has no edge: the land goes on, walkable, far from the origin", () => {
    let open = 0;
    for (let k = 0; k < 40; k++) if (canStand(world, 50_000 + k * 37, -80_000 + k * 53)) open++;
    expect(open).toBeGreaterThan(10);
  });

  it("varies over distance: lowland, hills and high peaks, and every region, within a few kilometres", () => {
    const s = emptySample();
    const seen = new Set<string>();
    let low = 0;
    let high = 0;
    for (let z = -8000; z <= 8000; z += 250) {
      for (let x = -8000; x <= 8000; x += 250) {
        world.landAt(x, z, s);
        if (s.height < 60) low++;
        if (s.height > 450) high++;
        seen.add(mainRegion(world.regionAt(x, z, s)));
      }
    }
    expect(low).toBeGreaterThan(100);
    expect(high).toBeGreaterThan(20);
    expect([...seen].sort()).toEqual([...REGIONS].sort());
  });

  it("never runs its rivers uphill, and keeps them shallow enough to wade", () => {
    const s = emptySample();
    let checked = 0;
    let wadeable = 0;
    for (let z = -4000; z <= 4000; z += 7) {
      for (let x = -4000; x <= 4000; x += 97) {
        world.landAt(x, z, s);
        if (s.river < 0.8 || s.water <= s.height) continue;
        const { water, height } = s;
        const flow = world.flowAt(x, z);
        const ahead = world.landAt(x + flow.x * 5, z + flow.z * 5, s).water;
        // Level water, or a fall down to the next terrace below: never up.
        expect(ahead).toBeLessThanOrEqual(water + 1e-6);
        expect([0, TERRACE]).toContain(Math.round(water - ahead));
        // Where a river runs through a lake the water is the lake's, and deep; along the river itself it is a ford.
        if (water - height <= WALK_LIMITS.wade) wadeable++;
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
    expect(wadeable / checked).toBeGreaterThan(0.85);
  });

  it("finds a place in most cells, each kept clear of trees", () => {
    let places = 0;
    for (let cz = -3; cz < 3; cz++) {
      for (let cx = -3; cx < 3; cx++) {
        const place = world.placeIn(cx, cz);
        if (!place) continue;
        places++;
        expect(Math.floor(place.x / PLACE_CELL)).toBe(cx);
        const chunkX = Math.floor(place.x / PLANT_CHUNK);
        const chunkZ = Math.floor(place.z / PLANT_CHUNK);
        const plants = [-1, 0, 1].flatMap((dz) => [-1, 0, 1].flatMap((dx) => world.plantsIn(chunkX + dx, chunkZ + dz).plants));
        expect(plants.filter((p) => isTree(p.kind) && Math.hypot(p.x - place.x, p.z - place.z) < place.clearing - 2)).toEqual([]);
      }
    }
    // About one place in every two or three cells: one every 300 m or so, wherever the walk goes.
    expect(places).toBeGreaterThan(12);
  });

  it("joins neighbouring tiles of a level exactly along their shared edge", () => {
    const a = landTile(world, { level: 1, i: 0, j: 0 });
    const b = landTile(world, { level: 1, i: 1, j: 0 });
    for (let j = 0; j < a.side; j++) expect(b.heights[j * b.side]).toBe(a.heights[j * a.side + a.side - 1]);
  });
});

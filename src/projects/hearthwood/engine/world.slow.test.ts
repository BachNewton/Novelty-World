import { describe, expect, it } from "vitest";
import { canStand, WALK_LIMITS, type WalkGround } from "./walking";
import { emptySample } from "./land";
import { createWorld } from "./world";

/*
 * Checks that need a wide stretch of the world worked out: finding a tarn
 * means working out the places of a few hundred cells among the ranges, and
 * finding a way up a big mountain means reading a whole massif closely.
 */

const world = createWorld("first-valley");

/** The highest point of each block of the world's big ranges. */
function bigPeaks(blocks: number, block: number, over: number): { x: number; z: number; height: number }[] {
  const s = emptySample();
  const peaks: { x: number; z: number; height: number }[] = [];
  const from = (-blocks / 2) * block;
  for (let bz = 0; bz < blocks; bz++) {
    for (let bx = 0; bx < blocks; bx++) {
      let best = { x: 0, z: 0, height: -Infinity };
      for (let z = from + bz * block; z < from + (bz + 1) * block; z += 150) {
        for (let x = from + bx * block; x < from + (bx + 1) * block; x += 150) {
          const height = world.landAt(x, z, s, 75).height;
          if (height > best.height) best = { x, z, height };
        }
      }
      if (best.height > over) peaks.push(best);
    }
  }
  return peaks;
}

/**
 * How high a walker gets from the lowlands round a peak: a search over a grid of spots that can be stood on, stepping
 * between neighbours no steeper than a walker climbs, starting from the low ground at the edge of the area.
 */
function highestReached(peak: { x: number; z: number }, reach: number, grid: number): number {
  const s = emptySample();
  const ground: WalkGround = { heightAt: (x, z) => world.landAt(x, z, s).height, waterAt: (x, z) => world.landAt(x, z, s).water };
  const side = Math.round((2 * reach) / grid) + 1;
  const x0 = peak.x - reach;
  const z0 = peak.z - reach;
  const heights = new Float32Array(side * side);
  const standable = new Uint8Array(side * side);
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      heights[j * side + i] = ground.heightAt(x0 + i * grid, z0 + j * grid);
      standable[j * side + i] = canStand(ground, x0 + i * grid, z0 + j * grid) ? 1 : 0;
    }
  }
  const seen = new Uint8Array(side * side);
  const queue: number[] = [];
  for (let k = 0; k < side; k++) {
    for (const v of [k, (side - 1) * side + k, k * side, k * side + side - 1]) {
      if (standable[v] && heights[v] < LOWLAND && !seen[v]) {
        seen[v] = 1;
        queue.push(v);
      }
    }
  }
  let highest = -Infinity;
  for (let q = 0; q < queue.length; q++) {
    const v = queue[q];
    highest = Math.max(highest, heights[v]);
    const i = v % side;
    const j = Math.floor(v / side);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const ni = i + di;
        const nj = j + dj;
        if ((di === 0 && dj === 0) || ni < 0 || nj < 0 || ni >= side || nj >= side) continue;
        const w = nj * side + ni;
        if (seen[w] || !standable[w]) continue;
        if (Math.abs(heights[w] - heights[v]) / (grid * Math.hypot(di, dj)) > WALK_LIMITS.steepest * 0.9) continue;
        seen[w] = 1;
        queue.push(w);
      }
    }
  }
  return highest;
}

/** Ground lower than this is the lowlands a climb starts from, in metres. */
const LOWLAND = 250;

describe("the world, widely", () => {
  it("holds a tarn's water in its hollow", () => {
    const tarn = world.placesNear(-2500, 4000, 1800).find((p) => p.kind === "tarn");
    if (!tarn?.pool) throw new Error("No tarn among the ranges near the origin");
    const { level, radius } = tarn.pool;
    expect(world.waterAt(tarn.x, tarn.z)).toBe(level);
    expect(world.heightAt(tarn.x, tarn.z)).toBeLessThan(level - 1);
    for (let k = 0; k < 16; k++) {
      const angle = (k / 16) * Math.PI * 2;
      const x = tarn.x + Math.cos(angle) * (radius + 3.5);
      const z = tarn.z + Math.sin(angle) * (radius + 3.5);
      expect(world.heightAt(x, z)).toBeGreaterThan(level);
    }
  }, 60_000);

  it("has a way up every big mountain from the lowlands to a high viewpoint", () => {
    // The three highest massifs of a 24 km square: each takes several seconds to read closely enough.
    const peaks = bigPeaks(3, 8000, 1800).sort((a, b) => b.height - a.height);
    expect(peaks.length).toBeGreaterThanOrEqual(3);
    for (const peak of peaks.slice(0, 3)) {
      // Four fifths of the way up from the lowlands: the summits themselves may be horns, faces to look at, not climb.
      expect(highestReached(peak, 4500, 40)).toBeGreaterThan(LOWLAND + 0.8 * (peak.height - LOWLAND));
    }
  }, 120_000);
});

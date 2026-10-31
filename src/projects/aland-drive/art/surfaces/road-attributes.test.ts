import { describe, expect, it } from "vitest";
import { RING_POINTS, type RoadSurface } from "../../render/tile";
import { FAR_FROM_MARK_M, GIVE_WAY, roadAttributes, ZEBRA } from "./road-attributes";

const HALF_WIDTH = 3;

/** A straight road of sections 10 m apart, from a point along a direction, with a 1 m shoulder each side. */
function straight(fromX: number, fromZ: number, stepX: number, stepZ: number, sections: number): number[] {
  const rings: number[] = [];
  const [sideX, sideZ] = [-stepZ / Math.hypot(stepX, stepZ), stepX / Math.hypot(stepX, stepZ)];
  for (let section = 0; section < sections; section++) {
    const [x, z] = [fromX + stepX * section, fromZ + stepZ * section];
    for (const across of [HALF_WIDTH + 1, HALF_WIDTH, 0, -HALF_WIDTH, -HALF_WIDTH - 1]) rings.push(x + sideX * across, 0, z + sideZ * across);
  }
  return rings;
}

/** A main road along x, and a lesser one running up to its edge from the south. */
function junction(kind: string, tier: number): RoadSurface {
  const main = straight(-100, 0, 10, 0, 21);
  const lesser = straight(0, 54, 0, -10, 6);
  return {
    rings: Float32Array.from([...main, ...lesser]),
    tiers: Uint8Array.from([...Array<number>(21).fill(0), ...Array<number>(6).fill(tier)]),
    chains: [
      { sections: 21, kind: "primary", motor: true, first: 0 },
      { sections: 6, kind, motor: true, first: 21 },
    ],
  };
}

const lastVertex = (surface: RoadSurface) => surface.rings.length / 3 - RING_POINTS + 2;

describe("road attributes", () => {
  it("marks the end of a lesser road on a main road, and not the main road", () => {
    const surface = junction("residential", 1);
    const { surface: info, mark } = roadAttributes(surface, []);
    const end = lastVertex(surface);
    expect(info[end * 4 + 3]).toBeCloseTo(0);
    expect(mark[end * 2 + 1]).toBe(GIVE_WAY);
    expect(info[2 * 4 + 3]).toBe(FAR_FROM_MARK_M);
    expect(mark[2 * 2 + 1]).toBe(0);
  });

  it("measures a road's half width and its shoulder in metres", () => {
    const surface = junction("residential", 1);
    const { surface: info, mark } = roadAttributes(surface, []);
    expect(info[2 * 4 + 2]).toBeCloseTo(HALF_WIDTH);
    expect(mark[2 * 2]).toBeCloseTo(1);
  });

  it("adds a zebra only in town, and leaves tracks unmarked and unsealed", () => {
    const town = [{ x: 0, z: 0, vertices: 20000 }, { x: 600, z: 0, vertices: 20000 }, { x: 0, z: 600, vertices: 20000 }, { x: -600, z: 0, vertices: 20000 }, { x: 0, z: -600, vertices: 20000 }, { x: 600, z: 600, vertices: 20000 }, { x: -600, z: 600, vertices: 20000 }, { x: 600, z: -600, vertices: 20000 }, { x: -600, z: -600, vertices: 20000 }];
    const inTown = junction("residential", 1);
    expect(roadAttributes(inTown, town).mark[lastVertex(inTown) * 2 + 1]).toBe(GIVE_WAY + ZEBRA);
    const track = junction("track", 2);
    const { surface: info, mark } = roadAttributes(track, []);
    expect(mark[lastVertex(track) * 2 + 1]).toBe(0);
    expect(info[lastVertex(track) * 4]).toBe(0);
  });
});

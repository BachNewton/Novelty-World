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
function junction(kind: string, tier: number, sealed?: boolean): RoadSurface {
  const main = straight(-100, 0, 10, 0, 21);
  const lesser = straight(0, 54, 0, -10, 6);
  return {
    rings: Float32Array.from([...main, ...lesser]),
    tiers: Uint8Array.from([...Array<number>(21).fill(0), ...Array<number>(6).fill(tier)]),
    aprons: { firstPoint: 27 * 5, firstAreaPoint: Infinity, across: new Float32Array(), tiers: new Float32Array(), indices: new Uint32Array() },
    chains: [
      { sections: 21, kind: "primary", motor: true, first: 0 },
      { sections: 6, kind, motor: true, first: 21, sealed },
    ],
  };
}

const lastVertex = (surface: RoadSurface) => surface.rings.length / 3 - RING_POINTS + 2;

describe("road attributes", () => {
  it("dresses an apron as the road it joins, with nothing to reach and a real width", () => {
    const road = junction("residential", 1);
    const apron = { ...road, rings: Float32Array.from([...road.rings, 0, 0, 1]) };
    const { surface: info, mark } = roadAttributes(apron, []);
    const vertex = road.rings.length / 3;
    expect(info[vertex * 4]).toBe(1);
    expect(info[vertex * 4 + 2]).toBeCloseTo(HALF_WIDTH);
    expect(info[vertex * 4 + 3]).toBe(FAR_FROM_MARK_M);
    expect(mark[vertex * 2 + 1]).toBe(0);
  });

  it("dresses a car park as paving of its own, however far from a road, and fails on a junction apron far from one", () => {
    const road = junction("track", 2);
    const far = { ...road, rings: Float32Array.from([...road.rings, 0, 0, 500]) };
    const vertex = road.rings.length / 3;
    const { surface: info } = roadAttributes({ ...far, aprons: { ...far.aprons, firstAreaPoint: vertex } }, []);
    expect(info[vertex * 4]).toBe(1);
    expect(info[vertex * 4 + 3]).toBe(FAR_FROM_MARK_M);
    expect(() => roadAttributes(far, [])).toThrow(/no road within/);
  });

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

  it("takes OSM's surface over what a road's class would make it, either way", () => {
    expect(roadAttributes(junction("track", 2, true), []).surface[lastVertex(junction("track", 2)) * 4]).toBe(1);
    expect(roadAttributes(junction("residential", 1, false), []).surface[lastVertex(junction("residential", 1)) * 4]).toBe(0);
  });
});

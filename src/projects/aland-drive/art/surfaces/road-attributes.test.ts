import { describe, expect, it } from "vitest";
import { RING_POINTS, type RoadSurface } from "../../render/tile";
import { FAR_FROM_MARK_M, GIVE_WAY, LOOSE_WAY, ON_CARRIAGEWAY, roadAttributes, sealedSections, SEALED_WAY, ZEBRA } from "./road-attributes";

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

/** A main road along x, and a lesser one running up from the south to a metre short of its edge, or to `endZ`. */
function junction(kind: string, tier: number, sealed?: boolean, endZ = 4): RoadSurface {
  const main = straight(-100, 0, 10, 0, 21);
  const lesser = straight(0, endZ + 50, 0, -10, 6);
  return {
    rings: Float32Array.from([...main, ...lesser]),
    tiers: Uint8Array.from([...Array<number>(21).fill(0), ...Array<number>(6).fill(tier)]),
    aprons: { firstPoint: 27 * 5, firstAreaPoint: Infinity, across: new Float32Array(), tiers: new Float32Array(), along: new Float32Array(), ways: new Int32Array(), classes: new Uint8Array(), runs: new Float32Array(), indices: new Uint32Array() },
    paved: false,
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

  it("paints a paved road's give-way line back from the edge of the road it meets, on its own carriageway only", () => {
    // The lesser road laid as paving: on to the main road's line, or stopping short of it. Its line is 0.8 m back from the main road's edge either way.
    for (const endZ of [0, 4]) {
      const road = junction("residential", 1, undefined, endZ);
      const back = HALF_WIDTH + 0.8;
      const places = [[1, 0, back], [HALF_WIDTH + 2, 0, back], [1, 0, 45]];
      const surface: RoadSurface = { ...road, rings: Float32Array.from([...road.rings, ...places.flat()]), paved: true, aprons: { ...road.aprons, ways: Int32Array.from([1, 1, 1]), classes: new Uint8Array(3) } };
      const dressed = roadAttributes(surface, []);
      const first = 27 * RING_POINTS;
      expect(dressed.surface[first * 4 + 3]).toBeCloseTo(0.8);
      expect(dressed.mark[first * 2 + 1]).toBe(GIVE_WAY);
      // Beside the carriageway, a mouth's fill, and far up the road: nothing.
      expect([1, 2].map((point) => dressed.mark[(first + point) * 2 + 1])).toEqual([0, 0]);
      expect(dressed.surface[(first + 1) * 4 + 3]).toBe(FAR_FROM_MARK_M);
    }
  });

  it("lays a road's end paint right across its carriageway where the paving says which points are on it, and not on a mouth's fill at its edge", () => {
    const road = junction("residential", 1);
    const back = HALF_WIDTH + 0.8;
    // Both edges of the carriageway, one stored a hair past it, a fill's point at the very place of an edge's, and a
    // point of the road's own paving past its last section, on the middle of the road it meets.
    const places = [[HALF_WIDTH + 0.04, 0, back], [-HALF_WIDTH, 0, back], [HALF_WIDTH + 0.04, 0, back], [1, 0, 0]];
    const surface: RoadSurface = { ...road, rings: Float32Array.from([...road.rings, ...places.flat()]), paved: true, aprons: { ...road.aprons, ways: Int32Array.from([1, 1, 1, 1]), classes: Uint8Array.from([ON_CARRIAGEWAY, ON_CARRIAGEWAY, 0, ON_CARRIAGEWAY]) } };
    const dressed = roadAttributes(surface, []);
    const first = 27 * RING_POINTS;
    expect([0, 1, 2, 3].map((point) => dressed.mark[(first + point) * 2 + 1])).toEqual([GIVE_WAY, GIVE_WAY, 0, GIVE_WAY]);
    expect(dressed.surface[first * 4 + 3]).toBeCloseTo(0.8);
    expect(dressed.surface[(first + 1) * 4 + 3]).toBeCloseTo(0.8);
    expect(dressed.surface[(first + 3) * 4 + 3]).toBeCloseTo(-HALF_WIDTH);
  });

  it("sets a give-way line back to where its road's whole width is its own, where the two roads meet at a slant", () => {
    // A lesser road coming down to the main road at 45 degrees, its last section 2 m short of the main road's edge.
    const step = 10 * Math.SQRT1_2;
    const [endX, endZ] = [5, HALF_WIDTH + 2];
    const lesser = straight(endX + 5 * step, endZ + 5 * step, -step, -step, 6);
    const road = junction("residential", 1);
    const slanted = { ...road, rings: Float32Array.from([...road.rings.slice(0, 21 * RING_POINTS * 3), ...lesser]) };
    // The road's side that reaches the main road first does so 3 m of road sooner than its middle, so the line stands
    // 3 m further back: a point 0.8 m of road back from there, on that side and on the middle.
    const nearSide = HALF_WIDTH - 0.01;
    const back = (HALF_WIDTH - endZ) * Math.SQRT2 + HALF_WIDTH + 0.8;
    const places = [0, nearSide].map((aside) => [endX + (back + aside) * Math.SQRT1_2, 0, endZ + (back - aside) * Math.SQRT1_2]);
    const surface: RoadSurface = { ...slanted, rings: Float32Array.from([...slanted.rings, ...places.flat()]), paved: true, aprons: { ...road.aprons, ways: Int32Array.from([1, 1]), classes: Uint8Array.from([ON_CARRIAGEWAY, ON_CARRIAGEWAY]) } };
    const dressed = roadAttributes(surface, []);
    const first = 27 * RING_POINTS;
    expect([0, 1].map((point) => dressed.surface[(first + point) * 4 + 3])).toEqual([expect.closeTo(0.8, 2), expect.closeTo(0.8, 2)]);
    expect([0, 1].map((point) => dressed.mark[(first + point) * 2 + 1])).toEqual([GIVE_WAY, GIVE_WAY]);
    // That side's point is off the main road's carriageway: on asphalt that carries this road's paint.
    expect(Math.abs(places[1][2])).toBeGreaterThan(HALF_WIDTH);
  });

  it("draws each point of paving as its own OSM way's surface, where the way says, whatever most of its road is", () => {
    // Three points of a street's paving: one whose way says gravel, one whose way says asphalt on a track, one that says nothing.
    const paved = (kind: string, sealed: boolean | undefined, said: number[]): RoadSurface => {
      const road = junction(kind, 1, sealed);
      const points = said.flatMap((_, point) => [point, 0, 60]);
      return { ...road, rings: Float32Array.from([...road.rings, ...points]), paved: true, aprons: { ...road.aprons, ways: Int32Array.from(said.map(() => 1)), classes: Uint8Array.from(said) } };
    };
    const first = 27 * RING_POINTS;
    const street = roadAttributes(paved("residential", true, [LOOSE_WAY, SEALED_WAY, 0]), []).surface;
    expect([0, 1, 2].map((point) => street[(first + point) * 4])).toEqual([0, 1, 1]);
    const track = roadAttributes(paved("track", undefined, [LOOSE_WAY, SEALED_WAY, 0]), []).surface;
    expect([0, 1, 2].map((point) => track[(first + point) * 4])).toEqual([0, 1, 0]);
  });

  it("reads a road as sealed or loose at each place along it, as the nearest point of its own paving says", () => {
    // The lesser road runs from z = 54 north to z = 4, a section every 10 m, with a point of its paving at each: gravel
    // along its southern end, asphalt along its northern, and between them points that say nothing. A point of the main
    // road's paving lies beside the lesser road's middle stretch, far from its own, and says gravel.
    const road = junction("residential", 1, true);
    const points = [
      { x: 3, z: 54, way: 1, said: LOOSE_WAY },
      { x: -3, z: 44, way: 1, said: LOOSE_WAY },
      { x: 3, z: 34, way: 1, said: 0 },
      { x: -3, z: 24, way: 1, said: 0 },
      { x: 3, z: 14, way: 1, said: SEALED_WAY },
      { x: 0, z: 4, way: 1, said: SEALED_WAY },
      { x: 1, z: 30, way: 0, said: LOOSE_WAY },
    ];
    const paved: RoadSurface = {
      ...road,
      rings: Float32Array.from([...road.rings, ...points.flatMap(({ x, z }) => [x, 0, z])]),
      paved: true,
      aprons: { ...road.aprons, ways: Int32Array.from(points.map(({ way }) => way)), classes: Uint8Array.from(points.map(({ said }) => said)) },
    };
    // Where its paving says nothing the road is what its chain is: sealed, or loose.
    expect([...sealedSections(paved).subarray(21, 27)]).toEqual([0, 0, 1, 1, 1, 1]);
    expect([...sealedSections({ ...paved, chains: [paved.chains[0], { ...paved.chains[1], sealed: false }] }).subarray(21, 27)]).toEqual([0, 0, 0, 0, 1, 1]);
    // That point says nothing of the lesser road it lies beside, which the first reading held, nor of its own road so far off.
    expect([...sealedSections(paved).subarray(0, 21)]).toEqual(Array<number>(21).fill(1));
    // A surface with no paving is each chain's own.
    expect([...sealedSections(road).subarray(21, 27)]).toEqual(Array<number>(6).fill(1));
  });
});

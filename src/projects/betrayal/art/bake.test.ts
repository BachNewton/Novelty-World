import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { bounceSampleSet, bounceSamples, gather, gatherBounce, layOut, occluders, roomSampleSet, roomSamples, spreadBounce, withBounce, type BakeScene, type Gathered, type SampleSet, type Samples } from "./bake";
import { freezeRoom } from "./freeze";
import { stubCanvas } from "./headless";
import { TEST_TEXELS_PER_METRE } from "./lighting";
import { shellRoom } from "./house";
import { buildRoom } from "./stage";

stubCanvas();

type Vec = [number, number, number];

/** A quad as two triangles, corners in order round it. */
function quad(a: Vec, b: Vec, c: Vec, d: Vec): number[] {
  return [...a, ...b, ...c, ...a, ...c, ...d];
}

/** A scene from quads, each with its albedo, lit by the given lamps and no moon. */
function scene(quads: { corners: number[]; albedo: Vec }[], lamps: BakeScene["lamps"]): BakeScene {
  return {
    casters: new Float32Array(quads.flatMap(({ corners }) => corners)),
    albedo: new Float32Array(quads.flatMap(({ albedo }) => [...albedo, ...albedo])),
    lamps,
    moon: [0, 1, 0],
    moonRgb: [0, 0, 0],
    moonSpread: 0,
    rays: 16,
  };
}

const lamp = (at: Vec, rgb: Vec = [20, 20, 20], radius = 0): BakeScene["lamps"][number] => ({ at, rgb, range: 12, radius, flicker: 0, channel: 0 });

/** A floor 8 m square at y = 0, facing up. */
const floor = (albedo: Vec) => ({ corners: quad([-4, 0, -4], [-4, 0, 4], [4, 0, 4], [4, 0, -4]), albedo });

function samples(points: { at: Vec; normal: Vec }[]): Samples {
  return {
    position: new Float32Array(points.flatMap(({ at }) => at)),
    normal: new Float32Array(points.flatMap(({ normal }) => normal)),
    within: new Float32Array(points.length * 6).fill(NaN),
  };
}

function bounce(lit: BakeScene, points: { at: Vec; normal: Vec }[]): Gathered {
  return gatherBounce(lit, occluders(lit.casters), samples(points));
}

const rgb = ({ light }: Gathered, n: number): Vec => [light[n * 3], light[n * 3 + 1], light[n * 3 + 2]];

describe("soft shadows", () => {
  /** A board over the floor at `height`, covering x < 0. */
  const board = (height: number) => ({ corners: quad([-4, height, -4], [-4, height, 4], [0, height, 4], [0, height, -4]), albedo: [0.5, 0.5, 0.5] as Vec });
  /** The direct light on the floor at each x, along z = 0, from a lamp 2 m up over x = 0 with `radius`. */
  const across = (height: number, radius: number, xs: number[]) => {
    const lit = scene([floor([0.5, 0.5, 0.5]), board(height)], [{ ...lamp([0, 2, 0], [20, 20, 20], radius), flicker: 0.2, channel: 2 }]);
    const gathered = gather("direct", lit, occluders(lit.casters), samples(xs.map((x) => ({ at: [x, 0, 0] as Vec, normal: [0, 1, 0] as Vec }))));
    return { light: xs.map((_, n) => rgb(gathered, n)[0]), shares: xs.map((_, n) => gathered.weights[n * 5 + 2]) };
  };
  const xs = [-0.6, -0.3, -0.15, -0.05, 0.05, 0.15, 0.3, 0.6];

  it("from a point lamp, step from dark to lit at the shadow's edge", () => {
    const { light } = across(1, 0, xs);
    expect(light.slice(0, 4)).toEqual([0, 0, 0, 0]);
    for (const value of light.slice(4)) expect(value).toBeGreaterThan(1);
  });

  it("from a lamp with a size, ease across a penumbra that widens with the distance from what casts them", () => {
    // The share of the lamp seen: the light over that with the board above the lamp, out of its way.
    const open = across(3, 0.2, xs).light;
    const seen = (height: number) => across(height, 0.2, xs).light.map((value, i) => value / open[i]);
    const high = seen(1);
    // Half the lamp's width shows past an edge halfway down: a penumbra about 20 cm either side.
    expect(high[0]).toBe(0);
    expect(high[2]).toBeGreaterThan(0);
    expect(high[5]).toBeLessThan(1);
    expect(high[7]).toBe(1);
    for (let i = 1; i < high.length; i++) expect(high[i]).toBeGreaterThanOrEqual(high[i - 1]);
    // A board just over the floor gives a shadow nearly as crisp as a point's.
    const low = seen(0.05);
    expect(low.slice(0, 3)).toEqual([0, 0, 0]);
    expect(low[4]).toBeGreaterThan(0.9);
  });

  it("keep the lamp's flicker share in the penumbra, and are the same every bake", () => {
    const { shares } = across(1, 0.2, xs);
    for (const share of shares.slice(2)) expect(share).toBeCloseTo(0.2, 4);
    expect(across(1, 0.2, xs)).toEqual(across(1, 0.2, xs));
  });
});

describe("the bounce", () => {
  /** A point on a wall standing at x = 3, facing back into the room, half a metre up. */
  const onWall = { at: [3, 0.5, 0] as Vec, normal: [-1, 0, 0] as Vec };

  it("carries a lit floor's light onto a wall", () => {
    const [r, g, b] = rgb(bounce(scene([floor([0.5, 0.5, 0.5])], [lamp([0, 2, 0])]), [onWall]), 0);
    expect(r).toBeGreaterThan(0.01);
    expect(g).toBeCloseTo(r, 5);
    expect(b).toBeCloseTo(r, 5);
  });

  it("brings nothing off a surface that reflects nothing", () => {
    expect(rgb(bounce(scene([floor([0, 0, 0])], [lamp([0, 2, 0])]), [onWall]), 0)).toEqual([0, 0, 0]);
  });

  it("takes the colour of the surface it comes off", () => {
    const [r, g, b] = rgb(bounce(scene([floor([0.6, 0.05, 0.05])], [lamp([0, 2, 0])]), [onWall]), 0);
    expect(r).toBeGreaterThan(g * 10);
    expect(g).toBeCloseTo(b, 6);
  });

  it("leaves a shut box dark when its light is outside", () => {
    const s = 1;
    const box = [
      quad([-s, -s, -s], [s, -s, -s], [s, -s, s], [-s, -s, s]),
      quad([-s, s, -s], [-s, s, s], [s, s, s], [s, s, -s]),
      quad([-s, -s, -s], [-s, -s, s], [-s, s, s], [-s, s, -s]),
      quad([s, -s, -s], [s, s, -s], [s, s, s], [s, -s, s]),
      quad([-s, -s, -s], [-s, s, -s], [s, s, -s], [s, -s, -s]),
      quad([-s, -s, s], [s, -s, s], [s, s, s], [-s, s, s]),
    ].map((corners) => ({ corners, albedo: [0.8, 0.8, 0.8] as Vec }));
    const outside = scene([...box, { ...floor([0.8, 0.8, 0.8]), corners: quad([-4, -1.5, -4], [-4, -1.5, 4], [4, -1.5, 4], [4, -1.5, -4]) }], [lamp([3, 2, 0])]);
    expect(rgb(bounce(outside, [{ at: [0, -0.99, 0], normal: [0, 1, 0] }]), 0)).toEqual([0, 0, 0]);
  });

  it("lights the underside of a figure over a lit floor: a probe's downward face", () => {
    const lit = scene([floor([0.4, 0.3, 0.2])], [lamp([0, 2.5, 0.5])]);
    const probe = bounce(lit, [
      { at: [0, 1, 0], normal: [0, -1, 0] },
      { at: [0, 1, 0], normal: [0, 1, 0] },
    ]);
    const [down] = rgb(probe, 0);
    expect(down).toBeGreaterThan(0.01);
    // Nothing is above it to bounce light down; a dark floor gives the downward face nothing.
    expect(rgb(probe, 1)).toEqual([0, 0, 0]);
    expect(rgb(bounce(scene([floor([0, 0, 0])], [lamp([0, 2.5, 0.5])]), [{ at: [0, 1, 0], normal: [0, -1, 0] }]), 0)).toEqual([0, 0, 0]);
  });

  it("is the same every bake, however its samples are split", () => {
    const lit = scene([floor([0.5, 0.4, 0.3])], [lamp([0, 2, 0])]);
    const points = Array.from({ length: 12 }, (_, i) => ({ at: [i * 0.3 - 2, 0, 0.1 * i] as Vec, normal: [0, 1, 0] as Vec }));
    const whole = bounce(lit, points);
    expect(bounce(lit, points)).toEqual(whole);
    const halves = [bounce(lit, points.slice(0, 5)), bounce(lit, points.slice(5))];
    expect(new Float32Array([...halves[0].light, ...halves[1].light])).toEqual(whole.light);
  });

  it("adds to the direct light by its strength, keeping the flicker each part brings", () => {
    const direct: Gathered = { light: new Float32Array([1, 1, 1]), weights: new Float32Array([0.4, 0, 0, 0, 0]) };
    const bounced: Gathered = { light: new Float32Array([1, 1, 1]), weights: new Float32Array([0, 0, 0, 0, 0]) };
    const both = withBounce(direct, bounced, 0.5);
    expect([...both.light]).toEqual([1.5, 1.5, 1.5]);
    expect(both.weights[0]).toBeCloseTo(0.4 / 1.5, 6);
  });

  it("is gathered on a coarse grid of a room's lightmap and spread back over all of it", { timeout: 60_000 }, () => {
    const room = freezeRoom("creaky-hallway", buildRoom(shellRoom("creaky-hallway"), { explorer: null }), TEST_TEXELS_PER_METRE);
    const placed = { room, matrix: new THREE.Matrix4() };
    const coarse = bounceSamples(placed, 3);
    const full = roomSamples(placed).position.length / 3;
    expect(coarse.position.length / 3).toBeLessThan(full / 4);
    // A bounce the same everywhere spreads back the same everywhere, probes included.
    const count = coarse.position.length / 3;
    const flat: Gathered = { light: new Float32Array(count * 3).fill(0.25), weights: new Float32Array(count * 5).fill(0.1) };
    const spread = spreadBounce(room, flat, 3);
    expect(spread.light.length).toBe(full * 3);
    for (const value of spread.light) expect(value).toBeCloseTo(0.25, 5);
    for (const value of spread.weights) expect(value).toBeCloseTo(0.1, 5);
  });
});

describe("a room's samples", () => {
  /** A set's chunks of `size`, each laid out as a lane does, joined in order. */
  const inChunks = (set: SampleSet, size: number): Samples => {
    const parts: Samples[] = [];
    for (let start = 0; start < set.count; start += size) parts.push(layOut(set.chunk(start, Math.min(set.count, start + size))));
    const join = (key: keyof Samples) => new Float32Array(parts.flatMap((part) => [...part[key]]));
    return { position: join("position"), normal: join("normal"), within: join("within") };
  };

  it("are the same laid out a chunk at a time as all at once, wherever the chunks fall", { timeout: 60_000 }, () => {
    const room = freezeRoom("creaky-hallway", buildRoom(shellRoom("creaky-hallway"), { explorer: null }), TEST_TEXELS_PER_METRE);
    const placed = { room, matrix: new THREE.Matrix4().compose(new THREE.Vector3(6.5, 3, -13), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), new THREE.Vector3(1, 1, 1)) };
    // Odd sizes, so a chunk straddles the last texel and the first probe face.
    expect(inChunks(roomSampleSet(placed), 7777)).toEqual(roomSamples(placed));
    expect(inChunks(bounceSampleSet(placed, 3), 999)).toEqual(bounceSamples(placed, 3));
  });
});

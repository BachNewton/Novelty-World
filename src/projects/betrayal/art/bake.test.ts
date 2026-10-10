import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { bounceSamples, gatherBounce, occluders, roomSamples, spreadBounce, withBounce, type BakeScene, type Gathered, type Samples } from "./bake";
import { freezeRoom } from "./freeze";
import { stubCanvas } from "./headless";
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
  };
}

const lamp = (at: Vec, rgb: Vec = [20, 20, 20]): BakeScene["lamps"][number] => ({ at, rgb, range: 12, flicker: 0, channel: 0 });

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
    const room = freezeRoom("creaky-hallway", buildRoom(shellRoom("creaky-hallway"), { explorer: null }));
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

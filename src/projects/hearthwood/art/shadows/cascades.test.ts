import { Matrix4, OrthographicCamera, Vector3, Vector4, WebGLCoordinateSystem } from "three";
import { describe, expect, it } from "vitest";
import { lightFrame, sliceSphere, snapToTexels, splitDistances, squareMatrix, steadyRadius } from "./cascades";

const LENS = { fov: 55, aspect: 16 / 9 };

/** The corners of a slice of the view, looking down -z from the origin. */
function corners(near: number, far: number): Vector3[] {
  const tan = Math.tan((LENS.fov * Math.PI) / 360);
  return [near, far].flatMap((d) => [-1, 1].flatMap((sx) => [-1, 1].map((sy) => new Vector3(sx * d * tan * LENS.aspect, sy * d * tan, -d))));
}

describe("the shadow maps' slices", () => {
  it("grow by one ratio from the first to the reach", () => {
    const splits = splitDistances(2.5, 900, 4);
    expect(splits).toHaveLength(5);
    expect(splits[4]).toBe(900);
    const ratios = splits.slice(1).map((d, i) => d / splits[i]);
    for (const r of ratios) expect(r).toBeCloseTo(ratios[0], 6);
    expect(splitDistances(2.5, 60, 1)).toEqual([2.5, 60]);
    expect(() => splitDistances(0, 60, 4)).toThrow();
  });

  it("are each held in a sphere that touches their corners", () => {
    for (const [near, far] of [
      [0.2, 10],
      [10, 45],
      [200, 900],
    ]) {
      const { along, radius } = sliceSphere(LENS, near, far);
      const centre = new Vector3(0, 0, -along);
      const reach = corners(near, far).map((c) => c.distanceTo(centre));
      for (const r of reach) expect(r).toBeLessThanOrEqual(radius + 1e-6);
      // The tightest sphere touches the slice's farthest corners.
      expect(Math.max(...reach)).toBeCloseTo(radius, 6);
    }
  });

  it("keep a sphere's size while the lens holds, stepping it only now and then", () => {
    const r = sliceSphere(LENS, 10, 45).radius;
    expect(steadyRadius(r)).toBeGreaterThanOrEqual(r);
    expect(steadyRadius(r)).toBeLessThan(r * 1.07);
    expect(steadyRadius(r * 1.001)).toBe(steadyRadius(r));
  });
});

describe("the light's frame", () => {
  it("is square-on to the light and steady overhead", () => {
    for (const toLight of [new Vector3(0.3, 0.5, -0.8), new Vector3(0, 1, 0), new Vector3(1, 0.02, 0)]) {
      const frame = lightFrame(toLight);
      expect(frame.forward.dot(toLight.clone().normalize())).toBeCloseTo(-1, 6);
      expect(frame.right.dot(frame.up)).toBeCloseTo(0, 6);
      expect(frame.right.dot(frame.forward)).toBeCloseTo(0, 6);
      expect(frame.up.length()).toBeCloseTo(1, 6);
    }
  });

  it("moves a map's centre only in whole texels across it", () => {
    const frame = lightFrame(new Vector3(0.4, 0.6, 0.2));
    const texel = 0.37;
    const a = snapToTexels(new Vector3(12.3, 4, -7.9), frame, texel);
    const b = snapToTexels(new Vector3(12.45, 4.1, -7.7), frame, texel);
    const across = b.clone().sub(a);
    for (const axis of [frame.right, frame.up]) {
      const steps = across.dot(axis) / texel;
      expect(steps).toBeCloseTo(Math.round(steps), 6);
    }
    // Along the light the centre is never moved.
    expect(a.clone().sub(new Vector3(12.3, 4, -7.9)).dot(frame.forward)).toBeCloseTo(0, 6);
  });
});

describe("a map's matrix", () => {
  it("holds the reversed depth: 1 nearest the light, 0 at the end of its reach", () => {
    const light = new OrthographicCamera(-10, 10, 10, -10, 0, 200);
    light.position.set(0, 100, 0);
    light.up.set(0, 0, -1);
    light.lookAt(0, 0, 0);
    light.updateMatrixWorld();
    // As the renderer makes it, drawing with the world's reversed depth buffer.
    const projection = new Matrix4().makeOrthographic(-10, 10, 10, -10, 0, 200, WebGLCoordinateSystem, true);
    const square = squareMatrix(projection, light.matrixWorldInverse);
    const at = (x: number, y: number, z: number) => new Vector4(x, y, z, 1).applyMatrix4(square);
    expect(at(0, 100, 0).z).toBeCloseTo(1, 6);
    expect(at(0, -100, 0).z).toBeCloseTo(0, 6);
    // Nearer the light is the greater depth, which is what a caster above a point holds.
    expect(at(0, 10, 0).z).toBeGreaterThan(at(0, 0, 0).z);
    expect(at(0, 0, 0).x).toBeCloseTo(0.5, 6);
    expect(at(10, 0, 0).x).toBeCloseTo(1, 6);
    expect(at(-10, 0, 0).x).toBeCloseTo(0, 6);
  });
});

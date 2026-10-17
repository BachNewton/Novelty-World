import { Matrix4, PerspectiveCamera, Vector3, WebGLCoordinateSystem } from "three";
import { describe, expect, it } from "vitest";
import { QUALITY } from "../../quality";
import { depthOf } from "../depth";
import { airRay } from "./air-march";

const NEAR = 0.2;
const FAR = QUALITY.viewDistance * 1.2;
const REACH = 12000;

/** Three's reversed projection, as the renderer makes it for a reversed depth buffer. */
function reversedProjection(): Matrix4 {
  const camera = new PerspectiveCamera(55, 16 / 9, NEAR, FAR);
  const top = NEAR * Math.tan((camera.fov * Math.PI) / 360);
  return new Matrix4().makePerspective(-top * camera.aspect, top * camera.aspect, top, -top, NEAR, FAR, WebGLCoordinateSystem, true);
}

describe("a pixel's ray through the air, on a reversed depth", () => {
  const projection = reversedProjection();
  const inverse = projection.clone().invert();
  const screen = (point: Vector3) => {
    const clip = point.clone().applyMatrix4(projection);
    return { u: (clip.x + 1) / 2, v: (clip.y + 1) / 2, depth: Math.fround(depthOf(point, projection)) };
  };

  it("runs to what is drawn, from a hand's breadth to kilometres off", () => {
    for (const point of [new Vector3(0.05, -0.1, -0.3), new Vector3(3, -1, -40), new Vector3(-200, 30, -5000)]) {
      const { u, v, depth } = screen(point);
      const ray = airRay(u, v, depth, inverse, REACH);
      expect(ray.distance / point.length()).toBeCloseTo(1, 3);
      expect(ray.direction.angleTo(point)).toBeLessThan(1e-4);
    }
  });

  it("stops at its reach for what is drawn further off", () => {
    const { u, v, depth } = screen(new Vector3(100, 50, -60000));
    expect(airRay(u, v, depth, inverse, REACH).distance).toBe(REACH);
  });

  it("runs its whole reach where nothing is drawn (depth 0, the far plane), the right way", () => {
    const point = new Vector3(400, 900, -3000);
    const { u, v } = screen(point);
    const ray = airRay(u, v, 0, inverse, REACH);
    expect(ray.distance).toBe(REACH);
    expect(ray.direction.angleTo(point)).toBeLessThan(1e-4);
  });

  it("takes a depth of 1 as right at the eye, never as far", () => {
    const { u, v } = screen(new Vector3(0, 0, -10));
    expect(airRay(u, v, 1, inverse, REACH).distance).toBeCloseTo(NEAR, 3);
  });
});

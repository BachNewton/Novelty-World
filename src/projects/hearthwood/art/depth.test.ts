import { Matrix4, PerspectiveCamera, Vector3, WebGLCoordinateSystem } from "three";
import { describe, expect, it } from "vitest";
import { QUALITY } from "../quality";
import { depthOf, isFar, linearDepth, viewPosition } from "./depth";

// The world's own camera: from a hand's breadth to past the horizon.
const NEAR = 0.2;
const FAR = QUALITY.viewDistance * 1.2;

/** Three's reversed projection, as the renderer makes it for a reversed depth buffer. */
function reversedProjection(): Matrix4 {
  const camera = new PerspectiveCamera(55, 16 / 9, NEAR, FAR);
  const top = NEAR * Math.tan((camera.fov * Math.PI) / 360);
  const right = top * camera.aspect;
  return new Matrix4().makePerspective(-right, right, top, -top, NEAR, FAR, WebGLCoordinateSystem, true);
}

describe("reading a reversed depth", () => {
  const projection = reversedProjection();
  const inverse = projection.clone().invert();

  it("is 1 at the near plane and 0 at the far one", () => {
    expect(depthOf(new Vector3(0, 0, -NEAR), projection)).toBeCloseTo(1, 6);
    expect(depthOf(new Vector3(0, 0, -FAR), projection)).toBeCloseTo(0, 6);
    expect(isFar(0)).toBe(true);
    expect(isFar(1e-7)).toBe(false);
  });

  it("gives back the distance along the view, from 10 cm past the near plane to tens of kilometres", () => {
    for (const distance of [0.3, 1, 10, 250, 4000, 30000, 110000]) {
      const depth = Math.fround(depthOf(new Vector3(3, -1, -distance), projection));
      expect(linearDepth(depth, NEAR, FAR) / distance).toBeCloseTo(1, 3);
    }
  });

  it("puts a screen position and its depth back where it was in view space", () => {
    for (const point of [new Vector3(0.1, 0.05, -0.5), new Vector3(-40, 12, -300), new Vector3(2000, -150, -20000)]) {
      const clip = point.clone().applyMatrix4(projection);
      const u = (clip.x + 1) / 2;
      const v = (clip.y + 1) / 2;
      const back = viewPosition(u, v, depthOf(point, projection), inverse);
      expect(back.distanceTo(point) / point.length()).toBeLessThan(1e-6);
    }
  });

  it("matches a camera the renderer has reversed", () => {
    const camera = new PerspectiveCamera(55, 16 / 9, NEAR, FAR);
    // What WebGLRenderer does to a camera when its depth buffer is reversed.
    (camera as unknown as { _reversedDepth: boolean })._reversedDepth = true;
    camera.updateProjectionMatrix();
    expect(depthOf(new Vector3(0, 0, -NEAR), camera.projectionMatrix)).toBeCloseTo(1, 6);
    expect(linearDepth(depthOf(new Vector3(0, 0, -1234), camera.projectionMatrix), NEAR, FAR)).toBeCloseTo(1234, 3);
  });
});

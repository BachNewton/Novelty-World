import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { colourRing } from "./house";
import { houseDepthStep } from "./house-camera";
import { SAME_DEPTH, zFights, type PlaneFace } from "./zfight";

/** A square face `size` across, centred at `at`, facing along `normal`, as two triangles. */
function square(owner: string, at: [number, number, number], normal: [number, number, number], size = 1, writesDepth = true): PlaneFace<string>[] {
  const n = new THREE.Vector3(...normal).normalize();
  const u = new THREE.Vector3().crossVectors(Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0), n).normalize().multiplyScalar(size / 2);
  const v = new THREE.Vector3().crossVectors(n, u);
  const centre = new THREE.Vector3(...at);
  const corner = (a: number, b: number) => centre.clone().addScaledVector(u, a).addScaledVector(v, b);
  const [p, q, r, s] = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
  return [
    { owner, corners: [p, q, r], normal: n, writesDepth, colour: owner },
    { owner, corners: [p, r, s], normal: n, writesDepth, colour: owner },
  ];
}

const owners = (faces: PlaneFace<string>[]) => [...new Set(zFights(faces).map(({ a, b }) => [a.owner, b.owner].sort().join(" & ")))];
const area = (faces: PlaneFace<string>[]) => zFights(faces).reduce((sum, fight) => sum + fight.area, 0);

describe("the z-fighting check", () => {
  it("finds two faces in one plane, facing the same way, and how much they share", () => {
    const faces = [...square("rug", [0, 0, 0], [0, 1, 0]), ...square("mat", [0.5, 0, 0], [0, 1, 0])];
    expect(owners(faces)).toEqual(["mat & rug"]);
    expect(area(faces)).toBeCloseTo(0.5);
  });

  it("finds them nearer than the depth buffer can separate, and not further apart", () => {
    expect(owners([...square("a", [0, 0, 0], [0, 1, 0]), ...square("b", [0, SAME_DEPTH * 0.9, 0], [0, 1, 0])])).toEqual(["a & b"]);
    expect(owners([...square("a", [0, 0, 0], [0, 1, 0]), ...square("b", [0, SAME_DEPTH * 1.5, 0], [0, 1, 0])])).toEqual([]);
  });

  it("finds faces of one owner too: two boxes of one batch fight like two pieces", () => {
    expect(owners([...square("shelf", [0, 0.4, 0], [0, 1, 0]), ...square("shelf", [0.3, 0.4, 0], [0, 1, 0])])).toEqual(["shelf & shelf"]);
  });

  it("finds faces at a slant, and a plane far from the origin", () => {
    const tilted: [number, number, number] = [0, 0.8, -0.6];
    expect(owners([...square("a", [2, 1, -2], tilted), ...square("b", [2.2, 1, -2], tilted)])).toEqual(["a & b"]);
  });

  it("passes faces that only meet at an edge, or face opposite ways", () => {
    expect(owners([...square("a", [0, 0, 0], [0, 1, 0]), ...square("b", [1, 0, 0], [0, 1, 0])])).toEqual([]);
    expect(owners([...square("a", [0, 0, 0], [0, 1, 0]), ...square("b", [0, 0, 0], [0, -1, 0])])).toEqual([]);
  });

  it("passes faces turned down, away from every camera", () => {
    expect(owners([...square("a", [0, 1, 0], [0, -1, 0]), ...square("b", [0.5, 1, 0], [0, -1, 0])])).toEqual([]);
  });

  it("passes a pair neither of which writes depth: two pools of light blend, they don't fight", () => {
    expect(owners([...square("pool", [0, 0.02, 0], [0, 1, 0], 1, false), ...square("haze", [0, 0.02, 0], [0, 1, 0], 1, false)])).toEqual([]);
    expect(owners([...square("pool", [0, 0.02, 0], [0, 1, 0], 1, false), ...square("step", [0, 0.02, 0], [0, 1, 0])])).toEqual(["pool & step"]);
  });

  it("passes a patch a solid in front of it buries", () => {
    const faces = [...square("a", [0, 0, 0], [0, 1, 0]), ...square("b", [0, 0, 0], [0, 1, 0])];
    expect(zFights(faces, { buried: (point) => point.y > 0 && point.y < 0.1 })).toEqual([]);
  });

  it("compares only the owners it is asked to", () => {
    const faces = [...square("a", [0, 0, 0], [0, 1, 0]), ...square("b", [0, 0, 0], [0, 1, 0])];
    expect(zFights(faces, { pairs: (a, b) => a === b })).toEqual([]);
  });

  it("takes its tolerance from the house's depth buffer: a few of its coarsest steps, about a millimetre", () => {
    expect(SAME_DEPTH).toBeCloseTo(4 * houseDepthStep());
    expect(SAME_DEPTH).toBeGreaterThan(0.0005);
    expect(SAME_DEPTH).toBeLessThan(0.002);
  });

  it("passes two figures' colour rings overlapping where the figures stand close: they write no depth, and draw after the room", () => {
    /** A ring's triangles, as it lies round a figure standing at `x`. */
    const ringFaces = (owner: string, x: number, writesDepth: (ring: THREE.Mesh) => boolean): PlaneFace<string>[] => {
      const ring = colourRing("blood");
      ring.position.x = x;
      ring.updateMatrixWorld(true);
      const geometry = ring.geometry.clone().applyMatrix4(ring.matrixWorld).toNonIndexed();
      const position = geometry.getAttribute("position");
      const faces: PlaneFace<string>[] = [];
      for (let i = 0; i < position.count; i += 3) {
        const corners = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(position, i + k)) as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
        const normal = new THREE.Vector3().subVectors(corners[1], corners[0]).cross(new THREE.Vector3().subVectors(corners[2], corners[0])).normalize();
        faces.push({ owner, corners, normal, writesDepth: writesDepth(ring), colour: owner });
      }
      return faces;
    };
    // Two figures half a metre apart: their rings cross.
    const overlapping = (writesDepth: (ring: THREE.Mesh) => boolean) => [...ringFaces("ox", 0, writesDepth), ...ringFaces("zoe", 0.5, writesDepth)];
    expect(owners(overlapping(() => true)), "rings that wrote depth would fight").toEqual(["ox & zoe"]);
    expect(owners(overlapping((ring) => (ring.material as THREE.Material).depthWrite))).toEqual([]);
    const ring = colourRing("blood");
    expect(ring.renderOrder, "a ring that writes no depth draws after the floor it lies on").toBeGreaterThan(0);
    expect((ring.material as THREE.Material).depthTest, "a base in front still hides a ring").toBe(true);
  });
});

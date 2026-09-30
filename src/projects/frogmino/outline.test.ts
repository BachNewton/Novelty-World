import { describe, it, expect } from "vitest";
import { TETROMINOES, pieceCells } from "./logic";
import { hullTriangles, outlineHull, type CubeSpot, type HullFace } from "./outline";
import type { Rotation, TetrominoKind } from "./types";

const WIDTH = 0.05;
const KINDS = Object.keys(TETROMINOES) as TetrominoKind[];
const ROTATIONS: Rotation[] = [0, 1, 2, 3];

function spotsOf(kind: TetrominoKind, rotation: Rotation): CubeSpot[] {
  return pieceCells(kind, rotation).map((c) => ({ x: c.col, y: c.row, z: 0 }));
}

function area(face: HullFace): number {
  return (face.u[1] - face.u[0]) * (face.v[1] - face.v[0]);
}

// Whether a face cuts into a cube: its plane runs through the cube's inside
// and the two overlap across it.
function cutsInto(face: HullFace, spot: CubeSpot): boolean {
  const at = [spot.x, spot.y, spot.z];
  const inside = (value: number, axis: number): boolean => Math.abs(value - at[axis]) < 0.5 - 1e-9;
  const overlaps = ([min, max]: [number, number], axis: number): boolean =>
    Math.min(max, at[axis] + 0.5) - Math.max(min, at[axis] - 0.5) > 1e-9;
  return inside(face.plane, face.axis) && overlaps(face.u, (face.axis + 1) % 3) && overlaps(face.v, (face.axis + 2) % 3);
}

describe("outlineHull", () => {
  it("wraps a lone cube in a slightly larger cube", () => {
    const faces = outlineHull([{ x: 0, y: 0, z: 0 }], WIDTH);
    expect(faces).toHaveLength(6);
    for (const face of faces) {
      expect(face.plane).toBeCloseTo(face.sign * (0.5 + WIDTH));
      expect(area(face)).toBeCloseTo((1 + 2 * WIDTH) ** 2);
    }
  });

  it("wraps two touching cubes as one box, with nothing at the seam", () => {
    const faces = outlineHull([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }], WIDTH);
    expect(faces).toHaveLength(10);
    expect(faces.some((face) => face.axis === 0 && Math.abs(face.plane - 0.5) < 0.5)).toBe(false);
    const total = faces.reduce((sum, face) => sum + area(face), 0);
    const [w, h] = [2 + 2 * WIDTH, 1 + 2 * WIDTH];
    expect(total).toBeCloseTo(2 * (w * h + w * h + h * h));
  });

  it.each(KINDS)("never cuts into a cube of a %s, and is the same hull in every rotation", (kind) => {
    const areas = ROTATIONS.map((rotation) => {
      const spots = spotsOf(kind, rotation);
      const faces = outlineHull(spots, WIDTH);
      for (const face of faces) {
        for (const spot of spots) expect(cutsInto(face, spot)).toBe(false);
      }
      return faces.reduce((sum, face) => sum + area(face), 0);
    });
    for (const total of areas) expect(total).toBeCloseTo(areas[0]);
  });

  it("finds seams between cubes at half-unit positions, as the drawn frog's cubes are", () => {
    const spots = [{ x: -0.5, y: -0.5, z: 0.5 }, { x: 0.5, y: -0.5, z: 0.5 }];
    expect(outlineHull(spots, WIDTH)).toHaveLength(10);
  });
});

describe("hullTriangles", () => {
  it("winds every face to point outward", () => {
    const faces = outlineHull(spotsOf("T", 0), WIDTH);
    const positions = hullTriangles(faces);
    expect(positions).toHaveLength(faces.length * 18);
    faces.forEach((face, f) => {
      for (let t = 0; t < 2; t++) {
        const p = (i: number): number[] => Array.from(positions.slice(f * 18 + t * 9 + i * 3, f * 18 + t * 9 + i * 3 + 3));
        const [a, b, c] = [p(0), p(1), p(2)];
        const e1 = b.map((v, i) => v - a[i]);
        const e2 = c.map((v, i) => v - a[i]);
        const normal = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        expect(Math.sign(normal[face.axis])).toBe(face.sign);
        normal.forEach((component, axis) => {
          if (axis !== face.axis) expect(component).toBeCloseTo(0);
        });
      }
    });
  });
});

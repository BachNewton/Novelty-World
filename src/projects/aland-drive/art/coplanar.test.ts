import { describe, expect, it } from "vitest";
import { RuralMesh } from "./rural/mesh";
import { coplanarOverlaps } from "./coplanar";

// A check that finds nothing looks the same as a model with nothing to find.
describe("coplanar overlaps", () => {
  it("finds two faces sharing a plane and some area, whichever way each faces", () => {
    const overlapping = new RuralMesh().face([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], "trim").face([[0.5, 1.5, 0], [0.5, 0.5, 0], [1.5, 0.5, 0], [1.5, 1.5, 0]], "roof-dark");
    expect(coplanarOverlaps(overlapping.build()).length).toBeGreaterThan(0);
  });

  it("passes faces that only meet at an edge, or stand a centimetre apart", () => {
    const meeting = new RuralMesh().face([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], "trim").face([[1, 0, 0], [2, 0, 0], [2, 1, 0], [1, 1, 0]], "roof-dark");
    const proud = new RuralMesh().face([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], "trim").face([[0.5, 0.5, 0.01], [1.5, 0.5, 0.01], [1.5, 1.5, 0.01], [0.5, 1.5, 0.01]], "roof-dark");
    expect(coplanarOverlaps(meeting.build())).toEqual([]);
    expect(coplanarOverlaps(proud.build())).toEqual([]);
  });
});

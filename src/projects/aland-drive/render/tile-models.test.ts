import { describe, expect, it } from "vitest";
import { COW } from "../art/rural/index";
import { COW_BOX, modelWalls } from "./tile-models";

describe("the farm's walls", () => {
  it("collide as the kit's cow is drawn", () => {
    expect(COW_BOX).toEqual([-COW.halfX, -COW.back, COW.halfX, COW.front]);
  });

  it("turn with a prop's yaw as the material turns the model: a quarter turn lays a tractor's length east and west", () => {
    const walls = modelWalls({ tractor: Float32Array.of(10, 0, 20, Math.PI / 2, 1, 1) });
    const xs = walls.filter((_, index) => index % 2 === 0);
    const zs = walls.filter((_, index) => index % 2 === 1);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1.75 + 1.62, 4);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(2 * 1.12, 4);
    // The bonnet, +z in the model, points east.
    expect(Math.max(...xs)).toBeCloseTo(10 + 1.62, 4);
  });
});

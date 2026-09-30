import { describe, it, expect } from "vitest";
import { cellKey } from "../logic";
import { VEHICLE_IDS, vehicleCells } from "../fleet";
import type { Cell } from "../types";
import { VEHICLES, vehicleModel } from "./index";
import { SURFACE_TOLERANCE, type Part } from "./parts";

// Every way a part's front view pokes into a cell the vehicle doesn't fill,
// or below the road, by more than the surface-detail tolerance. A part is
// allowed to stand proud of an outer face by a few hundredths, as a decal or
// a wheel does, but never enough to read as part of the silhouette.
function intrusions(cells: readonly Cell[], parts: readonly Part[]): string[] {
  const filled = new Set(cells.map(cellKey));
  const found: string[] = [];
  for (const [i, part] of parts.entries()) {
    const [x0, y0] = part.min;
    const [x1, y1] = part.max;
    if (y0 < -SURFACE_TOLERANCE) found.push(`part ${String(i)} (${part.paint}) sinks below the road`);
    for (let col = Math.floor(x0); col < Math.ceil(x1); col++) {
      for (let row = Math.floor(y0); row < Math.ceil(y1); row++) {
        if (row < 0 || filled.has(cellKey({ col, row }))) continue;
        const across = Math.min(x1, col + 1) - Math.max(x0, col);
        const up = Math.min(y1, row + 1) - Math.max(y0, row);
        if (across > SURFACE_TOLERANCE && up > SURFACE_TOLERANCE) {
          found.push(`part ${String(i)} (${part.paint}) fills ${cellKey({ col, row })}`);
        }
      }
    }
  }
  return found;
}

describe("the silhouette check", () => {
  const cells = vehicleCells("T0");
  const part = (min: Part["min"], max: Part["max"]): Part => ({ shape: "box", min, max, paint: "chrome" });

  it("allows decals and wheels standing just proud of an outer face", () => {
    expect(intrusions(cells, [part([-0.04, 0, -1], [0.1, 0.5, 0]), part([1.2, 2, -1], [1.8, 2.03, 0])])).toEqual([]);
  });

  it("catches a part reaching into an empty cell", () => {
    expect(intrusions(cells, [part([0.2, 0.8, -1], [0.4, 1.3, 0])])).toHaveLength(1);
  });

  it("catches a part sinking into the road", () => {
    expect(intrusions(cells, [part([0.2, -0.2, -1], [0.4, 0.3, 0])])).toHaveLength(1);
  });
});

describe.each(VEHICLE_IDS)("vehicle %s", (id) => {
  const model = vehicleModel(id);

  it("has a solid body cell for exactly each of its four cells", () => {
    expect(model.body.map(({ cell }) => cellKey(cell)).sort()).toEqual(vehicleCells(id).map(cellKey).sort());
  });

  it("keeps every part inside its four cells, seen head-on", () => {
    expect(intrusions(model.cells, model.parts)).toEqual([]);
  });

  it("keeps every part within its length along the road, give or take a decal", () => {
    for (const part of model.parts) {
      expect(part.min[2]).toBeGreaterThanOrEqual(-model.length - 0.1);
      expect(part.max[2]).toBeLessThanOrEqual(0.1);
    }
  });

  it("has only parts with some size on every axis", () => {
    for (const part of model.parts) {
      for (let axis = 0; axis < 3; axis++) expect(part.max[axis]).toBeGreaterThan(part.min[axis]);
    }
  });

  it("is between one and three cells long", () => {
    expect(model.length).toBeGreaterThanOrEqual(1);
    expect(model.length).toBeLessThanOrEqual(3);
  });
});

describe("the fleet's designs", () => {
  it("gives every vehicle its own name", () => {
    expect(new Set(Object.values(VEHICLES).map((design) => design.name)).size).toBe(VEHICLE_IDS.length);
  });

  it("never paints every rotation of a piece the same main colour", () => {
    // The main colour is the paint of most body cells.
    const mainPaint = (id: (typeof VEHICLE_IDS)[number]): string => {
      const counts = new Map<string, number>();
      for (const { paint } of vehicleModel(id).body) counts.set(paint, (counts.get(paint) ?? 0) + 1);
      return [...counts].sort((a, b) => b[1] - a[1])[0][0];
    };
    for (const kind of ["I", "S", "Z", "T", "J", "L"]) {
      const paints = VEHICLE_IDS.filter((id) => id[0] === kind).map(mainPaint);
      expect(new Set(paints).size).toBe(paints.length);
    }
  });
});

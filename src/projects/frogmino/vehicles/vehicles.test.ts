import { describe, it, expect } from "vitest";
import { GROUND_CLEARANCE } from "../clearance";
import { cellKey } from "../logic";
import { VEHICLE_IDS, vehicleCells } from "../fleet";
import type { Cell } from "../types";
import { faceClashes, spanning, type FaceClash } from "../world/coplanar";
import type { Placement } from "../world/geometry";
import { VEHICLES, vehicleModel, type VehicleModel } from "./index";
import { DEPTH_RESOLUTION, LAYER, SURFACE_TOLERANCE, layers, type Paint, type Part, type Vec3 } from "./parts";

// Every way a part's front view pokes into a cell the vehicle doesn't fill,
// into the ground clearance, or below the road, by more than the
// surface-detail tolerance. A part is allowed to stand proud of an outer face
// by a few hundredths, as a decal or a wheel does, but never enough to read
// as part of the silhouette. The clearance under the vehicle's lowest cells
// holds its wheels and nothing else, and nothing hangs in the clearance under
// an empty lane.
function intrusions(cells: readonly Cell[], parts: readonly Part[]): string[] {
  const filled = new Set(cells.map(cellKey));
  const found: string[] = [];
  for (const [i, part] of parts.entries()) {
    const [x0, y0] = part.min;
    const [x1, y1] = part.max;
    const name = `part ${String(i)} (${part.paint})`;
    if (y0 < -GROUND_CLEARANCE - SURFACE_TOLERANCE) found.push(`${name} sinks below the road`);
    if (y0 < -SURFACE_TOLERANCE) {
      if (part.wheel !== true) found.push(`${name} hangs into the ground clearance`);
      for (let col = Math.floor(x0); col < Math.ceil(x1); col++) {
        const across = Math.min(x1, col + 1) - Math.max(x0, col);
        if (!filled.has(cellKey({ col, row: 0 })) && across > SURFACE_TOLERANCE) {
          found.push(`${name} reaches under the empty lane ${String(col)}`);
        }
      }
    }
    for (let col = Math.floor(x0); col < Math.ceil(x1); col++) {
      for (let row = Math.max(0, Math.floor(y0)); row < Math.ceil(y1); row++) {
        if (filled.has(cellKey({ col, row }))) continue;
        const across = Math.min(x1, col + 1) - Math.max(x0, col);
        const up = Math.min(y1, row + 1) - Math.max(y0, row);
        if (across > SURFACE_TOLERANCE && up > SURFACE_TOLERANCE) found.push(`${name} fills ${cellKey({ col, row })}`);
      }
    }
  }
  return found;
}

describe("the silhouette check", () => {
  const cells = vehicleCells("T0");
  const part = (min: Part["min"], max: Part["max"], wheel = false): Part => ({ shape: "box", min, max, paint: "chrome", wheel });

  it("allows decals and wheels standing just proud of an outer face", () => {
    expect(intrusions(cells, [part([-0.04, 0, -1], [0.1, 0.5, 0]), part([1.2, 2, -1], [1.8, 2.03, 0])])).toEqual([]);
  });

  it("catches a part reaching into an empty cell", () => {
    expect(intrusions(cells, [part([0.2, 0.8, -1], [0.4, 1.3, 0])])).toHaveLength(1);
  });

  it("allows a wheel down through the clearance under a lowest cell", () => {
    expect(intrusions(cells, [part([-0.03, -GROUND_CLEARANCE, -1], [0.12, 0.3, -0.5], true)])).toEqual([]);
  });

  it("catches anything but a wheel in the clearance", () => {
    expect(intrusions(cells, [part([0.2, -0.2, -1], [0.4, 0.3, 0])])).toHaveLength(1);
  });

  it("catches a wheel under an empty lane, or sinking into the road", () => {
    const t2 = vehicleCells("T2");
    expect(intrusions(t2, [part([0.2, -GROUND_CLEARANCE, -1], [0.4, 0, 0], true)])).toHaveLength(1);
    expect(intrusions(cells, [part([0.2, -GROUND_CLEARANCE - 0.2, -1], [0.4, 0.3, 0], true)])).toHaveLength(1);
  });
});

// A vehicle's body cells and parts as boxes for the face scanner. A disc or
// drum is scanned as the box it fills: its flat ends lie in that box's faces,
// and its curved side only touches them along a line, so the scan can only
// over-report. Body cells carry the cell border, so they never count as the
// same material as a part, whatever the paint.
interface ScanBox extends Placement {
  paint: Paint;
  what: string;
  body: boolean;
}

function scanBoxes(model: VehicleModel): ScanBox[] {
  const at = (p: Vec3): string => p.map((n) => n.toFixed(3)).join(",");
  return [
    ...model.body.map(({ cell, paint }) => ({
      ...spanning([cell.col, cell.row, -model.length], [cell.col + 1, cell.row + 1, 0]),
      paint,
      what: `body ${cellKey(cell)}`,
      body: true,
    })),
    ...model.parts.map((part) => ({
      ...spanning(part.min, part.max),
      paint: part.paint,
      what: `${part.shape} ${at(part.min)}..${at(part.max)}`,
      body: false,
    })),
  ];
}

// The camera never goes below the road, which is the ground clearance under
// a vehicle's cells, and may look down from any height.
const EYE = { lowest: -GROUND_CLEARANCE, highest: Infinity };
const COPLANAR = 1e-6;

// Two faces fight unless they are one material, when whichever wins looks
// the same.
function fights({ a, b }: FaceClash<ScanBox>): boolean {
  return a.body || b.body || a.paint !== b.paint;
}

const describeClash = ({ a, b, gap }: FaceClash<ScanBox>): string =>
  `${a.paint} ${a.what} ~ ${b.paint} ${b.what}, ${gap.toFixed(4)} apart`;

describe("the vehicles' face scan", () => {
  it("takes a paint layer to be enough for the depth buffer, and two to fit the surface tolerance", () => {
    expect(LAYER).toBeGreaterThan(DEPTH_RESOLUTION);
    expect(layers(2)).toBeLessThan(SURFACE_TOLERANCE);
  });

  const clashesOf = (parts: Part[], minGap = COPLANAR): number => {
    const model: VehicleModel = { ...vehicleModel("T0"), body: [{ cell: { col: 0, row: 0 }, paint: "cream" }], parts };
    return faceClashes(scanBoxes(model), minGap, EYE).filter(fights).length;
  };
  const part = (min: Vec3, max: Vec3, paint: Paint): Part => ({ shape: "box", min, max, paint });

  it("finds a decal edge to edge on another, but not one inset from its edges", () => {
    expect(clashesOf([part([0.1, 0.1, 0], [0.9, 0.9, 0.02], "glass"), part([0.2, 0.5, 0], [0.5, 0.9, 0.04], "charcoal")])).toBe(1);
    expect(clashesOf([part([0.1, 0.1, 0], [0.9, 0.9, 0.02], "glass"), part([0.2, 0.5, 0], [0.5, 0.8, 0.04], "charcoal")])).toBe(0);
  });

  it("finds different paints layered too close for the depth buffer, but not the same paint", () => {
    const base = part([0.1, 0.1, 0], [0.9, 0.9, 0.02], "glass");
    expect(clashesOf([base, part([0.2, 0.2, 0], [0.8, 0.8, 0.03], "charcoal")], DEPTH_RESOLUTION)).toBe(1);
    expect(clashesOf([base, part([0.2, 0.2, 0], [0.8, 0.8, 0.03], "glass")], DEPTH_RESOLUTION)).toBe(0);
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

  it("stands on its wheels: a wheel reaches down to the road", () => {
    expect(Math.min(...model.parts.filter((part) => part.wheel === true).map((part) => part.min[1]))).toBeCloseTo(-GROUND_CLEARANCE);
  });

  it("has only parts with some size on every axis", () => {
    for (const part of model.parts) {
      for (let axis = 0; axis < 3; axis++) expect(part.max[axis]).toBeGreaterThan(part.min[axis]);
    }
  });

  it("lays no two faces of different paints in one plane", () => {
    expect(faceClashes(scanBoxes(model), COPLANAR, EYE).filter(fights).map(describeClash)).toEqual([]);
  });

  it("layers different paints far enough apart for the depth buffer, however far away it is drawn", () => {
    expect(faceClashes(scanBoxes(model), DEPTH_RESOLUTION, EYE).filter(fights).map(describeClash)).toEqual([]);
  });

  it("is two or three cells long", () => {
    expect(model.length).toBeGreaterThanOrEqual(2);
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

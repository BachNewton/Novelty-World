import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TETROMINOES } from "../logic";
import { TUNING } from "../tuning";
import type { Gate, TetrominoKind } from "../types";
import { faceClashes } from "../world/coplanar";
import { ROAD_LEFT, ROAD_RIGHT, VERGE, boxPoint, sideX } from "../world/geometry";
import { DECK_TOP, DECK_UNDERSIDE, VEHICLE_TOP } from "../world/structures";
import { GATE_TOKENS, gapBox, gateParts, type GatePart } from "./gate-parts";

const KINDS = Object.keys(TETROMINOES) as TetrominoKind[];
const GATES: Gate[] = KINDS.flatMap((kind) => Array.from({ length: TUNING.corridorCols - 1 }, (_, lane) => ({ lane, kind })));

// A part's extent, turned.
function bounds(part: GatePart) {
  const placed = { ...part, yaw: 0 };
  const [w, h, d] = part.size;
  const corners = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => boxPoint(placed, [(x * w) / 2, (y * h) / 2, (z * d) / 2]))));
  const along = (axis: 0 | 1 | 2) => [Math.min(...corners.map((c) => c[axis])), Math.max(...corners.map((c) => c[axis]))] as const;
  return { x: along(0), y: along(1) };
}

describe("a gate's gantry", () => {
  it("stays out of every lane below the tallest vehicle, so it never hides a cell of its row", () => {
    for (const gate of GATES) {
      for (const part of gateParts(gate)) {
        const { x, y } = bounds(part);
        const onRoad = x[1] > ROAD_LEFT && x[0] < ROAD_RIGHT;
        if (onRoad) expect(y[0]).toBeGreaterThan(VEHICLE_TOP);
      }
    }
  });

  it("leaves its gap open: nothing of it in the gate's lanes, the face's full height", () => {
    for (const gate of GATES) {
      const gap = gapBox(gate);
      expect(gap.y1 - gap.y0).toBe(TUNING.wallRows);
      for (const part of gateParts(gate)) {
        const { x, y } = bounds(part);
        expect(x[1] > gap.x0 && x[0] < gap.x1 && y[1] > gap.y0 && y[0] < gap.y1).toBe(false);
      }
    }
  });

  it("passes under the overpass and the finish gantry, clear of their pillars", () => {
    // The structures' pillars stand beyond the verge, at least this far out.
    const pillars = VERGE + 0.4;
    for (const gate of GATES) {
      for (const part of gateParts(gate)) {
        const { x, y } = bounds(part);
        expect(y[1]).toBeLessThan(DECK_UNDERSIDE);
        expect(x[0]).toBeGreaterThan(sideX("left", pillars));
        expect(x[1]).toBeLessThan(sideX("right", pillars));
      }
    }
  });

  it("shows the gate's piece as a little frog, a cell for each of the piece's cells, with two eyes", () => {
    for (const gate of GATES) {
      const parts = gateParts(gate);
      // One on each post's sign.
      expect(parts.filter((p) => p.paint === "skin")).toHaveLength(2 * 4);
      expect(parts.filter((p) => p.paint === "eye")).toHaveLength(2 * 2);
      expect(parts.filter((p) => p.paint === "pupil")).toHaveLength(2 * 2);
    }
  });

  it("lays no two faces of different paints in one plane", () => {
    const eye = { lowest: TUNING.cameraHeight, highest: DECK_TOP + TUNING.cameraHeight };
    for (const gate of GATES) {
      const placed = gateParts(gate).map((part) => ({ ...part, yaw: 0 }));
      const clashes = faceClashes(placed, 1e-4, eye).filter(({ a, b }) => a.paint !== b.paint);
      expect(clashes.map(({ a, b }) => `${a.paint} at ${a.center.join(",")} ~ ${b.paint} at ${b.center.join(",")}`)).toEqual([]);
    }
  });

  it("is painted from design tokens", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(Object.values(GATE_TOKENS).filter((token) => !css.includes(`${token}:`))).toEqual([]);
    expect(css.includes("--color-frogmino-gate-shimmer:")).toBe(true);
  });
});

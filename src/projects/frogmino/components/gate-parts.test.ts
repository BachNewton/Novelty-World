import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GROUND_CLEARANCE } from "../clearance";
import { VEHICLE_IDS, VEHICLE_LENGTHS } from "../fleet";
import { TETROMINOES } from "../logic";
import { gatePostLines, vehicleWidth } from "../traffic";
import { TUNING } from "../tuning";
import type { Gate, TetrominoKind } from "../types";
import { vehicleModel } from "../vehicles";
import { DEPTH_RESOLUTION } from "../vehicles/parts";
import { faceClashes, spanning } from "../world/coplanar";
import { ROAD_LEFT, VERGE, roadRight, sideX, type Placement } from "../world/geometry";
import { DECK_TOP, DECK_UNDERSIDE, VEHICLE_TOP } from "../world/structures";
import { END_INSET, GATE_TOKENS, POST_HALF, gapBox, gateParts, type GatePart } from "./gate-parts";

const KINDS = Object.keys(TETROMINOES) as TetrominoKind[];
const GATES: Gate[] = KINDS.flatMap((kind) => Array.from({ length: TUNING.corridorCols - 1 }, (_, lane) => ({ lane, kind })));
const LENGTHS = [...new Set(Object.values(VEHICLE_LENGTHS))];
const FRAMES = GATES.flatMap((gate) => LENGTHS.map((length) => ({ gate, length, parts: gateParts(gate, length) })));

function bounds(part: GatePart) {
  const along = (axis: 0 | 1 | 2) => [part.center[axis] - part.size[axis] / 2, part.center[axis] + part.size[axis] / 2] as const;
  return { x: along(0), y: along(1), z: along(2) };
}

const placed = (part: GatePart): Placement & GatePart => ({ ...part, roll: 0, yaw: 0 });

// The heights the gameplay camera looks from, on the road and on the decks.
const EYE = { lowest: TUNING.cameraHeight, highest: DECK_TOP + TUNING.cameraHeight };

describe("a gate's frame", () => {
  it("stands nothing on the road below the lintel but its posts, each on a lane line either side of the gate", () => {
    expect(POST_HALF).toBeLessThan(0.1);
    for (const { gate, parts } of FRAMES) {
      const lines = gatePostLines(gate).map((line) => line - 0.5);
      for (const part of parts) {
        const { x, y } = bounds(part);
        const onRoad = x[1] > ROAD_LEFT && x[0] < roadRight(TUNING.corridorCols);
        if (!onRoad || y[0] > VEHICLE_TOP) continue;
        expect(lines.some((line) => x[0] >= line - POST_HALF - 1e-9 && x[1] <= line + POST_HALF + 1e-9)).toBe(true);
      }
    }
  });

  it("leaves its gap open between the posts, the face's full height", () => {
    for (const { gate, parts } of FRAMES) {
      const gap = gapBox(gate);
      expect(gap.y1 - gap.y0).toBe(TUNING.wallRows);
      expect(gap.x1 - gap.x0).toBeCloseTo(2 - 2 * POST_HALF);
      for (const part of parts) {
        const { x, y } = bounds(part);
        expect(x[1] > gap.x0 + 1e-9 && x[0] < gap.x1 - 1e-9 && y[1] > gap.y0 && y[0] < gap.y1).toBe(false);
      }
    }
  });

  it("runs its posts the row's whole length, as long as the rules hold them solid", () => {
    for (const { length, parts } of FRAMES) {
      const posts = parts.filter((part) => bounds(part).y[0] < VEHICLE_TOP);
      expect(Math.max(...posts.map((part) => bounds(part).z[1]))).toBeCloseTo(-END_INSET);
      expect(Math.min(...posts.map((part) => bounds(part).z[0]))).toBeCloseTo(-length + END_INSET);
    }
  });

  it("passes under the overpass and the finish gantry, clear of their pillars", () => {
    // The structures' pillars stand beyond the verge, at least this far out.
    const pillars = VERGE + 0.4;
    for (const { parts } of FRAMES) {
      for (const part of parts) {
        const { x, y } = bounds(part);
        expect(y[1]).toBeLessThan(DECK_UNDERSIDE);
        expect(x[0]).toBeGreaterThan(sideX(TUNING.corridorCols, "left", pillars));
        expect(x[1]).toBeLessThan(sideX(TUNING.corridorCols, "right", pillars));
      }
    }
  });

  it("shows the gate's piece on its lintel as a little frog, a cell for each of the piece's cells, with two eyes", () => {
    for (const { gate, parts } of FRAMES) {
      const lines = gatePostLines(gate).map((line) => line - 0.5);
      const icon = parts.filter((p) => p.paint === "skin" || p.paint === "eye" || p.paint === "pupil");
      expect(icon.filter((p) => p.paint === "skin")).toHaveLength(4);
      expect(icon.filter((p) => p.paint === "eye")).toHaveLength(2);
      expect(icon.filter((p) => p.paint === "pupil")).toHaveLength(2);
      for (const part of icon) {
        const { x, y } = bounds(part);
        expect(y[0]).toBeGreaterThan(VEHICLE_TOP);
        expect(x[0]).toBeGreaterThan(lines[0]);
        expect(x[1]).toBeLessThan(lines[1]);
      }
    }
  });

  it("lays no two faces of different paints in one plane", () => {
    for (const { parts } of FRAMES) {
      const clashes = faceClashes(parts.map(placed), 1e-4, EYE).filter(({ a, b }) => a.paint !== b.paint);
      expect(clashes.map(({ a, b }) => `${a.paint} at ${a.center.join(",")} ~ ${b.paint} at ${b.center.join(",")}`)).toEqual([]);
    }
  });

  it("lays no face where the depth buffer can't tell it from a face of a vehicle beside the gate", () => {
    // A gate at lane 4 with each vehicle against its left post, and a gate at
    // lane 0 with each against its right post, whatever lanes that takes.
    for (const id of VEHICLE_IDS) {
      const model = vehicleModel(id);
      const at = (lane: number) => (corner: readonly [number, number, number]) =>
        [corner[0] + lane - 0.5, corner[1] + GROUND_CLEARANCE, corner[2]] as const;
      for (const [gate, lane] of [
        [{ lane: 4, kind: "T" }, 4 - vehicleWidth(id)],
        [{ lane: 0, kind: "T" }, 2],
      ] as const) {
        const shift = at(lane);
        const vehicle = [
          ...model.body.map(({ min, max }) => spanning(shift(min), shift(max))),
          ...model.parts.map((part) => spanning(shift(part.min), shift(part.max))),
        ].map((box) => ({ ...box, what: `${id}` }));
        for (const length of LENGTHS.filter((l) => l >= model.length)) {
          const frame = gateParts(gate, length).map((part) => ({ ...placed(part), what: `gate ${part.paint}` }));
          const clashes = faceClashes([...vehicle, ...frame], DEPTH_RESOLUTION, EYE).filter(({ a, b }) => a.what.startsWith("gate") !== b.what.startsWith("gate"));
          expect(clashes.map(({ a, b, gap }) => `${a.what} at ${a.center.join(",")} ~ ${b.what} at ${b.center.join(",")}, ${gap.toFixed(4)} apart`)).toEqual([]);
        }
      }
    }
  });

  it("is painted from design tokens", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(Object.values(GATE_TOKENS).filter((token) => !css.includes(`${token}:`))).toEqual([]);
    expect(css.includes("--color-frogmino-gate-shimmer:")).toBe(true);
  });
});

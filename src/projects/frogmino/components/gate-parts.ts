import { GROUND_CLEARANCE } from "../clearance";
import { pieceCells } from "../logic";
import { gatePostLines } from "../traffic";
import { TUNING } from "../tuning";
import type { Gate } from "../types";
import { LAYER as PAINT_LAYER, SURFACE_TOLERANCE } from "../vehicles/parts";
import { DECK_UNDERSIDE, VEHICLE_TOP } from "../world/structures";

// A gate's frame as boxes, in its row's frame: x across the road, one unit
// per lane, lane n centred on x = n; y up from the road; z along the course,
// the row's front face at z = 0 and its vehicles toward -z. It travels with
// its row. A thin post stands on the lane line either side of the gate's two
// lanes, from the road to just above the tallest vehicle, and runs the row's
// whole length, since the rules hold it solid for as long as the row
// overlaps the frog. A lintel across the top joins them at the row's front,
// with a sign on its face showing the gate's piece as a little frog. The
// rows drive under the overpass and the finish gantry, so all of it passes
// beneath their decks too.

export type GatePaint = "frame" | "frameLight" | "panel" | "skin" | "eye" | "pupil";

export const GATE_TOKENS: Record<GatePaint, string> = {
  frame: "--color-frogmino-gate-frame",
  frameLight: "--color-frogmino-gate-frame-light",
  panel: "--color-frogmino-gate-sign",
  // The icon is the player's own frog, as the piece the gate gives it.
  skin: "--color-frogmino-frog-p1-skin",
  eye: "--color-frogmino-frog-eye",
  pupil: "--color-frogmino-frog-pupil",
};

export type Vec3 = readonly [number, number, number];

export interface GatePart {
  center: Vec3;
  size: Vec3;
  paint: GatePaint;
}

// A little clear of the vehicles below and the decks above.
const GAP = 0.03;
export const LINTEL_BOTTOM = VEHICLE_TOP + GAP;
export const LINTEL_TOP = DECK_UNDERSIDE - GAP;
// Half a post's width, either side of its lane line: it reaches into the
// lanes beside it a paint layer further than a vehicle's details may stand
// proud of its side, so it buries them rather than sharing a plane with
// them, and no further.
export const POST_HALF = SURFACE_TOLERANCE + PAINT_LAYER;
// The frame stands a paint layer inside the row's ends, so its faces never
// share a plane with a vehicle's front or back.
export const END_INSET = PAINT_LAYER;
const LINTEL_DEPTH = 0.3;
const BAND = 0.5;
// The sign fills the lintel's face but for a rim of the frame round it, and
// stands out from it toward the frog.
const SIGN_RIM = 0.012;
const SIGN_WIDTH = 0.6;
const SIGN_THICKNESS = 0.04;
// The icon's cells, as cubes a little smaller than their spacing so they
// stay countable, two rows of them filling the sign's height.
const ICON_MARGIN = 0.012;
const ICON_CELL = (LINTEL_TOP - LINTEL_BOTTOM - 2 * SIGN_RIM - 2 * ICON_MARGIN) / 2;
const ICON_CUBE = 0.88 * ICON_CELL;
const ICON_DEPTH = 0.03;
const EYE = 0.34 * ICON_CELL;
const PUPIL = 0.17 * ICON_CELL;
const LAYER = 0.006;

if (LINTEL_TOP - LINTEL_BOTTOM < 0.15) throw new Error("No room for a gate's lintel between the vehicles and the decks");

function part(center: Vec3, size: Vec3, paint: GatePaint): GatePart {
  return { center, size, paint };
}

// A box spanning x0..x1, y0..y1 and z0..z1.
function span(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, paint: GatePaint): GatePart {
  return part([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [x1 - x0, y1 - y0, z1 - z0], paint);
}

// About a band's width each, `count` slices of from..to, in the two violets
// by turns.
function bands(from: number, to: number, startLight: boolean): { from: number; to: number; paint: GatePaint }[] {
  const count = Math.max(1, Math.round((to - from) / BAND));
  const width = (to - from) / count;
  return Array.from({ length: count }, (_, i) => ({
    from: from + i * width,
    to: from + (i + 1) * width,
    paint: (i % 2 === 0) === startLight ? "frameLight" : "frame",
  }));
}

// The x of the lane line on the left of lane `line`.
function lineX(line: number): number {
  return line - 0.5;
}

// The gate's piece as a little frog: its cells, and two eyes on the front of
// its top row, centred on the row's middle half a cell apart, looking out.
function frogIcon(kind: Gate["kind"], x: number, y: number, front: number): GatePart[] {
  const cells = pieceCells(kind, 0);
  const width = Math.max(...cells.map((c) => c.col)) + 1;
  const height = Math.max(...cells.map((c) => c.row)) + 1;
  const at = (col: number, row: number): [number, number] => [
    x + (col - (width - 1) / 2) * ICON_CELL,
    y + (row - (height - 1) / 2) * ICON_CELL,
  ];
  const cubes = cells.map((c) => {
    const [cx, cy] = at(c.col, c.row);
    return part([cx, cy, front + ICON_DEPTH / 2], [ICON_CUBE, ICON_CUBE, ICON_DEPTH], "skin");
  });
  const head = cells.filter((c) => c.row === height - 1);
  const middle = head.reduce((sum, c) => sum + at(c.col, c.row)[0], 0) / head.length;
  const eyeY = at(0, height - 1)[1] + ICON_CUBE / 2 - EYE / 2 - 0.1 * ICON_CELL;
  const face = front + ICON_DEPTH;
  const eyes = [-1, 1].flatMap((sideways) => {
    const ex = middle + (sideways * ICON_CELL) / 4;
    return [
      part([ex, eyeY, face + LAYER / 2], [EYE, EYE, LAYER], "eye"),
      part([ex, eyeY + (EYE - PUPIL) / 2 - 0.02 * ICON_CELL, face + LAYER + LAYER / 2], [PUPIL, PUPIL, LAYER], "pupil"),
    ];
  });
  return [...cubes, ...eyes];
}

// The gate's frame, for a row reaching `length` back from its front.
export function gateParts(gate: Gate, length: number): GatePart[] {
  const [left, right] = gatePostLines(gate).map(lineX);
  const [front, back] = [-END_INSET, -length + END_INSET];
  const posts = [left, right].flatMap((x) =>
    bands(0, LINTEL_BOTTOM, false).map((band) => span(x - POST_HALF, x + POST_HALF, band.from, band.to, back, front, band.paint)),
  );
  const lintel = bands(left - POST_HALF, right + POST_HALF, true).map((band) =>
    span(band.from, band.to, LINTEL_BOTTOM, LINTEL_TOP, front - LINTEL_DEPTH, front, band.paint),
  );
  const middle = (left + right) / 2;
  const sign = span(
    middle - SIGN_WIDTH / 2,
    middle + SIGN_WIDTH / 2,
    LINTEL_BOTTOM + SIGN_RIM,
    LINTEL_TOP - SIGN_RIM,
    front,
    front + SIGN_THICKNESS,
    "panel",
  );
  const icon = frogIcon(gate.kind, middle, (LINTEL_BOTTOM + LINTEL_TOP) / 2, front + SIGN_THICKNESS);
  return [...posts, ...lintel, sign, ...icon];
}

// Where the gate's gap is: between its posts, the face's full height.
export function gapBox(gate: Gate): { x0: number; x1: number; y0: number; y1: number } {
  const [left, right] = gatePostLines(gate).map(lineX);
  return { x0: left + POST_HALF, x1: right - POST_HALF, y0: GROUND_CLEARANCE, y1: GROUND_CLEARANCE + TUNING.wallRows };
}

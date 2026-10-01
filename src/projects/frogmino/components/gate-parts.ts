import { GROUND_CLEARANCE } from "../clearance";
import { pieceCells } from "../logic";
import { gateLanes } from "../traffic";
import { TUNING } from "../tuning";
import type { Gate } from "../types";
import { sideX, type Side } from "../world/geometry";
import { DECK_UNDERSIDE, VEHICLE_TOP } from "../world/structures";

// A gate's gantry as boxes, in its row's frame: x across the road, one unit
// per lane; y up from the road; z along the course, the row's front face at
// z = 0 and its vehicles toward -z. It travels with its row, so it stays
// out of every lane below the tallest vehicle: posts on the shoulders, a
// chequered beam across the road above the vehicles, with the gate's own
// lanes marked on it by a panel of arrows pointing down into them, and on
// each post a sign showing the gate's piece as a little frog. The rows drive
// under the overpass and the finish gantry, so all of it passes beneath
// their decks too.

export type GatePaint = "frame" | "frameLight" | "panel" | "arrow" | "skin" | "eye" | "pupil";

export const GATE_TOKENS: Record<GatePaint, string> = {
  frame: "--color-frogmino-gate-frame",
  frameLight: "--color-frogmino-gate-frame-light",
  panel: "--color-frogmino-gate-sign",
  arrow: "--color-frogmino-gate-arrow",
  // The icon is the player's own frog, as the piece the gate gives it.
  skin: "--color-frogmino-frog-p1-skin",
  eye: "--color-frogmino-frog-eye",
  pupil: "--color-frogmino-frog-pupil",
};

export type Vec3 = readonly [number, number, number];

export interface GatePart {
  center: Vec3;
  size: Vec3;
  // Turned about z, for the arrows' arms.
  roll: number;
  paint: GatePaint;
}

// A little clear of the vehicles below and the decks above.
const GAP = 0.03;
export const BEAM_BOTTOM = VEHICLE_TOP + GAP;
export const BEAM_TOP = DECK_UNDERSIDE - GAP;
const DEPTH = 0.3;
const POST_OFFSET = 0.3;
const POST_WIDTH = 0.22;
const CHECK = 0.5;
// The signs stand out from the posts toward the frog, clear of the lanes
// and short of the structures' pillars.
const SIGN_INNER = 0.04;
const SIGN_OUTER = 1.1;
const SIGN_BOTTOM = 1.7;
const SIGN_TOP = 2.9;
const SIGN_FRONT = 0.14;
const SIGN_THICKNESS = 0.12;
// The icon's cells, as cubes a little smaller than their spacing so they
// stay countable.
const ICON_CELL = 0.25;
const ICON_CUBE = 0.22;
const ICON_DEPTH = 0.08;
const EYE = 0.08;
const PUPIL = 0.04;
const LAYER = 0.01;

if (BEAM_TOP - BEAM_BOTTOM < 0.15) throw new Error("No room for a gate's beam between the vehicles and the decks");

function part(center: Vec3, size: Vec3, paint: GatePaint, roll = 0): GatePart {
  return { center, size, roll, paint };
}

// A box spanning x0..x1 and y0..y1, as deep as the beam.
function span(x0: number, x1: number, y0: number, y1: number, paint: GatePaint): GatePart {
  return part([(x0 + x1) / 2, (y0 + y1) / 2, -DEPTH / 2], [x1 - x0, y1 - y0, DEPTH], paint);
}

// Blocks of two paints across x0..x1, about a check wide each.
function chequer(x0: number, x1: number, startLight: boolean): GatePart[] {
  const count = Math.max(1, Math.round((x1 - x0) / CHECK));
  const width = (x1 - x0) / count;
  return Array.from({ length: count }, (_, i) =>
    span(x0 + i * width, x0 + (i + 1) * width, BEAM_BOTTOM, BEAM_TOP, (i % 2 === 0) === startLight ? "frameLight" : "frame"),
  );
}

// A chevron pointing down, painted on the beam's front at x.
function arrow(x: number): GatePart[] {
  const y = (BEAM_BOTTOM + BEAM_TOP) / 2;
  const arm = BEAM_TOP - BEAM_BOTTOM;
  return [-1, 1].map((sideways) =>
    part([x + (sideways * arm) / 3, y, LAYER / 2], [arm, arm / 5, LAYER], "arrow", (sideways * Math.PI) / 4),
  );
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
  const eyeY = at(0, height - 1)[1] + ICON_CUBE / 2 - EYE / 2 - 0.015;
  const face = front + ICON_DEPTH;
  const eyes = [-1, 1].flatMap((sideways) => {
    const ex = middle + (sideways * ICON_CELL) / 4;
    return [
      part([ex, eyeY, face + LAYER], [EYE, EYE, 2 * LAYER], "eye"),
      part([ex, eyeY + (EYE - PUPIL) / 2 - 0.005, face + 2 * LAYER + LAYER / 2], [PUPIL, PUPIL, LAYER], "pupil"),
    ];
  });
  return [...cubes, ...eyes];
}

// A sign on the post on `side`, with the gate's piece on it.
function sign(side: Side, kind: Gate["kind"]): GatePart[] {
  const [a, b] = [sideX(side, SIGN_INNER), sideX(side, SIGN_OUTER)];
  const [x0, x1] = [Math.min(a, b), Math.max(a, b)];
  const panel = part(
    [(x0 + x1) / 2, (SIGN_BOTTOM + SIGN_TOP) / 2, SIGN_FRONT - SIGN_THICKNESS / 2],
    [x1 - x0, SIGN_TOP - SIGN_BOTTOM, SIGN_THICKNESS],
    "panel",
  );
  return [panel, ...frogIcon(kind, (x0 + x1) / 2, (SIGN_BOTTOM + SIGN_TOP) / 2 - 0.08, SIGN_FRONT)];
}

export function gateParts(gate: Gate): GatePart[] {
  const lanes = gateLanes(gate);
  const [gate0, gate1] = [lanes.first - 0.5, lanes.last + 0.5];
  const [left, right] = [sideX("left", POST_OFFSET), sideX("right", POST_OFFSET)];
  const [x0, x1] = [left - POST_WIDTH / 2, right + POST_WIDTH / 2];
  const posts = [left, right].map((x) => span(x - POST_WIDTH / 2, x + POST_WIDTH / 2, 0, BEAM_BOTTOM, "frame"));
  const beam = [
    ...chequer(x0, gate0, true),
    span(gate0, gate1, BEAM_BOTTOM, BEAM_TOP, "panel"),
    ...chequer(gate1, x1, false),
  ];
  const arrows = [lanes.first, lanes.last].flatMap(arrow);
  return [...posts, ...beam, ...arrows, ...sign("left", gate.kind), ...sign("right", gate.kind)];
}

// Where the gate's gap is: its lanes, the face's full height.
export function gapBox(gate: Gate): { x0: number; x1: number; y0: number; y1: number } {
  const lanes = gateLanes(gate);
  return { x0: lanes.first - 0.5, x1: lanes.last + 0.5, y0: GROUND_CLEARANCE, y1: GROUND_CLEARANCE + TUNING.wallRows };
}

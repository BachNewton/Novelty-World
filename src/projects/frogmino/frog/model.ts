import { GROUND_CLEARANCE } from "../clearance";
import { cellKey, pieceCells, pieceSize } from "../logic";
import { FROG_THICKNESS } from "../run";
import type { Cell, Rotation, TetrominoKind } from "../types";
import { DECAL, type Vec3 } from "../vehicles/parts";
import type { FrogRole, Markings, Pupil } from "./look";

// The frog is built in its own frame, like a vehicle: x runs across the
// lanes and y up, so the cell at (col, row) fills x from col to col + 1. Every
// cell is lifted by the ground clearance, filling y from row + clearance to
// row + 1 + clearance, and the legs stand in the gap below. Its front face,
// toward the traffic, is at z = 0, and its back, toward the camera, at
// z = depth.
//
// Features stay upright whatever the rotation: the head is always the top
// row, with the eyes on top of it, and the legs are always under the bottom
// row, on the road. Seen head-on, every cell is a full square and nothing
// reaches into an empty cell: the eyes bulge up from a dip in the back of the
// head, never above it (see the frog in CLAUDE.md).

// The head's snout: a full-height ridge across the front of the top row,
// which keeps each head cell a full square seen head-on.
const SNOUT_DEPTH = 0.26;
// How far the back of the head sits below the top of its cells, so the eyes
// bulge up out of it.
const HEAD_DIP = 0.22;

const EYE_RADIUS = 0.2;
// The two eyes' centres are half a cell apart, centred on the head row.
const EYE_SPACING = 0.5;
const EYE_Z = SNOUT_DEPTH + 0.15;
// The white sits a little up and back in the bump, facing the camera, and
// the pupil near its top, so the frog looks up and back at the player.
const WHITE_RADIUS = 0.155;
const WHITE_OFFSET: Vec3 = [0, 0.03, 0.05];
const PUPIL_OFFSET: Vec3 = [0, 0.116, 0.058];
const PUPIL_RADII: Record<Pupil, Vec3> = {
  round: [0.075, 0.075, 0.075],
  bar: [0.105, 0.045, 0.06],
};

const MARK_SIZE = 0.42;
// Freckles: two small dots on a diagonal, where spots have one big one.
const FRECKLE_SIZE = 0.22;
const FRECKLE_SPREAD = 0.17;
const TOP_MARK_SIZE = 0.4;
const MOUTH: readonly [inset: number, bottom: number, top: number] = [0.1, 0.47, 0.52];
// The throat, under the mouth on the front of the head, which puffs.
const THROAT_RADIUS = 0.18;
const THROAT_HEIGHT = 0.24;

export type FrogShape = "box" | "sphere" | "drumY" | "drumZ";

// A part fills the box from `min` to `max`: as a box, as an ellipsoid, or as
// a disc whose axis runs along y or z.
export interface FrogPart {
  shape: FrogShape;
  min: Vec3;
  max: Vec3;
  role: FrogRole;
}

export interface FrogEye {
  // The middle of the bump; the eyeball sinks toward it to blink.
  centre: Vec3;
  bump: FrogPart;
  white: FrogPart;
  pupil: FrogPart;
}

export interface FrogCell {
  cell: Cell;
  // What the cell's squash and stretch shrink toward: the middle of its
  // bottom edge, on its front face. Shrinking toward a point inside its own
  // cell always keeps it inside that cell.
  anchor: Vec3;
  // The cell's skin, drawn with the cell border.
  body: FrogPart[];
  details: FrogPart[];
  eyes: FrogEye[];
  throat: FrogPart | null;
}

export interface FrogLeg {
  // Where the leg tucks toward: its top, against the body's underside.
  hip: Vec3;
  parts: FrogPart[];
}

export interface FrogModel {
  kind: TetrominoKind;
  rotation: Rotation;
  clearance: number;
  depth: number;
  width: number;
  height: number;
  cells: FrogCell[];
  legs: FrogLeg[];
}

export interface FrogModelOptions {
  markings: Markings;
  pupil: Pupil;
  clearance?: number;
  depth?: number;
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

function ellipsoid(centre: Vec3, radii: Vec3, role: FrogRole): FrogPart {
  return {
    shape: "sphere",
    min: [centre[0] - radii[0], centre[1] - radii[1], centre[2] - radii[2]],
    max: [centre[0] + radii[0], centre[1] + radii[1], centre[2] + radii[2]],
    role,
  };
}

function eye(x: number, top: number, pupil: Pupil): FrogEye {
  const centre: Vec3 = [x, top - EYE_RADIUS, EYE_Z];
  const whiteCentre = add(centre, WHITE_OFFSET);
  return {
    centre,
    bump: ellipsoid(centre, [EYE_RADIUS, EYE_RADIUS, EYE_RADIUS], "skin"),
    white: ellipsoid(whiteCentre, [WHITE_RADIUS, WHITE_RADIUS, WHITE_RADIUS], "eye"),
    pupil: ellipsoid(add(whiteCentre, PUPIL_OFFSET), PUPIL_RADII[pupil], "pupil"),
  };
}

function disc(axis: "drumY" | "drumZ", centre: Vec3, size: number): FrogPart {
  const [x, y, z] = centre;
  const r = size / 2;
  return axis === "drumZ"
    ? { shape: "drumZ", min: [x - r, y - r, z], max: [x + r, y + r, z + DECAL], role: "mark" }
    : { shape: "drumY", min: [x - r, y, z - r], max: [x + r, y + DECAL, z + r], role: "mark" };
}

// The marks on the back of a cell, which faces the camera, centred between
// `bottom` and `top`: one big spot, or two freckles.
function backMarks(col: number, bottom: number, top: number, depth: number, markings: Markings): FrogPart[] {
  const [x, v] = [col + 0.5, (bottom + top) / 2];
  const d = FRECKLE_SPREAD;
  return markings === "spots"
    ? [disc("drumZ", [x, v, depth], MARK_SIZE)]
    : [disc("drumZ", [x - d, v + d, depth], FRECKLE_SIZE), disc("drumZ", [x + d, v - d, depth], FRECKLE_SIZE)];
}

function topMarks(col: number, top: number, depth: number, markings: Markings): FrogPart[] {
  const [x, z] = [col + 0.5, depth / 2];
  const d = FRECKLE_SPREAD;
  return markings === "spots"
    ? [disc("drumY", [x, top, z], TOP_MARK_SIZE)]
    : [disc("drumY", [x - d, top, z - d], FRECKLE_SIZE), disc("drumY", [x + d, top, z + d], FRECKLE_SIZE)];
}

// Two hind legs at the ends of the bottom row, with big webbed feet reaching
// back toward the camera, and two small front feet: all in the clearance
// under the bottom row. A frog with no clearance has no legs.
function legs(from: number, to: number, clearance: number): FrogLeg[] {
  const c = clearance;
  if (c <= 0) return [];
  const hind = (x: number): FrogLeg => ({
    hip: [x, c, 0.66],
    parts: [
      { shape: "sphere", min: [x - 0.17, c * 0.2, 0.42], max: [x + 0.17, c, 0.9], role: "skin" },
      { shape: "sphere", min: [x - 0.15, 0, 0.62], max: [x + 0.15, c * 0.24, 0.96], role: "foot" },
      ...[-0.1, 0, 0.1].map(
        (dx): FrogPart => ({
          shape: "sphere",
          min: [x + dx - 0.05, 0, 0.9],
          max: [x + dx + 0.05, Math.min(0.1, c * 0.4), 1],
          role: "foot",
        }),
      ),
    ],
  });
  const front = (x: number): FrogLeg => ({
    hip: [x, c, 0.16],
    parts: [
      { shape: "sphere", min: [x - 0.07, c * 0.2, 0.08], max: [x + 0.07, c, 0.24], role: "skin" },
      { shape: "sphere", min: [x - 0.1, 0, 0.02], max: [x + 0.1, c * 0.2, 0.26], role: "foot" },
    ],
  });
  return [hind(from + 0.21), hind(to - 0.21), front(from + 0.34), front(to - 0.34)];
}

export function frogModel(kind: TetrominoKind, rotation: Rotation, options: FrogModelOptions): FrogModel {
  const { markings, pupil, clearance = GROUND_CLEARANCE, depth = FROG_THICKNESS } = options;
  const cells = pieceCells(kind, rotation);
  const { width, height } = pieceSize(kind, rotation);
  const filled = new Set(cells.map(cellKey));
  const headRow = height - 1;
  const headCols = cells.filter((c) => c.row === headRow).map((c) => c.col);
  // The eyes centre on the head row, one either side of its middle; the
  // throat belongs to the cell under that middle, the left one at a seam.
  const eyeMiddle = (Math.min(...headCols) + Math.max(...headCols) + 1) / 2;
  const eyeXs = [eyeMiddle - EYE_SPACING / 2, eyeMiddle + EYE_SPACING / 2];
  const throatCol = Math.ceil(eyeMiddle) - 1;
  const bottomCols = cells.filter((c) => c.row === 0).map((c) => c.col);

  const frogCells = cells.map(({ col, row }): FrogCell => {
    const bottom = row + clearance;
    const top = bottom + 1;
    const head = row === headRow;
    const backTop = head ? top - HEAD_DIP : top;
    const body: FrogPart[] = head
      ? [
          { shape: "box", min: [col, bottom, 0], max: [col + 1, top, SNOUT_DEPTH], role: "skin" },
          { shape: "box", min: [col, bottom, SNOUT_DEPTH], max: [col + 1, backTop, depth], role: "skin" },
        ]
      : [{ shape: "box", min: [col, bottom, 0], max: [col + 1, top, depth], role: "skin" }];
    const details: FrogPart[] = backMarks(col, bottom, backTop, depth, markings);
    if (!head && !filled.has(cellKey({ col, row: row + 1 }))) details.push(...topMarks(col, top, depth, markings));
    if (row === 0) {
      details.push({
        shape: "box",
        min: [col + 0.1, bottom - DECAL, 0.1],
        max: [col + 0.9, bottom, depth - 0.1],
        role: "belly",
      });
    }
    if (head) {
      const [inset, from, to] = MOUTH;
      details.push({
        shape: "box",
        min: [col + inset, bottom + from, -DECAL],
        max: [col + 1 - inset, bottom + to, 0],
        role: "pupil",
      });
    }
    const throat: FrogPart | null =
      head && col === throatCol
        ? {
            shape: "drumZ",
            min: [eyeMiddle - THROAT_RADIUS, bottom + THROAT_HEIGHT - THROAT_RADIUS, -DECAL],
            max: [eyeMiddle + THROAT_RADIUS, bottom + THROAT_HEIGHT + THROAT_RADIUS, 0],
            role: "belly",
          }
        : null;
    return {
      cell: { col, row },
      anchor: [col + 0.5, bottom, 0],
      body,
      details,
      eyes: head ? eyeXs.filter((x) => x >= col && x < col + 1).map((x) => eye(x, top, pupil)) : [],
      throat,
    };
  });

  return {
    kind,
    rotation,
    clearance,
    depth,
    width,
    height,
    cells: frogCells,
    legs: legs(Math.min(...bottomCols), Math.max(...bottomCols) + 1, clearance),
  };
}

// The middle of the frog's cells in its own frame: the point it turns about,
// which the scene places where the rules put the middle of the piece's box.
export function frogPivot(model: FrogModel): Vec3 {
  return [model.width / 2, model.clearance + model.height / 2, model.depth / 2];
}

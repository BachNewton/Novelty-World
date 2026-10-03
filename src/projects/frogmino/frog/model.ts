import { GROUND_CLEARANCE } from "../clearance";
import { cellKey, pieceCells, pieceSize } from "../logic";
import { FROG_THICKNESS } from "../run";
import type { Cell, Rotation, TetrominoKind } from "../types";
import { DECAL, type Vec3 } from "../vehicles/parts";
import type { FrogRole, Markings, Pupil } from "./look";
import { PUPIL_ORBIT, type PupilOrbit } from "./motion";

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
// head, never above it, with their pupils turned up to the camera (see the
// frog in CLAUDE.md).

// The head's snout: a full-height ridge across the front of the top row,
// which keeps each head cell a full square seen head-on.
const SNOUT_DEPTH = 0.1;
// How far the back of the head sits below the top of its cells, so the eyes
// bulge up out of it.
const HEAD_DIP = 0.22;

// The camera is behind and above the frog, which faces down the road. Each
// eye is a skin bump on the head, just behind the snout, with its eyeball
// bulging out of the bump's top, toward the outside and a touch back, as a
// frog's eyes sit high on its head, and the pupil in the middle of that
// bulge, looking up and out. So the gameplay camera sees each pupil on the
// far, outer side of its eyeball, as a frog seen from behind looking ahead
// and out, and the turntable shows the frog from the front looking up.
const EYE_RADIUS = 0.2;
// The two eyes' centres are half a cell apart, centred on the head row.
const EYE_SPACING = 0.5;
const EYE_Z = 0.33;
// Which way the right eye looks: up, out, and a touch back toward the
// camera, enough to turn its pupil to it. The left eye's mirrors it.
const GAZE: Vec3 = [0.6, 0.75, 0.2];
const WHITE_RADIUS = 0.11;
// How far the white's middle sits from the bump's, along the gaze. The white
// stands well out of the bump, so its rim crosses the bump's skin steeply: a
// white barely poking through would run alongside the skin and flicker
// through it.
const WHITE_OUT = 0.145;
// Each pupil's size, and how far its middle is from the white's: it stands
// out of the white far enough that its rim crosses the white steeply. The bar
// is wide across the road and thin along it, so the camera, looking down on
// the eye, sees it lying across.
const PUPILS: Record<Pupil, { radii: Vec3; distance: number }> = {
  round: { radii: [0.045, 0.045, 0.045], distance: 0.08 },
  bar: { radii: [0.05, 0.04, 0.026], distance: 0.095 },
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
  // Which way the pupil looks from the white's middle, a unit vector.
  gaze: Vec3;
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
  // Where the leg tucks toward and kicks out from: its top, against the
  // body's underside.
  hip: Vec3;
  // A hind leg, which kicks out behind on a hop.
  hind: boolean;
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
const times = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const unit = (a: Vec3): Vec3 => times(a, 1 / Math.hypot(...a));
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// The middle of a part's box.
export const partMiddle = (part: FrogPart): Vec3 => times(add(part.min, part.max), 0.5);

function ellipsoid(centre: Vec3, radii: Vec3, role: FrogRole): FrogPart {
  return {
    shape: "sphere",
    min: [centre[0] - radii[0], centre[1] - radii[1], centre[2] - radii[2]],
    max: [centre[0] + radii[0], centre[1] + radii[1], centre[2] + radii[2]],
    role,
  };
}

// How far an eye reaches above its bump's middle: its bump, its white, or
// its pupil anywhere on the dazed circle, whichever is highest, for either
// pupil, so both frogs' eyes sit alike.
const EYE_REACH = Math.max(
  EYE_RADIUS,
  unit(GAZE)[1] * WHITE_OUT + WHITE_RADIUS,
  ...Object.values(PUPILS).map(
    ({ radii, distance }) => unit(GAZE)[1] * (WHITE_OUT + distance) + PUPIL_ORBIT + radii[1],
  ),
);

// An eye at `x` across, peaking at `top`, on the `side` of the head it
// looks out of: -1 left, 1 right.
function eye(x: number, top: number, side: -1 | 1, pupil: Pupil): FrogEye {
  const outward = (v: Vec3): Vec3 => [side * v[0], v[1], v[2]];
  const centre: Vec3 = [x, top - EYE_REACH, EYE_Z];
  const gaze = unit(outward(GAZE));
  const whiteCentre = add(centre, times(gaze, WHITE_OUT));
  return {
    centre,
    bump: ellipsoid(centre, [EYE_RADIUS, EYE_RADIUS, EYE_RADIUS], "skin"),
    white: ellipsoid(whiteCentre, [WHITE_RADIUS, WHITE_RADIUS, WHITE_RADIUS], "eye"),
    pupil: ellipsoid(add(whiteCentre, times(gaze, PUPILS[pupil].distance)), PUPILS[pupil].radii, "pupil"),
    gaze,
  };
}

// Where a pupil's middle is: on its gaze, or, dazed, tipped off it by the
// orbit's radius and turned round it by the orbit's angle, always the same
// distance from the white's middle, so it rolls over the white.
export function pupilCentre(eye: FrogEye, orbit: PupilOrbit | null): Vec3 {
  const whiteCentre = partMiddle(eye.white);
  const out = Math.hypot(...partMiddle(eye.pupil).map((v, i) => v - whiteCentre[i]));
  if (orbit === null) return add(whiteCentre, times(eye.gaze, out));
  const across = unit(cross(eye.gaze, [0, 1, 0]));
  const up = cross(across, eye.gaze);
  const tip = orbit.radius / out;
  const aside = add(times(across, Math.cos(orbit.angle)), times(up, Math.sin(orbit.angle)));
  const look = add(times(eye.gaze, Math.cos(tip)), times(aside, Math.sin(tip)));
  return add(whiteCentre, times(look, out));
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

// Two hind legs at the ends of the bottom row and two small front legs, all
// in the clearance under the bottom row, and all facing down the road with
// the frog. A sitting frog's hind leg folds under it in a Z: the haunch along
// the body's underside, back from the hip to the knee, and the long webbed
// foot back on the road from the toes, fanned out ahead and to the side, to
// the heel under the knee. Only the back of the clearance shows past the body
// from the gameplay camera, so it sees each haunch with its heel below it,
// never toes pointing at it. A hind leg tucks toward and kicks out from its
// hip, at the haunch's front, so a kick stretches it back along the road.
// A frog with no clearance has no legs.
function legs(from: number, to: number, clearance: number): FrogLeg[] {
  const c = clearance;
  if (c <= 0) return [];
  const toeHeight = Math.min(0.1, c * 0.4);
  // `side` is the way out from the frog's middle: -1 left, 1 right.
  const hind = (x: number, side: -1 | 1): FrogLeg => ({
    hip: [x, c, 0.46],
    hind: true,
    parts: [
      { shape: "sphere", min: [x - 0.17, c * 0.3, 0.46], max: [x + 0.17, c, 0.96], role: "skin" },
      { shape: "sphere", min: [x - 0.1, 0, 0.46], max: [x + 0.1, c * 0.24, 0.99], role: "foot" },
      // The toes, inner to outer: the outer ones reach furthest out and ahead.
      ...[
        [-0.08, 0.42],
        [0.03, 0.36],
        [0.12, 0.38],
      ].map(
        ([out, front]): FrogPart => ({
          shape: "sphere",
          min: [x + side * out - 0.05, 0, front],
          max: [x + side * out + 0.05, toeHeight, front + 0.14],
          role: "foot",
        }),
      ),
    ],
  });
  const front = (x: number): FrogLeg => ({
    hip: [x, c, 0.16],
    hind: false,
    parts: [
      { shape: "sphere", min: [x - 0.07, c * 0.2, 0.08], max: [x + 0.07, c, 0.24], role: "skin" },
      { shape: "sphere", min: [x - 0.1, 0, 0.02], max: [x + 0.1, c * 0.2, 0.26], role: "foot" },
    ],
  });
  return [hind(from + 0.21, -1), hind(to - 0.21, 1), front(from + 0.34), front(to - 0.34)];
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
      eyes: head
        ? eyeXs.flatMap((x, i) => (x >= col && x < col + 1 ? [eye(x, top, i === 0 ? -1 : 1, pupil)] : []))
        : [],
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

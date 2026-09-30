import { cellKey } from "../logic";
import type { Cell } from "../types";

// A vehicle is built in its own frame: x runs across the lanes and y up the
// rows, so the cell at (col, row) fills x from col to col + 1 and y from row
// to row + 1. Its front face is at z = 0 and it stretches back to z = -length.
// Every body cell is a solid box through the whole length, so the front
// silhouette is the same all along the vehicle. Everything else is a part:
// a small box or disc on the body's surface.

// The fleet's paints. Each is a design token in globals.css.
export const PAINTS = [
  "cherry",
  "tangerine",
  "sunflower",
  "lime",
  "mint",
  "teal",
  "sky",
  "cobalt",
  "grape",
  "bubblegum",
  "coral",
  "peach",
  "cream",
  "bun",
  "cocoa",
  "chrome",
  "charcoal",
  "glass",
  "headlight",
  "snow",
] as const;

export type Paint = (typeof PAINTS)[number];

export function paintToken(paint: Paint): string {
  return `--color-frogmino-${paint}`;
}

export type Vec3 = readonly [x: number, y: number, z: number];

// A part fills the box from `min` to `max`: as a box, or as a round disc or
// drum whose axis runs along x, y or z and which touches the box's sides.
export type PartShape = "box" | "drumX" | "drumY" | "drumZ";

export interface Part {
  shape: PartShape;
  min: Vec3;
  max: Vec3;
  paint: Paint;
}

// How far a decal stands proud of the face it sits on. Anything that stands
// proud of an outer face (sideways or upward) must stay within the surface
// detail tolerance, so it never reads as part of the silhouette.
export const DECAL = 0.02;
// A second decal laid over a first stands a little prouder, so the two never
// fight over the same depth.
export const OVERLAY = 0.035;
export const SURFACE_TOLERANCE = 0.05;

// A rectangle on a face in the cell's own units, 0 to 1 across each way.
// On the front and back: [left, bottom, right, top] as the frog sees it.
export type FaceRect = readonly [u0: number, v0: number, u1: number, v1: number];
// On a side: [from, bottom, to, top], `from` and `to` measured back from the
// front face along the length, and bottom and top up the cell.
export type SideRect = readonly [z0: number, v0: number, z1: number, v1: number];
// On a top or underside: [left, from, right, to].
export type FlatRect = readonly [u0: number, z0: number, u1: number, z1: number];

export type Side = "left" | "right";
export type Look = "flat" | "round";

export interface VehicleFrame {
  cells: readonly Cell[];
  length: number;
  front: (col: number, row: number, rect: FaceRect, paint: Paint, look?: Look, proud?: number) => Part;
  back: (col: number, row: number, rect: FaceRect, paint: Paint, look?: Look, proud?: number) => Part;
  side: (col: number, row: number, side: Side, rect: SideRect, paint: Paint, look?: Look, proud?: number) => Part;
  top: (col: number, row: number, rect: FlatRect, paint: Paint, proud?: number) => Part;
  under: (col: number, row: number, rect: FlatRect, paint: Paint, proud?: number) => Part;
  // Whether the cell at (col, row) has no neighbour on that side, so its
  // face there is on the outside.
  exposed: (col: number, row: number, side: Side) => boolean;
  // A wheel sunk into the side of a road cell, standing just proud of it.
  wheel: (col: number, side: Side, from: number, radius?: number) => Part[];
  // Wheels on every outer side of every road cell, one pair of axles near
  // the ends (one axle for a vehicle a cell long).
  wheels: (radius?: number) => Part[];
  // The fronts of the tyres, peeking out under the bumper of each outer road
  // cell, so the head-on view reads as something on wheels.
  tyreFronts: () => Part[];
}

export const WHEEL_RADIUS = 0.27;
const WHEEL_PROUD = 0.03;
const WHEEL_SUNK = 0.12;
const HUB_RADIUS_SHARE = 0.45;
const HUB_PROUD = 0.045;

function drumFor(look: Look, axis: "drumX" | "drumY" | "drumZ"): PartShape {
  return look === "round" ? axis : "box";
}

export function vehicleFrame(cells: readonly Cell[], length: number): VehicleFrame {
  const filled = new Set(cells.map(cellKey));
  const exposed = (col: number, row: number, side: Side): boolean =>
    !filled.has(cellKey({ col: side === "left" ? col - 1 : col + 1, row }));

  const front: VehicleFrame["front"] = (col, row, [u0, v0, u1, v1], paint, look = "flat", proud = DECAL) => ({
    shape: drumFor(look, "drumZ"),
    min: [col + u0, row + v0, 0],
    max: [col + u1, row + v1, proud],
    paint,
  });
  const back: VehicleFrame["back"] = (col, row, [u0, v0, u1, v1], paint, look = "flat", proud = DECAL) => ({
    shape: drumFor(look, "drumZ"),
    min: [col + u0, row + v0, -length - proud],
    max: [col + u1, row + v1, -length],
    paint,
  });
  const side: VehicleFrame["side"] = (col, row, which, [z0, v0, z1, v1], paint, look = "flat", proud = DECAL) => {
    const x = which === "left" ? col : col + 1;
    const out = which === "left" ? -proud : proud;
    return {
      shape: drumFor(look, "drumX"),
      min: [Math.min(x, x + out), row + v0, -z1],
      max: [Math.max(x, x + out), row + v1, -z0],
      paint,
    };
  };
  const top: VehicleFrame["top"] = (col, row, [u0, z0, u1, z1], paint, proud = DECAL) => ({
    shape: "box",
    min: [col + u0, row + 1, -z1],
    max: [col + u1, row + 1 + proud, -z0],
    paint,
  });
  const under: VehicleFrame["under"] = (col, row, [u0, z0, u1, z1], paint, proud = DECAL) => ({
    shape: "box",
    min: [col + u0, row - proud, -z1],
    max: [col + u1, row, -z0],
    paint,
  });

  const wheel: VehicleFrame["wheel"] = (col, which, from, radius = WHEEL_RADIUS) => {
    const outer = which === "left" ? col : col + 1;
    const outward = which === "left" ? -1 : 1;
    const span = (a: number, b: number): [number, number] => [
      Math.min(outer + outward * a, outer + outward * b),
      Math.max(outer + outward * a, outer + outward * b),
    ];
    const [tyreMinX, tyreMaxX] = span(-WHEEL_SUNK, WHEEL_PROUD);
    const [hubMinX, hubMaxX] = span(WHEEL_PROUD, HUB_PROUD);
    const hub = radius * HUB_RADIUS_SHARE;
    return [
      { shape: "drumX", min: [tyreMinX, 0, -from - 2 * radius], max: [tyreMaxX, 2 * radius, -from], paint: "charcoal" },
      {
        shape: "drumX",
        min: [hubMinX, radius - hub, -from - radius - hub],
        max: [hubMaxX, radius + hub, -from - radius + hub],
        paint: "chrome",
      },
    ];
  };

  const wheels: VehicleFrame["wheels"] = (radius = WHEEL_RADIUS) => {
    const inset = Math.min(0.12, (length - 2 * radius) / 2);
    const axles = length <= 1 ? [(length - 2 * radius) / 2] : [inset, length - 2 * radius - inset];
    return cells
      .filter((cell) => cell.row === 0)
      .flatMap((cell) =>
        (["left", "right"] as const)
          .filter((which) => exposed(cell.col, 0, which))
          .flatMap((which) => axles.flatMap((from) => wheel(cell.col, which, from, radius))),
      );
  };

  const tyreFronts: VehicleFrame["tyreFronts"] = () =>
    cells
      .filter((cell) => cell.row === 0)
      .flatMap((cell) => [
        ...(exposed(cell.col, 0, "left") ? [front(cell.col, 0, [0.04, 0, 0.26, 0.2], "charcoal")] : []),
        ...(exposed(cell.col, 0, "right") ? [front(cell.col, 0, [0.74, 0, 0.96, 0.2], "charcoal")] : []),
      ]);

  return { cells, length, front, back, side, top, under, exposed, wheel, wheels, tyreFronts };
}

// Evenly spaced stripes across a face rectangle, `count` of them alternating
// between two paints, running left to right.
export function stripesAcross(rect: FaceRect, count: number): FaceRect[] {
  const [u0, v0, u1, v1] = rect;
  const step = (u1 - u0) / count;
  return Array.from({ length: count }, (_, i): FaceRect => [u0 + i * step, v0, u0 + (i + 1) * step, v1]);
}

// Windows along a side, one per unit of length, each inset from its ends.
export function windowsAlong(length: number, v0: number, v1: number, gap = 0.12): SideRect[] {
  return Array.from({ length: Math.round(length) }, (_, i): SideRect => [i + gap, v0, i + 1 - gap, v1]);
}

export interface VehicleDesign {
  name: string;
  archetype: string;
  // One line on what it is, for the garage and the docs.
  blurb: string;
  // How far it stretches along the road, in cells.
  length: number;
  // Each body cell's paint. Colour blocking by cell helps the cells count.
  body: (cell: Cell) => Paint;
  details: (frame: VehicleFrame) => Part[];
}

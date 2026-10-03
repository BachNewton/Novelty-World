import { GROUND_CLEARANCE } from "../clearance";
import { CAMERA_NEAR } from "../components/camera-fit";
import { cellKey } from "../logic";
import { TUNING } from "../tuning";
import type { Cell } from "../types";

// A vehicle is built in its own frame: x runs across the lanes and y up the
// rows, so the cell at (col, row) fills x from col to col + 1 and y from row
// to row + 1. Its front face is at z = 0 and it stretches back to z = -length.
// Every body cell is a solid box through the whole length, so the front
// silhouette is the same all along the vehicle, but for its two outer sides,
// on the lane lines either side of it, which stand a hair inside the lines
// (see SIDE_INSET). Everything else is a part:
// a small box or disc on the body's surface. The vehicle rides the ground
// clearance above the road, at y = -GROUND_CLEARANCE in this frame, and only
// its wheels reach down through that gap to the road.

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
  // Whether it is part of a wheel, the one thing allowed in the ground
  // clearance under the vehicle.
  wheel?: boolean;
}

// Anything that stands proud of an outer face (sideways or upward) must stay
// within the surface detail tolerance, so it never reads as part of the
// silhouette.
export const SURFACE_TOLERANCE = 0.05;
// How far apart two faces that look the same way must be for the depth
// buffer to tell which is in front, wherever the traffic is drawn. A 24-bit
// depth buffer resolves about d² / (near × 2²⁴) at distance d, and traffic is
// drawn at most the traffic horizon away, where it reappears beyond the fog:
// with the gameplay camera's near plane, a little under 0.02.
const DEPTH_BITS = 24;
export const DEPTH_RESOLUTION = TUNING.trafficHorizon ** 2 / (CAMERA_NEAR * 2 ** DEPTH_BITS);
// Paint lies on a face in layers, each a layer thick: a decal is one layer,
// a second decal laid over it two, and so on. A layer is thicker than the
// depth resolution, and two layers stay within the surface tolerance.
// Different paints never share a layer where they overlap: a smaller detail
// laid over a decal sits a layer up and inset from its edges, and stripes of
// two paints lie side by side in one layer rather than one over the other.
export const LAYER = 0.02;
export const layers = (count: number): number => count * LAYER;
export const DECAL = layers(1);
export const OVERLAY = layers(2);
// A vehicle's outer sides, on the lane lines either side of it, stand this
// far inside the lines, and nothing on them stands prouder: its details,
// wheels included, reach the lane line at most and never cross it. So two
// vehicles side by side share no space, and none of the one's faces lies in
// a plane of the other's, however each rumbles; nor do the frog or a gate's
// post beside it. Two layers, as a wheel's hub and an overlay stand proud.
export const SIDE_INSET = layers(2);

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
  // The solid box a body cell fills: the cell the whole length, its outer
  // sides inset from the lane lines.
  bodyBox: (cell: Cell) => { min: Vec3; max: Vec3 };
  front: (col: number, row: number, rect: FaceRect, paint: Paint, look?: Look, proud?: number) => Part;
  back: (col: number, row: number, rect: FaceRect, paint: Paint, look?: Look, proud?: number) => Part;
  side: (col: number, row: number, side: Side, rect: SideRect, paint: Paint, look?: Look, proud?: number) => Part;
  top: (col: number, row: number, rect: FlatRect, paint: Paint, proud?: number) => Part;
  under: (col: number, row: number, rect: FlatRect, paint: Paint, proud?: number) => Part;
  // Whether the cell at (col, row) has no neighbour on that side, so its
  // face there is on the outside.
  exposed: (col: number, row: number, side: Side) => boolean;
  // A wheel sunk into the side of a road cell, standing just proud of it and
  // reaching down through the ground clearance to the road.
  wheel: (col: number, side: Side, from: number, radius?: number) => Part[];
  // Wheels on every outer side of every road cell, one pair of axles near
  // the ends (one axle for a vehicle a cell long).
  wheels: (radius?: number) => Part[];
}

export const WHEEL_RADIUS = 0.27;
// The tyre stands a layer proud of the body, and the hub a layer prouder.
const WHEEL_PROUD = layers(1);
const WHEEL_SUNK = 0.12;
const HUB_RADIUS_SHARE = 0.45;
const HUB_PROUD = layers(2);

function drumFor(look: Look, axis: "drumX" | "drumY" | "drumZ"): PartShape {
  return look === "round" ? axis : "box";
}

export function vehicleFrame(cells: readonly Cell[], length: number): VehicleFrame {
  const filled = new Set(cells.map(cellKey));
  const exposed = (col: number, row: number, side: Side): boolean =>
    !filled.has(cellKey({ col: side === "left" ? col - 1 : col + 1, row }));
  const lastCol = Math.max(...cells.map((cell) => cell.col));
  // Where a cell's body face is on that side, across the lanes.
  const faceX = (col: number, which: Side): number =>
    which === "left" ? col + (col === 0 ? SIDE_INSET : 0) : col + 1 - (col === lastCol ? SIDE_INSET : 0);
  // A rectangle's u, 0 to 1 across a cell's face, as x.
  const across = (col: number, u: number): number => faceX(col, "left") + u * (faceX(col, "right") - faceX(col, "left"));

  const bodyBox: VehicleFrame["bodyBox"] = ({ col, row }) => ({
    min: [faceX(col, "left"), row, -length],
    max: [faceX(col, "right"), row + 1, 0],
  });
  const front: VehicleFrame["front"] = (col, row, [u0, v0, u1, v1], paint, look = "flat", proud = DECAL) => ({
    shape: drumFor(look, "drumZ"),
    min: [across(col, u0), row + v0, 0],
    max: [across(col, u1), row + v1, proud],
    paint,
  });
  const back: VehicleFrame["back"] = (col, row, [u0, v0, u1, v1], paint, look = "flat", proud = DECAL) => ({
    shape: drumFor(look, "drumZ"),
    min: [across(col, u0), row + v0, -length - proud],
    max: [across(col, u1), row + v1, -length],
    paint,
  });
  const side: VehicleFrame["side"] = (col, row, which, [z0, v0, z1, v1], paint, look = "flat", proud = DECAL) => {
    const x = faceX(col, which);
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
    min: [across(col, u0), row + 1, -z1],
    max: [across(col, u1), row + 1 + proud, -z0],
    paint,
  });
  const under: VehicleFrame["under"] = (col, row, [u0, z0, u1, z1], paint, proud = DECAL) => ({
    shape: "box",
    min: [across(col, u0), row - proud, -z1],
    max: [across(col, u1), row, -z0],
    paint,
  });

  const wheel: VehicleFrame["wheel"] = (col, which, from, radius = WHEEL_RADIUS) => {
    const outer = faceX(col, which);
    const outward = which === "left" ? -1 : 1;
    const span = (a: number, b: number): [number, number] => [
      Math.min(outer + outward * a, outer + outward * b),
      Math.max(outer + outward * a, outer + outward * b),
    ];
    const [tyreMinX, tyreMaxX] = span(-WHEEL_SUNK, WHEEL_PROUD);
    const [hubMinX, hubMaxX] = span(WHEEL_PROUD, HUB_PROUD);
    const hub = radius * HUB_RADIUS_SHARE;
    const axle = radius - GROUND_CLEARANCE;
    return [
      {
        shape: "drumX",
        min: [tyreMinX, -GROUND_CLEARANCE, -from - 2 * radius],
        max: [tyreMaxX, axle + radius, -from],
        paint: "charcoal",
        wheel: true,
      },
      {
        shape: "drumX",
        min: [hubMinX, axle - hub, -from - radius - hub],
        max: [hubMaxX, axle + hub, -from - radius + hub],
        paint: "chrome",
        wheel: true,
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

  return { cells, length, bodyBox, front, back, side, top, under, exposed, wheel, wheels };
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
  // Each body cell's paint. Colour blocking by cell helps the cells count.
  body: (cell: Cell) => Paint;
  details: (frame: VehicleFrame) => Part[];
}

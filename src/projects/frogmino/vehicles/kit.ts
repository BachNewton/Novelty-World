import { OVERLAY, type FaceRect, type Paint, type Part, type Side, type VehicleFrame } from "./parts";

// Details many vehicles share, so their faces speak one visual language:
// the same headlights, bumpers and windscreens across the fleet.

export function headlights(f: VehicleFrame, col: number, row: number, paint: Paint = "headlight"): Part[] {
  return [
    f.front(col, row, [0.1, 0.34, 0.3, 0.54], paint, "round"),
    f.front(col, row, [0.7, 0.34, 0.9, 0.54], paint, "round"),
  ];
}

// A single headlight on one side of a cell, for a face shared across cells.
export function headlight(f: VehicleFrame, col: number, row: number, side: Side, paint: Paint = "headlight"): Part {
  return side === "left"
    ? f.front(col, row, [0.1, 0.34, 0.3, 0.54], paint, "round")
    : f.front(col, row, [0.7, 0.34, 0.9, 0.54], paint, "round");
}

export function bumper(f: VehicleFrame, col: number, row: number, paint: Paint = "chrome"): Part {
  return f.front(col, row, [0.06, 0.2, 0.94, 0.29], paint);
}

export function grille(f: VehicleFrame, col: number, row: number, paint: Paint = "charcoal"): Part {
  return f.front(col, row, [0.36, 0.34, 0.64, 0.52], paint);
}

export function windscreen(f: VehicleFrame, col: number, row: number, rect: FaceRect = [0.1, 0.6, 0.9, 0.9]): Part {
  return f.front(col, row, rect, "glass");
}

// A little face of a car: bumper, two headlights and a grille.
export function carNose(f: VehicleFrame, col: number, row: number): Part[] {
  return [bumper(f, col, row), ...headlights(f, col, row), grille(f, col, row)];
}

// A ring: a disc with a smaller disc of another paint laid over it.
export function ring(
  f: VehicleFrame,
  col: number,
  row: number,
  rect: FaceRect,
  outer: Paint,
  inner: Paint,
  hole = 0.5,
): Part[] {
  const [u0, v0, u1, v1] = rect;
  const du = ((u1 - u0) * (1 - hole)) / 2;
  const dv = ((v1 - v0) * (1 - hole)) / 2;
  return [
    f.front(col, row, rect, outer, "round"),
    f.front(col, row, [u0 + du, v0 + dv, u1 - du, v1 - dv], inner, "round", OVERLAY),
  ];
}

// A porthole on a side: a chrome rim with glass inside.
export function sidePorthole(f: VehicleFrame, col: number, row: number, side: Side, from: number, size = 0.44): Part[] {
  const v0 = 0.5 - size / 2;
  const rim = 0.07;
  return [
    f.side(col, row, side, [from, v0, from + size, v0 + size], "chrome", "round"),
    f.side(col, row, side, [from + rim, v0 + rim, from + size - rim, v0 + size - rim], "glass", "round", OVERLAY),
  ];
}

import { VEHICLE_LENGTHS, vehicleCells, type VehicleId } from "./fleet";
import { cellKey } from "./logic";
import type { Cell, Solid } from "./types";

// One vehicle in a row, its leftmost lane at `lane`.
export interface RowVehicle {
  id: VehicleId;
  lane: number;
}

// A row of traffic: vehicles side by side, their fronts lined up at one
// depth, one per lane span, with empty lanes allowed. Each reaches back its
// own length, so the row's back is wherever its longest vehicle ends.
export type Row = readonly RowVehicle[];

// How many lanes a vehicle takes up.
export function vehicleWidth(id: VehicleId): number {
  return Math.max(...vehicleCells(id).map((c) => c.col)) + 1;
}

// The lanes a placed vehicle takes up.
export function lanesOf(placed: RowVehicle): number[] {
  return Array.from({ length: vehicleWidth(placed.id) }, (_, i) => placed.lane + i);
}

// The road cells a placed vehicle fills.
export function vehicleCellsAt(placed: RowVehicle): Cell[] {
  return vehicleCells(placed.id).map((c) => ({ col: c.col + placed.lane, row: c.row }));
}

// Fails loudly on a broken row: a vehicle outside a road `lanes` wide, or
// two sharing a lane. Everything a row's vehicles don't fill is open, up into
// the air above them.
export function checkRow(row: Row, lanes: number): void {
  const used = new Set<number>();
  for (const placed of row) {
    for (const lane of lanesOf(placed)) {
      if (lane < 0 || lane >= lanes) throw new Error(`${placed.id} at lane ${String(placed.lane)} leaves the road`);
      if (used.has(lane)) throw new Error(`Lane ${String(lane)} holds two vehicles`);
      used.add(lane);
    }
  }
}

// How far a row reaches back along the course from its front: its longest
// vehicle's length.
export function rowLength(solids: readonly Solid[]): number {
  if (solids.length === 0) throw new Error("A row with no vehicles has no length");
  return Math.max(...solids.map((solid) => solid.length));
}

// The row as the rules see it: each vehicle's cells and length.
export function rowSolids(row: Row): Solid[] {
  return row.map((placed) => ({ cells: vehicleCellsAt(placed), length: VEHICLE_LENGTHS[placed.id] }));
}

// Whether cells keep clear of a row's solids: none of them in a vehicle's
// cells.
export function keepsClear(cells: readonly Cell[], solids: readonly Solid[]): boolean {
  const filled = new Set(solids.flatMap((solid) => solid.cells.map(cellKey)));
  return cells.every((cell) => !filled.has(cellKey(cell)));
}

// Where a row's back is along the course, from its front at `depth`: its
// longest vehicle's back.
export function rowBack(row: { depth: number; solids: readonly Solid[] }): number {
  return row.depth + rowLength(row.solids);
}

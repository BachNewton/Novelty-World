import { VEHICLE_LENGTHS, vehicleCells, type VehicleId } from "./fleet";
import { cellKey } from "./logic";
import type { Cell, Gate, Lanes, Opening, PostSolid, Solid, VehicleSolid } from "./types";

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

// How many lanes a gate spans. Every piece has an upright pose this narrow.
export const GATE_WIDTH = 2;

// The lanes a gate spans.
export function gateLanes(gate: Pick<Gate, "lane">): Lanes {
  return { first: gate.lane, last: gate.lane + GATE_WIDTH - 1 };
}

// Whether every cell lies in the gate's lanes.
export function insideGate(cells: readonly Cell[], gate: Pick<Gate, "lane">): boolean {
  const { first, last } = gateLanes(gate);
  return cells.every((cell) => cell.col >= first && cell.col <= last);
}

// The lane lines a gate's posts stand on, either side of its lanes: each the
// line on the left of a lane.
export function gatePostLines(gate: Pick<Gate, "lane">): number[] {
  return [gate.lane, gate.lane + GATE_WIDTH];
}

// Whether cells lie on both sides of the line on the left of lane `line`.
export function acrossLine(cells: readonly Cell[], line: number): boolean {
  return cells.some((cell) => cell.col < line) && cells.some((cell) => cell.col >= line);
}

// Whether cells stand across one of a gate's posts: some in its lanes and
// some outside them.
export function acrossGate(cells: readonly Cell[], gate: Pick<Gate, "lane">): boolean {
  return gatePostLines(gate).some((line) => acrossLine(cells, line));
}

// The row's opening: every cell of the `cols` × `rows` face that none of its
// vehicles fills, its gates' lanes among them. A vehicle outside the road,
// two sharing a lane, or a gate off the road or with a vehicle in its lanes,
// is a broken row, not a row with an odd opening.
export function rowOpening(row: Row, cols: number, rows: number, gates: readonly Gate[] = []): Opening {
  const used = new Set<number>();
  for (const gate of gates) {
    const { first, last } = gateLanes(gate);
    if (first < 0 || last >= cols) throw new Error(`A gate at lane ${String(gate.lane)} leaves the road`);
    for (let lane = first; lane <= last; lane++) {
      if (used.has(lane)) throw new Error(`Two gates share lane ${String(lane)}`);
      used.add(lane);
    }
  }
  const solid = new Set<string>();
  for (const placed of row) {
    for (const lane of lanesOf(placed)) {
      if (lane < 0 || lane >= cols) throw new Error(`${placed.id} at lane ${String(placed.lane)} leaves the road`);
      if (used.has(lane)) throw new Error(`Lane ${String(lane)} holds two vehicles, or a vehicle in a gate`);
      used.add(lane);
    }
    for (const cell of vehicleCellsAt(placed)) {
      if (cell.row >= rows) throw new Error(`${placed.id} is taller than ${String(rows)} rows`);
      solid.add(cellKey(cell));
    }
  }
  const open: Cell[] = [];
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      if (!solid.has(cellKey({ col, row }))) open.push({ col, row });
    }
  }
  return open;
}

// How far a row reaches back along the course from its front: its longest
// vehicle's length.
export function rowLength(solids: readonly Solid[]): number {
  if (solids.length === 0) throw new Error("A row with no vehicles has no length");
  return Math.max(...solids.map((solid) => solid.length));
}

// The row as the rules see it: each vehicle's cells and length, and each of
// its gates' posts, solid for the row's whole length, so for as long as the
// row overlaps the frog.
export function rowSolids(row: Row, gates: readonly Gate[] = []): Solid[] {
  const vehicles: VehicleSolid[] = row.map((placed) => ({ cells: vehicleCellsAt(placed), length: VEHICLE_LENGTHS[placed.id] }));
  if (gates.length === 0) return vehicles;
  const length = rowLength(vehicles);
  const posts: PostSolid[] = gates.flatMap((gate) => gatePostLines(gate).map((post) => ({ post, length })));
  return [...vehicles, ...posts];
}

// Whether a frog moving from the cells `from` to the cells `to` keeps clear
// of a row's solids: none of `to` in a vehicle's cells, and none of either
// across a post, so it neither stands across one nor passes through one. A
// frog that isn't moving across the face goes from its cells to the same.
export function keepsClear(from: readonly Cell[], to: readonly Cell[], solids: readonly Solid[]): boolean {
  const filled = new Set(solids.flatMap((solid) => ("cells" in solid ? solid.cells.map(cellKey) : [])));
  const swept = [...from, ...to];
  return to.every((cell) => !filled.has(cellKey(cell))) && solids.every((solid) => !("post" in solid) || !acrossLine(swept, solid.post));
}

// Where a row's back is along the course, from its front at `depth`: its
// longest vehicle's back.
export function rowBack(row: { depth: number; solids: readonly Solid[] }): number {
  return row.depth + rowLength(row.solids);
}

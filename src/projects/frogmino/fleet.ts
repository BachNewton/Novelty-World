import { cellKey, pieceCells, TETROMINOES } from "./logic";
import type { Cell, Rotation, TetrominoKind } from "./types";

// The traffic is the 19 fixed tetrominoes: every rotation of the seven pieces,
// with rotations that look the same counted once. Each is its own vehicle,
// named by its piece and the first rotation that gives its shape.
export const VEHICLE_IDS = [
  "I0", "I1",
  "O0",
  "S0", "S1",
  "Z0", "Z1",
  "T0", "T1", "T2", "T3",
  "J0", "J1", "J2", "J3",
  "L0", "L1", "L2", "L3",
] as const;

export type VehicleId = (typeof VEHICLE_IDS)[number];

const ROTATIONS: readonly Rotation[] = [0, 1, 2, 3];

export interface FixedTetromino {
  kind: TetrominoKind;
  rotation: Rotation;
  cells: Cell[];
}

// A shape's cells as one comparable string, whatever order they come in.
export function shapeKey(cells: readonly Cell[]): string {
  return cells.map(cellKey).sort().join(";");
}

// Every piece in every rotation, keeping only the first rotation of each
// distinct shape.
export function fixedTetrominoes(): FixedTetromino[] {
  const seen = new Set<string>();
  return (Object.keys(TETROMINOES) as TetrominoKind[]).flatMap((kind) =>
    ROTATIONS.flatMap((rotation) => {
      const cells = pieceCells(kind, rotation);
      const key = shapeKey(cells);
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ kind, rotation, cells }];
    }),
  );
}

export function vehiclePiece(id: VehicleId): { kind: TetrominoKind; rotation: Rotation } {
  return { kind: id[0] as TetrominoKind, rotation: Number(id[1]) as Rotation };
}

// The vehicle's front silhouette on the lane × row grid: lane 0 is its
// leftmost lane as the frog sees it, and its lowest cells rest on row 0.
export function vehicleCells(id: VehicleId): Cell[] {
  const { kind, rotation } = vehiclePiece(id);
  return pieceCells(kind, rotation);
}

// How far each vehicle stretches back along the road from its front, in
// cells: its archetype's length, two or three. The rules keep a vehicle solid
// for as long as its length overlaps the frog, and the art is built this long.
export const VEHICLE_LENGTHS: Record<VehicleId, number> = {
  I0: 2, I1: 3,
  O0: 2,
  S0: 3, S1: 3,
  Z0: 2, Z1: 3,
  T0: 2, T1: 2, T2: 2, T3: 2,
  J0: 2, J1: 3, J2: 2, J3: 2,
  L0: 3, L1: 2, L2: 3, L3: 2,
};

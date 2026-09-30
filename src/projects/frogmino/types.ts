// A square on the wall face, seen from behind the frog: `col` runs left to
// right across the corridor, `row` counts up from the floor.
export interface Cell {
  col: number;
  row: number;
}

export type TetrominoKind = "I" | "O" | "T" | "S" | "Z" | "J" | "L";

// Quarter turns clockwise, as the player sees the frog from behind.
export type Rotation = 0 | 1 | 2 | 3;

// A hop lifts the frog exactly one cell.
export type HopHeight = 0 | 1;

export interface Frog {
  kind: TetrominoKind;
  // The column of the frog's leftmost cell.
  col: number;
  rotation: Rotation;
  hop: HopHeight;
}

// The cells of one hole in a wall.
export type Opening = readonly Cell[];

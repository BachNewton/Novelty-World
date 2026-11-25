import { building } from "./buildings";
import type { TownPiece } from "./fantasy-town";

/**
 * One kit piece placed on the world's grid. The kit's pieces each fill one
 * unit cell, centred on their origin, with a wall along the cell's +x edge,
 * so a piece is placed by its cell and a number of quarter turns.
 */
export interface Placement {
  piece: TownPiece;
  /** The cell, by the grid's unit lines: cell (0, 0) spans 0 to 1 on x and z. */
  x: number;
  z: number;
  /** Storeys up, a unit each. */
  y?: number;
  /** Quarter turns anticlockwise seen from above: 1 puts a +x wall on the cell's −z edge. */
  turn?: number;
}

/** The trees standing about the grid, clear of where the player starts and of the house. */
export const TREES: readonly Placement[] = [
  { piece: "tree-high", x: -5, z: -4 },
  { piece: "tree", x: -7, z: 0, turn: 1 },
  { piece: "tree-crooked", x: -4, z: 5, turn: 2 },
  { piece: "tree-high-round", x: 6, z: 3 },
  { piece: "tree", x: 8, z: -1, turn: 3 },
  { piece: "tree-high-crooked", x: -9, z: -7, turn: 1 },
  { piece: "tree-high", x: 0, z: -9 },
  { piece: "tree", x: 9, z: 7, turn: 2 },
  { piece: "tree-high-round", x: -7, z: 8 },
  { piece: "tree-crooked", x: 5, z: -9, turn: 3 },
  { piece: "tree-high", x: -11, z: 2, turn: 2 },
  { piece: "tree-high", x: 11, z: -6, turn: 1 },
  { piece: "tree-high-round", x: -2, z: -11 },
  { piece: "tree", x: 2, z: 10, turn: 1 },
];

/** A small stone cottage north-east of where the player starts, its door facing them. */
export const HOUSE: readonly Placement[] = building({
  x: 2,
  z: -5,
  width: 2,
  depth: 3,
  walls: {
    front: ["door", "window-shutters"],
    left: ["plain", "window-shutters", "plain"],
    right: ["plain", "window-shutters", "plain"],
  },
});

import { building } from "./buildings";
import type { TownPiece } from "./fantasy-town";

/**
 * One kit piece placed on the world's grid. The kit's pieces each fill one
 * unit cell, centred on their origin, with a wall along the cell's +x edge,
 * so a piece is placed by its cell and a number of quarter turns.
 */
export interface Placement {
  piece: TownPiece;
  /** The cell, by the grid's unit lines: cell (0, 0) spans 0 to 1 on x and z. A fraction moves the piece off its cell's middle by that much. */
  x: number;
  z: number;
  /** Storeys up, a unit each; a fraction for a piece that hangs between them. */
  y?: number;
  /** Quarter turns anticlockwise seen from above: 1 puts a +x wall on the cell's −z edge. */
  turn?: number;
}

/** The trees standing about the grid, clear of where the player starts and of the village. */
export const TREES: readonly Placement[] = [
  { piece: "tree-high", x: -9, z: -9 },
  { piece: "tree", x: -11, z: -3, turn: 1 },
  { piece: "tree-crooked", x: -9, z: 7, turn: 2 },
  { piece: "tree-high-round", x: 11, z: 4 },
  { piece: "tree", x: 11, z: -4, turn: 3 },
  { piece: "tree-high-crooked", x: -12, z: -10, turn: 1 },
  { piece: "tree-high", x: 5, z: -12 },
  { piece: "tree", x: 9, z: 10, turn: 2 },
  { piece: "tree-high-round", x: -12, z: 9 },
  { piece: "tree-crooked", x: 7, z: -9, turn: 3 },
  { piece: "tree-high", x: -14, z: 2, turn: 2 },
  { piece: "tree-high", x: 14, z: -7, turn: 1 },
  { piece: "tree-high-round", x: -5, z: -14 },
  { piece: "tree", x: 1, z: 12, turn: 1 },
];

/** A small stone cottage north-east of where the player starts, its door facing them. */
const COTTAGE = building({
  x: 2,
  z: -5,
  width: 2,
  depth: 3,
  storeys: [
    {
      walls: {
        front: ["door", "window-shutters"],
        left: ["plain", "window-shutters", "plain"],
        right: ["plain", "window-shutters", "plain"],
      },
    },
  ],
});

/** The inn, north-west: stone below and timber above, with a chimney at its back and a balcony up the side facing the square. */
const INN = building({
  x: -6,
  z: -7,
  width: 2,
  depth: 4,
  storeys: [
    {
      walls: {
        front: ["door", "window-stone"],
        left: ["plain", "window-small", "window-small", "plain"],
        right: ["window-small", "plain", "window-small", "plain"],
      },
    },
    {
      material: "wood",
      walls: {
        front: ["window-glass", "window-glass"],
        back: ["detail-cross", "detail-cross"],
        left: ["window-shutters", "detail-cross", "window-shutters", "detail-cross"],
        right: ["door", "window-glass", "window-shutters", "detail-cross"],
      },
    },
  ],
  fixtures: [
    { piece: "overhang", side: "front", cell: 0 },
    { piece: "banner-red", side: "front", cell: 1, storey: 1 },
  ],
  chimney: { side: "back", cell: 1 },
  balcony: { side: "right", storey: 1, stairs: "right" },
});

/** The windmill, the village's landmark, north of where the player starts: a stone tower with a timber top, its sails turned to the square. */
const WINDMILL_AT = { x: -1, z: -10 };
const WINDMILL: readonly Placement[] = [
  ...building({
    ...WINDMILL_AT,
    width: 2,
    depth: 2,
    storeys: [
      { walls: { front: ["door", "plain"], left: ["window-small", "plain"], right: ["plain", "window-small"] } },
      { walls: { front: ["window-round", "window-round"], back: ["plain", "window-small"] } },
      { material: "wood", walls: { front: ["window-round", "window-round"], left: ["detail-diagonal", "detail-diagonal"], right: ["detail-diagonal", "detail-diagonal"], back: ["detail-cross", "detail-cross"] } },
    ],
    roof: { shape: "hip" },
    fixtures: [{ piece: "overhang", side: "front", cell: 0 }],
  }),
  // The sails' hub, centred across the front a little below the eaves, standing out from the wall.
  { piece: "windmill", x: WINDMILL_AT.x + 0.5, z: WINDMILL_AT.z + 1.74, y: 2.6, turn: 1 },
];

/** The mill house, east of the square, facing it: timber on a stone footing, under a low teal roof, its wheel at the back. */
const MILL_HOUSE_AT = { x: 6, z: -1 };
const MILL_HOUSE: readonly Placement[] = [
  ...building({
    ...MILL_HOUSE_AT,
    width: 2,
    depth: 3,
    facing: 3,
    storeys: [
      {
        walls: {
          front: ["doorway-round", "window-glass"],
          left: ["window-stone", "plain", "window-stone"],
          right: ["plain", "plain", "plain"],
        },
      },
      {
        material: "wood",
        walls: {
          front: ["window-shutters", "window-shutters"],
          left: ["detail-cross", "window-glass", "detail-cross"],
          right: ["detail-cross", "window-glass", "detail-cross"],
          back: ["window-round", "window-round"],
        },
      },
    ],
    roof: { shape: "gable", pitch: "low" },
    fixtures: [{ piece: "banner-green", side: "front", cell: 0, storey: 1 }],
  }),
  // The mill race along its back: water two cells wide, longer than the house, rimmed all round but where the house's wall is its near bank.
  ...[-1, 0].map((z): Placement => ({ piece: "fountain-center", x: MILL_HOUSE_AT.x + 3, z })),
  { piece: "fountain-corner", x: MILL_HOUSE_AT.x + 3, z: -2 },
  { piece: "fountain-corner", x: MILL_HOUSE_AT.x + 3, z: 1, turn: 1 },
  ...[-1, 0].map((z): Placement => ({ piece: "fountain-edge", x: MILL_HOUSE_AT.x + 4, z, turn: 1 })),
  { piece: "fountain-corner", x: MILL_HOUSE_AT.x + 4, z: -2, turn: 3 },
  { piece: "fountain-corner", x: MILL_HOUSE_AT.x + 4, z: 1, turn: 2 },
  // The wheel against the back wall, dipping into the race.
  { piece: "watermill", x: MILL_HOUSE_AT.x + 2.95, z: MILL_HOUSE_AT.z + 0.5, y: 0.7 },
];

/** The smithy, south-west of the square: one stone room under a low roof, its forge's chimney at the back, and a fenced yard beside it. */
const SMITHY = building({
  x: -6,
  z: 3,
  width: 1,
  depth: 2,
  facing: 1,
  storeys: [{ walls: { front: ["doorway-square"], left: ["plain", "window-stone"], right: ["window-stone", "plain"] } }],
  roof: { shape: "gable", pitch: "low" },
  chimney: { side: "back", cell: 0 },
});

/** The smithy's yard, south of it: a fence round two cells by two, its gate on the way to the square. */
const YARD: readonly Placement[] = [
  { piece: "fence", x: -6, z: 6, turn: 3 },
  { piece: "fence", x: -5, z: 6, turn: 3 },
  { piece: "fence", x: -6, z: 5, turn: 2 },
  { piece: "fence", x: -6, z: 6, turn: 2 },
  { piece: "fence-gate", x: -5, z: 5, turn: 0 },
  { piece: "fence", x: -5, z: 6, turn: 0 },
  { piece: "fence", x: -6, z: 5, turn: 1 },
  { piece: "fence", x: -5, z: 5, turn: 1 },
  { piece: "cart-high", x: -6, z: 5, turn: 1 },
];

/** A lookout south-east of the square: two storeys of stone and a timber top under a pointed roof. */
const LOOKOUT = building({
  x: 5,
  z: 5,
  width: 1,
  depth: 1,
  facing: 2,
  storeys: [
    { walls: { front: ["door"], left: ["window-small"], right: ["window-small"], back: ["window-small"] } },
    { walls: { front: ["window-round"], left: ["plain"], right: ["plain"], back: ["window-round"] } },
    { material: "wood", walls: { front: ["window-shutters"], left: ["window-round"], right: ["window-round"], back: ["window-round"] } },
  ],
  roof: { shape: "point" },
  fixtures: [{ piece: "banner-green", side: "left", cell: 0, storey: 1 }, { piece: "banner-green", side: "right", cell: 0, storey: 1 }],
});

/** The square's furniture: market stalls with their benches, lanterns along the ways in, and a hedge before the lookout. */
const SQUARE: readonly Placement[] = [
  { piece: "stall-red", x: -2, z: 2, turn: 1 },
  { piece: "stall-bench", x: -3, z: 2, turn: 0 },
  { piece: "stall-green", x: 2, z: 2, turn: 3 },
  { piece: "stall-stool", x: 3, z: 2 },
  { piece: "lantern", x: -2, z: -2 },
  { piece: "lantern", x: 1, z: -2 },
  { piece: "lantern", x: 2, z: 4 },
  { piece: "lantern", x: -3, z: 4 },
  ...[3, 4, 6, 7].map((x): Placement => ({ piece: "hedge", x, z: 4, turn: 1 })),
  { piece: "cart", x: 5, z: -4, turn: 2 },
];

/** The buildings, round the square where the player starts. */
export const BUILDINGS: readonly Placement[] = [...COTTAGE, ...INN, ...WINDMILL, ...MILL_HOUSE, ...SMITHY, ...YARD, ...LOOKOUT, ...SQUARE];

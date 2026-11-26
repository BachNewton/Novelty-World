import { building, winged } from "./buildings";
import type { Cell } from "./ground";
import type { KitPiece } from "./kit";

/**
 * One kit piece placed on the world's grid. The kits' pieces each fill one
 * unit cell, centred on their origin (a town wall along the cell's +x edge),
 * so a piece is placed by its cell and a number of quarter turns.
 */
export interface Placement {
  piece: KitPiece;
  /** The cell, by the grid's unit lines: cell (0, 0) spans 0 to 1 on x and z. A fraction moves the piece off its cell's middle by that much. */
  x: number;
  z: number;
  /** Storeys up, a unit each; a fraction for a piece that hangs between them. */
  y?: number;
  /** Quarter turns anticlockwise seen from above: 1 puts a +x wall on the cell's −z edge. */
  turn?: number;
  /**
   * Mirrored across the piece's own z before it is turned, which keeps a wall's
   * outside where it was: the kit makes some pieces in one hand only, such as
   * half of an arch, and the other hand is its mirror.
   */
  mirror?: boolean;
}

/** The trees standing about the grid, clear of where the player starts and of the village. */
export const TREES: readonly Placement[] = [
  { piece: "tree-high", x: -9, z: -9 },
  { piece: "tree", x: -15, z: -10, turn: 1 },
  { piece: "tree-crooked", x: -7, z: 14, turn: 2 },
  { piece: "tree-high-round", x: 11, z: 5 },
  { piece: "tree", x: 11, z: -4, turn: 3 },
  { piece: "tree-high-crooked", x: -12, z: -10, turn: 1 },
  { piece: "tree-high", x: 4, z: -10 },
  { piece: "tree", x: 15, z: 12, turn: 2 },
  { piece: "tree-high-round", x: -6, z: 16 },
  { piece: "tree-crooked", x: 7, z: -9, turn: 3 },
  { piece: "tree-high", x: -14, z: 2, turn: 2 },
  { piece: "tree-high", x: 14, z: -7, turn: 1 },
  { piece: "tree-high-round", x: -3, z: -18 },
  { piece: "tree", x: 4, z: 15, turn: 1 },
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
        front: ["window-glass", "plain"],
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
          front: ["plain", "window-shutters"],
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
  ...[1, 2].map((z): Placement => ({ piece: "fountain-edge", x: MILL_HOUSE_AT.x + 3, z, turn: 3 })),
  { piece: "fountain-corner", x: MILL_HOUSE_AT.x + 3, z: 3, turn: 1 },
  ...[-1, 0, 1].map((z): Placement => ({ piece: "fountain-edge", x: MILL_HOUSE_AT.x + 4, z, turn: 1 })),
  { piece: "fountain-corner", x: MILL_HOUSE_AT.x + 4, z: -2, turn: 3 },
  // Past the mill house the race runs on along the sawmill, whose wall is its far bank there.
  { piece: "fountain-center", x: MILL_HOUSE_AT.x + 4, z: 2 },
  { piece: "fountain-edge", x: MILL_HOUSE_AT.x + 4, z: 3 },
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

/** A cell's key, for replacing what a run of placements puts there. */
const cellOf = (p: { x: number; z: number }): string => `${Math.round(p.x)},${Math.round(p.z)}`;

/** Placements with some cells' pieces swapped for others: a curb broken where a way in meets it. */
function except(base: readonly Placement[], changes: readonly Placement[]): Placement[] {
  const changed = new Set(changes.map(cellOf));
  return [...base.filter((p) => !changed.has(cellOf(p))), ...changes];
}

/**
 * Paving over a rectangle of cells, from its −x, −z corner cell to its +x, +z
 * one, its rim curbed: the kit's road with a raised curb along the rim's outer
 * half, and the curb turning each corner. A road piece is a hair above the
 * ground, so what stands on it stands at `ON_ROAD`.
 */
function paved(x0: number, z0: number, x1: number, z1: number, y = 0): Placement[] {
  const placed: Placement[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      const [w, e, n, s] = [x === x0, x === x1, z === z0, z === z1];
      // The road's edge is curbed along its own +x; the inner corner along its +x and −z.
      if (n && e) placed.push({ piece: "road-corner-inner", x, z, y, turn: 0 });
      else if (n && w) placed.push({ piece: "road-corner-inner", x, z, y, turn: 1 });
      else if (s && w) placed.push({ piece: "road-corner-inner", x, z, y, turn: 2 });
      else if (s && e) placed.push({ piece: "road-corner-inner", x, z, y, turn: 3 });
      else if (e || n || w || s) placed.push({ piece: "road-edge", x, z, y, turn: e ? 0 : n ? 1 : w ? 2 : 3 });
      else placed.push({ piece: "road", x, z, y });
    }
  }
  return placed;
}

/** The top of the kit's road, where what stands on the paving stands. */
const ON_ROAD = 0.025;

/**
 * The plaza south of the square: paving curbed round its rim, a street in from
 * the square to the north, a way out west to the garden and a street east, a
 * fountain in the middle and lanterns at its corners. To the south, past an
 * open stretch of curb, steps climb to the town hall's plinth.
 */
const PLAZA: readonly Placement[] = [
  ...except(paved(-6, 7, 6, 11), [
    // The street from the square, its curbs turning out along the plaza's own.
    { piece: "road-corner", x: -1, z: 7, turn: 1 },
    { piece: "road", x: 0, z: 7 },
    { piece: "road-corner", x: 1, z: 7, turn: 0 },
    // The way west to the garden, a gap in the curb, which ends round each side of it.
    { piece: "road-curb-end", x: -6, z: 8, turn: 2, mirror: true },
    { piece: "road", x: -6, z: 9 },
    { piece: "road-curb-end", x: -6, z: 10, turn: 2 },
    // The street east.
    { piece: "road-corner", x: 6, z: 8, turn: 0 },
    { piece: "road", x: 6, z: 9 },
    { piece: "road-corner", x: 6, z: 10, turn: 3 },
    // Open to the hall's steps.
    { piece: "road-curb-end", x: -2, z: 11, turn: 3, mirror: true },
    ...[-1, 0, 1].map((x): Placement => ({ piece: "road", x, z: 11 })),
    { piece: "road-curb-end", x: 2, z: 11, turn: 3 },
  ]),
  // The street in from the square, its curbs ending where the dirt track from the square meets it.
  { piece: "road-curb-end", x: -1, z: 5, turn: 2 },
  { piece: "road", x: 0, z: 5 },
  { piece: "road-curb-end", x: 1, z: 5, mirror: true },
  { piece: "road-edge", x: -1, z: 6, turn: 2 },
  { piece: "road", x: 0, z: 6 },
  { piece: "road-edge", x: 1, z: 6, turn: 0 },
  // The fountain, centred on the plaza.
  { piece: "fountain-round-detail", x: 0, z: 9, y: ON_ROAD },
  ...[
    [-6, 7],
    [6, 7],
    [-6, 11],
    [6, 11],
  ].map(([x, z]): Placement => ({ piece: "lantern", x, z, y: 0.05 })),
];

/**
 * The street east from the plaza: along to a bend, south, and up a ramp onto a
 * raised terrace before the guildhall. The terrace is paved on a bed of the
 * kit's half blocks, sunk so their tops stand level with the ramp's head.
 */
const TERRACE_Y = 0.2;
const EAST_STREET: readonly Placement[] = [
  ...[7, 8, 9].flatMap((x): Placement[] => [
    { piece: "road-edge", x, z: 8, turn: 1 },
    { piece: "road", x, z: 9 },
    { piece: "road-edge", x, z: 10, turn: 3 },
  ]),
  // The bend fills three cells by three about its middle: made from −z round to +x, it is mirrored to turn from the west to the south.
  { piece: "road-bend", x: 11, z: 9, turn: 3, mirror: true },
  { piece: "road-edge", x: 10, z: 11, turn: 2 },
  { piece: "road", x: 11, z: 11 },
  { piece: "road-edge", x: 12, z: 11, turn: 0 },
  // The ramp, rising south to the terrace: its curbs slope with it.
  { piece: "road-edge-slope", x: 10, z: 12, turn: 2, mirror: true },
  { piece: "road-slope", x: 11, z: 12 },
  { piece: "road-edge-slope", x: 12, z: 12 },
  // The terrace: its bed, the road on from the ramp, and a raised walk round the guildhall.
  ...[9, 10, 11, 12, 13].flatMap((x) => [13, 14, 15, 16].map((z): Placement => ({ piece: "wall-block-half", x, z, y: TERRACE_Y - 0.5 }))),
  { piece: "road-edge", x: 10, z: 13, y: TERRACE_Y, turn: 2 },
  { piece: "road", x: 11, z: 13, y: TERRACE_Y },
  { piece: "road-edge", x: 12, z: 13, y: TERRACE_Y, turn: 0 },
  ...[13, 14, 15, 16].flatMap((z) => [9, 13].map((x): Placement => ({ piece: "road-curb", x, z, y: TERRACE_Y }))),
];

/** The town hall, south of the plaza on a stone plinth, stone below and timber above, under a broad high roof with a window in each side. */
const HALL_BASE = 0.5;
const HALL: readonly Placement[] = [
  ...building({
    x: -1,
    z: 14,
    width: 3,
    depth: 3,
    facing: 2,
    base: HALL_BASE,
    storeys: [
      { corners: "square", walls: { front: ["plain", "door", "plain"], left: ["plain", "window-glass", "plain"], right: ["plain", "window-glass", "plain"], back: ["plain", "detail-horizontal", "plain"] } },
      {
        material: "wood",
        corners: "square",
        walls: { front: ["plain", "window-stone", "plain"], left: ["plain", "window-small", "plain"], right: ["plain", "window-small", "plain"], back: ["plain", "detail-horizontal", "plain"] },
      },
    ],
    roof: { shape: "gable", dormers: [{ side: "left", cell: 1 }, { side: "right", cell: 1 }] },
    fixtures: [
      { piece: "banner-red", side: "front", cell: 0 },
      { piece: "banner-red", side: "front", cell: 2 },
    ],
  }),
  // The plinth under it and a landing before its door, of the kit's half blocks.
  ...[-1, 0, 1].flatMap((x) => [14, 15, 16].map((z): Placement => ({ piece: "wall-block-half", x, z }))),
  { piece: "wall-block-half", x: 0, z: 13 },
  // Steps round the landing: straight up its front, an outer corner at each front corner, and an inner corner each side where they meet the plinth.
  { piece: "stairs-full", x: 0, z: 12, turn: 3 },
  { piece: "stairs-full-corner-outer", x: -1, z: 12, turn: 0 },
  { piece: "stairs-full-corner-outer", x: 1, z: 12, turn: 3 },
  { piece: "stairs-full-corner-inner", x: -1, z: 13, turn: 0 },
  { piece: "stairs-full-corner-inner", x: 1, z: 13, turn: 3 },
];

/** The guildhall on the terrace: chamfered corners, stone and timber, under a hipped roof with a flat top. */
const GUILDHALL = building({
  x: 10,
  z: 14,
  width: 3,
  depth: 3,
  facing: 2,
  base: TERRACE_Y,
  storeys: [
    { corners: "diagonal", walls: { front: ["plain", "door", "plain"], left: ["plain", "detail-diagonal", "plain"], right: ["plain", "detail-diagonal", "plain"], back: ["plain", "detail-cross", "plain"] } },
    { material: "wood", corners: "diagonal", walls: { front: ["plain", "window-glass", "plain"], left: ["plain", "window-round", "plain"], right: ["plain", "window-round", "plain"], back: ["plain", "window-round", "plain"] } },
  ],
  roof: { shape: "hip" },
});

/**
 * The old town wall on the village's west edge: a rampart of solid blocks with
 * a walk along its top behind a parapet, stone but for a stretch mended in
 * timber, a gate through it under arches, a round tower at its north end, and
 * stairs of every kind the kit has up to the walk. At its south end it has
 * crumbled to half its height.
 */
const WALL_X = -18;
const OUTSIDE = WALL_X - 0.9;
const INSIDE = WALL_X + 0.9;
const GATE = [-1, 0];
const TIMBER = [-6, -5, -4];
const TOWN_WALL: readonly Placement[] = [
  ...Array.from({ length: 15 }, (_, i) => i - 12)
    .filter((z) => !GATE.includes(z))
    .map((z): Placement => ({ piece: TIMBER.includes(z) ? "wall-wood-block" : "wall-block", x: WALL_X, z })),
  { piece: "wall-block-half", x: WALL_X, z: 3 },
  // The parapet along the walk's outer edge, merlons between gaps, over the gate too; one merlon broken, and its end sloping down to the crumbled stretch.
  ...Array.from({ length: 14 }, (_, i) => i - 12).map((z): Placement => {
    const merlon = z % 2 === 0;
    const piece = z === -10 ? "wall-broken" : TIMBER.includes(z) ? (merlon ? "wall-wood" : "wall-wood-half") : merlon ? "wall" : "wall-half";
    return { piece, x: OUTSIDE, z, y: 1 };
  }),
  // Made high at its +z end, the slope is mirrored to stand high toward the rest of the wall.
  { piece: "wall-slope", x: OUTSIDE, z: 2, y: 1, mirror: true },
  { piece: "wall-side", x: OUTSIDE, z: 3, y: 0.5, mirror: true },
  // The gate: an arch two cells wide on each face, its halves the kit's piece and its mirror, the carved one outside; the walk bridges it on planks.
  { piece: "wall-arch-top-detail", x: OUTSIDE, z: -1, mirror: true },
  { piece: "wall-arch-top-detail", x: OUTSIDE, z: 0 },
  { piece: "wall-arch-top", x: INSIDE, z: -1, turn: 2 },
  { piece: "wall-arch-top", x: INSIDE, z: 0, turn: 2, mirror: true },
  ...GATE.map((z): Placement => ({ piece: "planks", x: WALL_X, z, y: 1 })),
  // Stairs up the inside to the walk, each rising west onto it: a spiral by the tower, a broad flight with and without its rail, timber up the timber stretch, a narrow flight, one turning a corner, and one more by the crumbled end.
  { piece: "stairs-stone-round", x: WALL_X + 1, z: -11, turn: 2 },
  { piece: "stairs-wide-stone", x: WALL_X + 1, z: -9, turn: 2 },
  { piece: "stairs-wide-stone-handrail", x: WALL_X + 1, z: -8, turn: 2 },
  { piece: "stairs-wide-wood-handrail", x: WALL_X + 1, z: -5, turn: 2 },
  { piece: "stairs-stone", x: WALL_X + 1, z: -3, turn: 2 },
  { piece: "stairs-stone-corner", x: WALL_X + 1, z: -2, turn: 2 },
  { piece: "stairs-stone-handrail", x: WALL_X + 1, z: 2, turn: 2 },
  { piece: "rock-large", x: WALL_X, z: 4, turn: 1 },
  // The round tower at the north end: two storeys of stone and a timber top, every corner curved, under a round high roof.
  ...building({
    x: WALL_X,
    z: -14,
    width: 2,
    depth: 2,
    storeys: [{ corners: "curved" }, { corners: "curved" }, { material: "wood", corners: "curved" }],
    roof: { shape: "hip" },
  }),
];

/** The gatekeeper's hut inside the gate, by the street: one stone cell under a low pointed roof. */
const GATEHOUSE = building({ x: WALL_X + 2, z: 1, width: 1, depth: 1, facing: 2, storeys: [{ walls: { front: ["door"], left: ["window-small"] } }], roof: { shape: "point", pitch: "low" } });

/** Ruins north of the street, inside the wall: a stone cottage and a timber house fallen to their walls, rocks and a broken fence between them. */
const RUINS: readonly Placement[] = [
  ...building({
    x: -16,
    z: -7,
    width: 3,
    depth: 2,
    storeys: [{ walls: { front: ["broken", "doorway-base", "half"], back: ["half", "slope", "broken"], left: ["arch", "side"], right: ["half", "broken"] } }],
    roof: "none",
  }),
  ...building({
    x: -12,
    z: -7,
    width: 2,
    depth: 2,
    storeys: [{ material: "wood", walls: { front: ["doorway-base", "broken"], back: ["slope", "half"], left: ["side", "arch"], right: ["half", "broken"] } }],
    roof: "none",
  }),
  { piece: "rock-small", x: -15, z: -6, turn: 2 },
  { piece: "rock-wide", x: -13, z: -4, turn: 1 },
  { piece: "fence", x: -12, z: -5, turn: 3 },
  { piece: "fence-broken", x: -11, z: -5, turn: 3 },
];

/** The coach house west of the inn: stone, a wide carriage door at the front and another down its side. */
const COACH_HOUSE = building({
  x: -9,
  z: -7,
  width: 2,
  depth: 2,
  storeys: [{ walls: { front: ["doorway-square-wide-curved", "doorway-square-wide-curved"], left: ["doorway-square-wide", "doorway-square-wide"], right: ["window-small", "plain"] } }],
  roof: { shape: "gable", pitch: "low" },
});

/**
 * The garden west of the plaza: a tall hedge round it with a gate toward the
 * plaza, a square fountain in a ring of low hedge at its middle, a pond north
 * and south of it, each a basin built from its rim's pieces with a corner cut
 * out (the north one squared, the south one rounded), a shrine, and an open
 * pavilion on stone pillars.
 */
const GARDEN_RIM = { x0: -17, z0: 3, x1: -9, z1: 16 };

/** A ring of hedge along a rectangle's rim, each piece along its cell's outer edge, rounded at the corners, with gates. */
function hedgeRing(x0: number, z0: number, x1: number, z1: number, large: boolean, gates: readonly string[]): Placement[] {
  const [straight, curved, gate] = large ? (["hedge-large", "hedge-large-curved", "hedge-large-gate"] as const) : (["hedge", "hedge-curved", "hedge-gate"] as const);
  const placed: Placement[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      const [w, e, n, s] = [x === x0, x === x1, z === z0, z === z1];
      // A hedge stands along its own +x; the curved one turns from its −z edge round to its +x edge.
      if (n && e) placed.push({ piece: curved, x, z, turn: 0 });
      else if (n && w) placed.push({ piece: curved, x, z, turn: 1 });
      else if (s && w) placed.push({ piece: curved, x, z, turn: 2 });
      else if (s && e) placed.push({ piece: curved, x, z, turn: 3 });
      else if (e || n || w || s) placed.push({ piece: gates.includes(`${x},${z}`) ? gate : straight, x, z, turn: e ? 0 : n ? 1 : w ? 2 : 3 });
    }
  }
  return placed;
}

/**
 * A basin four cells by three with its north-east (or, turned over, south-east)
 * corner cut out: the rim's edge pieces along its sides, its outer corners
 * squared or rounded, the water's middle open, and an inner corner piece where
 * the rim turns in at the cut.
 */
function pond(x: number, z: number, rounded: boolean, cutAt: "north" | "south"): Placement[] {
  const corner = rounded ? "fountain-curved" : "fountain-corner";
  const inner = rounded ? "fountain-corner-inner-square" : "fountain-corner-inner";
  // A corner's rim runs along its −z and −x edges; an edge's along its +z; an inner corner's post stands on its −x, −z corner.
  const north = [
    { piece: corner, dx: 0, dz: 0, turn: 0 },
    { piece: "fountain-edge", dx: 1, dz: 0, turn: 2 },
    { piece: corner, dx: 2, dz: 0, turn: 3 },
    { piece: "fountain-edge", dx: 0, dz: 1, turn: 3 },
    { piece: "fountain-center", dx: 1, dz: 1, turn: 0 },
    { piece: inner, dx: 2, dz: 1, turn: 3 },
    { piece: corner, dx: 3, dz: 1, turn: 3 },
    { piece: corner, dx: 0, dz: 2, turn: 1 },
    { piece: "fountain-edge", dx: 1, dz: 2, turn: 0 },
    { piece: "fountain-edge", dx: 2, dz: 2, turn: 0 },
    { piece: corner, dx: 3, dz: 2, turn: 2 },
  ] as const;
  // Cut at the south, the same basin turned over north to south.
  return north.map(({ piece, dx, dz, turn }): Placement => (cutAt === "north" ? { piece, x: x + dx, z: z + dz, turn } : { piece, x: x + dx, z: z + 2 - dz, turn: overturned(piece, turn) }));
}

/** A basin piece's turn once the basin is turned over north to south: whichever of its rims faced north faces south, and the other way round. */
function overturned(piece: string, turn: number): number {
  if (piece === "fountain-center") return turn;
  // An edge's rim lies along its own +z; a corner's, and an inner corner's post, along its −z and −x.
  return piece === "fountain-edge" ? [2, 1, 0, 3][turn] : [1, 0, 3, 2][turn];
}

const GARDEN: readonly Placement[] = [
  ...hedgeRing(GARDEN_RIM.x0, GARDEN_RIM.z0, GARDEN_RIM.x1, GARDEN_RIM.z1, true, [`${GARDEN_RIM.x1},9`]),
  ...hedgeRing(-15, 8, -12, 11, false, ["-12,9"]),
  // The square fountain, two cells by two, on the corner its four cells share.
  { piece: "fountain-square-detail", x: -13.5, z: 9.5 },
  ...pond(-16, 4, false, "north"),
  ...pond(-16, 13, true, "south"),
  // The pavilion: open on every side, a stone pillar at each corner, a low hipped roof, and a bench under it.
  ...building({ x: -11, z: 13, width: 2, depth: 2, storeys: [{ fill: "open", corners: "pillar" }], roof: { shape: "hip", pitch: "low" } }),
  { piece: "stall-bench", x: -10.5, z: 13.5, turn: 1 },
  // A shrine of one stone cell under a high gable, facing the fountain.
  ...building({ x: -11, z: 5, width: 1, depth: 1, facing: 3, storeys: [{ walls: { front: ["doorway-round"] } }], roof: { shape: "gable" } }),
];

/**
 * The farm north of the windmill, along a lane: a timber barn with wide doors
 * front and back and arches down one side, a round granary, a privy, a house
 * going up in a frame of poles with a tool shed, and a paddock fenced round a
 * trough.
 */
const FARM: readonly Placement[] = [
  ...building({
    x: -6,
    z: -16,
    width: 2,
    depth: 3,
    storeys: [
      {
        material: "wood",
        walls: {
          front: ["doorway-square-wide", "doorway-square-wide"],
          back: ["doorway-square-wide-curved", "doorway-square-wide-curved"],
          left: ["arch-top", "arch-top", "doorway-round"],
          right: ["arch-top-detail", "arch-top-detail", "plain"],
        },
      },
      { material: "wood", walls: { front: ["window-small", "window-stone"], back: ["detail-horizontal", "detail-horizontal"], left: ["plain", "doorway-square", "plain"] } },
    ],
    roof: { shape: "gable", pitch: "low", dormers: [{ side: "right", cell: 1 }] },
  }),
  // A loading platform by the barn's back corner.
  { piece: "wall-wood-block-half", x: -4, z: -16 },
  // The granary: one round timber storey under a round low roof.
  ...building({ x: -10, z: -16, width: 2, depth: 2, storeys: [{ material: "wood", corners: "curved" }], roof: { shape: "hip", pitch: "low" } }),
  // The privy: one timber cell under a low gable, boarded at both ends.
  ...building({ x: -12, z: -13, width: 1, depth: 1, storeys: [{ material: "wood", walls: { front: ["door"] } }], roof: { shape: "gable", pitch: "low" } }),
  // The house going up: a frame of poles two storeys high, a plank floor between them with a hatch over a flight of stairs, its last boards still half laid, and a workbench.
  ...building({
    x: 1,
    z: -17,
    width: 2,
    depth: 3,
    storeys: [
      { material: "wood", corners: "pillar", fill: "poles-horizontal", walls: { front: ["poles", "poles"] } },
      { material: "wood", corners: "pillar", fill: "poles" },
    ],
    roof: "none",
  }),
  ...[
    [1, -17],
    [2, -16],
    [1, -15],
    [2, -15],
  ].map(([x, z]): Placement => ({ piece: "planks", x, z, y: 1 })),
  { piece: "planks-opening", x: 1, z: -16, y: 1 },
  { piece: "planks-half", x: 2, z: -17, y: 1, turn: 2 },
  { piece: "stairs-wide-wood", x: 1, z: -16 },
  { piece: "stall", x: 0, z: -15 },
  // The tool shed beside it: one timber cell wide, two deep, under a high roof hipped at both ends.
  ...building({ x: 4, z: -17, width: 1, depth: 2, facing: 3, storeys: [{ material: "wood", walls: { front: ["door"], right: ["window-shutters", "plain"] } }], roof: { shape: "hip" } }),
  // The paddock: a fence round four cells by four, rounded at its corners, a gate toward the lane, one length broken, and a round trough.
  ...fenceRing(6, -17, 9, -14),
  { piece: "fountain-round", x: 7.5, z: -15.5 },
  // A spare sail stood against the windmill's back wall.
  { piece: "blade", x: -1, z: -11 },
];

/** A fence round a rectangle's rim, along each cell's outer edge, curved at the corners, with its gate and a broken length. */
function fenceRing(x0: number, z0: number, x1: number, z1: number): Placement[] {
  const placed: Placement[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      const [w, e, n, s] = [x === x0, x === x1, z === z0, z === z1];
      // The curved fence turns from its −z edge round to its +x edge, as the curved hedge does.
      if (n && e) placed.push({ piece: "fence-curved", x, z, turn: 0 });
      else if (n && w) placed.push({ piece: "fence-curved", x, z, turn: 1 });
      else if (s && w) placed.push({ piece: "fence-curved", x, z, turn: 2 });
      else if (s && e) placed.push({ piece: "fence-curved", x, z, turn: 3 });
      else if (e || n || w || s) {
        const piece = s && x === x0 + 1 ? "fence-gate" : e && z === z0 + 1 ? "fence-broken" : "fence";
        placed.push({ piece, x, z, turn: e ? 0 : n ? 1 : w ? 2 : 3 });
      }
    }
  }
  return placed;
}

/** The sawmill across the mill race: a timber shed open at the front under a loft, whose wide wheel turns in the race, with a woodshed beside it. */
const SAWMILL: readonly Placement[] = [
  ...building({
    x: 11,
    z: 2,
    width: 2,
    depth: 2,
    facing: 1,
    storeys: [
      { material: "wood", walls: { front: ["balcony", "balcony"], left: ["window-stone", "plain"], right: ["plain", "window-stone"] } },
      { material: "wood", walls: { front: ["window-shutters", "plain"], back: ["plain", "window-small"] } },
    ],
    roof: { shape: "gable", pitch: "low" },
  }),
  { piece: "watermill-wide", x: 9.95, z: 2.5, y: 0.7 },
  { piece: "wheel", x: 12, z: 1, turn: 3 },
  ...building({ x: 14, z: 0, width: 1, depth: 2, facing: 2, storeys: [{ material: "wood", walls: { front: ["doorway-square"] } }], roof: { shape: "hip", pitch: "low" } }),
];

/** The shop on the east street: stone below and timber above, rounded at every corner, a loggia over its door, under a low flat-topped roof. */
const SHOP = building({
  x: 7,
  z: 6,
  width: 3,
  depth: 2,
  storeys: [
    { corners: "rounded", walls: { front: ["plain", "door", "plain"] } },
    { material: "wood", corners: "rounded", walls: { front: ["plain", "balcony-fence", "plain"] } },
  ],
  roof: { shape: "flat", pitch: "low" },
});

/** A house east of the bend, its corners bent across their cells, stone and timber, under a broad low gable, with a balcony at its back up stairs with a handrail. */
const BENT_HOUSE = building({
  x: 14,
  z: 6,
  width: 3,
  depth: 3,
  facing: 3,
  storeys: [
    { corners: "edge", walls: { front: ["plain", "door", "plain"], left: ["plain", "window-shutters", "plain"], right: ["plain", "window-shutters", "plain"], back: ["plain", "detail-cross", "plain"] } },
    { material: "wood", corners: "edge", walls: { front: ["plain", "window-glass", "plain"], left: ["plain", "detail-cross", "plain"], right: ["plain", "detail-cross", "plain"], back: ["plain", "door", "plain"] } },
  ],
  roof: { shape: "gable", pitch: "low" },
  balcony: { side: "back", storey: 1, stairs: "left", handrail: true },
});

/** A narrow house beside the terrace, one cell wide, chamfered to a point front and back, under a high gable. */
const NARROW_HOUSE = building({
  x: 8,
  z: 11,
  width: 1,
  depth: 3,
  facing: 2,
  storeys: [
    { corners: "diagonal", walls: { right: ["plain", "door", "plain"], left: ["plain", "window-shutters", "plain"] } },
    { material: "wood", corners: "diagonal", walls: { right: ["plain", "window-shutters", "plain"], left: ["plain", "window-glass", "plain"] } },
  ],
  roof: { shape: "gable" },
});

/** The chapel at the lane's east end: its corners cut away across their cells, so it stands eight-sided, stone and timber, under a low hipped roof with a flat top. */
const CHAPEL = building({
  x: 12,
  z: -13,
  width: 3,
  depth: 3,
  facing: 3,
  storeys: [
    { corners: "cut", walls: { front: ["plain", "door", "plain"], left: ["plain", "window-round", "plain"], right: ["plain", "window-round", "plain"], back: ["plain", "window-round", "plain"] } },
    { material: "wood", corners: "cut", walls: { front: ["plain", "window-round", "plain"], left: ["plain", "detail-diagonal", "plain"], right: ["plain", "detail-diagonal", "plain"], back: ["plain", "detail-diagonal", "plain"] } },
  ],
  roof: { shape: "hip", pitch: "low" },
});

/** The farmhouse, at the lane's west end: an L of timber on stone, its wing reaching west, under a low hipped roof. */
const FARMHOUSE = winged(
  {
    x: -16,
    z: -18,
    width: 2,
    depth: 3,
    storeys: [
      { walls: { front: ["door", "window-shutters"], right: ["window-small", "plain", "window-small"] } },
      { material: "wood", walls: { front: ["window-shutters", "window-shutters"], right: ["detail-cross", "window-glass", "detail-cross"], back: ["detail-cross", "detail-cross"] } },
    ],
    roof: { shape: "hip", pitch: "low" },
    chimney: { side: "back", cell: 0 },
  },
  { length: 2, storeys: [{ walls: { front: ["window-small", "window-small"] } }, { material: "wood", walls: { front: ["window-glass", "window-glass"], back: ["detail-cross", "detail-cross"] } }] },
);

/** The manor, past the chapel: an L of stone two storeys high, its wing reaching west, under a high hipped roof. */
const MANOR = winged(
  {
    x: 13,
    z: -18,
    width: 2,
    depth: 3,
    storeys: [
      { walls: { front: ["door", "window-glass"], right: ["window-glass", "plain", "window-glass"] } },
      { walls: { front: ["window-glass", "window-glass"], right: ["window-round", "plain", "window-round"] } },
    ],
    roof: { shape: "hip" },
    fixtures: [{ piece: "banner-green", side: "right", cell: 1, storey: 1 }],
  },
  { length: 2, storeys: [{ walls: { front: ["window-glass", "window-glass"] } }, { walls: { front: ["window-round", "window-round"] } }] },
);

/** A trough for the coach house's horses, by the way to its door. */
const TROUGH: Placement = { piece: "fountain-square", x: -10.5, z: -2.5 };



/**
 * The village's paths, as dirt tracks from each door to the street through the
 * square, the farm's lane or the paving, each from cell to cell in straight runs.
 */
export const PATHS: readonly (readonly Cell[])[] = [
  // The street, east to west past the square, from the town wall's gate to the mill house's door.
  [[-18, 0], [5, 0]],
  [[-6, -3], [-6, 0]],
  [[-1, -8], [-1, 0]],
  [[2, -2], [2, 0]],
  [[-4, 3], [-4, 0]],
  [[5, 4], [5, 0]],
  [[0, 0], [0, 4]],
  [[-9, -5], [-9, -1]],
  [[-11, 9], [-7, 9]],
  [[-10, 10], [-10, 12]],
  [[-12, 5], [-12, 6], [-10, 6], [-10, 8]],
  [[-14, -12], [11, -12]],
  [[7, -13], [7, -12]],
  [[-14, -15], [-14, -13]],
  [[15, -15], [15, -14], [11, -14], [11, -13]],
  [[-2, -8], [-2, -11]],
  [[-6, -13], [-6, -11]],
  [[1, -14], [1, -11]],
  [[3, -17], [3, -13]],
  [[14, -1], [13, -1], [13, 9]],
  [[7, 12], [7, 11]],
];

/** A few flowers and tufts of grass by the doors and along the street. */
export const PLANTS: readonly Placement[] = [
  { piece: "flower_redA", x: 3.1, z: -2.25 },
  { piece: "flower_redB", x: 3.4, z: -1.9 },
  { piece: "flower_yellowA", x: -4.8, z: -3.3 },
  { piece: "flower_yellowC", x: -4.5, z: -3.05 },
  { piece: "flower_purpleA", x: 0.1, z: -8.25 },
  { piece: "flower_purpleB", x: 0.35, z: -8.05, turn: 1 },
  { piece: "grass", x: -2.2, z: 0.9 },
  { piece: "grass_large", x: 3.6, z: -0.9, turn: 2 },
  { piece: "grass", x: -5.3, z: 1.1, turn: 1 },
];

/** Everything the town kit places: the buildings and what stands round them. */
export const BUILDINGS: readonly Placement[] = [
  ...COTTAGE,
  ...INN,
  ...WINDMILL,
  ...MILL_HOUSE,
  ...SMITHY,
  ...YARD,
  ...LOOKOUT,
  ...SQUARE,
  ...PLAZA,
  ...HALL,
  ...EAST_STREET,
  ...GUILDHALL,
  ...SHOP,
  ...BENT_HOUSE,
  ...NARROW_HOUSE,
  ...GARDEN,
  ...TOWN_WALL,
  ...GATEHOUSE,
  ...RUINS,
  ...COACH_HOUSE,
  TROUGH,
  ...FARM,
  ...FARMHOUSE,
  ...CHAPEL,
  ...MANOR,
  ...SAWMILL,
];

import { cliffPieces, risesTerrain, type Rise } from "./cliffs";
import type { NaturePiece } from "./nature-kit";
import type { Place, Placement } from "./town";
import { cellsAlong, GROUND, type Cell } from "./ways";

/**
 * The country round the village, built from Kenney's Nature Kit: a stone ridge
 * across the north with a waterfall, a cave and a pine wood on top; the river
 * from its foot south past the town wall, broadening to a lake in the
 * south-west; woods either side of it, a quarry, a crag and an autumn wood
 * to the north-east; fields east of the village, watered by a brook and
 * ditches; a red-rock badlands with an oasis in the south-east; and south of
 * the village a meadow with a ruined temple on a stepped hill and a ring of
 * standing stones. Paths lead out to each from the village's ways out.
 */

/** Everything stands inside the ground's outermost ring of cells, which the player can't quite reach. */
const BOUNDS = { min: GROUND.min + 1, max: GROUND.max - 1 };

/** What sinks a piece standing on a path's or a dirt patch's bed to the bed: the Nature Kit's dirt lies this far below its grass. */
const ON_DIRT = -0.05;
/** What sets a piece floating on the water: the kit's open water lies this far below the grass. */
const ON_WATER = -0.05;

const rect = (x0: number, z0: number, x1: number, z1: number): Cell[] => {
  const cells: Cell[] = [];
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) cells.push([x, z]);
  return cells;
};
const key = ([x, z]: Cell): string => `${x},${z}`;
const without = (cells: readonly Cell[], gone: readonly Cell[]): Cell[] => {
  const out = new Set(gone.map(key));
  return cells.filter((c) => !out.has(key(c)));
};
const at = (piece: NaturePiece, x: number, z: number, more: Partial<Placement> = {}): Placement => ({ piece, x, z, ...more });

/** A number in [0, 1) from a few integers, the same every time, so scattered things stand where they stood. */
function hash(...values: number[]): number {
  let h = 0x811c9dc5;
  for (const v of values) h = Math.imul(h ^ Math.round(v * 1000), 0x01000193);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 2 ** 32;
}

// ---------------------------------------------------------------------------
// Water

/** The pool at the waterfall's foot, under the ridge. */
const FALLS_POOL = rect(-33, -32, -31, -30);
/** The river: out of the pool, south in a narrow bed winding by the woods, to a broad reach past the road. */
const RIVER_BED = cellsAlong([[-32, -29], [-32, -24], [-29, -24], [-29, -14], [-32, -14], [-32, -5]]);
const BROAD_REACH = rect(-33, -4, -31, 16);
/** A spring's brook out of the west wood, into the river. */
const SPRING_BROOK = cellsAlong([[-36, -12], [-33, -12]]);
/** The lake the river runs into, in the south-west, with a bay on its east shore and an island. */
const ISLAND = rect(-31, 25, -30, 26);
const LAKE = without(
  [...rect(-37, 17, -28, 17), ...rect(-38, 18, -27, 30), ...rect(-38, 31, -24, 33), ...rect(-38, 34, -29, 36), ...rect(-37, 37, -32, 37)],
  ISLAND,
);
/** The brook through the autumn wood and down past the fields, and the ditches it feeds. */
const BROOK = cellsAlong([[19, -30], [19, -24], [27, -24], [27, 5]]);
const DITCHES = [...cellsAlong([[20, 5], [37, 5]]), ...cellsAlong([[27, 6], [27, 11]])];
/** The oasis's pool, under the mesa's waterfall. */
const OASIS_POOL = rect(28, 29, 30, 31);
/** A pond in the meadow, a cell across. */
const MEADOW_POND: Cell = [5, 34];
/** The ridge's stream, on its top from a spring, over the edge as the waterfall into the pool. */
const RIDGE_STREAM = cellsAlong([[-32, -37], [-32, -33]]);
/** The mesa's stream, from a spring on top over the edge into the oasis. */
const MESA_STREAM = cellsAlong([[35, 30], [31, 30]]);

/** Water on the ground, laid by the ground's tiles. */
export const COUNTRY_WATER: readonly Cell[] = [...FALLS_POOL, ...RIVER_BED, ...BROAD_REACH, ...SPRING_BROOK, ...LAKE, ...BROOK, ...DITCHES, ...OASIS_POOL, MEADOW_POND, ...RIDGE_STREAM, ...MESA_STREAM];

// ---------------------------------------------------------------------------
// Paths and dirt

/** The dirt tracks out from the village's ways out, each from cell to cell in straight runs. */
export const COUNTRY_PATHS: readonly (readonly Cell[])[] = [
  // The road west, on from the gate's paving over the river to the camp in the pines.
  [[-26, 0], [-38, 0]],
  // North along the river to the woods, over it on an arched bridge, and a way down to the waterfall's pool.
  [[-27, -1], [-27, -19], [-35, -19]],
  [[-30, -20], [-30, -28]],
  [[-27, -9], [-37, -9]],
  // From the farm lane north to the ridge's steps, and east to the quarry.
  [[-2, -13], [-2, -28], [-20, -28], [-20, -29]],
  [[-1, -28], [6, -28], [6, -34]],
  // The farm track east from the sawmill along the fields, its ways down between them, and on to the badlands.
  [[15, -1], [38, -1]],
  [[24, 0], [24, 13]],
  [[34, 0], [34, 17]],
  // Up the brook into the autumn wood, to the woodcutters' clearing.
  [[26, -2], [26, -30]],
  // South to the lake: over the broad reach, round its shore, out to the island and to the fishing camp.
  [[-28, 1], [-28, 10], [-38, 10]],
  [[-28, 10], [-28, 14], [-25, 14], [-25, 37]],
  [[-26, 25], [-31, 25]],
  [[-24, 27], [-22, 27]],
  // Into the camp in the pines.
  [[-37, -1], [-37, -1]],
];

/** A path along the ridge's top, from the steps up to a lookout over the falls, crossing the stream under a bridge. */
const RIDGE_WALK = cellsAlong([[-36, -36], [-16, -36], [-16, -33]]);

/** Wide patches of dirt, and pits a cell across: a camp's clearing, a woodcutters' yard, the badlands' dry wash, a fire's pit. */
const CAMP_CLEARING = rect(-38, -5, -35, -2);
const WOODCUTTERS_YARD = rect(24, -33, 27, -31);
const WASH = without(rect(25, 18, 35, 24), rect(33, 22, 35, 24));
const FIRE_PIT: Cell = [-21, 28];
export const COUNTRY_DIRT: readonly Cell[] = [...CAMP_CLEARING, ...WOODCUTTERS_YARD, ...WASH, FIRE_PIT, ...RIDGE_WALK];

/** Ends of paths that run out level onto steps or a ramp, and a ditch's end running out onto its field. */
export const COUNTRY_OPEN_ENDS: readonly Cell[] = [[-20, -29], [6, -34], [20, 5], [-16, -33]];

/** Stretches of path or water laid with their rough tile: rocks in a straight, a wide bank round a bend. */
export const COUNTRY_ROUGH: readonly Cell[] = [[6, -28], [34, 14], [-32, -27], [-29, -17], [-32, -11], [-29, -14], [19, -27]];

// ---------------------------------------------------------------------------
// The ridge

const RIDGE_RISE: Rise = {
  rock: "stone",
  edge: "plain",
  raised: [
    { x0: -38, z0: -38, x1: -12, z1: -33, height: 2 },
    // A spur jutting south, its west corner cut on the diagonal, a cave in its face.
    { x0: -29, z0: -32, x1: -27, z1: -31, height: 2 },
    // A terrace a storey up along its foot, and its east end a storey lower.
    { x0: -26, z0: -32, x1: -12, z1: -31, height: 1 },
    { x0: -11, z0: -38, x1: -4, z1: -33, height: 1 },
  ],
  cuts: [[-29, -31]],
  faces: [
    { x: -28, z: -30, face: "cave" },
    // Up onto the terrace from the path, and from the terrace to the top.
    { x: -20, z: -30, face: "steps" },
    { x: -16, z: -32, face: "steps" },
  ],
};

/** Hanging moss on a face standing in a cell, turned as the face is: it hangs on the face's outside, which stands a little in from the cell's edge. */
function moss(x: number, z: number, turn: number, y: number): Placement {
  // The moss is made to hang on a wall at its cell's very edge; the kit's faces stand this far in from it.
  const inset = 0.19;
  const [dx, dz] = [[0, -inset], [-inset, 0], [0, inset], [inset, 0]][turn];
  return at("hanging_moss", x + dx, z + dz, { y, turn });
}

const RIDGE: readonly Placement[] = [
  // A bridge where the walk crosses the stream, and a fire ring at the lookout.
  at("bridge_stoneRoundNarrow", -32, -36, { y: 2 }),
  at("campfire_bricks", -36, -35.6, { y: 2 }),
  at("log", -36.75, -35.7, { y: 2, turn: 0 }),
  // Rock filling the cave's mouth, a little way in.
  at("cliff_block_stone", -28, -31),
  // Moss trailing down the faces by the falls and over the cave.
  moss(-34, -32, 2, 1.5),
  moss(-30.6, -32, 2, 1.45),
  moss(-28.3, -30, 2, 0.5),
  moss(-27.7, -30, 2, 1.5),
  moss(-37, -32, 2, 0.5),
  // Boulders fallen at its foot.
  at("stone_largeA", -36.3, -30.9, { turn: 1 }),
  at("stone_largeB", -24.4, -29.6),
  at("stone_largeE", -13.2, -29.4, { turn: 2 }),
  at("stone_smallD", -35.2, -30.2),
  at("stone_smallG", -25.4, -29.2, { turn: 3 }),
  at("stone_smallTopA", -9.4, -31.3),
  at("stone_smallFlatA", -6.2, -31.2, { turn: 1 }),
];

// ---------------------------------------------------------------------------
// The quarry, north of the farm: stone cut back from the hill in blocks, in benches stepping down to the path.

const QUARRY: readonly Placement[] = [
  // The back face, two blocks high, its west corner cut away and a working driven in.
  ...rect(1, -38, 8, -37).flatMap(([x, z]): Placement[] => [
    at("cliff_block_stone", x, z),
    // The working is driven into the face's upper block, its mouth toward the benches.
    x === 5 && z === -37 ? at("cliff_blockCave_stone", x, z, { y: 1, turn: 2 }) : at("cliff_block_stone", x, z, { y: 1 }),
  ]),
  at("cliff_block_stone", 0, -38),
  at("cliff_block_stone", 0, -38, { y: 1 }),
  at("cliff_block_stone", 0, -37),
  at("cliff_blockDiagonal_stone", 0, -37, { y: 1, turn: 2 }),
  // The first bench, a block high, a ramp up it to the top, and a walled ramp cut through it from the path.
  ...without(rect(0, -36, 8, -35), [[6, -35]]).map(([x, z]) => at("cliff_block_stone", x, z)),
  at("cliff_blockSlope_stone", 3, -36, { y: 1, turn: 2 }),
  at("cliff_blockSlopeWalls_stone", 6, -35, { turn: 2 }),
  // Lower benches, half and a quarter block, a half ramp up from the floor at the west.
  ...without(rect(0, -34, 8, -34), [[6, -34]]).map(([x, z]) => at("cliff_blockHalf_stone", x, z)),
  ...rect(2, -33, 5, -33).map(([x, z]) => at("cliff_blockQuarter_stone", x, z)),
  at("cliff_blockSlopeHalfWalls_stone", 1, -33, { turn: 2 }),
  // Blocks cut and left on the floor, chips, and logs to roll them on.
  at("statue_block", 2.2, -31.7, { turn: 1 }),
  at("statue_block", 7.7, -32.4),
  at("log", 3.4, -31.6, { turn: 1 }),
  at("log", 3.4, -31.1, { turn: 1 }),
  at("stone_smallFlatB", 1.3, -32.2),
  at("stone_smallFlatC", 5.2, -31.9, { turn: 2 }),
  at("stone_smallA", 8.4, -33.1),
  at("stone_smallE", 0.4, -32.6),
];

// ---------------------------------------------------------------------------
// The crag in the autumn wood: grey stone two storeys high on a broad base.

const CRAG_RISE: Rise = {
  rock: "stone",
  edge: "large",
  raised: [
    { x0: 31, z0: -36, x1: 35, z1: -34, height: 2 },
    { x0: 31, z0: -33, x1: 32, z1: -31, height: 2 },
  ],
};
const CRAG: readonly Placement[] = [
  at("tree_pineRoundC", 33, -35, { y: 2 }),
  at("tree_pineSmallB", 34.2, -34.4, { y: 2, turn: 1 }),
  at("tree_pineRoundF", 31.3, -32.2, { y: 2 }),
  moss(33, -33, 2, 1.5),
  moss(30, -32, 1, 1.5),
];

// ---------------------------------------------------------------------------
// The badlands, south-east: red rock round a dry wash.

/** The mesa: two storeys, a shelf along its north, steps up both, a waterfall from a spring on top into the oasis, and a cave. */
const MESA_RISE: Rise = {
  rock: "rock",
  edge: "plain",
  raised: [
    { x0: 31, z0: 28, x1: 37, z1: 33, height: 2 },
    { x0: 31, z0: 34, x1: 34, z1: 35, height: 2 },
    { x0: 31, z0: 26, x1: 37, z1: 27, height: 1 },
  ],
  cuts: [[31, 35]],
  faces: [
    { x: 30, z: 33, face: "cave" },
    { x: 34, z: 25, face: "steps" },
    { x: 36, z: 27, face: "steps" },
  ],
};
const MESA: readonly Placement[] = [
  at("cliff_block_rock", 31, 33),
  at("cactus_tall", 34.3, 33.2, { y: 2 }),
  at("cactus_short", 36.1, 29.4, { y: 2, turn: 1 }),
  at("rock_tallC", 33.2, 34.6, { y: 2 }),
  at("rock_smallTopA", 35.4, 32.1, { y: 2, turn: 2 }),
];

/** The oasis round the pool at the mesa's foot: palms leaning over the water, lilies, and reeds. */
const OASIS: readonly Placement[] = [
  at("tree_palmBend", 27.3, 30.2, { turn: 3 }),
  at("tree_palmTall", 26.6, 29.1),
  at("tree_palmDetailedTall", 26.7, 31.6, { turn: 1 }),
  at("tree_palmShort", 28.4, 32.6, { turn: 2 }),
  at("tree_palm", 26.2, 32.9),
  at("tree_palmDetailedShort", 29.6, 32.3, { turn: 3 }),
  at("lily_large", 28.6, 29.9, { y: ON_WATER }),
  at("lily_small", 29.1, 30.7, { y: ON_WATER, turn: 2 }),
  at("plant_flatTall", 27.6, 28.5),
  at("plant_flatShort", 27.9, 31.9, { turn: 1 }),
  at("grass_leafsLarge", 28.1, 28.4),
];

/** A low ledge of red rock, half a storey, a ramp up its south side. */
const LEDGE_RISE: Rise = {
  rock: "rock",
  edge: "half",
  raised: [
    { x0: 26, z0: 26, x1: 28, z1: 26, height: 1 },
    { x0: 26, z0: 27, x1: 27, z1: 27, height: 1 },
  ],
  faces: [{ x: 26, z: 28, face: "ramp" }],
};
const LEDGE: readonly Placement[] = [
  at("rock_smallC", 27.3, 26.2, { y: 0.5 }),
  at("cactus_short", 26.2, 26.6, { y: 0.5 }),
];

/** A knoll of red rock, a storey high, stepped all round. */
const KNOLL_RISE: Rise = {
  rock: "rock",
  edge: "steps",
  raised: [
    { x0: 20, z0: 24, x1: 22, z1: 27, height: 1 },
    { x0: 20, z0: 28, x1: 21, z1: 29, height: 1 },
  ],
};
const KNOLL: readonly Placement[] = [
  at("rock_tallA", 21, 25, { y: 1 }),
  at("cactus_tall", 20.1, 27.6, { y: 1, turn: 2 }),
  at("rock_smallFlatA", 21.8, 26.9, { y: 1 }),
];

/** A butte, two storeys on a broad foot, in an L. */
const BUTTE_RISE: Rise = {
  rock: "rock",
  edge: "large",
  raised: [
    { x0: 23, z0: 36, x1: 27, z1: 37, height: 2 },
    { x0: 23, z0: 33, x1: 24, z1: 35, height: 2 },
  ],
};
const BUTTE: readonly Placement[] = [
  at("cactus_short", 25.4, 36.4, { y: 2 }),
  at("rock_largeD", 23.5, 34.3, { y: 2, turn: 1 }),
];

/**
 * Rock weathered into blocks at the wash's east end: a shelf two blocks high
 * stepping down to the wash, a block and then a half, a walled ramp cut up
 * through the half step and a ramp up the next, a hollow in the back wall, and
 * its corner fallen away on the diagonal.
 */
const BLOCKS: readonly Placement[] = [
  ...rect(38, 17, 38, 23).flatMap(([x, z]): Placement[] => [
    at("cliff_block_rock", x, z),
    ...(z === 17 ? [] : [at(z === 20 ? "cliff_blockCave_rock" : "cliff_block_rock", x, z, { y: 1, turn: 1 })]),
  ]),
  at("cliff_blockDiagonal_rock", 38, 17, { y: 1, turn: 1 }),
  ...rect(37, 17, 37, 23).map(([x, z]) => at("cliff_block_rock", x, z)),
  at("cliff_blockSlope_rock", 37, 22, { y: 1, turn: 1 }),
  ...without(rect(36, 18, 36, 22), [[36, 20]]).map(([x, z]) => at("cliff_blockHalf_rock", x, z)),
  at("cliff_blockSlopeWalls_rock", 36, 20, { turn: 1 }),
  at("cliff_blockQuarter_rock", 36, 17),
  at("cliff_blockQuarter_rock", 36, 23),
  at("rock_smallTopA", 37.2, 18.1, { y: 1 }),
];

/** What else stands about the badlands: spires, boulders, stones and cacti, round the wash. */
const BADLANDS: readonly Placement[] = [
  ...(["rock_tallA", "rock_tallB", "rock_tallD", "rock_tallE", "rock_tallF", "rock_tallG", "rock_tallH", "rock_tallI", "rock_tallJ"] as const).map(
    (piece, i) => at(piece, [24.4, 30.3, 32.6, 26.2, 36.2, 35.6, 22.6, 29.3, 37.1][i], [21.1, 17.2, 17.5, 25.2, 24.6, 15.8, 31.6, 34.4, 37.2][i], { turn: i % 4 }),
  ),
  ...(["rock_largeA", "rock_largeB", "rock_largeC", "rock_largeE", "rock_largeF"] as const).map(
    (piece, i) => at(piece, [23.4, 31.2, 36.4, 28.6, 33.8][i], [17.5, 25.3, 19.4, 35.8, 37.4][i], { turn: (i * 3) % 4 }),
  ),
  ...(["rock_smallA", "rock_smallB", "rock_smallD", "rock_smallE", "rock_smallF", "rock_smallG", "rock_smallH", "rock_smallI", "rock_smallFlatB", "rock_smallFlatC", "rock_smallTopB"] as const).map(
    (piece, i) => at(piece, [26.2, 28.7, 30.6, 32.3, 27.4, 29.8, 31.6, 33.1, 25.6, 30.1, 34.8][i], [19.3, 22.6, 19.8, 21.2, 23.6, 18.4, 23.1, 19.6, 21.8, 20.8, 16.4][i], {
      y: i < 10 ? ON_DIRT : 0,
      turn: i % 4,
    }),
  ),
  at("cactus_tall", 24.2, 23.2),
  at("cactus_short", 22.9, 19.3, { turn: 2 }),
  at("cactus_tall", 29.2, 36.6, { turn: 1 }),
  at("cactus_short", 35.4, 22.6, { turn: 3 }),
  at("cactus_tall", 36.6, 15.2),
  at("plant_bushTriangle", 24.6, 16.8),
  at("plant_bushLargeTriangle", 30.6, 16.3, { turn: 1 }),
];

// ---------------------------------------------------------------------------
// South of the village: the ruin on its stepped hill, the standing stones, and the meadow round them.

/** A temple fallen to its columns on a hill stepped all round, a stone ring before it and an obelisk behind. */
const RUIN_HILL_RISE: Rise = {
  rock: "stone",
  edge: "steps",
  raised: [
    { x0: -5, z0: 28, x1: 1, z1: 31, height: 1 },
    { x0: -5, z0: 25, x1: -3, z1: 27, height: 1 },
  ],
};
const RUIN_HILL: readonly Placement[] = [
  ...[-4, -2, 0].flatMap((x, i): Placement[] => [
    at(i === 1 ? "statue_columnDamaged" : "statue_column", x, 28.4, { y: 1 }),
    at(i === 1 ? "statue_column" : "statue_columnDamaged", x, 30.6, { y: 1, turn: i }),
  ]),
  at("statue_head", -2, 29.5, { y: 1, turn: 3 }),
  at("statue_ring", -4, 25.6, { y: 1 }),
  at("statue_obelisk", 1, 31, { y: 1 }),
  at("stone_smallFlatA", -3.1, 31.2, { y: 1 }),
  at("stone_smallB", 0.7, 28.3, { y: 1 }),
  at("stone_smallTopB", -4.6, 27.1, { y: 1, turn: 1 }),
  // Stepping stones from the town hall's back steps to the hill, branching east at a round flag to the standing stones.
  at("path_stoneEnd", 0, 17, { turn: 3 }),
  ...[18, 19, 21, 22, 23, 24, 25, 26].map((z) => at("path_stone", 0, z, { turn: 1 })),
  at("path_stoneCircle", 0, 20),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((x) => at("path_stone", x, 20)),
  at("path_stoneCorner", 11, 20),
  at("path_stone", 11, 21, { turn: 1 }),
  at("path_stoneEnd", 11, 22, { turn: 1 }),
];

/** A ring of standing stones in the meadow, a flat stone at its heart. */
const STONE_CIRCLE_AT = { x: 11.5, z: 26.5 };
const STONE_CIRCLE: readonly Placement[] = [
  ...(["stone_tallA", "stone_tallB", "stone_tallC", "stone_tallD", "stone_tallE", "stone_tallF", "stone_tallG", "stone_tallH", "stone_tallI", "stone_tallJ"] as const).map((piece, i) => {
    const angle = (i / 10) * Math.PI * 2;
    return at(piece, STONE_CIRCLE_AT.x - 0.5 + 2.8 * Math.cos(angle), STONE_CIRCLE_AT.z - 0.5 + 2.8 * Math.sin(angle), { turn: i % 4 });
  }),
  at("stone_largeC", STONE_CIRCLE_AT.x - 0.5, STONE_CIRCLE_AT.z - 0.5),
];

/** A low shelf of grey stone in the meadow, half a storey, a ramp up its south side. */
const STONE_LEDGE_RISE: Rise = {
  rock: "stone",
  edge: "half",
  raised: [
    { x0: -18, z0: 21, x1: -14, z1: 22, height: 1 },
    { x0: -18, z0: 23, x1: -16, z1: 23, height: 1 },
  ],
  faces: [{ x: -17, z: 24, face: "ramp" }],
};
const STONE_LEDGE: readonly Placement[] = [
  at("stone_largeF", -15.4, 21.4, { y: 0.5, turn: 1 }),
  at("grass_large", -17.6, 21.6, { y: 0.5 }),
  at("flower_yellowB", -16.4, 22.4, { y: 0.5 }),
];

// ---------------------------------------------------------------------------
// The fields east of the village.

/** A row of tilled earth along x, from its end at x0 to its end at x1: the kit's row ends fill half their cell, toward the row. */
function earthRow(x0: number, x1: number, z: number, double: boolean): Placement[] {
  const [end, run] = double ? (["crops_dirtDoubleRowEnd", "crops_dirtDoubleRow"] as const) : (["crops_dirtRowEnd", "crops_dirtRow"] as const);
  return [at(end, x0, z), ...Array.from({ length: x1 - x0 - 1 }, (_, i) => at(run, x0 + 1 + i, z)), at(end, x1, z, { turn: 2 })];
}

/** Crops along a row's cells between its ends, one to a cell, or two across a double row. */
function sown(pieces: readonly NaturePiece[], x0: number, x1: number, z: number, double: boolean): Placement[] {
  return Array.from({ length: x1 - x0 - 1 }, (_, i) => x0 + 1 + i).flatMap((x, i) => {
    const piece = pieces[i % pieces.length];
    return double ? [at(piece, x, z - 0.22, { turn: i % 4 }), at(piece, x, z + 0.26, { turn: (i + 2) % 4 })] : [at(piece, x, z, { turn: i % 4 })];
  });
}

/** Rows looped back on themselves round a corner at the east, a run between: two turns of the kit's corner. */
function earthLoop(x0: number, x1: number, z: number, double: boolean): Placement[] {
  const [end, run, corner] = double
    ? (["crops_dirtDoubleRowEnd", "crops_dirtDoubleRow", "crops_dirtDoubleRowCorner"] as const)
    : (["crops_dirtRowEnd", "crops_dirtRow", "crops_dirtRowCorner"] as const);
  const runs = (rowZ: number): Placement[] => [at(end, x0, rowZ), ...Array.from({ length: x1 - x0 - 1 }, (_, i) => at(run, x0 + 1 + i, rowZ))];
  // The corner joins its −x side to its +z; turned three times, its −z to its −x.
  return [...runs(z), at(corner, x1, z), at(run, x1, z + 1, { turn: 1 }), at(corner, x1, z + 2, { turn: 3 }), ...runs(z + 2)];
}

/** Single rails along a field, each a hair longer than its cell, laid end to end at their own length so no two posts share a place. */
function rails(piece: "fence_simpleHigh" | "fence_simpleLow", x0: number, count: number, z: number): Placement[] {
  return Array.from({ length: count }, (_, i) => at(piece, x0 + i * 1.042, z));
}

const CORN: readonly Placement[] = [
  // Corn sown a row at a time, so it stands at every height, the last row just up.
  ...[-9, -7, -5, -3].flatMap((z, i) => [
    ...earthRow(19, 25, z, false),
    ...sown([(["crops_cornStageD", "crops_cornStageC", "crops_cornStageB", "crops_cornStageA"] as const)[i]], 19, 25, z, false),
  ]),
  ...rails("fence_simpleLow", 19, 6, -2),
];

const WHEAT: readonly Placement[] = [
  ...earthLoop(29, 35, -9, true),
  ...sown(["crops_wheatStageB"], 29, 35, -9, true),
  ...sown(["crops_wheatStageB"], 29, 35, -7, true),
  ...earthLoop(29, 35, -5, true),
  ...sown(["crops_wheatStageA"], 29, 35, -5, true),
  ...sown(["crops_wheatStageA"], 29, 35, -3, true),
  ...rails("fence_simpleHigh", 29, 6, -2),
];

/** The kitchen garden by the ditch: carrots and turnips on a looped row, greens on another, a board fence on two sides. */
const KITCHEN_GARDEN: readonly Placement[] = [
  ...earthLoop(19, 23, 7, false),
  ...sown(["crop_carrot"], 19, 23, 7, false),
  ...sown(["crop_turnip"], 19, 23, 9, false),
  ...earthRow(19, 23, 11, false),
  ...sown(["crops_leafsStageA", "crops_leafsStageB"], 19, 23, 11, false),
  ...[19, 20, 21, 22, 23].map((x) => at("fence_planksDouble", x, 7)),
  ...[8, 9, 10, 11].map((z) => at("fence_planks", 19, z, { turn: 1 })),
];

/** The pumpkin patch: pumpkins and melons on hills, fenced round, a gate to the track, its corners each made a different way. */
const PUMPKIN_PATCH: readonly Placement[] = [
  ...rect(29, 8, 32, 11).flatMap(([x, z], i): Placement[] => [
    at("crops_dirtSingle", x, z),
    at(i % 3 === 1 ? "crop_melon" : "crop_pumpkin", x, z, { y: 0.03, turn: i % 4 }),
  ]),
  // A fence along each cell's outer edge: along its own −z edge unturned.
  ...[29, 30, 31, 32].flatMap((x, i): Placement[] => [
    at(i % 2 === 0 ? "fence_simple" : "fence_simpleCenter", x, 7),
    at(i % 2 === 0 ? "fence_simpleCenter" : "fence_simple", x, 12, { turn: 2 }),
  ]),
  ...[8, 9, 10, 11].flatMap((z, i): Placement[] => [
    at(i % 2 === 0 ? "fence_simple" : "fence_simpleCenter", 28, z, { turn: 1 }),
    at(z === 10 ? "fence_gate" : i % 2 === 0 ? "fence_simpleCenter" : "fence_simple", 33, z, { turn: 3 }),
  ]),
  // The corners: squared along its −z and +x edges, cut across on the diagonal, and bent round, plain or with a post at the middle.
  at("fence_corner", 28, 7, { turn: 1 }),
  at("fence_simpleDiagonal", 33, 7),
  at("fence_bend", 33, 12, { turn: 3 }),
  at("fence_bendCenter", 28, 12, { turn: 2 }),
];

/** A small pen by the ditch's end, its corners cut, and bamboo along the water. */
const PEN: readonly Placement[] = [
  at("fence_simpleDiagonalCenter", 36, 8, { turn: 1 }),
  at("fence_simpleCenter", 37, 8),
  at("fence_simpleDiagonal", 38, 8),
  at("fence_simpleCenter", 38, 9, { turn: 3 }),
  at("fence_simpleDiagonalCenter", 38, 10, { turn: 3 }),
  at("fence_simple", 37, 10, { turn: 2 }),
  at("fence_simpleDiagonal", 36, 10, { turn: 2 }),
  at("fence_gate", 36, 9, { turn: 1 }),
  at("crops_bambooStageB", 35.3, 6.1),
  at("crops_bambooStageA", 36.1, 6.3, { turn: 1 }),
  at("crops_bambooStageB", 36.9, 6.05, { turn: 2 }),
  at("crops_bambooStageA", 37.6, 4.2, { turn: 3 }),
];

/** Bridges over the brook and ditches where the farm's ways cross them. */
const FIELD_BRIDGES: readonly Placement[] = [
  at("bridge_wood", 27, -1),
  at("bridge_woodRound", 26, -24, { turn: 1 }),
  at("bridge_woodNarrow", 24, 5, { turn: 1 }),
  at("bridge_woodRoundNarrow", 34, 5, { turn: 1 }),
  at("sign", 25.4, -1.75),
];

// ---------------------------------------------------------------------------
// The river and the lake.

const RIVER: readonly Placement[] = [
  // The road's bridge over the broad reach: two ends with their posts, and a span between.
  at("bridge_side_stone", -33, 0),
  at("bridge_center_stone", -32, 0),
  at("bridge_side_stone", -31, 0, { turn: 2 }),
  // An arched timber bridge on the way to the lake.
  at("bridge_side_woodRound", -33, 10),
  at("bridge_center_woodRound", -32, 10),
  at("bridge_side_woodRound", -31, 10, { turn: 2 }),
  // Footbridges over the narrow river upstream.
  at("bridge_stone", -32, -9),
  at("bridge_stoneRound", -29, -19),
  at("bridge_stoneNarrow", -30, -24, { turn: 1 }),
  at("stone_largeD", -34.6, -11.4, { turn: 1 }),
  // A stepping stone where the river runs shallow.
  at("platform_stone", -32, -7, { y: ON_WATER }),
  at("sign", -27.6, 1.15, { turn: 2 }),
  at("stone_smallC", -30.4, -12.3),
  at("stone_smallF", -33.6, -6.4, { turn: 1 }),
  at("stone_smallH", -28.2, -22.1),
  at("stone_smallI", -31.1, -16.7, { turn: 2 }),
  at("grass_leafs", -30.6, -6.2),
  at("plant_flatShort", -33.7, -15.4),
  at("plant_flatTall", -30.7, -20.6, { turn: 2 }),
];

const LAKE_SHORE: readonly Placement[] = [
  // The arched stone bridge out to the island, and a flat timber one across the bay.
  at("bridge_side_stoneRound", -29, 25),
  at("bridge_center_stoneRound", -28, 25),
  at("bridge_side_stoneRound", -27, 25, { turn: 2 }),
  // Running along z, the bay's bridge has its −z end's posts turned to the north and its +z end's to the south.
  at("bridge_side_wood", -25, 31, { turn: 3 }),
  at("bridge_center_wood", -25, 32, { turn: 1 }),
  at("bridge_side_wood", -25, 33, { turn: 1 }),
  // A jetty off the shore, turning south at its end, a canoe tied up beside it and its paddle on the boards.
  ...[-26, -27, -28, -29].map((x) => at("path_wood", x, 20, { y: -0.03 })),
  at("path_woodCorner", -30, 20, { y: -0.03, turn: 1 }),
  at("path_wood", -30, 21, { y: -0.03, turn: 1 }),
  at("path_woodEnd", -30, 22, { y: -0.03, turn: 1 }),
  at("canoe", -29, 21, { y: -0.07, turn: 1 }),
  at("canoe_paddle", -28, 20, { y: 0.06, turn: 1 }),
  // Sand along the east shore.
  ...[17.6, 18.7, 21.9, 23.1, 28.4].map((z, i) => at("platform_beach", -26.05, z, { turn: i % 2 === 0 ? 0 : 2 })),
  // Lilies and grassy hummocks in the shallows, reeds and bamboo on the north shore.
  ...([[-35.4, 19.2], [-36.6, 20.4], [-33.1, 28.6], [-27.9, 35.1], [-36.1, 33.3]] as const).map(([x, z], i) => at(i % 2 === 0 ? "lily_large" : "lily_small", x, z, { y: ON_WATER, turn: i % 4 })),
  at("platform_grass", -36.6, 17.9, { y: ON_WATER }),
  at("platform_grass", -29.5, 17.8, { y: ON_WATER, turn: 2 }),
  at("crops_bambooStageB", -38.6, 16.1),
  at("crops_bambooStageA", -37.8, 15.6, { turn: 1 }),
  at("plant_flatTall", -35.3, 16.3),
  at("plant_flatShort", -29.7, 16.3, { turn: 2 }),
  at("grass_leafsLarge", -34.4, 16.5),
  at("grass_leafs", -26.6, 30.4),
  // The island: a tree, a bush and flowers.
  at("tree_default_dark", -31, 26),
  at("plant_bushDetailed", -29.9, 26.2),
  at("flower_purpleC", -30.4, 25.9),
  at("flower_redC", -31.2, 25.2),
];

/** A fishing camp on the lake's east shore: a fire in its pit, tents, a bedroll, a pot and a log to sit on. */
const FISHING_CAMP: readonly Placement[] = [
  at("campfire_stones", FIRE_PIT[0], FIRE_PIT[1], { y: ON_DIRT }),
  at("tent_smallOpen", -22, 29, { turn: 2 }),
  at("tent_smallClosed", -20.2, 29.4, { turn: 2 }),
  at("bed_floor", -19.9, 27.7, { turn: 1 }),
  at("pot_small", -21.8, 28.3),
  at("log", -20.2, 27.9, { turn: 0 }),
  at("sign", -24.4, 26.3),
];

// ---------------------------------------------------------------------------
// The camp in the pines west of the river.

const WEST_CAMP: readonly Placement[] = [
  // Tents along the clearing's north edge, their mouths to the fire.
  at("tent_detailedOpen", -37, -6, { turn: 2 }),
  at("tent_detailedClosed", -35.4, -6, { turn: 2 }),
  at("bed", -38.4, -5.9),
  // The fire at the clearing's middle, logs and a stump round it to sit on.
  at("campfire_logs", -37, -4, { y: ON_DIRT }),
  at("log", -37.85, -4, { y: ON_DIRT }),
  at("log", -36.15, -4, { y: ON_DIRT }),
  at("stump_round", -37, -3.1, { y: ON_DIRT }),
  at("pot_large", -35.9, -2.9, { y: ON_DIRT }),
  at("pot_small", -35.6, -3.4, { y: ON_DIRT }),
  at("log_stack", -38.95, -3.4, { turn: 1 }),
  at("sign", -36.2, -1.2),
];

// ---------------------------------------------------------------------------
// The woodcutters' yard in the autumn wood.

const WOODCUTTERS: readonly Placement[] = [
  at("log_stackLarge", 24.1, -33.1, { y: ON_DIRT, turn: 1 }),
  at("log_stack", 25.2, -33.1, { y: ON_DIRT, turn: 1 }),
  at("log_large", 26, -32, { y: ON_DIRT }),
  at("campfire_planks", 24.4, -31.4, { y: ON_DIRT }),
  at("stump_squareDetailed", 25.1, -31, { y: ON_DIRT }),
  at("stump_squareDetailedWide", 27.1, -33.2, { y: ON_DIRT }),
  // Stumps of trees felled round the yard.
  at("stump_old", 23.2, -32.5),
  at("stump_oldTall", 28.3, -31.2),
  at("stump_round", 23.1, -30.4),
  at("stump_roundDetailed", 28.2, -29.7),
  at("stump_square", 25.1, -34.3),
  at("sign", 25.4, -29.6, { turn: 1 }),
];

// ---------------------------------------------------------------------------
// Woods, scattered: trees and what grows under them, each kept clear of what else stands there.

/** Cells nothing is scattered on: water, paths, dirt, the village, and every cell a placed piece stands in or reaches. */
const village = { x0: -23, z0: -22, x1: 17, z1: 17 };
const villageTrees: readonly Cell[] = [[-24, -8], [-24, 6], [-23, 15], [-19, -22], [10, -22], [22, -12], [21, 4], [23, 16], [-8, 22], [6, 21], [18, 22]];

/** The country's rises, raised on the ground's heights: their faces follow from them. */
export const COUNTRY_RISES: readonly Rise[] = [RIDGE_RISE, CRAG_RISE, MESA_RISE, LEDGE_RISE, KNOLL_RISE, BUTTE_RISE, RUIN_HILL_RISE, STONE_LEDGE_RISE];
const rises = risesTerrain(COUNTRY_RISES);
/** Every cell a rise raises or stands a face in. */
const RISEN: readonly Cell[] = rect(GROUND.min, GROUND.min, GROUND.max, GROUND.max).filter(([x, z]) => rises.level(x, z) > 0 || cliffPieces(rises, x, z).length > 0);

const PLACED: readonly (readonly Placement[])[] = [
  RIDGE, QUARRY, CRAG, MESA, OASIS, LEDGE, KNOLL, BUTTE, BLOCKS, BADLANDS, RUIN_HILL, STONE_CIRCLE, STONE_LEDGE,
  CORN, WHEAT, KITCHEN_GARDEN, PUMPKIN_PATCH, PEN, FIELD_BRIDGES, RIVER, LAKE_SHORE, FISHING_CAMP, WEST_CAMP, WOODCUTTERS,
];
const taken = new Set<string>([
  ...COUNTRY_WATER, ...COUNTRY_PATHS.flatMap((p) => cellsAlong(p)), ...COUNTRY_DIRT, ...ISLAND, ...villageTrees,
  ...rect(village.x0, village.z0, village.x1, village.z1),
  ...rect(Math.floor(STONE_CIRCLE_AT.x) - 3, Math.floor(STONE_CIRCLE_AT.z) - 3, Math.floor(STONE_CIRCLE_AT.x) + 3, Math.floor(STONE_CIRCLE_AT.z) + 3),
  ...PLACED.flat().map((p): Cell => [Math.floor(p.x + 0.5), Math.floor(p.z + 0.5)]),
  ...RISEN,
].map(key));

interface Scatter {
  /** Where, from its −x, −z corner cell to its +x, +z one. */
  area: readonly [x0: number, z0: number, x1: number, z1: number];
  pieces: readonly NaturePiece[];
  /** Distance between neighbours before each is moved a little at random. */
  spacing: number;
  /** The share of places left empty. */
  gaps: number;
  /** How many cells round each must be clear: 1 for a tree, whose crown reaches over its neighbours, 0 for what grows low. */
  clear: 0 | 1;
  /** What else is scattered here already, kept at least this far from. */
  apart?: { from: readonly Placement[]; by: number };
  /** Where a piece may stand, in place of every cell nothing else takes: the top of a rise. */
  on?: (x: number, z: number) => boolean;
  y?: number;
  seed: number;
}

/** Pieces scattered over an area on a loose grid, each cell's piece and turn its own, every piece given at least once where there is room. */
function scatter(spec: Scatter): Placement[] {
  const [x0, z0, x1, z1] = spec.area;
  const placed: Placement[] = [];
  let next = Math.floor(hash(spec.seed) * spec.pieces.length);
  for (let gx = x0; gx <= x1; gx += spec.spacing) {
    for (let gz = z0; gz <= z1; gz += spec.spacing) {
      if (hash(gx, gz, spec.seed, 1) < spec.gaps) continue;
      const x = gx + (hash(gx, gz, spec.seed, 2) - 0.5) * spec.spacing * 0.5;
      const z = gz + (hash(gx, gz, spec.seed, 3) - 0.5) * spec.spacing * 0.5;
      const [cx, cz] = [Math.floor(x + 0.5), Math.floor(z + 0.5)];
      if (Math.min(x, z) < BOUNDS.min || Math.max(x, z) > BOUNDS.max) continue;
      const near = spec.clear === 1 ? [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] : [[0, 0]];
      const free = spec.on ?? ((nx: number, nz: number): boolean => !taken.has(`${nx},${nz}`));
      if (!near.every(([dx, dz]) => free(cx + dx, cz + dz))) continue;
      const apart = spec.apart;
      if (apart !== undefined && apart.from.some((p) => Math.hypot(p.x - x, p.z - z) < apart.by)) continue;
      placed.push(at(spec.pieces[next++ % spec.pieces.length], x, z, { y: spec.y ?? 0, turn: Math.floor(hash(gx, gz, spec.seed, 4) * 4) }));
    }
  }
  return placed;
}

const PINES: readonly NaturePiece[] = [
  "tree_pineDefaultA", "tree_pineDefaultB", "tree_pineGroundA", "tree_pineGroundB", "tree_pineRoundA", "tree_pineRoundB",
  "tree_pineRoundC", "tree_pineRoundD", "tree_pineRoundE", "tree_pineRoundF", "tree_pineSmallA", "tree_pineSmallB", "tree_pineSmallC",
  "tree_pineSmallD", "tree_pineTallA", "tree_pineTallA_detailed", "tree_pineTallB", "tree_pineTallB_detailed", "tree_pineTallC",
  "tree_pineTallC_detailed", "tree_pineTallD", "tree_pineTallD_detailed",
];
const BROADLEAVES = ["blocks", "cone", "default", "detailed", "fat", "oak", "plateau", "simple", "small", "tall", "thin"] as const;
const GREEN = BROADLEAVES.map((t) => `tree_${t}` as NaturePiece);
const DARK = BROADLEAVES.map((t) => (t === "fat" ? "tree_fat_darkh" : `tree_${t}_dark`) as NaturePiece);
const FALL = BROADLEAVES.map((t) => `tree_${t}_fall` as NaturePiece);

/** Pines on the ridge's top, a storey higher on its east end, and round the camp west of the river. */
const ridgeTop = new Set(rect(-38, -38, -13, -34).map(key));
const ridgeOpen = new Set([...RIDGE_STREAM, ...RIDGE_WALK].map(key));
const onRidge = (x: number, z: number): boolean => ridgeTop.has(`${x},${z}`) && ![[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => ridgeOpen.has(`${x + dx},${z + dz}`));
const RIDGE_PINES = scatter({ area: [-38, -38, -13, -34], pieces: PINES, spacing: 1.6, gaps: 0.25, clear: 0, y: 2, on: onRidge, seed: 1 });
const RIDGE_EAST_PINES = scatter({ area: [-10, -37, -5, -34], pieces: [...PINES].reverse(), spacing: 2, gaps: 0.3, clear: 0, y: 1, on: () => true, seed: 2 });
const WEST_WOOD_TREES = scatter({ area: [-38, -28, -34, 14], pieces: [...PINES, ...DARK.slice(0, 4)], spacing: 1.7, gaps: 0.3, clear: 1, seed: 3 });
/** The wildwood between the river and the town wall: broadleaves, dark and green. */
const WILDWOOD_TREES = scatter({ area: [-28, -29, -23, 14], pieces: [...DARK, ...GREEN], spacing: 1.7, gaps: 0.3, clear: 1, seed: 4 });
const AUTUMN_TREES = scatter({ area: [18, -38, 38, -12], pieces: FALL, spacing: 1.8, gaps: 0.35, clear: 1, seed: 5 });
/** Trees in the meadows and along the fields, the green broadleaves standing alone or in twos. */
const MEADOW_TREES = scatter({ area: [-38, 18, 18, 38], pieces: [...GREEN].reverse(), spacing: 3.4, gaps: 0.55, clear: 1, seed: 6 });
const FIELD_TREES = scatter({ area: [18, -12, 38, 15], pieces: GREEN, spacing: 3.5, gaps: 0.6, clear: 1, seed: 7 });
const NORTH_TREES = scatter({ area: [-22, -30, 17, -23], pieces: [...GREEN.slice(4), ...DARK.slice(6)], spacing: 3, gaps: 0.5, clear: 1, seed: 8 });

const TREES_SCATTERED = [...RIDGE_PINES, ...RIDGE_EAST_PINES, ...WEST_WOOD_TREES, ...WILDWOOD_TREES, ...AUTUMN_TREES, ...MEADOW_TREES, ...FIELD_TREES, ...NORTH_TREES];
const underTrees = { from: TREES_SCATTERED, by: 0.55 };

const WILDWOOD: readonly Placement[] = [
  ...WILDWOOD_TREES,
  ...scatter({ area: [-28, -29, -23, 14], pieces: ["mushroom_red", "mushroom_redGroup", "mushroom_redTall", "grass_leafs", "grass_leafsLarge", "plant_bush", "plant_bushSmall"], spacing: 1.3, gaps: 0.55, clear: 0, apart: underTrees, seed: 11 }),
  at("log_large", -25, -24, { turn: 1 }),
  at("stump_oldTall", -24.4, -4.3),
];
const WEST_WOOD: readonly Placement[] = [
  ...WEST_WOOD_TREES,
  ...scatter({ area: [-38, -28, -34, 14], pieces: ["grass_leafsLarge", "plant_bushDetailed", "mushroom_redGroup", "stone_smallB", "plant_bushLarge"], spacing: 1.5, gaps: 0.6, clear: 0, apart: underTrees, seed: 12 }),
];
const AUTUMN_WOOD: readonly Placement[] = [
  ...AUTUMN_TREES,
  ...scatter({ area: [18, -38, 38, -12], pieces: ["mushroom_tan", "mushroom_tanGroup", "mushroom_tanTall", "grass_leafs", "plant_bushSmall", "plant_bush"], spacing: 1.4, gaps: 0.55, clear: 0, apart: underTrees, seed: 13 }),
  at("log_large", 21, -19, { turn: 1 }),
  at("log", 33.6, -27.4),
];
const RIDGE_WOOD: readonly Placement[] = [...RIDGE_PINES, ...RIDGE_EAST_PINES];
/** The meadows south of the village and round the fields: wildflowers, tufts of grass, bushes. */
const MEADOW: readonly Placement[] = [
  ...MEADOW_TREES,
  ...scatter({
    area: [-38, 18, 18, 38],
    pieces: ["flower_purpleA", "flower_redA", "flower_yellowA", "grass", "flower_purpleB", "flower_redB", "flower_yellowB", "grass_large", "flower_yellowC", "plant_bushLarge", "flower_redC", "flower_purpleC", "plant_bushDetailed"],
    spacing: 1.6,
    gaps: 0.5,
    clear: 0,
    apart: underTrees,
    seed: 14,
  }),
  at("lily_small", MEADOW_POND[0], MEADOW_POND[1], { y: ON_WATER }),
  at("plant_flatShort", MEADOW_POND[0] + 0.55, MEADOW_POND[1] - 0.3),
];

/** Trees and bushes along the fields' edges. */
const HEDGEROWS: readonly Placement[] = [
  ...FIELD_TREES,
  ...scatter({ area: [18, -12, 38, 15], pieces: ["grass", "grass_large", "plant_bushSmall", "flower_yellowA", "plant_bushTriangle"], spacing: 2, gaps: 0.55, clear: 0, apart: underTrees, seed: 15 }),
];

/** Every part of the country, by the name the code gives it, for the debug overlay. */
export const COUNTRY: readonly Place[] = [
  { name: "RIDGE", placements: RIDGE },
  { name: "RIDGE_WOOD", placements: RIDGE_WOOD },
  { name: "QUARRY", placements: QUARRY },
  { name: "CRAG", placements: CRAG },
  { name: "RIVER", placements: RIVER },
  { name: "LAKE_SHORE", placements: LAKE_SHORE },
  { name: "FISHING_CAMP", placements: FISHING_CAMP },
  { name: "WEST_CAMP", placements: WEST_CAMP },
  { name: "WEST_WOOD", placements: WEST_WOOD },
  { name: "WILDWOOD", placements: WILDWOOD },
  { name: "AUTUMN_WOOD", placements: AUTUMN_WOOD },
  { name: "WOODCUTTERS", placements: WOODCUTTERS },
  { name: "CORN", placements: CORN },
  { name: "WHEAT", placements: WHEAT },
  { name: "KITCHEN_GARDEN", placements: KITCHEN_GARDEN },
  { name: "PUMPKIN_PATCH", placements: PUMPKIN_PATCH },
  { name: "PEN", placements: PEN },
  { name: "FIELD_BRIDGES", placements: FIELD_BRIDGES },
  { name: "MESA", placements: MESA },
  { name: "OASIS", placements: OASIS },
  { name: "LEDGE", placements: LEDGE },
  { name: "KNOLL", placements: KNOLL },
  { name: "BUTTE", placements: BUTTE },
  { name: "BLOCKS", placements: BLOCKS },
  { name: "BADLANDS", placements: BADLANDS },
  { name: "RUIN_HILL", placements: RUIN_HILL },
  { name: "STONE_CIRCLE", placements: STONE_CIRCLE },
  { name: "STONE_LEDGE", placements: STONE_LEDGE },
  { name: "MEADOW", placements: MEADOW },
  { name: "HEDGEROWS", placements: HEDGEROWS },
  { name: "NORTH_TREES", placements: NORTH_TREES },
];

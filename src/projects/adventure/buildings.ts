import type { TownPiece } from "./fantasy-town";
import type { Placement } from "./town";

/**
 * Buildings put together from the Fantasy Town Kit's pieces by its own rules:
 *
 * - A piece fills one unit cell, centred on its origin. A wall fills the outer
 *   tenth of its cell along the +x edge, with its outside, where shutters,
 *   banners and canopies hang, facing −x, back into the cell. Turned to face out
 *   of a building, a wall's piece belongs to the cell beyond the footprint's
 *   edge, the ring round it, and is moved back in by its thickness, so the wall
 *   stands just inside the edge and its outside is flush with it, as the roofs'
 *   eaves and gable ends expect.
 * - A building is walled by its edges: one wall piece on each outer edge of each
 *   cell of its footprint, on every storey. A post stands on each corner where
 *   two sides' walls meet: the kit's stone corner, or a wood pillar (the kit's
 *   `wall-wood-corner-edge` is no post but a wall bent across its cell).
 * - Storeys are a unit tall and stack straight: each has its own material and
 *   walls, and the roof sits on the top one.
 * - A roof's slope rises inward to a vertical back, and its eave reaches past
 *   the footprint, over the walls' tops. Every roof comes high (red) or low
 *   (teal), with the same shapes:
 *   - A gable two cells wide is two runs of slopes back to back, ridge front to
 *     back. Their underside closes the gable ends, and the end pieces of each run
 *     (`-left` at a piece's −z end, `-right` at its +z end) carry the boards that
 *     frame them.
 *   - A gable one cell wide is one run of the whole-gable piece, whose ridge lies
 *     along its own x, so it is turned a quarter to run front to back.
 *   - A hipped roof two cells wide is a gable whose runs end in corner pieces,
 *     each rising to its own +x, −z corner, turned to rise to the middle. On a
 *     square footprint the four corners alone make a pyramid.
 *   - A one-cell footprint takes the pointed roof.
 * - What hangs on a wall's outside (a canopy over a door, a banner, a chimney's
 *   foot) is placed exactly as its wall is, except a banner: its cloth lies in
 *   the wall's very face, so it hangs a hair further out.
 * - A chimney stands against a gable end, outside it, from the ground to above
 *   the ridge: its foot, a stack up each storey above the ground, one more past
 *   a high roof, and its cap, which clears a low roof's ridge by itself.
 * - A balcony runs the length of one side a storey up, in the ring beyond that
 *   side's walls: a plank floor, fences on its open edges, wood pillars beneath its outer edge,
 *   and stairs down from one end when it is one storey up, rising toward it.
 *
 * Shapes the kit offers beyond these (round and diagonal walls, flat roofs,
 * dormers) join here as each is worked out on the piece bench (`?view=pieces`).
 */

export type Material = "stone" | "wood";

/** The walls both materials have, by what follows `wall-` (stone) or `wall-wood-` (wood); `plain` is the wall alone. */
type Both<P> = P extends `wall-wood-${infer Kind}` ? (`wall-${Kind}` extends TownPiece ? Kind : never) : never;
export type WallKind = "plain" | Both<TownPiece>;

export type Side = "front" | "back" | "left" | "right";

export interface Storey {
  material?: Material;
  /** Each side's wall in each cell, from left to right as someone outside facing it sees them; plain where not given. */
  walls?: Partial<Record<Side, readonly WallKind[]>>;
}

export interface Roof {
  shape: "gable" | "hip" | "point";
  /** High roofs are the kit's steep red ones, low roofs its shallower teal ones. */
  pitch?: "high" | "low";
}

/** Something hung on a wall's outside: on `side`, in its `cell` counted as the side's walls are, on storey `storey`. */
export interface Fixture {
  piece: TownPiece;
  side: Side;
  cell: number;
  storey?: number;
}

export interface Balcony {
  side: Side;
  storey: number;
  /** The end the stairs come up at, as someone outside facing the side sees it; only for a balcony one storey up. */
  stairs?: "left" | "right";
}

export interface Building {
  /** The cell at the footprint's −x, −z corner, once the building is turned to face its way. */
  x: number;
  z: number;
  /** Cells across the front, and from front to back. */
  width: number;
  depth: number;
  /** Quarter turns anticlockwise seen from above, as a piece's: 0 faces the front to +z, 1 to +x. */
  facing?: number;
  /** From the ground up; one plain stone storey when not given. */
  storeys?: readonly Storey[];
  roof?: Roof | "none";
  fixtures?: readonly Fixture[];
  /** A chimney outside a gable end, the front or back, in that side's `cell`. */
  chimney?: { side: "front" | "back"; cell: number };
  balcony?: Balcony;
}

const CORNER_POST: Record<Material, TownPiece> = { stone: "wall-corner-detail", wood: "pillar-wood" };

function wallPiece(material: Material, kind: WallKind): TownPiece {
  if (kind === "plain") return material === "stone" ? "wall" : "wall-wood";
  return material === "stone" ? `wall-${kind}` : `wall-wood-${kind}`;
}

/** Every piece of a building, placed on the grid. */
export function building(spec: Building): Placement[] {
  const { width: w, depth: d, storeys = [{}], roof = { shape: "gable" } } = spec;
  if (w < 1 || d < 1) throw new Error(`adventure: a building needs at least one cell, not ${w}×${d}`);
  const across = (side: Side): number => (side === "front" || side === "back" ? w : d);

  // Laid out facing +z, footprint from cell (0, 0). Each side's ring cell for its
  // i-th wall, in the order its wall list reads, and the turn that faces it out.
  const ring = (side: Side, i: number): { x: number; z: number; turn: number } => {
    if (i < 0 || i >= across(side)) throw new Error(`adventure: the ${side} has no cell ${i}`);
    if (side === "front") return { x: i, z: d, turn: 1 };
    if (side === "back") return { x: w - 1 - i, z: -1, turn: 3 };
    if (side === "right") return { x: w, z: d - 1 - i, turn: 2 };
    return { x: -1, z: i, turn: 0 };
  };
  // Where the i-th wall's piece goes: its ring cell, moved back in by the wall's thickness.
  const wall = (side: Side, i: number): { x: number; z: number; turn: number } => {
    const cell = ring(side, i);
    const [dx, dz] = STEP[cell.turn];
    return { ...cell, x: cell.x + dx * WALL, z: cell.z + dz * WALL };
  };

  const local: Placement[] = [];
  storeys.forEach((storey, y) => {
    const material = storey.material ?? "stone";
    for (const side of ["front", "back", "right", "left"] as const) {
      for (let i = 0; i < across(side); i++) {
        local.push({ piece: wallPiece(material, storey.walls?.[side]?.[i] ?? "plain"), ...wall(side, i), y });
      }
    }
    local.push(...corners(w, d, material, y));
  });
  for (const f of spec.fixtures ?? []) {
    const at = wall(f.side, f.cell);
    // A banner's cloth lies in the wall's own face: hung a hair out from it, it doesn't flicker into the wall.
    const [dx, dz] = f.piece.startsWith("banner") ? STEP[at.turn] : [0, 0];
    local.push({ piece: f.piece, ...at, x: at.x - dx * BANNER_OUT, z: at.z - dz * BANNER_OUT, y: f.storey ?? 0 });
  }
  if (spec.chimney) {
    const pastRoof = roof !== "none" && (roof.pitch ?? "high") === "high" ? 1 : 0;
    local.push(...chimney(wall(spec.chimney.side, spec.chimney.cell), storeys.length + pastRoof));
  }
  if (spec.balcony) local.push(...balcony(spec.balcony, ring, across(spec.balcony.side)));
  if (roof !== "none") local.push(...roofOf(roof, w, d).map((p) => ({ ...p, y: storeys.length })));
  return turned(local, spec.facing ?? 0, { width: w, depth: d }, spec.x, spec.z);
}

/** A wall's thickness: the kit's walls fill the outer tenth of their cell. */
const WALL = 0.1;
/** How far a banner hangs out from its wall's face. */
const BANNER_OUT = 0.01;

/** The posts on the footprint's corners, where two sides' walls meet. */
function corners(w: number, d: number, material: Material, y: number): Placement[] {
  if (material === "stone") {
    // The stone corner stands on its cell's +x, +z corner, on the walls' middle: each is turned to the footprint's corner.
    return [
      { piece: CORNER_POST.stone, x: w - 1, z: d - 1, y, turn: 0 },
      { piece: CORNER_POST.stone, x: w - 1, z: 0, y, turn: 1 },
      { piece: CORNER_POST.stone, x: 0, z: 0, y, turn: 2 },
      { piece: CORNER_POST.stone, x: 0, z: d - 1, y, turn: 3 },
    ];
  }
  // The wood pillar stands in its cell's middle: moved onto the corner, on the walls' middle.
  const inset = WALL / 2;
  return [
    [w - inset, d - inset],
    [w - inset, inset],
    [inset, inset],
    [inset, d - inset],
  ].map(([cx, cz]) => ({ piece: CORNER_POST.wood, x: cx - 0.5, z: cz - 0.5, y }));
}

function roofOf(roof: Roof, w: number, d: number): Placement[] {
  const high = (roof.pitch ?? "high") === "high";
  if (roof.shape === "point") {
    if (w !== 1 || d !== 1) throw new Error(`adventure: the kit's pointed roof covers one cell, not ${w}×${d}`);
    return [{ piece: high ? "roof-high-point" : "roof-point", x: 0, z: 0 }];
  }
  if (w === 1 && roof.shape === "gable") {
    return Array.from({ length: d }, (_, z) => ({ piece: high ? "roof-high-gable" : "roof-gable", x: 0, z, turn: 1 }));
  }
  if (w !== 2 || d < 2) throw new Error(`adventure: the kit's ${roof.shape} roof spans two cells across and two or more deep, not ${w}×${d}`);
  return roof.shape === "gable" ? gable(d, high) : hip(d, high);
}

/** A gable two cells wide, its ridge front to back. */
function gable(d: number, high: boolean): Placement[] {
  const [slope, left, right]: TownPiece[] = high ? ["roof-high", "roof-high-left", "roof-high-right"] : ["roof", "roof-left", "roof-right"];
  const run = (z: number): { left: TownPiece; right: TownPiece } => ({
    left: z === 0 ? left : z === d - 1 ? right : slope,
    // Turned to face the other way, the right column's ends swap.
    right: z === 0 ? right : z === d - 1 ? left : slope,
  });
  const placed: Placement[] = [];
  for (let z = 0; z < d; z++) placed.push({ piece: run(z).left, x: 0, z, turn: 0 }, { piece: run(z).right, x: 1, z, turn: 2 });
  return placed;
}

/** A hipped roof two cells wide: a gable whose runs end in corners rising to the middle. */
function hip(d: number, high: boolean): Placement[] {
  const [slope, corner]: TownPiece[] = high ? ["roof-high", "roof-high-corner"] : ["roof", "roof-corner"];
  const placed: Placement[] = [
    // Each corner rises to its own +x, −z corner, turned to the roof's middle.
    { piece: corner, x: 0, z: 0, turn: 3 },
    { piece: corner, x: 1, z: 0, turn: 2 },
    { piece: corner, x: 1, z: d - 1, turn: 1 },
    { piece: corner, x: 0, z: d - 1, turn: 0 },
  ];
  for (let z = 1; z < d - 1; z++) placed.push({ piece: slope, x: 0, z, turn: 0 }, { piece: slope, x: 1, z, turn: 2 });
  return placed;
}

/** A chimney against a gable end: its foot on the ground, a stack on each level above it, and its cap. */
function chimney(at: { x: number; z: number; turn: number }, levels: number): Placement[] {
  const placed: Placement[] = [{ piece: "chimney-base", ...at, y: 0 }];
  for (let y = 1; y < levels; y++) placed.push({ piece: "chimney", ...at, y });
  placed.push({ piece: "chimney-top", ...at, y: levels });
  return placed;
}

type Ring = (side: Side, i: number) => { x: number; z: number; turn: number };

/** A balcony along one side, a storey up, in the ring beyond that side's walls. */
function balcony(spec: Balcony, ring: Ring, cells: number): Placement[] {
  const { side, storey: y, stairs } = spec;
  if (y < 1) throw new Error("adventure: a balcony stands a storey up or more");
  if (stairs && y !== 1) throw new Error("adventure: the kit's stairs climb one storey");
  const placed: Placement[] = [];
  // A point in a ring cell, in the frame its wall stands in: out is −x, and from outside the left end is −z.
  const at = (cell: { x: number; z: number; turn: number }, lx: number, lz: number): { x: number; z: number } => {
    let [ox, oz] = [lx, lz];
    for (let i = 0; i < cell.turn; i++) [ox, oz] = [oz, -ox];
    return { x: cell.x + ox, z: cell.z + oz };
  };
  const post = (cell: { x: number; z: number; turn: number }, lz: number): void => {
    for (let below = 0; below < y; below++) placed.push({ piece: "pillar-wood", ...at(cell, -0.5 + POST, lz), y: below });
  };
  for (let i = 0; i < cells; i++) {
    const cell = ring(side, i);
    // The wall's turn faces out; turned a half, an edge piece stands on the cell's outer edge.
    placed.push({ piece: "planks", x: cell.x, z: cell.z, y }, { piece: "fence", x: cell.x, z: cell.z, y, turn: (cell.turn + 2) % 4 });
    post(cell, i === 0 ? -0.5 + POST : -0.5);
  }
  post(ring(side, cells - 1), 0.5 - POST);
  // The ends: a railing, or the stairs' way up. The left end, from outside, is a quarter turn on from the outside's way.
  const ends = [
    { end: "left", cell: ring(side, 0), turn: (ring(side, 0).turn + 1) % 4 },
    { end: "right", cell: ring(side, cells - 1), turn: (ring(side, cells - 1).turn + 3) % 4 },
  ] as const;
  for (const { end, cell, turn } of ends) {
    if (stairs !== end) {
      placed.push({ piece: "fence", x: cell.x, z: cell.z, y, turn });
      continue;
    }
    // The stairs stand in the next cell along, rising toward the balcony: to their own +x, the end's edge turned a half.
    const [dx, dz] = STEP[turn];
    placed.push({ piece: "stairs-wood", x: cell.x + dx, z: cell.z + dz, y: 0, turn: (turn + 2) % 4 });
  }
  return placed;
}

/** How far a balcony's posts stand in from its outer edge and ends: half the kit's wood pillar. */
const POST = 0.08;

/** Which way a piece's +x points on the grid at each turn. */
const STEP = [
  [1, 0],
  [0, -1],
  [-1, 0],
  [0, 1],
] as const;

/**
 * Placements laid out facing +z with their footprint from cell (0, 0), turned to
 * face `facing` and moved so the footprint's −x, −z corner cell is (x, z).
 */
export function turned(local: readonly Placement[], facing: number, footprint: { width: number; depth: number }, x: number, z: number): Placement[] {
  const quarter = ((facing % 4) + 4) % 4;
  // A cell's centre, turned about the origin a quarter at a time: +x goes to −z, +z to +x.
  const spin = (px: number, pz: number): [number, number] => {
    let [cx, cz] = [px + 0.5, pz + 0.5];
    for (let i = 0; i < quarter; i++) [cx, cz] = [cz, -cx];
    return [cx - 0.5, cz - 0.5];
  };
  const corners = [spin(0, 0), spin(footprint.width - 1, footprint.depth - 1)];
  const minX = Math.min(...corners.map(([cx]) => cx));
  const minZ = Math.min(...corners.map(([, cz]) => cz));
  return local.map((p) => {
    const [cx, cz] = spin(p.x, p.z);
    return { ...p, x: cx - minX + x, z: cz - minZ + z, turn: ((p.turn ?? 0) + quarter) % 4 };
  });
}

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
 *   two sides' walls meet: the kit's stone corner, or a wood pillar; an open
 *   storey stands on free pillars, stone or wood, at its corners instead.
 * - The kit's corner walls are the other way to turn a corner. Each runs along
 *   its cell's +x edge and round to its +z edge, with its outside facing out of
 *   its cell, so unlike a straight wall it stands in the footprint's own corner
 *   cell, in place of that cell's two straight walls: squared (`corner`),
 *   rounded at the corner (`rounded`), chamfered (`corner-diagonal`), cut
 *   across the whole cell from corner to corner (`diagonal`), bent across it
 *   (`corner-edge`), or curved across it (`curved`), whose curve is a quarter
 *   of the circle round a footprint two cells by two: four make a round tower.
 *   A corner wall needs two cells along each side, but the chamfer: on a side
 *   one cell across, the half chamfer runs the whole of the other side and
 *   chamfers to the middle of this one, so its two ends meet in a point, and
 *   the far end's is the half mirrored.
 * - Some walls are open frames rather than walls: a balcony's posts and rails,
 *   with or without a railing low down, and bare poles, with or without rails,
 *   for a building still going up. They are the same whatever the storey's
 *   material.
 * - The kit makes a few walls as one half of an opening two cells wide, in one
 *   hand only: the wide doorways, square or curved at the top, which open at
 *   their own +z end, and the arch tops, which open at their −z end. A pair of
 *   halves is the kit's piece and its mirror, set so each opens toward the other.
 * - Storeys are a unit tall and stack straight: each has its own material,
 *   walls and corners, and the roof sits on the top one. A building may stand on
 *   a plinth, raised by its height.
 * - A roof's slope rises inward to a vertical back, and its eave reaches past
 *   the footprint, over the walls' tops. Every roof comes high (red) or low
 *   (teal), with the same shapes:
 *   - A gable two cells wide is two runs of slopes back to back, ridge front to
 *     back. Their underside closes the gable ends, and the end pieces of each run
 *     (`-left` at a piece's −z end, `-right` at its +z end) carry the boards that
 *     frame them.
 *   - Three cells wide, the runs down the sides leave the middle open between
 *     their backs, which the gable's top piece covers, set up by the slopes'
 *     height (half a storey low, a whole one high) so its foot meets their tops.
 *     Flat pieces there instead make a flat-topped roof, three cells wide or
 *     more, their raised rims along the slopes' backs. Either way, the gable ends
 *     stay open under the raised middle, so the top storey's wall there goes on
 *     up, half a wall under a low roof and a whole one under a high one.
 *   - A gable one cell wide is one run of the whole-gable piece, whose ridge lies
 *     along its own x, so it is turned a quarter to run front to back. On a
 *     single cell it is the gable boarded at both ends; hipped, its ends are the
 *     gable end piece, which slopes down to its own −x.
 *   - A hipped roof two cells wide is a gable whose runs end in corner pieces,
 *     each rising to its own +x, −z corner, turned to rise to the middle. On a
 *     square footprint the four corners alone make a pyramid, and over curved
 *     walls the corners with a rounded eave make a cone. Three cells wide, it
 *     rises from all four sides to a flat top.
 *   - A window in the roof is a slope piece with a dormer, in place of a plain
 *     slope.
 *   - A one-cell footprint takes the pointed roof.
 *   - An L-shaped building is a hipped block two cells wide with a wing two
 *     cells deep running out from its front. The ridges meet over the block's
 *     front, and the wing's slopes run into the block's down a valley: the inner
 *     corner piece, high along its −z and +x edges and low at its −x, +z corner.
 * - What hangs on a wall's outside (a canopy over a door, a banner, a chimney's
 *   foot) is placed exactly as its wall is, except a banner: its cloth lies in
 *   the wall's very face, so it hangs a hair further out. Nothing covers a
 *   window or a door but a canopy, made to hang over a door.
 * - A chimney stands against a gable end, outside it, from the ground to above
 *   the ridge: its foot, a stack up each storey above the ground, one more past
 *   a high roof, and its cap, which clears a low roof's ridge by itself.
 * - A balcony runs the length of one side a storey up, in the ring beyond that
 *   side's walls: a plank floor, fences on its open edges, wood pillars beneath its outer edge,
 *   and stairs down from one end when it is one storey up, rising toward it,
 *   with or without a handrail.
 */

export type Material = "stone" | "wood";

/** The walls both materials have, by what follows `wall-` (stone) or `wall-wood-` (wood). */
type Both<P> = P extends `wall-wood-${infer Kind}` ? (`wall-${Kind}` extends TownPiece ? Kind : never) : never;
/** The pieces that fill a corner cell or a whole cell rather than stand on one edge. */
type NotAnEdge = "block" | "block-half" | "curved" | "rounded" | "diagonal" | `corner${string}`;
/**
 * A side's wall in one cell: `plain` is the wall alone; `balcony` and `poles`
 * are open frames, the same whatever the storey's material; `open` is no wall.
 */
export type WallKind = "plain" | Exclude<Both<TownPiece>, NotAnEdge> | "balcony" | "balcony-fence" | "poles" | "poles-horizontal" | "open";

/** The walls the kit makes as one half of an opening two cells wide, in one hand only, and which end of the half is open. */
const HALVES: Partial<Record<WallKind, "right" | "left">> = {
  "doorway-square-wide": "right",
  "doorway-square-wide-curved": "right",
  "arch-top": "left",
  "arch-top-detail": "left",
};

/**
 * How a storey's walls turn the footprint's corners: a post where two straight
 * walls meet, a free-standing pillar, or one of the kit's corner walls.
 */
export type Corners = "post" | "pillar" | "square" | "rounded" | "diagonal" | "cut" | "edge" | "curved";
type CornerWall = Exclude<Corners, "post" | "pillar">;

const CORNER_WALL: Record<CornerWall, string> = {
  square: "corner",
  rounded: "rounded",
  diagonal: "corner-diagonal",
  cut: "diagonal",
  edge: "corner-edge",
  curved: "curved",
};

export type Side = "front" | "back" | "left" | "right";

export interface Storey {
  material?: Material;
  /** Each side's wall in each cell, from left to right as someone outside facing it sees them; `fill` where not given. */
  walls?: Partial<Record<Side, readonly WallKind[]>>;
  /** The wall wherever `walls` doesn't say; plain when not given. */
  fill?: WallKind;
  /** How the walls turn the corners; posts when not given. */
  corners?: Corners;
}

export interface Roof {
  /** `flat` slopes down the left and right sides with a flat top between them, on a footprint three cells across or more. */
  shape: "gable" | "hip" | "flat" | "point";
  /** High roofs are the kit's steep red ones, low roofs its shallower teal ones. */
  pitch?: "high" | "low";
  /** Windows in the roof, each in place of a slope on the left or right side, in its `cell` counted as that side's walls are. */
  dormers?: readonly { side: "left" | "right"; cell: number }[];
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
  /** Whether the stairs have a handrail up their open side. */
  handrail?: boolean;
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
  /** How high the building stands, on a plinth; on the ground when not given. */
  base?: number;
  /** From the ground up; one plain stone storey when not given. */
  storeys?: readonly Storey[];
  roof?: Roof | "none";
  fixtures?: readonly Fixture[];
  /** A chimney outside a gable end, the front or back, in that side's `cell`. */
  chimney?: { side: "front" | "back"; cell: number };
  balcony?: Balcony;
}

const CORNER_POST: Record<Material, TownPiece> = { stone: "wall-corner-detail", wood: "pillar-wood" };
const PILLAR: Record<Material, TownPiece> = { stone: "pillar-stone", wood: "pillar-wood" };

function wallPiece(material: Material, kind: Exclude<WallKind, "open">): TownPiece {
  if (kind === "balcony") return "balcony-wall";
  if (kind === "balcony-fence") return "balcony-wall-fence";
  if (kind === "poles" || kind === "poles-horizontal") return kind;
  if (kind === "plain") return material === "stone" ? "wall" : "wall-wood";
  return material === "stone" ? `wall-${kind}` : `wall-wood-${kind}`;
}

function cornerPiece(material: Material, shape: CornerWall, half: boolean): TownPiece {
  const name = `${material === "stone" ? "wall" : "wall-wood"}-${CORNER_WALL[shape]}${half ? "-half" : ""}`;
  return name as TownPiece;
}

type Ring = (side: Side, i: number) => { x: number; z: number; turn: number };

/** Every piece of a building, placed on the grid. */
export function building(spec: Building): Placement[] {
  const { width: w, depth: d, storeys = [{}], roof = { shape: "gable" } } = spec;
  if (w < 1 || d < 1) throw new Error(`adventure: a building needs at least one cell, not ${w}×${d}`);
  const across = (side: Side): number => (side === "front" || side === "back" ? w : d);

  // Laid out facing +z, footprint from cell (0, 0). Each side's ring cell for its
  // i-th wall, in the order its wall list reads, and the turn that faces it out.
  const ring: Ring = (side, i) => {
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
    const corners = storey.corners ?? "post";
    const shaped = corners !== "post" && corners !== "pillar";
    for (const side of ["front", "back", "right", "left"] as const) {
      const kinds = Array.from({ length: across(side) }, (_, i) => storey.walls?.[side]?.[i] ?? storey.fill ?? "plain");
      kinds.forEach((kind, i) => {
        if (shaped && (i === 0 || i === kinds.length - 1)) {
          const given = storey.walls?.[side]?.[i] ?? "plain";
          if (given !== "plain") throw new Error(`adventure: the ${side}'s cell ${i} is a corner wall, so it can't be ${given}`);
          return;
        }
        if (kind !== "open") local.push({ piece: wallPiece(material, kind), ...wall(side, i), y, ...halfOf(kinds, i) });
      });
    }
    const turning = shaped ? cornerWalls(w, d, material, corners) : posts(w, d, corners === "pillar" ? PILLAR[material] : CORNER_POST[material]);
    local.push(...turning.map((p) => ({ ...p, y })));
  });
  // Nothing covers a window or a way in, but a canopy, which is made to hang over a door: a fixture or a chimney stands against bare wall.
  const bare = (side: Side, cell: number, y: number, piece: TownPiece): void => {
    const kind = storeys[y].walls?.[side]?.[cell] ?? storeys[y].fill ?? "plain";
    if (kind === "plain" || kind.startsWith("detail") || (piece === "overhang" && /^door/.test(kind))) return;
    throw new Error(`adventure: the ${side}'s cell ${cell} on storey ${y} is a ${kind}, which a ${piece} would cover`);
  };
  for (const f of spec.fixtures ?? []) {
    bare(f.side, f.cell, f.storey ?? 0, f.piece);
    const at = wall(f.side, f.cell);
    // A banner's cloth lies in the wall's own face: hung a hair out from it, it doesn't flicker into the wall.
    const [dx, dz] = f.piece.startsWith("banner") ? STEP[at.turn] : [0, 0];
    local.push({ piece: f.piece, ...at, x: at.x - dx * BANNER_OUT, z: at.z - dz * BANNER_OUT, y: f.storey ?? 0 });
  }
  if (spec.chimney) {
    for (let y = 0; y < storeys.length; y++) bare(spec.chimney.side, spec.chimney.cell, y, "chimney");
    const pastRoof = roof !== "none" && (roof.pitch ?? "high") === "high" ? 1 : 0;
    local.push(...chimney(wall(spec.chimney.side, spec.chimney.cell), storeys.length + pastRoof));
  }
  if (spec.balcony) local.push(...balcony(spec.balcony, ring, across(spec.balcony.side)));
  if (roof !== "none") {
    const top = storeys[storeys.length - 1];
    const high = (roof.pitch ?? "high") === "high";
    local.push(...roofOf(roof, w, d, top.corners === "curved").map((p) => ({ ...p, y: storeys.length + (p.y ?? 0) })));
    // A roof that rises between its slopes leaves its gable ends open there, under the raised middle: the top storey's walls go on up to close them.
    if (w >= 3 && roof.shape !== "hip") {
      const end = wallPiece(top.material ?? "stone", high ? "plain" : "half");
      for (let i = 1; i < w - 1; i++) local.push({ piece: end, ...wall("front", i), y: storeys.length }, { piece: end, ...wall("back", i), y: storeys.length });
    }
  }
  const base = spec.base ?? 0;
  return turned(local, spec.facing ?? 0, { width: w, depth: d }, spec.x, spec.z).map((p) => (base === 0 ? p : { ...p, y: (p.y ?? 0) + base }));
}

/**
 * A half of an opening two cells wide is made opening at one end, so along a
 * side the halves pair up, left and right as seen from outside, and of each
 * pair the half that must open the other way is the kit's piece mirrored.
 */
function halfOf(kinds: readonly WallKind[], i: number): { mirror?: true } {
  const opens = HALVES[kinds[i]];
  if (opens === undefined) return {};
  let start = i;
  while (start > 0 && kinds[start - 1] === kinds[i]) start--;
  let end = i;
  while (end < kinds.length - 1 && kinds[end + 1] === kinds[i]) end++;
  if ((end - start + 1) % 2 !== 0) throw new Error(`adventure: a ${kinds[i]} is half of an opening two cells wide, so they come in pairs`);
  // A piece's +z end is its right as seen from outside: the pair's left half opens to its right.
  const left = (i - start) % 2 === 0;
  return left === (opens === "right") ? {} : { mirror: true };
}

/** A wall's thickness: the kit's walls fill the outer tenth of their cell. */
const WALL = 0.1;
/** How far a banner hangs out from its wall's face. */
const BANNER_OUT = 0.01;

/** The posts on the footprint's corners, where two sides' walls meet. */
function posts(w: number, d: number, piece: TownPiece): Placement[] {
  if (piece === CORNER_POST.stone) {
    // The stone corner stands on its cell's +x, +z corner, on the walls' middle: each is turned to the footprint's corner.
    return CORNERS(w, d).map(({ x, z, turn }) => ({ piece, x, z, turn }));
  }
  // A pillar stands in its cell's middle: moved onto the corner, on the walls' middle.
  const inset = WALL / 2;
  return [
    [w - inset, d - inset],
    [w - inset, inset],
    [inset, inset],
    [inset, d - inset],
  ].map(([cx, cz]) => ({ piece, x: cx - 0.5, z: cz - 0.5 }));
}

/**
 * The footprint's corner cells, each with the turn that puts a corner piece's
 * own +x, +z corner on the footprint's corner, and the sides that piece's +x
 * and +z edges then lie along.
 */
function CORNERS(w: number, d: number): { x: number; z: number; turn: number; plusX: Side; plusZ: Side }[] {
  return [
    { x: w - 1, z: d - 1, turn: 0, plusX: "right", plusZ: "front" },
    { x: w - 1, z: 0, turn: 1, plusX: "back", plusZ: "right" },
    { x: 0, z: 0, turn: 2, plusX: "left", plusZ: "back" },
    { x: 0, z: d - 1, turn: 3, plusX: "front", plusZ: "left" },
  ];
}

/**
 * The kit's corner walls, one in each corner cell of the footprint, running
 * along its +x edge and round to its +z edge: unlike a straight wall, a corner
 * wall stands in the footprint's own cell, its outside facing out of it. A
 * chamfered corner on a side only one cell across takes the half chamfer,
 * which stops at the middle of that side, so the side's two chamfers meet in a
 * point; the other end of that side takes the half mirrored.
 */
function cornerWalls(w: number, d: number, material: Material, shape: CornerWall): Placement[] {
  const across = (side: Side): number => (side === "front" || side === "back" ? w : d);
  return CORNERS(w, d).map(({ x, z, turn, plusX, plusZ }) => {
    const [narrowX, narrowZ] = [across(plusX) === 1, across(plusZ) === 1];
    if (!narrowX && !narrowZ) return { piece: cornerPiece(material, shape, false), x, z, turn };
    if (shape !== "diagonal" || (narrowX && narrowZ)) throw new Error(`adventure: a ${shape} corner needs two cells along each side, not ${w}×${d}`);
    // The half runs the whole of its +x edge and chamfers to the middle of its +z edge: mirrored and turned a quarter back, the whole of its +z edge.
    return narrowZ ? { piece: cornerPiece(material, shape, true), x, z, turn } : { piece: cornerPiece(material, shape, true), x, z, turn: (turn + 3) % 4, mirror: true };
  });
}

/** How far the top of a roof with a raised middle stands above the slopes' foot: the slopes' height. */
const RISE = { high: 1, low: 0.5 } as const;

/** The pieces of each pitch. */
const PITCH = {
  high: {
    slope: "roof-high",
    left: "roof-high-left",
    right: "roof-high-right",
    window: "roof-high-window",
    corner: "roof-high-corner",
    round: "roof-high-corner-round",
    inner: "roof-high-cornerinner",
    gable: "roof-high-gable",
    gableEnd: "roof-high-gable-end",
    gableDetail: "roof-high-gable-detail",
    gableTop: "roof-high-gable-top",
    flat: "roof-high-flat",
    point: "roof-high-point",
  },
  low: {
    slope: "roof",
    left: "roof-left",
    right: "roof-right",
    window: "roof-window",
    corner: "roof-corner",
    round: "roof-corner-round",
    inner: "roof-corner-inner",
    gable: "roof-gable",
    gableEnd: "roof-gable-end",
    gableDetail: "roof-gable-detail",
    gableTop: "roof-gable-top",
    flat: "roof-flat",
    point: "roof-point",
  },
} as const satisfies Record<"high" | "low", Record<string, TownPiece>>;
type Pieces = (typeof PITCH)[keyof typeof PITCH];

function roofOf(roof: Roof, w: number, d: number, round: boolean): Placement[] {
  const pitch = roof.pitch ?? "high";
  const pieces = PITCH[pitch];
  const placed = roofShape(roof.shape, w, d, pieces, RISE[pitch], round);
  for (const { side, cell } of roof.dormers ?? []) {
    // A side's cells run from the back on the left, from the front on the right, as its walls do.
    const at = side === "left" ? { x: 0, z: cell } : { x: w - 1, z: d - 1 - cell };
    const slope = placed.find((p) => p.x === at.x && p.z === at.z && p.piece === pieces.slope);
    if (slope === undefined) throw new Error(`adventure: the roof has no plain slope on the ${side} in cell ${cell} for a dormer`);
    slope.piece = pieces.window;
  }
  return placed;
}

function roofShape(shape: Roof["shape"], w: number, d: number, pieces: Pieces, rise: number, round: boolean): Placement[] {
  if (shape === "point") {
    if (w !== 1 || d !== 1) throw new Error(`adventure: the kit's pointed roof covers one cell, not ${w}×${d}`);
    return [{ piece: pieces.point, x: 0, z: 0 }];
  }
  if (w === 1) return narrow(shape, d, pieces);
  if (d < 2) throw new Error(`adventure: the kit's ${shape} roof needs two cells deep, not ${w}×${d}`);
  if (shape === "hip") {
    if (w === 2) return hip(d, pieces, round);
    if (w === 3 && d >= 3) return broadHip(d, pieces, rise);
    throw new Error(`adventure: the kit's hipped roof spans two or three cells across, not ${w}×${d}`);
  }
  if (shape === "gable" && w === 2) return gable(2, d, pieces);
  if ((shape === "gable" && w !== 3) || (shape === "flat" && w < 3)) throw new Error(`adventure: the kit's ${shape} roof can't span ${w} cells across`);
  // Between the side runs, a raised top along the ridge: the gable's top piece, or flat pieces whose rims meet the slopes' backs.
  const top: Placement[] = [];
  for (let x = 1; x < w - 1; x++) {
    for (let z = 0; z < d; z++) top.push({ piece: shape === "gable" ? pieces.gableTop : pieces.flat, x, z, y: rise, turn: 1 });
  }
  return [...gable(w, d, pieces), ...top];
}

/** A roof one cell wide: the whole-gable piece, its ridge front to back, boarded at both ends on one cell alone, or hipped at the ends. */
function narrow(shape: Roof["shape"], d: number, pieces: Pieces): Placement[] {
  if (shape === "flat") throw new Error("adventure: the kit's flat-topped roof needs three cells across");
  if (shape === "gable") {
    if (d === 1) return [{ piece: pieces.gableDetail, x: 0, z: 0, turn: 1 }];
    return Array.from({ length: d }, (_, z) => ({ piece: pieces.gable, x: 0, z, turn: 1 }));
  }
  if (d < 2) throw new Error("adventure: a hipped roof one cell wide needs two cells deep");
  // The hipped end piece slopes down to its own −x: turned to the front, or to the back.
  return Array.from({ length: d }, (_, z) =>
    z === d - 1 ? { piece: pieces.gableEnd, x: 0, z, turn: 1 } : z === 0 ? { piece: pieces.gableEnd, x: 0, z, turn: 3 } : { piece: pieces.gable, x: 0, z, turn: 1 },
  );
}

/** The two runs of slopes down the left and right sides, ridge front to back, boarded at the gable ends. */
function gable(w: number, d: number, pieces: Pieces): Placement[] {
  const run = (z: number): { left: TownPiece; right: TownPiece } => ({
    left: z === 0 ? pieces.left : z === d - 1 ? pieces.right : pieces.slope,
    // Turned to face the other way, the right column's ends swap.
    right: z === 0 ? pieces.right : z === d - 1 ? pieces.left : pieces.slope,
  });
  const placed: Placement[] = [];
  for (let z = 0; z < d; z++) placed.push({ piece: run(z).left, x: 0, z, turn: 0 }, { piece: run(z).right, x: w - 1, z, turn: 2 });
  return placed;
}

/** A hipped roof two cells wide: a gable whose runs end in corners rising to the middle, their eaves rounded over curved walls. */
function hip(d: number, pieces: Pieces, round: boolean): Placement[] {
  const corner = round ? pieces.round : pieces.corner;
  const placed: Placement[] = [
    // Each corner rises to its own +x, −z corner, turned to the roof's middle.
    { piece: corner, x: 0, z: 0, turn: 3 },
    { piece: corner, x: 1, z: 0, turn: 2 },
    { piece: corner, x: 1, z: d - 1, turn: 1 },
    { piece: corner, x: 0, z: d - 1, turn: 0 },
  ];
  for (let z = 1; z < d - 1; z++) placed.push({ piece: pieces.slope, x: 0, z, turn: 0 }, { piece: pieces.slope, x: 1, z, turn: 2 });
  return placed;
}

/** A hipped roof three cells wide: slopes rising from all four sides, and a flat top over the middle. */
function broadHip(d: number, pieces: Pieces, rise: number): Placement[] {
  const placed: Placement[] = [
    { piece: pieces.corner, x: 0, z: 0, turn: 3 },
    { piece: pieces.corner, x: 2, z: 0, turn: 2 },
    { piece: pieces.corner, x: 2, z: d - 1, turn: 1 },
    { piece: pieces.corner, x: 0, z: d - 1, turn: 0 },
    // The middle of the front and back, rising to the back and to the front.
    { piece: pieces.slope, x: 1, z: d - 1, turn: 1 },
    { piece: pieces.slope, x: 1, z: 0, turn: 3 },
  ];
  for (let z = 1; z < d - 1; z++) {
    placed.push({ piece: pieces.slope, x: 0, z, turn: 0 }, { piece: pieces.slope, x: 2, z, turn: 2 }, { piece: pieces.flat, x: 1, z, y: rise, turn: 1 });
  }
  return placed;
}

/** A chimney against a gable end: its foot on the ground, a stack on each level above it, and its cap. */
function chimney(at: { x: number; z: number; turn: number }, levels: number): Placement[] {
  const placed: Placement[] = [{ piece: "chimney-base", ...at, y: 0 }];
  for (let y = 1; y < levels; y++) placed.push({ piece: "chimney", ...at, y });
  placed.push({ piece: "chimney-top", ...at, y: levels });
  return placed;
}

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
    placed.push({ piece: spec.handrail === true ? "stairs-wood-handrail" : "stairs-wood", x: cell.x + dx, z: cell.z + dz, y: 0, turn: (turn + 2) % 4 });
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

/** A wing two cells deep running out from the left of a building's front, as seen from outside facing it. */
export interface Wing {
  /** Cells it reaches out past the building's side. */
  length: number;
  /** Its storeys, as many as the building's; its side against the building is open to it. */
  storeys?: readonly Storey[];
}

/**
 * An L-shaped building: a hipped block two cells wide, with a wing two cells
 * deep running out from the left of its front, flush with it, under one roof.
 * The roofs' ridges meet over the block's front, where the wing's slopes run
 * into the block's down a valley: the kit's inner corner piece, high along two
 * edges and low at the corner between the others.
 */
export function winged(spec: Building, wing: Wing): Placement[] {
  const { depth: d, storeys = [{}], roof = { shape: "hip" } } = spec;
  const wingStoreys = wing.storeys ?? storeys.map(() => ({}));
  if (spec.width !== 2 || d < 3 || roof === "none" || roof.shape !== "hip") throw new Error("adventure: a wing joins a hipped block two cells wide and three or more deep");
  if (wingStoreys.length !== storeys.length) throw new Error("adventure: a wing has as many storeys as its building");
  const L = wing.length;
  // The block's left side is open where the wing joins it, and the wing's right side all along.
  const open = (s: Storey, side: Side, cells: number, from: number): Storey => ({
    ...s,
    walls: { ...s.walls, [side]: Array.from({ length: cells }, (_, i) => (i >= from ? "open" : (s.walls?.[side]?.[i] ?? s.fill ?? "plain"))) },
  });
  const block = building({ ...spec, x: L, z: 0, facing: 0, base: 0, roof: "none", storeys: storeys.map((s) => open(s, "left", d, d - 2)) });
  const arm = building({ x: 0, z: d - 2, width: L, depth: 2, storeys: wingStoreys.map((s) => open(s, "right", 2, 0)), roof: "none" });
  // The posts where the wing's front meets the block's stand mid-wall: neither is a corner.
  const joint = (p: Placement): boolean => /^(pillar-wood|wall-corner-detail)$/.test(p.piece) && Math.abs(p.x - (L - 0.5)) < 0.6 && Math.abs(p.z - (d - 0.5)) < 0.6;
  const pieces = PITCH[roof.pitch ?? "high"];
  const y = storeys.length;
  const R = (piece: TownPiece, x: number, z: number, turn: number): Placement => ({ piece, x: x + L, z, y, turn });
  const top: Placement[] = [
    // The block's back is hipped; its left slope runs down to the valley, its right side to the front's hip.
    R(pieces.corner, 0, 0, 3),
    R(pieces.corner, 1, 0, 2),
    ...Array.from({ length: d - 3 }, (_, i) => [R(pieces.slope, 0, i + 1, 0), R(pieces.slope, 1, i + 1, 2)]).flat(),
    R(pieces.slope, 1, d - 2, 2),
    R(pieces.corner, 1, d - 1, 1),
    // The valley, high along its +x and +z edges, where the two ridges meet.
    R(pieces.inner, 0, d - 2, 3),
    R(pieces.slope, 0, d - 1, 1),
    // The wing: slopes rising to its ridge from back and front, hipped at its end.
    ...Array.from({ length: L - 1 }, (_, i) => [R(pieces.slope, i - L + 1, d - 2, 3), R(pieces.slope, i - L + 1, d - 1, 1)]).flat(),
    R(pieces.corner, -L, d - 2, 3),
    R(pieces.corner, -L, d - 1, 0),
  ];
  const local = [...block.filter((p) => !joint(p)), ...arm.filter((p) => !joint(p)), ...top];
  const base = spec.base ?? 0;
  return turned(local, spec.facing ?? 0, { width: L + 2, depth: d }, spec.x, spec.z).map((p) => (base === 0 ? p : { ...p, y: (p.y ?? 0) + base }));
}

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

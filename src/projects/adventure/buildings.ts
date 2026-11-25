import type { TownPiece } from "./fantasy-town";
import type { Placement } from "./town";

/**
 * Buildings put together from the Fantasy Town Kit's pieces by its own rules:
 *
 * - A piece fills one unit cell, centred on its origin. A wall stands along the
 *   cell's +x edge, its outside facing out of the cell, so a quarter turn moves
 *   it to the next edge round.
 * - A building is walled by its edges: one wall piece on each outer edge of each
 *   cell of its footprint, and a post standing in each corner.
 * - Each roof piece is one column's slope, rising inward to a vertical back, so
 *   a gable is two slopes back to back over a footprint two cells wide. Their
 *   underside closes the gable ends, and the end pieces of each run (`-left` at
 *   a piece's −z end, `-right` at its +z end) carry the boards that frame it.
 *
 * Shapes the kit offers beyond these (storeys, hipped and flat roofs, chimneys,
 * balconies, round and diagonal walls) join here as each is worked out on the
 * piece bench (`?view=pieces`).
 */

export type Material = "stone" | "wood";

/** The walls both materials have, by what follows `wall-` (stone) or `wall-wood-` (wood); `plain` is the wall alone. */
type Both<P> = P extends `wall-wood-${infer Kind}` ? (`wall-${Kind}` extends TownPiece ? Kind : never) : never;
export type WallKind = "plain" | Both<TownPiece>;

export type Side = "front" | "back" | "left" | "right";

export interface Building {
  /** The cell at the footprint's −x, −z corner, once the building is turned to face its way. */
  x: number;
  z: number;
  /** Cells across the front, and from front to back. */
  width: number;
  depth: number;
  /** Quarter turns anticlockwise seen from above, as a piece's: 0 faces the front to +z, 1 to +x. */
  facing?: number;
  material?: Material;
  /** Each side's wall in each cell, from left to right as someone outside facing it sees them; plain where not given. */
  walls?: Partial<Record<Side, readonly WallKind[]>>;
  roof?: "gable" | "none";
}

const CORNER_POST: Record<Material, TownPiece> = { stone: "wall-corner-detail", wood: "wall-wood-corner-edge" };

function wallPiece(material: Material, kind: WallKind): TownPiece {
  if (kind === "plain") return material === "stone" ? "wall" : "wall-wood";
  return material === "stone" ? `wall-${kind}` : `wall-wood-${kind}`;
}

/** Every piece of a building, placed on the grid. */
export function building(spec: Building): Placement[] {
  const { width: w, depth: d, material = "stone", walls = {}, roof = "gable" } = spec;
  if (w < 1 || d < 1) throw new Error(`adventure: a building needs at least one cell, not ${w}×${d}`);
  const wall = (side: Side, i: number): TownPiece => wallPiece(material, walls[side]?.[i] ?? "plain");

  // Laid out facing +z, from cell (0, 0); each side's cells in the order its wall list reads.
  const local: Placement[] = [];
  for (let i = 0; i < w; i++) local.push({ piece: wall("front", i), x: i, z: d - 1, turn: 3 });
  for (let i = 0; i < w; i++) local.push({ piece: wall("back", i), x: w - 1 - i, z: 0, turn: 1 });
  for (let i = 0; i < d; i++) local.push({ piece: wall("right", i), x: w - 1, z: d - 1 - i, turn: 0 });
  for (let i = 0; i < d; i++) local.push({ piece: wall("left", i), x: 0, z: i, turn: 2 });
  const post = CORNER_POST[material];
  local.push(
    { piece: post, x: w - 1, z: d - 1, turn: 0 },
    { piece: post, x: w - 1, z: 0, turn: 1 },
    { piece: post, x: 0, z: 0, turn: 2 },
    { piece: post, x: 0, z: d - 1, turn: 3 },
  );
  if (roof === "gable") local.push(...gable(w, d));
  return turned(local, spec.facing ?? 0, spec.x, spec.z);
}

/** A gable roof a storey up, its ridge front to back. */
function gable(w: number, d: number): Placement[] {
  if (w !== 2 || d < 2) throw new Error(`adventure: the kit's gable roof spans two cells across and two or more deep, not ${w}×${d}`);
  const run = (z: number): { left: TownPiece; right: TownPiece } => ({
    left: z === 0 ? "roof-high-left" : z === d - 1 ? "roof-high-right" : "roof-high",
    // Turned to face the other way, the right column's ends swap.
    right: z === 0 ? "roof-high-right" : z === d - 1 ? "roof-high-left" : "roof-high",
  });
  const roof: Placement[] = [];
  for (let z = 0; z < d; z++) {
    roof.push({ piece: run(z).left, x: 0, z, y: 1, turn: 0 }, { piece: run(z).right, x: 1, z, y: 1, turn: 2 });
  }
  return roof;
}

/** Placements laid out facing +z, turned to face `facing` and moved so their −x, −z corner cell is (x, z). */
export function turned(local: readonly Placement[], facing: number, x: number, z: number): Placement[] {
  const quarter = ((facing % 4) + 4) % 4;
  const spun = local.map((p) => {
    // A cell's centre, turned about the origin a quarter at a time: +x goes to −z, +z to +x.
    let [cx, cz] = [p.x + 0.5, p.z + 0.5];
    for (let i = 0; i < quarter; i++) [cx, cz] = [cz, -cx];
    return { ...p, x: cx - 0.5, z: cz - 0.5, turn: ((p.turn ?? 0) + quarter) % 4 };
  });
  const minX = Math.min(...spun.map((p) => p.x));
  const minZ = Math.min(...spun.map((p) => p.z));
  return spun.map((p) => ({ ...p, x: p.x - minX + x, z: p.z - minZ + z }));
}

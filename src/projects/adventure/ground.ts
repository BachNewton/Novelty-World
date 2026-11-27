import { cliffPieces, riseCells, type Cliff, type Face, type Terrain } from "./cliffs";
import { COUNTRY_DIRT, COUNTRY_OPEN_ENDS, COUNTRY_RISES, COUNTRY_ROUGH, COUNTRY_WATER } from "./country";
import type { Placement } from "./town";
import { cellsAlong, endWay, GROUND, laidShapeAt, shapeAt, tilePiece, VARIANTS, type Cell, type Has, type Shape } from "./ways";

export { GROUND, type Cell } from "./ways";

/** The cells a path runs through, from its first cell to its last by each one between, in straight runs along x or z. */
export const pathCells = cellsAlong;

/**
 * What a cell of the ground is: grass, a dirt track sunk in it (a patch where
 * it is two cells or more across), water, or empty: no ground at all, nothing
 * drawn and nothing to stand on.
 */
export type GroundKind = "grass" | "dirt" | "water" | "empty";

/** Each kind's mark in a row of the ground. */
export const GROUND_MARKS: Readonly<Record<GroundKind, string>> = { grass: ".", dirt: "d", water: "w", empty: "x" };
const KIND_OF_MARK: Readonly<Record<string, GroundKind | undefined>> = { ".": "grass", d: "dirt", w: "water", x: "empty" };

/** The highest a cell rises, in half storeys: its height is one digit. */
export const MAX_HEIGHT = 9;

/**
 * Each way of making a raised cell's faces by its mark in a row of cliffs: the
 * letter the face (`p` plain, `l` large, `s` steps), in capitals for red rock.
 */
const CLIFF_OF_MARK: Readonly<Record<string, Cliff | undefined>> = {
  p: { rock: "stone", edge: "plain" },
  l: { rock: "stone", edge: "large" },
  s: { rock: "stone", edge: "steps" },
  P: { rock: "rock", edge: "plain" },
  L: { rock: "rock", edge: "large" },
  S: { rock: "rock", edge: "steps" },
};
const markOfCliff = ({ rock, edge }: Cliff): string => {
  const mark = edge[0];
  return rock === "rock" ? mark.toUpperCase() : mark;
};
const PLAIN_STONE = "p";

/** The ground's side, in cells. */
export const GROUND_SIDE = GROUND.max - GROUND.min + 1;

/** Every tile a cell may be given by choice, beside the one its shape calls for. */
export const VARIANT_TILES: ReadonlySet<string> = new Set(Object.values(VARIANTS).flatMap((tiles) => tiles ?? []));

/**
 * The ground as data: each cell's kind, its height and how the faces round it
 * are made where it is raised, the tile chosen for a cell where the kit makes
 * more than one for its shape, and the face a cell shows at its own level in
 * place of the plain one. Tiles and cliffs are never stored: each cell's tile
 * and turn follow from its neighbours, as `ways.ts` lays them, and every face
 * from the heights, as `cliffs.ts` stands them. Each string holds a mark a
 * cell, row by row from the grid's −z edge, each row from its −x end.
 */
export interface GroundLayer {
  /** Each cell's kind (`GROUND_MARKS`). */
  readonly cells: string;
  /** Each cell's height in half storeys, a digit; an empty cell's is 0. */
  readonly heights: string;
  /** How the faces round each cell are made where it stands above its neighbours (`p`, `l`, `s`, and in capitals for red rock). */
  readonly cliffs: string;
  /** The tile chosen for a cell, by its `x,z`, without its kind's prefix: `Rocks`, `BendBank`, `End` or a plain one. */
  readonly variants: Readonly<Record<string, string>>;
  /** The face a cell shows at its own level, by its `x,z`. */
  readonly faces: Readonly<Record<string, Face>>;
}

const key = (x: number, z: number): string => `${x},${z}`;
const inGrid = (x: number, z: number): boolean => x >= GROUND.min && x <= GROUND.max && z >= GROUND.min && z <= GROUND.max;
const indexOf = (x: number, z: number): number => (z - GROUND.min) * GROUND_SIDE + (x - GROUND.min);

/** Grass at the ground's level everywhere, with nothing chosen. */
export function flatGround(): GroundLayer {
  const cells = GROUND_SIDE * GROUND_SIDE;
  return { cells: GROUND_MARKS.grass.repeat(cells), heights: "0".repeat(cells), cliffs: PLAIN_STONE.repeat(cells), variants: {}, faces: {} };
}

/** The kind of a cell. */
/** Every cell with no ground, by its −x, −z corner. */
export function emptyCells(ground: GroundLayer): [number, number][] {
  const empty: [number, number][] = [];
  for (let x = GROUND.min; x <= GROUND.max; x++) {
    for (let z = GROUND.min; z <= GROUND.max; z++) if (ground.cells[indexOf(x, z)] === GROUND_MARKS.empty) empty.push([x, z]);
  }
  return empty;
}

export function kindAt(ground: GroundLayer, x: number, z: number): GroundKind {
  const kind = KIND_OF_MARK[ground.cells[indexOf(x, z)]];
  if (kind === undefined) throw new Error(`adventure: the ground at ${x},${z} has no kind`);
  return kind;
}

/** A cell's height in half storeys: 0 off the ground and where it is empty. */
export function heightAt(ground: GroundLayer, x: number, z: number): number {
  return inGrid(x, z) ? Number(ground.heights[indexOf(x, z)]) : 0;
}

/** The ground as the cliffs read it. */
export function terrainOf(ground: GroundLayer): Terrain {
  return {
    level: (x, z) => heightAt(ground, x, z),
    ground: (x, z) => inGrid(x, z) && ground.cells[indexOf(x, z)] !== GROUND_MARKS.empty,
    water: (x, z) => inGrid(x, z) && ground.cells[indexOf(x, z)] === GROUND_MARKS.water,
    cliff: (x, z) => CLIFF_OF_MARK[inGrid(x, z) ? ground.cliffs[indexOf(x, z)] : PLAIN_STONE] ?? fail(`adventure: the ground at ${x},${z} has no cliff`),
    face: (x, z) => ground.faces[key(x, z)] as Face | undefined,
  };
}

/**
 * Whom a cell's way joins: its neighbours of its kind at its height, and for
 * water, water below it too, which it runs on into over the edge.
 */
function joins(ground: GroundLayer, x: number, z: number): Has {
  const i = indexOf(x, z);
  const [mark, height] = [ground.cells[i], ground.heights[i]];
  return (nx, nz) => {
    if (!inGrid(nx, nz)) return false;
    const j = indexOf(nx, nz);
    if (ground.cells[j] !== mark) return false;
    return ground.heights[j] === height || (mark === GROUND_MARKS.water && ground.heights[j] < height);
  };
}

/** The tile a dirt or water cell's shape calls for, or null on grass and where there is no ground. */
function shapeOf(ground: GroundLayer, x: number, z: number): Shape | null {
  const mark = ground.cells[indexOf(x, z)];
  return mark === GROUND_MARKS.grass || mark === GROUND_MARKS.empty ? null : laidShapeAt(x, z, joins(ground, x, z));
}

/**
 * The dirt and water cells whose shape the kit has no tile for, laid instead
 * as the narrow way joining the same neighbours: where a join looks wrong
 * because the kit lacks the piece, not because the painter chose badly.
 */
export function unfitted(ground: GroundLayer): Cell[] {
  const cells: Cell[] = [];
  for (let z = GROUND.min; z <= GROUND.max; z++) {
    for (let x = GROUND.min; x <= GROUND.max; x++) {
      const mark = ground.cells[indexOf(x, z)];
      if (mark !== GROUND_MARKS.grass && mark !== GROUND_MARKS.empty && shapeAt(x, z, joins(ground, x, z)) === null) cells.push([x, z]);
    }
  }
  return cells;
}

const optionsOf = (shape: Shape): readonly string[] => VARIANTS[shape.name] ?? [shape.name];

/** The pieces a way's end runs out level onto. */
const RAMP = /^(stairs-|cliff_steps|cliff_blockSlope)/;

/** Whether steps or a ramp the ground's cliffs stand in a cell have their foot at a height, in half storeys. */
function rampFootIn(ground: GroundLayer, x: number, z: number, height: number): boolean {
  return inGrid(x, z) && cliffPieces(terrainOf(ground), x, z).some((p) => RAMP.test(p.piece) && Math.round((p.y ?? 0) * 2) === height);
}

/**
 * The tile a cell takes: the one chosen for it while that fits its shape;
 * else, for an end, the open one where it runs out onto the foot of steps or
 * a ramp at its own height, placed or standing in the cliffs; else the plain one.
 */
function tileName(ground: GroundLayer, x: number, z: number, shape: Shape, ramps: ReadonlySet<string>): string {
  const chosen = ground.variants[key(x, z)] as string | undefined;
  if (chosen !== undefined && optionsOf(shape).includes(chosen)) return chosen;
  if (shape.name === "EndClosed") {
    const [dx, dz] = endWay(shape.turn);
    const [bx, bz] = [x - dx, z - dz];
    const height = heightAt(ground, x, z);
    if (ramps.has(`${bx},${bz},${height}`) || rampFootIn(ground, bx, bz, height)) return "End";
  }
  return shape.name;
}

/**
 * The tile laid on one cell, at its height, or null where it is empty. `ramps`
 * are where steps or a ramp placed on the map have their foot, by
 * `x,z,height` in half storeys (`rampsOf`).
 */
export function tileAt(ground: GroundLayer, x: number, z: number, ramps: ReadonlySet<string>): Placement | null {
  const kind = kindAt(ground, x, z);
  if (kind === "empty") return null;
  const height = heightAt(ground, x, z);
  const lift = height === 0 ? {} : { y: height / 2 };
  const shape = shapeOf(ground, x, z);
  if (shape === null) return { piece: "ground_grass", x, z, ...lift };
  return { piece: tilePiece(kind === "dirt" ? "path" : "river", tileName(ground, x, z, shape, ramps)), x, z, ...lift, turn: shape.turn };
}

/** What the ground draws in one cell: its tile, and the cliffs standing in it. */
export interface GroundCell {
  tile: Placement | null;
  cliffs: Placement[];
}

export function groundCell(ground: GroundLayer, x: number, z: number, ramps: ReadonlySet<string>): GroundCell {
  return { tile: tileAt(ground, x, z, ramps), cliffs: cliffPieces(terrainOf(ground), x, z) };
}

/** What the ground draws in every cell, the grid's columns from its −x edge, each from its −z end. */
export function groundCells(ground: GroundLayer, ramps: ReadonlySet<string>): GroundCell[] {
  const cells: GroundCell[] = [];
  for (let x = GROUND.min; x <= GROUND.max; x++) {
    for (let z = GROUND.min; z <= GROUND.max; z++) cells.push(groundCell(ground, x, z, ramps));
  }
  return cells;
}

/** A cell's place among `groundCells`. */
export function tileIndex(x: number, z: number): number {
  return (x - GROUND.min) * GROUND_SIDE + (z - GROUND.min);
}

/** Where steps or a ramp placed on the map have their foot, by `x,z,height` in half storeys: what an end of a way at that height runs out level onto. */
export function rampsOf(placements: readonly Placement[]): Set<string> {
  const ramps = new Set<string>();
  for (const p of placements) {
    if (RAMP.test(p.piece)) ramps.add(`${Math.floor(p.x + 0.5)},${Math.floor(p.z + 0.5)},${Math.max(0, Math.round((p.y ?? 0) * 2))}`);
  }
  return ramps;
}

/**
 * How far a change to one cell reaches in its neighbours' tiles and cliffs: a
 * tile follows its eight neighbours, and whether each of its four is part of
 * a wide stretch, which follows theirs; a cliff follows its eight neighbours'
 * heights, and whether a cut beside it stands, which follows the cut's.
 */
const REACH = 2;

/** The cells whose tile or cliffs a change to these cells may change, themselves among them. */
export function reachedBy(cells: Iterable<Cell>): Cell[] {
  const reached = new Map<string, Cell>();
  for (const [x, z] of cells) {
    for (let dx = -REACH; dx <= REACH; dx++) {
      for (let dz = -REACH; dz <= REACH; dz++) {
        if (inGrid(x + dx, z + dz)) reached.set(key(x + dx, z + dz), [x + dx, z + dz]);
      }
    }
  }
  return [...reached.values()];
}

const cellOfIndex = (i: number): Cell => [GROUND.min + (i % GROUND_SIDE), GROUND.min + Math.floor(i / GROUND_SIDE)];

/** The cells whose kind, height, cliff, chosen tile or face differs between two grounds. */
export function changedCells(before: GroundLayer, after: GroundLayer): Cell[] {
  const changed = new Map<string, Cell>();
  const note = (cell: Cell): void => {
    changed.set(key(cell[0], cell[1]), cell);
  };
  for (const field of ["cells", "heights", "cliffs"] as const) {
    if (before[field] === after[field]) continue;
    for (let i = 0; i < after[field].length; i++) if (before[field][i] !== after[field][i]) note(cellOfIndex(i));
  }
  for (const field of ["variants", "faces"] as const) {
    if (before[field] === after[field]) continue;
    const [was, now]: Readonly<Record<string, string>>[] = [before[field], after[field]];
    for (const cell of new Set([...Object.keys(was), ...Object.keys(now)])) {
      if (was[cell] === now[cell]) continue;
      const [x, z] = cell.split(",").map(Number);
      note([x, z]);
    }
  }
  return [...changed.values()];
}

/** The ground with its marks changed, a tile chosen for a cell whose shape no longer has it let go, so the cell takes its plain tile. */
function settled(next: GroundLayer, changed: readonly Cell[]): GroundLayer {
  const variants = { ...next.variants };
  for (const [x, z] of reachedBy(changed)) {
    const chosen = variants[key(x, z)] as string | undefined;
    if (chosen === undefined) continue;
    const shape = shapeOf(next, x, z);
    if (shape === null || !optionsOf(shape).includes(chosen)) delete variants[key(x, z)];
  }
  return { ...next, variants };
}

/** The cells of a list on the ground, each once. */
function distinct(cells: readonly Cell[]): Cell[] {
  return [...new Map(cells.filter(([x, z]) => inGrid(x, z)).map((c) => [key(c[0], c[1]), c])).values()];
}

/**
 * The ground with cells painted a kind, each at the height it has. Every tile
 * round them follows by itself; a tile chosen for a cell whose shape no longer
 * has it is let go, so the cell takes its plain tile, and painting a cell
 * grass lets its go too. Painting a cell empty takes its ground away, height,
 * face and all. The same ground when nothing changes.
 */
export function painted(ground: GroundLayer, cells: readonly Cell[], kind: GroundKind): GroundLayer {
  const mark = GROUND_MARKS[kind];
  const changed = distinct(cells).filter(([x, z]) => ground.cells[indexOf(x, z)] !== mark);
  if (changed.length === 0) return ground;
  const marks = ground.cells.split("");
  const heights = ground.heights.split("");
  const faces = { ...ground.faces };
  for (const [x, z] of changed) {
    marks[indexOf(x, z)] = mark;
    if (kind === "empty") {
      heights[indexOf(x, z)] = "0";
      delete faces[key(x, z)];
    }
  }
  return settled({ ...ground, cells: marks.join(""), heights: heights.join(""), faces }, changed);
}

/**
 * The ground with cells raised (or lowered, by a negative step) by some half
 * storeys, each from its own height, no lower than the ground's level and no
 * higher than `MAX_HEIGHT`; an empty cell has no ground to raise. A cell
 * raised takes `cliff` where one is given; else, raised from the ground's
 * level, the cliff of the highest raised cell beside it, so a rise grown
 * outward keeps its stone. The same ground when nothing changes.
 */
export function raised(ground: GroundLayer, cells: readonly Cell[], by: number, cliff?: Cliff): GroundLayer {
  const heights = ground.heights.split("");
  const cliffs = ground.cliffs.split("");
  const changed: Cell[] = [];
  for (const [x, z] of distinct(cells)) {
    const i = indexOf(x, z);
    if (ground.cells[i] === GROUND_MARKS.empty) continue;
    const from = Number(ground.heights[i]);
    const to = Math.min(MAX_HEIGHT, Math.max(0, from + by));
    if (to === from) continue;
    heights[i] = String(to);
    if (cliff !== undefined && to > from) cliffs[i] = markOfCliff(cliff);
    else if (from === 0) {
      const beside = [[1, 0], [0, -1], [-1, 0], [0, 1]]
        .map(([dx, dz]) => [x + dx, z + dz])
        .filter(([nx, nz]) => heightAt(ground, nx, nz) > 0)
        .sort(([ax, az], [bx, bz]) => heightAt(ground, bx, bz) - heightAt(ground, ax, az))[0] as number[] | undefined;
      if (beside !== undefined) cliffs[i] = ground.cliffs[indexOf(beside[0], beside[1])];
    }
    changed.push([x, z]);
  }
  if (changed.length === 0) return ground;
  return settled({ ...ground, heights: heights.join(""), cliffs: cliffs.join("") }, changed);
}

/** The ground with a cell given the next of the tiles the kit makes for its shape, or the same ground where it makes only one. */
export function cycled(ground: GroundLayer, x: number, z: number, ramps: ReadonlySet<string>): GroundLayer {
  if (!inGrid(x, z)) return ground;
  const shape = shapeOf(ground, x, z);
  if (shape === null) return ground;
  const options = optionsOf(shape);
  if (options.length === 1) return ground;
  const next = options[(options.indexOf(tileName(ground, x, z, shape, ramps)) + 1) % options.length];
  return { ...ground, variants: { ...ground.variants, [key(x, z)]: next } };
}

/** The ground with a tile chosen for each of these cells whose shape the kit makes it for; the rest are left as they are. The same ground when nothing changes. */
export function withTile(ground: GroundLayer, cells: readonly Cell[], tile: string): GroundLayer {
  const variants = { ...ground.variants };
  let changed = false;
  for (const [x, z] of distinct(cells)) {
    const shape = shapeOf(ground, x, z);
    if (shape === null || !optionsOf(shape).includes(tile) || variants[key(x, z)] === tile) continue;
    variants[key(x, z)] = tile;
    changed = true;
  }
  return changed ? { ...ground, variants } : ground;
}

/**
 * The ground with these cells given a face at their own level, or with their
 * face taken away where `face` is null. An empty cell, which has no ground to
 * show one, is left as it is. The same ground when nothing changes.
 */
export function faced(ground: GroundLayer, cells: readonly Cell[], face: Face | null): GroundLayer {
  const faces = { ...ground.faces };
  let changed = false;
  for (const [x, z] of distinct(cells)) {
    const cell = key(x, z);
    if (ground.cells[indexOf(x, z)] === GROUND_MARKS.empty || (faces[cell] as Face | undefined) === (face ?? undefined)) continue;
    if (face === null) delete faces[cell];
    else faces[cell] = face;
    changed = true;
  }
  return changed ? { ...ground, faces } : ground;
}

/** One of the ground's strings as rows, a row of marks each, from its −z edge. */
export function rowsOf(marks: string): string[] {
  return Array.from({ length: GROUND_SIDE }, (_, i) => marks.slice(i * GROUND_SIDE, (i + 1) * GROUND_SIDE));
}

/** Whether a mark names a kind, a height or a cliff. */
export const isGroundMark = (mark: string): boolean => KIND_OF_MARK[mark] !== undefined;
export const isHeightMark = (mark: string): boolean => /^[0-9]$/.test(mark) && Number(mark) <= MAX_HEIGHT;
export const isCliffMark = (mark: string): boolean => CLIFF_OF_MARK[mark] !== undefined;

/** Whether a cell lies on the ground. */
export const onGround = inGrid;

/**
 * The ground as the code lays it: grass everywhere but the paths' and the
 * country's dirt patches and its water, raised where the country's rises
 * stand. Where a path crosses water the water is laid, and the path ends in a
 * bank either side of it, under a bridge's ends. The country's rough stretches
 * take their shape's other tile, and its ends that run out level onto a field
 * or the top of steps the open end.
 */
export function codeGround(paths: readonly (readonly Cell[])[]): GroundLayer {
  const flat = flatGround();
  const marks = flat.cells.split("");
  const heights = flat.heights.split("");
  const cliffs = flat.cliffs.split("");
  const faces: Record<string, Face> = {};
  for (const [x, z] of [...paths.flatMap(cellsAlong), ...COUNTRY_DIRT]) marks[indexOf(x, z)] = GROUND_MARKS.dirt;
  for (const [x, z] of COUNTRY_WATER) marks[indexOf(x, z)] = GROUND_MARKS.water;
  for (const rise of COUNTRY_RISES) {
    const cells = riseCells(rise);
    for (const [cell, { height, cliff }] of cells.heights) {
      const [x, z] = cell.split(",").map(Number);
      heights[indexOf(x, z)] = String(height);
      cliffs[indexOf(x, z)] = markOfCliff(cliff);
    }
    for (const [cell, face] of cells.faces) faces[cell] = face;
  }
  const plain: GroundLayer = { cells: marks.join(""), heights: heights.join(""), cliffs: cliffs.join(""), variants: {}, faces };
  const variants: Record<string, string> = {};
  for (const [x, z] of COUNTRY_OPEN_ENDS) {
    if (shapeOf(plain, x, z)?.name !== "EndClosed") throw new Error(`adventure: the way at ${x},${z} is to run out level but isn't an end`);
    variants[key(x, z)] = "End";
  }
  for (const [x, z] of COUNTRY_ROUGH) {
    const shape = shapeOf(plain, x, z);
    const rough = shape === null || shape.name === "EndClosed" ? undefined : VARIANTS[shape.name]?.[1];
    if (rough === undefined) throw new Error(`adventure: the ground at ${x},${z} has no rough tile for its shape`);
    variants[key(x, z)] = rough;
  }
  return { ...plain, variants };
}

function fail(message: string): never {
  throw new Error(message);
}

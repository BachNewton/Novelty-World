import { COUNTRY_DIRT, COUNTRY_OPEN_ENDS, COUNTRY_ROUGH, COUNTRY_WATER } from "./country";
import type { Placement } from "./town";
import { cellsAlong, endWay, GROUND, laidShapeAt, tilePiece, VARIANTS, type Cell, type Has, type Shape } from "./ways";

export { GROUND, type Cell } from "./ways";

/** The cells a path runs through, from its first cell to its last by each one between, in straight runs along x or z. */
export const pathCells = cellsAlong;

/** What a cell of the ground is: grass, a dirt track sunk in it (a patch where it is two cells or more across), or water. */
export type GroundKind = "grass" | "dirt" | "water";

/** Each kind's mark in a row of the ground. */
export const GROUND_MARKS: Readonly<Record<GroundKind, string>> = { grass: ".", dirt: "d", water: "w" };
const KIND_OF_MARK: Readonly<Record<string, GroundKind | undefined>> = { ".": "grass", d: "dirt", w: "water" };

/** The ground's side, in cells. */
export const GROUND_SIDE = GROUND.max - GROUND.min + 1;

/** Every tile a cell may be given by choice, beside the one its shape calls for. */
export const VARIANT_TILES: ReadonlySet<string> = new Set(Object.values(VARIANTS).flatMap((tiles) => tiles ?? []));

/**
 * The ground as data: each cell's kind, and the tile chosen for a cell where
 * the kit makes more than one for its shape. Tiles are never stored: each
 * cell's tile and turn follow from its neighbours, as `ways.ts` lays them.
 */
export interface GroundLayer {
  /** A mark a cell (`GROUND_MARKS`), row by row from the grid's −z edge, each row from its −x end. */
  readonly cells: string;
  /** The tile chosen for a cell, by its `x,z`, without its kind's prefix: `Rocks`, `BendBank`, `End` or a plain one. */
  readonly variants: Readonly<Record<string, string>>;
}

const key = (x: number, z: number): string => `${x},${z}`;
const inGrid = (x: number, z: number): boolean => x >= GROUND.min && x <= GROUND.max && z >= GROUND.min && z <= GROUND.max;
const indexOf = (x: number, z: number): number => (z - GROUND.min) * GROUND_SIDE + (x - GROUND.min);

/** The kind of a cell. */
export function kindAt(ground: GroundLayer, x: number, z: number): GroundKind {
  const kind = KIND_OF_MARK[ground.cells[indexOf(x, z)]];
  if (kind === undefined) throw new Error(`adventure: the ground at ${x},${z} has no kind`);
  return kind;
}

const hasKind = (ground: GroundLayer, mark: string): Has => (x, z) => inGrid(x, z) && ground.cells[indexOf(x, z)] === mark;

/** The tile a dirt or water cell's shape calls for, or null on grass. */
function shapeOf(ground: GroundLayer, x: number, z: number): Shape | null {
  const mark = ground.cells[indexOf(x, z)];
  return mark === GROUND_MARKS.grass ? null : laidShapeAt(x, z, hasKind(ground, mark));
}

const optionsOf = (shape: Shape): readonly string[] => VARIANTS[shape.name] ?? [shape.name];

/**
 * The tile a cell takes: the one chosen for it while that fits its shape;
 * else, for an end, the open one where it runs out onto steps or a ramp; else
 * the plain one.
 */
function tileName(ground: GroundLayer, x: number, z: number, shape: Shape, ramps: ReadonlySet<string>): string {
  const chosen = ground.variants[key(x, z)] as string | undefined;
  if (chosen !== undefined && optionsOf(shape).includes(chosen)) return chosen;
  if (shape.name === "EndClosed") {
    const [dx, dz] = endWay(shape.turn);
    if (ramps.has(key(x - dx, z - dz))) return "End";
  }
  return shape.name;
}

/** The tile laid on one cell. `ramps` are the cells where steps or a ramp stand on the ground, by `x,z`. */
export function tileAt(ground: GroundLayer, x: number, z: number, ramps: ReadonlySet<string>): Placement {
  const kind = kindAt(ground, x, z);
  const shape = shapeOf(ground, x, z);
  if (shape === null) return { piece: "ground_grass", x, z };
  return { piece: tilePiece(kind === "dirt" ? "path" : "river", tileName(ground, x, z, shape, ramps)), x, z, turn: shape.turn };
}

/** Every cell's tile, the grid's columns from its −x edge, each from its −z end. */
export function groundTiles(ground: GroundLayer, ramps: ReadonlySet<string>): Placement[] {
  const tiles: Placement[] = [];
  for (let x = GROUND.min; x <= GROUND.max; x++) {
    for (let z = GROUND.min; z <= GROUND.max; z++) tiles.push(tileAt(ground, x, z, ramps));
  }
  return tiles;
}

/** A tile's place among `groundTiles`. */
export function tileIndex(x: number, z: number): number {
  return (x - GROUND.min) * GROUND_SIDE + (z - GROUND.min);
}

/** Where steps or a ramp stand on the ground, by `x,z`: what an end of a way runs out level onto. */
export function rampsOf(placements: readonly Placement[]): Set<string> {
  const ramps = new Set<string>();
  for (const p of placements) {
    if (RAMP.test(p.piece) && (p.y ?? 0) < 0.5) ramps.add(key(Math.floor(p.x + 0.5), Math.floor(p.z + 0.5)));
  }
  return ramps;
}
const RAMP = /^(stairs-|cliff_steps|cliff_blockSlope)/;

/**
 * How far a change to one cell reaches in its neighbours' tiles: a tile
 * follows its eight neighbours, and whether each of its four is part of a
 * wide stretch, which follows theirs.
 */
const REACH = 2;

/** The cells whose tile a change to these cells may change, themselves among them. */
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

/** The cells whose kind or chosen tile differs between two grounds. */
export function changedCells(before: GroundLayer, after: GroundLayer): Cell[] {
  const changed: Cell[] = [];
  if (before.cells !== after.cells) {
    for (let i = 0; i < after.cells.length; i++) {
      if (before.cells[i] !== after.cells[i]) changed.push([GROUND.min + (i % GROUND_SIDE), GROUND.min + Math.floor(i / GROUND_SIDE)]);
    }
  }
  if (before.variants !== after.variants) {
    for (const cell of new Set([...Object.keys(before.variants), ...Object.keys(after.variants)])) {
      if (before.variants[cell] === after.variants[cell]) continue;
      const [x, z] = cell.split(",").map(Number);
      changed.push([x, z]);
    }
  }
  return changed;
}

/**
 * The ground with cells painted a kind. Every tile round them follows by
 * itself; a tile chosen for a cell whose shape no longer has it is let go, so
 * the cell takes its plain tile, and painting a cell grass lets its go too.
 * The same ground when nothing changes.
 */
export function painted(ground: GroundLayer, cells: readonly Cell[], kind: GroundKind): GroundLayer {
  const marks = ground.cells.split("");
  const changed = cells.filter(([x, z]) => inGrid(x, z) && marks[indexOf(x, z)] !== GROUND_MARKS[kind]);
  if (changed.length === 0) return ground;
  for (const [x, z] of changed) marks[indexOf(x, z)] = GROUND_MARKS[kind];
  const next: GroundLayer = { cells: marks.join(""), variants: ground.variants };
  const variants = { ...ground.variants };
  for (const [x, z] of reachedBy(changed)) {
    const chosen = variants[key(x, z)] as string | undefined;
    if (chosen === undefined) continue;
    const shape = shapeOf(next, x, z);
    if (shape === null || !optionsOf(shape).includes(chosen)) delete variants[key(x, z)];
  }
  return { cells: next.cells, variants };
}

/** The ground with a cell given the next of the tiles the kit makes for its shape, or the same ground where it makes only one. */
export function cycled(ground: GroundLayer, x: number, z: number, ramps: ReadonlySet<string>): GroundLayer {
  if (!inGrid(x, z)) return ground;
  const shape = shapeOf(ground, x, z);
  if (shape === null) return ground;
  const options = optionsOf(shape);
  if (options.length === 1) return ground;
  const next = options[(options.indexOf(tileName(ground, x, z, shape, ramps)) + 1) % options.length];
  return { cells: ground.cells, variants: { ...ground.variants, [key(x, z)]: next } };
}

/** The ground's rows, each a row of marks, from its −z edge. */
export function groundRows(ground: GroundLayer): string[] {
  return Array.from({ length: GROUND_SIDE }, (_, i) => ground.cells.slice(i * GROUND_SIDE, (i + 1) * GROUND_SIDE));
}

/** Whether a mark names a kind. */
export const isGroundMark = (mark: string): boolean => KIND_OF_MARK[mark] !== undefined;

/** Whether a cell lies on the ground. */
export const onGround = inGrid;

/**
 * The ground as the code lays it: grass everywhere but the paths' and the
 * country's dirt patches and its water. Where a path crosses water the water
 * is laid, and the path ends in a bank either side of it, under a bridge's
 * ends. The country's rough stretches take their shape's other tile, and its
 * ends that run out level onto a field the open end.
 */
export function codeGround(paths: readonly (readonly Cell[])[]): GroundLayer {
  const marks = new Array<string>(GROUND_SIDE * GROUND_SIDE).fill(GROUND_MARKS.grass);
  for (const [x, z] of [...paths.flatMap(cellsAlong), ...COUNTRY_DIRT]) marks[indexOf(x, z)] = GROUND_MARKS.dirt;
  for (const [x, z] of COUNTRY_WATER) marks[indexOf(x, z)] = GROUND_MARKS.water;
  const plain: GroundLayer = { cells: marks.join(""), variants: {} };
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
  return { cells: plain.cells, variants };
}

/**
 * The shared tile map: grid shape, parsing (localStorage and wire), and the
 * one store both the play canvas and the editor read and write. The store
 * persists every change, so toggling modes or reloading never loses edits.
 */

import { migrateTileSrc } from "./tiles";
import { foldAnimSx, sheetForTileSrc } from "./tile-anim";

export const MAP_COLS = 40;
export const MAP_ROWS = 28;
export const STORAGE_KEY = "map-editor-v1";

export interface PlacedTile {
  src: string;
  sx: number;
  sy: number;
}

export type MapGrid = (PlacedTile | null)[][];

/** One cell write: a tile, or `null` to erase. */
export interface CellEdit {
  c: number;
  r: number;
  tile: PlacedTile | null;
}

export function createEmptyGrid(): MapGrid {
  return Array.from({ length: MAP_ROWS }, () =>
    Array.from({ length: MAP_COLS }, () => null),
  );
}

export function sameTile(a: PlacedTile | null, b: PlacedTile | null): boolean {
  if (a === null || b === null) return a === b;
  return a.src === b.src && a.sx === b.sx && a.sy === b.sy;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isIndex(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isCellIndex(value: unknown, size: number): value is number {
  return isIndex(value) && value < size;
}

/**
 * Validate an untrusted tile (storage or a peer): the src must be in the
 * tile manifest (legacy `/tiles/` paths migrate first) and animated sheets
 * fold to frame 0. `null` for anything unusable.
 */
export function parseTile(value: unknown): PlacedTile | null {
  if (!isRecord(value)) return null;
  const { src, sx, sy } = value;
  if (typeof src !== "string" || !isIndex(sx) || !isIndex(sy)) {
    return null;
  }
  const migrated = migrateTileSrc(src);
  const sheet = sheetForTileSrc(migrated);
  if (sheet === undefined) return null;
  return { src: migrated, sx: foldAnimSx(sheet, sx), sy };
}

/** Validate an untrusted grid; `null` unless it is exactly MAP_ROWS x MAP_COLS. */
export function parseGrid(value: unknown): MapGrid | null {
  if (!Array.isArray(value) || value.length !== MAP_ROWS) return null;
  const grid: MapGrid = [];
  for (const row of value) {
    if (!Array.isArray(row) || row.length !== MAP_COLS) return null;
    grid.push(row.map(parseTile));
  }
  return grid;
}

/** Validate untrusted cell edits, dropping any that are malformed. */
export function parseCellEdits(value: unknown): CellEdit[] {
  if (!Array.isArray(value)) return [];
  const edits: CellEdit[] = [];
  for (const item of value) {
    if (!isRecord(item) || !isCellIndex(item.c, MAP_COLS) || !isCellIndex(item.r, MAP_ROWS)) {
      continue;
    }
    if (item.tile === null) {
      edits.push({ c: item.c, r: item.r, tile: null });
      continue;
    }
    const tile = parseTile(item.tile);
    if (tile !== null) edits.push({ c: item.c, r: item.r, tile });
  }
  return edits;
}

function loadStoredGrid(): MapGrid {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) return createEmptyGrid();
  try {
    return parseGrid(JSON.parse(raw)) ?? createEmptyGrid();
  } catch (err) {
    // Corrupt storage (hand-edited, truncated write) starts a fresh map
    // rather than bricking the game; say so instead of failing silently.
    console.error("rpg: discarding unreadable stored map", err);
    return createEmptyGrid();
  }
}

export interface MapStore {
  /** Current grid. Treat as read-only; it is replaced, never mutated. */
  grid(): MapGrid;
  /** Apply edits; returns only those that changed a cell. */
  apply(edits: readonly CellEdit[]): CellEdit[];
  clear(): void;
  replace(grid: MapGrid): void;
  subscribe(listener: () => void): () => void;
}

export function createMapStore(
  initial: MapGrid,
  persist: (grid: MapGrid) => void = () => {},
): MapStore {
  let grid = initial;
  const listeners = new Set<() => void>();

  function commit(next: MapGrid): void {
    grid = next;
    persist(grid);
    for (const listener of listeners) listener();
  }

  return {
    grid: () => grid,
    apply(edits) {
      const changed = edits.filter((e) => !sameTile(grid[e.r][e.c], e.tile));
      if (changed.length === 0) return changed;
      const next = grid.map((row) => row.slice());
      for (const e of changed) next[e.r][e.c] = e.tile;
      commit(next);
      return changed;
    },
    clear() {
      if (grid.every((row) => row.every((cell) => cell === null))) return;
      commit(createEmptyGrid());
    },
    replace(next) {
      commit(next);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** The browser map store, loaded from and persisted to localStorage. */
export function createStoredMapStore(): MapStore {
  return createMapStore(loadStoredGrid(), (grid) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(grid));
  });
}

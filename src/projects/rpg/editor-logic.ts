import { CELL_PX, TILE_SHEET_BY_SRC } from "./tiles";
import {
  canonicalSrcFor,
  isAnimSheet,
  isNestedSingle,
  matrixFor,
  matrixIndicesFor,
  matrixPrimaryFor,
  pickerSrcsFor,
  staticFor,
  syncKeyFor,
} from "./tile-variants";
import { MAP_COLS, MAP_ROWS, type PlacedTile } from "./world-map";

export type MapMouseDownIntent = "pick" | "paint" | "erase" | "ignore";
export type MapMouseMoveIntent = "pick" | "paint" | "erase" | "none";

/** Left-click intent: Alt turns the brush into an eyedropper. Right-button
 * erase is never modified by Alt. */
export function resolveMouseDownIntent(
  button: number,
  altKey: boolean,
): MapMouseDownIntent {
  if (button === 2) return "erase";
  if (button !== 0) return "ignore";
  return altKey ? "pick" : "paint";
}

/** Drag intent, keeping mousedown's left-before-right button priority. */
export function resolveMouseMoveIntent(
  buttons: number,
  altKey: boolean,
): MapMouseMoveIntent {
  if ((buttons & 1) === 1) return altKey ? "pick" : "paint";
  if ((buttons & 2) === 2) return "erase";
  return "none";
}

/** Physical Alt keys only — `code`-based so §/AltGr layouts never match a
 * bare `key === "Alt"` read. */
export function isAltModifierCode(code: string): boolean {
  return code === "AltLeft" || code === "AltRight";
}

/** Eyedropper cursor state: plain Alt only. Ctrl/Meta/AltGraph held alongside
 * (notably AltGr, which reports as Ctrl+Alt) keep the normal brush cursor. */
export function resolveEyedropperActive(opts: {
  alt: boolean;
  ctrl?: boolean;
  meta?: boolean;
  altGraph?: boolean;
}): boolean {
  return (
    opts.alt &&
    (opts.ctrl ?? false) === false &&
    (opts.meta ?? false) === false &&
    (opts.altGraph ?? false) === false
  );
}

/** Pure hover math shared by hit-testing and unit tests: canvas-CSS point →
 * map cell, honouring the fractional fit-scale and centering offsets. */
export function cellFromPoint(
  x: number,
  y: number,
  scale: number,
  offsetX: number,
  offsetY: number,
): { c: number; r: number } | null {
  const c = Math.floor((x - offsetX) / (CELL_PX * scale));
  const r = Math.floor((y - offsetY) / (CELL_PX * scale));
  if (c < 0 || c >= MAP_COLS || r < 0 || r >= MAP_ROWS) return null;
  return { c, r };
}

/** Eyedropper cursor: inline SVG data-URI (no new asset files) with a
 * `crosshair` fallback. Hotspot (4 20) sits on the drop tip. */
export const EYEDROPPER_CURSOR =
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E` +
  `%3Cg transform='rotate(45 12 12)'%3E` +
  `%3Crect x='10.5' y='1' width='3' height='7' rx='1' fill='%23f97316' stroke='white'/%3E` +
  `%3Crect x='10.5' y='9' width='3' height='8' fill='%23e2e8f0' stroke='white'/%3E` +
  `%3Cpath d='M10.5 17h3L12 21z' fill='%2338bdf8' stroke='white'/%3E` +
  `%3C/g%3E` +
  `%3Ccircle cx='5' cy='19' r='2.5' fill='%2338bdf8' stroke='white' stroke-width='1.2'/%3E` +
  `%3C/svg%3E") 4 20, crosshair`;

export interface PickedSelection {
  /** Manifest sheet src backing the selection — the matrix primary for
   * matrix-member picks, so the owning section highlights. */
  sheetSrc: string;
  /** Paint src, kept as stored so repaints reproduce the picked cell. */
  src: string;
  sx: number;
  sy: number;
  /** Variant picker sync (group key + index), or null when no picker owns it. */
  variant: { key: string; index: number } | null;
  /** Matrix picker sync, or null for non-matrix picks and unknown combos. */
  matrix: { primary: string; indices: number[] } | null;
  /** Anim-toggle sync for the section owner, or null for nested singles
   * (they paint from a parent row with no toggle of their own). */
  anim: { primary: string; animated: boolean } | null;
}

/** Resolve an eyedropper pick to a selection plus the picker states that
 * must sync (variant dots, matrix dots, anim toggle). Returns null for
 * srcs with no manifest sheet, which the caller treats as "clear". */
export function resolvePickedTile(tile: PlacedTile): PickedSelection | null {
  const staticSide = staticFor(tile.src);
  const animated = staticSide !== null;
  const staticSrc = staticSide ?? tile.src;
  let canonical = canonicalSrcFor(staticSrc);
  if (isAnimSheet(canonical)) {
    const folded = staticFor(canonical);
    if (folded !== null) canonical = folded;
  }
  const primary =
    matrixFor(canonical) === null ? null : canonical;
  const matrixPrimary = primary ?? matrixPrimaryFor(canonical);
  if (matrixPrimary !== null) {
    const matrix = matrixFor(matrixPrimary);
    if (matrix === null || !TILE_SHEET_BY_SRC.has(matrixPrimary)) return null;
    const indices = matrixIndicesFor(matrix, staticSrc);
    return {
      sheetSrc: matrixPrimary,
      src: tile.src,
      sx: tile.sx,
      sy: tile.sy,
      variant: null,
      matrix: indices === null ? null : { primary: matrixPrimary, indices },
      anim: { primary: matrixPrimary, animated },
    };
  }
  if (!TILE_SHEET_BY_SRC.has(canonical)) return null;
  const choices = pickerSrcsFor(canonical);
  const index = choices.indexOf(staticSrc);
  return {
    sheetSrc: canonical,
    src: tile.src,
    sx: tile.sx,
    sy: tile.sy,
    variant:
      index < 0 ? null : { key: syncKeyFor(canonical), index },
    matrix: null,
    anim: isNestedSingle(canonical)
      ? null
      : { primary: canonical, animated },
  };
}

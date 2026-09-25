import { useCallback, useRef, useState } from "react";
import { TILE_SHEET_BY_SRC, type TileSheet } from "./tiles";
import {
  animFor,
  matrixPaintSrc,
  pickerSrcsFor,
  staticFor,
  syncKeyFor,
  type TileMatrix,
} from "./tile-variants";
import { resolvePickedTile } from "./editor-logic";
import type { PlacedTile } from "./world-map";

export interface SelectedTile {
  sheet: TileSheet;
  sx: number;
  sy: number;
  /** Paint URL: the canonical sheet src, or a synthesized variant src. */
  src: string;
}

export interface TileSelection {
  selected: SelectedTile | null;
  select: (tile: SelectedTile) => void;
  /** Eyedropper: select a placed tile and sync every picker to it (null clears). */
  pick: (tile: PlacedTile | null) => void;
  /** Chosen variant paint src for a canonical (null = canonical sheet). */
  activeVariantFor: (canonicalSrc: string) => string | null;
  animatedFor: (primarySrc: string) => boolean;
  matrixChoiceFor: (primarySrc: string, matrix: TileMatrix) => number[];
  selectVariant: (canonicalSrc: string, src: string | null) => void;
  selectMatrix: (
    primarySrc: string,
    matrix: TileMatrix,
    axisIdx: number,
    optIdx: number,
  ) => void;
  toggleAnim: (primarySrc: string, next: boolean) => void;
}

/** Static paint src through a section's anim toggle (identity when off). */
function animPaintFor(animated: boolean, paint: string): string {
  return animated ? (animFor(paint) ?? paint) : paint;
}

/** The brush tile plus every palette picker choice (variant dots, matrix
 * dots, anim toggles) that shapes it. */
export function useTileSelection(): TileSelection {
  const [selected, setSelected] = useState<SelectedTile | null>(null);
  /** Per-group paint variant index into pickerSrcsFor (0 = canonical).
   * Keyed by sync-group primary so synced canonicals share one selection. */
  const [variantChoice, setVariantChoice] = useState<Map<string, number>>(
    () => new Map(),
  );
  /** Per-section static+anim pair toggle, keyed by section primary src. */
  const [animChoice, setAnimChoice] = useState<Map<string, boolean>>(
    () => new Map(),
  );
  /** Ref mirror of animChoice so swatch handlers read the latest toggle. */
  const animChoiceRef = useRef<Map<string, boolean>>(animChoice);
  /** Per-matrix paint variant: primary sheet src -> chosen option per axis. */
  const [matrixChoice, setMatrixChoice] = useState<Map<string, number[]>>(
    () => new Map(),
  );
  /** Ref mirror of matrixChoice so rapid per-axis clicks compose instead of
   * clobbering (each click reads the latest indices, not a stale closure). */
  const matrixChoiceRef = useRef<Map<string, number[]>>(matrixChoice);

  const pick = useCallback((tile: PlacedTile | null) => {
    if (tile === null) {
      setSelected(null);
      return;
    }
    const resolved = resolvePickedTile(tile);
    const sheet =
      resolved === null ? undefined : TILE_SHEET_BY_SRC.get(resolved.sheetSrc);
    if (resolved === null || sheet === undefined) {
      setSelected(null);
      return;
    }
    const variant = resolved.variant;
    if (variant !== null) {
      setVariantChoice((prev) => new Map(prev).set(variant.key, variant.index));
    }
    const matrix = resolved.matrix;
    if (matrix !== null) {
      matrixChoiceRef.current = new Map(matrixChoiceRef.current).set(
        matrix.primary,
        matrix.indices,
      );
      setMatrixChoice(matrixChoiceRef.current);
    }
    const anim = resolved.anim;
    if (anim !== null) {
      animChoiceRef.current = new Map(animChoiceRef.current).set(
        anim.primary,
        anim.animated,
      );
      setAnimChoice(animChoiceRef.current);
    }
    setSelected({ sheet, sx: tile.sx, sy: tile.sy, src: tile.src });
  }, []);

  const selectMatrix = useCallback(
    (primarySrc: string, matrix: TileMatrix, axisIdx: number, optIdx: number) => {
      const stored = matrixChoiceRef.current.get(primarySrc);
      const indices = matrix.axes.map((_, a) =>
        a === axisIdx ? optIdx : (stored?.[a] ?? 0),
      );
      matrixChoiceRef.current = new Map(matrixChoiceRef.current).set(
        primarySrc,
        indices,
      );
      setMatrixChoice(matrixChoiceRef.current);
      const base = matrixPaintSrc(matrix, indices);
      const paint = animPaintFor(
        animChoiceRef.current.get(primarySrc) ?? false,
        base,
      );
      setSelected((prev) =>
        prev !== null && prev.sheet.src === primarySrc
          ? { ...prev, src: paint }
          : prev,
      );
    },
    [],
  );

  const selectVariant = useCallback(
    (canonicalSrc: string, src: string | null) => {
      const key = syncKeyFor(canonicalSrc);
      const choices = pickerSrcsFor(canonicalSrc);
      const index = src === null ? 0 : choices.indexOf(src);
      setVariantChoice((prev) => new Map(prev).set(key, index));
      setSelected((prev) => {
        if (prev === null || syncKeyFor(prev.sheet.src) !== key) return prev;
        const paint =
          pickerSrcsFor(prev.sheet.src)[index] ?? prev.sheet.src;
        return {
          ...prev,
          src: animPaintFor(
            animChoiceRef.current.get(prev.sheet.src) ?? false,
            paint,
          ),
        };
      });
    },
    [],
  );

  const toggleAnim = useCallback(
    (primarySrc: string, next: boolean) => {
      animChoiceRef.current = new Map(animChoiceRef.current).set(
        primarySrc,
        next,
      );
      setAnimChoice(animChoiceRef.current);
      setSelected((prev) => {
        if (prev === null || prev.sheet.src !== primarySrc) return prev;
        const remapped = next ? animFor(prev.src) : staticFor(prev.src);
        return remapped === null ? prev : { ...prev, src: remapped };
      });
    },
    [],
  );

  const activeVariantFor = useCallback(
    (canonicalSrc: string): string | null => {
      const index = variantChoice.get(syncKeyFor(canonicalSrc)) ?? 0;
      if (index <= 0) return null;
      return pickerSrcsFor(canonicalSrc)[index] ?? null;
    },
    [variantChoice],
  );

  return {
    selected,
    select: setSelected,
    pick,
    activeVariantFor,
    animatedFor: (primarySrc) => animChoice.get(primarySrc) ?? false,
    matrixChoiceFor: (primarySrc, matrix) =>
      matrixChoice.get(primarySrc) ?? matrix.axes.map(() => 0),
    selectVariant,
    selectMatrix,
    toggleAnim,
  };
}

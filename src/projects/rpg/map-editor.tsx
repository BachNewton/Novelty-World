"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CELL_PX, TILE_SHEETS, migrateTileSrc, type TileSheet } from "./tiles";
import {
  animSrcCol,
  foldAnimSx,
  sheetForTileSrc,
} from "./tile-anim";
import {
  animFor,
  canonicalSwatchCss,
  familyDisplayName,
  getTileImage,
  isAnimSheet,
  isMatrixMember,
  isNestedSingle,
  isVariantSrc,
  matrixFor,
  matrixPaintSrc,
  matrixSwatchCss,
  nestedSingleSrcsFor,
  pickerSrcsFor,
  staticFor,
  syncKeyFor,
  variantSrcsFor,
  variantSwatchCss,
  type TileMatrix,
} from "./tile-variants";

export const MAP_COLS = 40;
export const MAP_ROWS = 28;
export const STORAGE_KEY = "map-editor-v1";
const PALETTE_SCALE = 2;
const PALETTE_PX = CELL_PX * PALETTE_SCALE;

export interface PlacedTile {
  src: string;
  sx: number;
  sy: number;
}

const SHEET_BY_SRC = new Map<string, TileSheet>(
  TILE_SHEETS.map((sheet) => [sheet.src, sheet]),
);

/** Manifest sheets nested as singles rows in this parent's section. */
function nestedSheetsFor(parentSrc: string): TileSheet[] {
  const out: TileSheet[] = [];
  for (const src of nestedSingleSrcsFor(parentSrc)) {
    const sheet = SHEET_BY_SRC.get(src);
    if (sheet !== undefined) out.push(sheet);
  }
  return out;
}

export type MapGrid = (PlacedTile | null)[][];

interface SelectedTile {
  sheet: TileSheet;
  sx: number;
  sy: number;
  /** Paint URL: the canonical sheet src, or a synthesized variant src. */
  src: string;
}

function createEmptyGrid(): MapGrid {
  return Array.from({ length: MAP_ROWS }, () =>
    Array.from({ length: MAP_COLS }, () => null),
  );
}

function isPlacedTile(value: unknown): value is PlacedTile {
  if (typeof value !== "object" || value === null) return false;
  const tile = value as Record<string, unknown>;
  return (
    typeof tile.src === "string" &&
    typeof tile.sx === "number" &&
    typeof tile.sy === "number"
  );
}

function loadGrid(): MapGrid {
  const empty = createEmptyGrid();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return empty;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== MAP_ROWS) return empty;
    for (let r = 0; r < MAP_ROWS; r += 1) {
      const row: unknown = parsed[r];
      if (!Array.isArray(row) || row.length !== MAP_COLS) return empty;
      for (let c = 0; c < MAP_COLS; c += 1) {
        const cell: unknown = row[c];
        if (cell === null || cell === undefined) {
          empty[r][c] = null;
        } else if (!isPlacedTile(cell)) {
          return createEmptyGrid();
        } else {
          const src = migrateTileSrc(cell.src);
          // Back-compat: cells picked from later animation frames fold into frame 0.
          empty[r][c] = { ...cell, src, sx: foldAnimSx(sheetForTileSrc(src), cell.sx) };
        }
      }
    }
    return empty;
  } catch {
    return empty;
  }
}

function SwatchDot({
  label,
  color,
  active,
  src,
  onSelect,
}: {
  label: string;
  color: string;
  active: boolean;
  src: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      data-testid="variant-swatch"
      data-src={src}
      onClick={onSelect}
      className={`rounded-full border p-0 ${
        active
          ? "border-brand-orange"
          : "border-border-default hover:border-border-hover"
      }`}
      style={{ width: 20, height: 20, backgroundColor: color }}
    />
  );
}

/** Ticker driving animated palette cells; idle when the section is closed. */
function useAnimTick(active: boolean, fps: number): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(performance.now()), 1000 / fps);
    return () => window.clearInterval(id);
  }, [active, fps]);
  return now;
}

function SheetSection({
  sheet,
  defaultOpen,
  selected,
  activeVariantFor,
  animated,
  matrix,
  matrixIndices,
  nested,
  onSelect,
  onVariantSelect,
  onMatrixSelect,
  onAnimToggle,
}: {
  sheet: TileSheet;
  defaultOpen: boolean;
  selected: SelectedTile | null;
  /** Chosen variant paint src per canonical (null for canonical); synced
   * canonicals resolve through one shared picker index. */
  activeVariantFor: (canonicalSrc: string) => string | null;
  /** Static+anim pair toggle state for this section. */
  animated: boolean;
  /** Two-axis picker folding several sheets into this section, if any. */
  matrix: TileMatrix | null;
  /** Chosen option index per matrix axis. */
  matrixIndices: number[];
  /** 1x1 sheets painting from a nested row in this section. */
  nested: TileSheet[];
  onSelect: (tile: SelectedTile) => void;
  onVariantSelect: (canonicalSrc: string, src: string | null) => void;
  onMatrixSelect: (axisIdx: number, optIdx: number) => void;
  onAnimToggle: (primarySrc: string, next: boolean) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const variantSrcs = useMemo(() => variantSrcsFor(sheet.src), [sheet.src]);
  const activeVariant = activeVariantFor(sheet.src);
  const familyName = useMemo(() => familyDisplayName(sheet.src), [sheet.src]);
  const displayName = matrix?.name ?? familyName ?? sheet.name;
  const basePreview =
    matrix === null ? (activeVariant ?? sheet.src) : matrixPaintSrc(matrix, matrixIndices);
  // Static+anim pair toggle: offered only when every paintable src of this
  // section owns an explicit animated counterpart.
  const toggleStatics = matrix === null ? pickerSrcsFor(sheet.src) : matrix.cells;
  const canAnimate =
    toggleStatics.length > 0 && toggleStatics.every((src) => animFor(src) !== null);
  const paintSrc = animated ? (animFor(basePreview) ?? basePreview) : basePreview;
  /** Manifest sheet behind the paint src (follows synthesized variants to
   * their canonical strip) — drives preview geometry and cell playback. */
  const paintSheet = sheetForTileSrc(paintSrc) ?? sheet;
  const anim = paintSheet.anim;
  /** Animated sheets offer only frame-0 cells; stored sx stays frame-0-relative. */
  const paletteCols = anim?.frameW ?? sheet.cols;
  /** Cells cycle their own frames on the global clock (per-cell phase, the
   * same math the game canvas uses); the strip sprite shifts per tick. */
  const now = useAnimTick(open && anim !== undefined, anim?.fps ?? 1);
  const cells = useMemo(() => {
    if (!open) return [];
    const list: { sx: number; sy: number }[] = [];
    for (let sy = 0; sy < sheet.rows; sy += 1) {
      for (let sx = 0; sx < paletteCols; sx += 1) {
        list.push({ sx, sy });
      }
    }
    return list;
  }, [open, sheet, paletteCols]);

  return (
    <details
      className="w-max max-w-none rounded-md border border-border-default bg-surface-tertiary"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      data-testid="palette-section"
      data-sheet={sheet.src}
    >
      <summary className="cursor-pointer px-2 py-1.5 text-sm text-text-secondary hover:text-text-primary">
        {displayName}{" "}
        <span className="text-text-muted">
          ({sheet.cols}×{sheet.rows})
        </span>
        {anim !== undefined && (
          <span
            data-testid="anim-badge"
            className="ml-1.5 rounded-sm border border-border-default px-1 py-px text-xs text-text-muted"
          >
            {anim.frames}f {anim.mode === "pingpong" ? "ping-pong" : anim.mode} · {anim.fps}fps
          </span>
        )}
      </summary>
      {matrix !== null ? (
        <div className="flex flex-col gap-1 px-2 pt-1">
          {matrix.axes.map((axis, axisIdx) => (
            <div key={axis.key} className="flex items-center gap-1.5">
              <span className="w-9 text-xs text-text-muted">{axis.label}</span>
              {axis.options.map((optionSrc, optIdx) => (
                <SwatchDot
                  key={optionSrc}
                  label={optionSrc.split("/").pop() ?? optionSrc}
                  color={matrixSwatchCss(matrix, axis.key, optionSrc)}
                  active={(matrixIndices[axisIdx] ?? 0) === optIdx}
                  src={optionSrc}
                  onSelect={() => onMatrixSelect(axisIdx, optIdx)}
                />
              ))}
            </div>
          ))}
        </div>
      ) : (
        variantSrcs.length > 0 && (
          <div className="flex items-center gap-1.5 px-2 pt-1">
            <SwatchDot
              label={`${sheet.name} canonical`}
              color={canonicalSwatchCss(sheet.src)}
              active={activeVariant === null}
              src={sheet.src}
              onSelect={() => onVariantSelect(sheet.src, null)}
            />
            {variantSrcs.map((variantSrc) => (
              <SwatchDot
                key={variantSrc}
                label={variantSrc.split("/").pop() ?? variantSrc}
                color={variantSwatchCss(variantSrc)}
                active={activeVariant === variantSrc}
                src={variantSrc}
                onSelect={() => onVariantSelect(sheet.src, variantSrc)}
              />
            ))}
          </div>
        )
      )}
      {canAnimate && (
        <label className="flex cursor-pointer items-center gap-1.5 px-2 pt-1 text-xs text-text-muted">
          <input
            type="checkbox"
            data-testid="anim-toggle"
            checked={animated}
            onChange={(e) => onAnimToggle(sheet.src, e.target.checked)}
          />
          Animated
        </label>
      )}
      <div
        className="grid w-fit gap-px p-2"
        style={{ gridTemplateColumns: `repeat(${paletteCols}, ${PALETTE_PX}px)` }}
      >
        {cells.map(({ sx, sy }) => {
          const isActive =
            selected !== null &&
            selected.sheet.src === sheet.src &&
            selected.sx === sx &&
            selected.sy === sy;
          // Animated cells show their current frame by shifting the
          // full-strip sprite; static cells sit at frame 0. The stored sx
          // stays frame-0-relative either way.
          const srcCol =
            anim === undefined ? sx : animSrcCol(paintSheet, sx, now, sx, sy);
          return (
            <button
              key={`${sx}-${sy}`}
              type="button"
              title={`${displayName} (${sx}, ${sy})`}
              aria-label={`${displayName} cell ${sx},${sy}`}
              data-testid="palette-cell"
              data-src={sheet.src}
              data-paint={paintSrc}
              data-sx={sx}
              data-sy={sy}
              onClick={() => onSelect({ sheet, sx, sy, src: paintSrc })}
              className={`overflow-hidden rounded-sm border p-0 ${
                isActive
                  ? "border-brand-orange"
                  : "border-border-default hover:border-border-hover"
              }`}
              style={{ width: PALETTE_PX, height: PALETTE_PX }}
            >
              <CellPreview
                src={paintSrc}
                width={paintSheet.cols * PALETTE_PX}
                height={paintSheet.rows * PALETTE_PX}
                offsetX={-srcCol * PALETTE_PX}
                offsetY={-sy * PALETTE_PX}
              />
            </button>
          );
        })}
      </div>
      {open &&
        nested.map((child) => (
          <SinglesRow
            key={child.src}
            sheet={child}
            selected={selected}
            activeVariant={activeVariantFor(child.src)}
            sharedPicker={syncKeyFor(child.src) === syncKeyFor(sheet.src)}
            onSelect={onSelect}
            onVariantSelect={onVariantSelect}
          />
        ))}
    </details>
  );
}

/** One paintable 1x1 sheet nested inside its parent family section.
 * A child sharing its parent's variant sync group paints from the section's
 * single picker row (sharedPicker) instead of rendering a duplicate row. */
function SinglesRow({
  sheet,
  selected,
  activeVariant,
  sharedPicker,
  onSelect,
  onVariantSelect,
}: {
  sheet: TileSheet;
  selected: SelectedTile | null;
  activeVariant: string | null;
  sharedPicker: boolean;
  onSelect: (tile: SelectedTile) => void;
  onVariantSelect: (canonicalSrc: string, src: string | null) => void;
}) {
  const variantSrcs = variantSrcsFor(sheet.src);
  const displayName = familyDisplayName(sheet.src) ?? sheet.name;
  const previewSrc = activeVariant ?? sheet.src;
  const isActive =
    selected !== null &&
    selected.sheet.src === sheet.src &&
    selected.sx === 0 &&
    selected.sy === 0;
  return (
    <div className="flex items-center gap-1.5 px-2 pb-2">
      <span className="text-xs text-text-muted">{displayName}</span>
      {!sharedPicker && variantSrcs.length > 0 && (
        <>
          <SwatchDot
            label={`${sheet.name} canonical`}
            color={canonicalSwatchCss(sheet.src)}
            active={activeVariant === null}
            src={sheet.src}
            onSelect={() => onVariantSelect(sheet.src, null)}
          />
          {variantSrcs.map((variantSrc) => (
            <SwatchDot
              key={variantSrc}
              label={variantSrc.split("/").pop() ?? variantSrc}
              color={variantSwatchCss(variantSrc)}
              active={activeVariant === variantSrc}
              src={variantSrc}
              onSelect={() => onVariantSelect(sheet.src, variantSrc)}
            />
          ))}
        </>
      )}
      <button
        type="button"
        title={`${displayName} (0, 0)`}
        aria-label={`${displayName} cell 0,0`}
        data-testid="palette-cell"
        data-src={sheet.src}
        data-sx={0}
        data-sy={0}
        onClick={() => onSelect({ sheet, sx: 0, sy: 0, src: previewSrc })}
        className={`overflow-hidden rounded-sm border p-0 ${
          isActive
            ? "border-brand-orange"
            : "border-border-default hover:border-border-hover"
        }`}
        style={{ width: PALETTE_PX, height: PALETTE_PX }}
      >
        <CellPreview
          src={previewSrc}
          width={sheet.cols * PALETTE_PX}
          height={sheet.rows * PALETTE_PX}
          offsetX={0}
          offsetY={0}
        />
      </button>
    </div>
  );
}

/** Image URL for a palette cell, following synthesized variants (async). */
function useTileImageUrl(src: string): string {
  const [prevSrc, setPrevSrc] = useState(src);
  const [url, setUrl] = useState(() => (isVariantSrc(src) ? "" : src));
  // Plain sheets resolve synchronously during render (the documented
  // render-time state adjustment, not an effect cascade); variant sheets
  // resolve async via the effect below.
  if (prevSrc !== src) {
    setPrevSrc(src);
    setUrl(isVariantSrc(src) ? "" : src);
  }
  useEffect(() => {
    if (!isVariantSrc(src)) return;
    let live = true;
    const img = getTileImage(src);
    const update = () => {
      if (live && img.complete && img.naturalWidth > 0) setUrl(img.src);
    };
    update();
    img.addEventListener("load", update);
    return () => {
      live = false;
      img.removeEventListener("load", update);
    };
  }, [src]);
  return url;
}

function CellPreview({
  src,
  width,
  height,
  offsetX,
  offsetY,
}: {
  src: string;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}) {
  const url = useTileImageUrl(src);
  if (url === "") return <span className="block" style={{ width, height }} />;
  return (
    /* eslint-disable-next-line @next/next/no-img-element -- sprite-sheet cell previews need raw offsets that next/image cannot express */
    <img
      src={url}
      alt=""
      draggable={false}
      className="block max-w-none"
      style={{ width, height, marginLeft: offsetX, marginTop: offsetY }}
    />
  );
}

/** Static paint src through a section's anim toggle (identity when off). */
function animPaintFor(animated: boolean, paint: string): string {
  return animated ? (animFor(paint) ?? paint) : paint;
}

export function MapEditor() {
  const [grid, setGrid] = useState<MapGrid>(() =>
    typeof window === "undefined" ? createEmptyGrid() : loadGrid(),
  );
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

  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<MapGrid>(grid);
  const selectedRef = useRef<SelectedTile | null>(selected);
  const scaleRef = useRef(1);
  const sizeRef = useRef({ width: 1, height: 1 });
  const offsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    gridRef.current = grid;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(grid));
    } catch {
      // Storage full or unavailable — the map still works in memory.
    }
  }, [grid]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (canvas === null || wrapper === null) return;

    const ctx = canvas.getContext("2d");
    if (ctx === null) return;

    const resize = () => {
      const rect = wrapper.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const cssWidth = Math.max(1, Math.floor(rect.width));
      const cssHeight = Math.max(1, Math.floor(rect.height));
      sizeRef.current = { width: cssWidth, height: cssHeight };
      const scale = Math.max(
        0.25,
        Math.min(
          cssWidth / (MAP_COLS * CELL_PX),
          cssHeight / (MAP_ROWS * CELL_PX),
        ),
      );
      scaleRef.current = scale;
      offsetRef.current = {
        x: Math.max(0, Math.floor((cssWidth - MAP_COLS * CELL_PX * scale) / 2)),
        y: Math.max(0, Math.floor((cssHeight - MAP_ROWS * CELL_PX * scale) / 2)),
      };
      canvas.width = Math.floor(cssWidth * dpr);
      canvas.height = Math.floor(cssHeight * dpr);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(wrapper);
    window.addEventListener("resize", resize);

    let rafId = 0;
    const drawFrame = (now: number) => {
      rafId = requestAnimationFrame(drawFrame);
      const { width, height } = sizeRef.current;
      const scale = scaleRef.current;
      const { x: offsetX, y: offsetY } = offsetRef.current;
      const mapWidth = MAP_COLS * CELL_PX * scale;
      const mapHeight = MAP_ROWS * CELL_PX * scale;

      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, width, height);

      const current = gridRef.current;
      for (let r = 0; r < MAP_ROWS; r += 1) {
        for (let c = 0; c < MAP_COLS; c += 1) {
          const tile = current[r][c];
          if (tile === null) continue;
          const img = getTileImage(tile.src);
          if (!img.complete || img.naturalWidth === 0) continue;
          const sheet = sheetForTileSrc(tile.src);
          const srcCol =
            sheet?.anim === undefined
              ? tile.sx
              : animSrcCol(sheet, tile.sx, now, c, r);
          ctx.drawImage(
            img,
            srcCol * CELL_PX,
            tile.sy * CELL_PX,
            CELL_PX,
            CELL_PX,
            offsetX + c * CELL_PX * scale,
            offsetY + r * CELL_PX * scale,
            CELL_PX * scale,
            CELL_PX * scale,
          );
        }
      }

      ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 0; c <= MAP_COLS; c += 1) {
        const x = offsetX + c * CELL_PX * scale + 0.5;
        ctx.moveTo(x, offsetY);
        ctx.lineTo(x, offsetY + mapHeight);
      }
      for (let r = 0; r <= MAP_ROWS; r += 1) {
        const y = offsetY + r * CELL_PX * scale + 0.5;
        ctx.moveTo(offsetX, y);
        ctx.lineTo(offsetX + mapWidth, y);
      }
      ctx.stroke();
    };

    rafId = requestAnimationFrame(drawFrame);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  const cellFromEvent = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (canvas === null) return null;
    const rect = canvas.getBoundingClientRect();
    const size = sizeRef.current;
    const scale = scaleRef.current;
    const { x: offsetX, y: offsetY } = offsetRef.current;
    const scaleX = size.width <= 0 ? 1 : rect.width / size.width;
    const scaleY = size.height <= 0 ? 1 : rect.height / size.height;
    const x = (e.clientX - rect.left) / scaleX - offsetX;
    const y = (e.clientY - rect.top) / scaleY - offsetY;
    const c = Math.floor(x / (CELL_PX * scale));
    const r = Math.floor(y / (CELL_PX * scale));
    if (c < 0 || c >= MAP_COLS || r < 0 || r >= MAP_ROWS) return null;
    return { c, r };
  }, []);

  const paintAt = useCallback(
    (c: number, r: number, erase: boolean) => {
      const sel = selectedRef.current;
      if (!erase && sel === null) return;
      setGrid((prev) => {
        const existing = prev[r][c];
        if (erase) {
          if (existing === null) return prev;
          const next = prev.map((row) => row.slice());
          next[r]![c] = null;
          return next;
        }
        if (
          existing !== null &&
          sel !== null &&
          existing.src === sel.src &&
          existing.sx === sel.sx &&
          existing.sy === sel.sy
        ) {
          return prev;
        }
        const next = prev.map((row) => row.slice());
        next[r]![c] =
          sel === null
            ? null
            : { src: sel.src, sx: sel.sx, sy: sel.sy };
        return next;
      });
    },
    [],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1) return;
      const cell = cellFromEvent(e);
      if (cell === null) return;
      paintAt(cell.c, cell.r, e.button === 2);
    },
    [cellFromEvent, paintAt],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (e.buttons === 0) return;
      const cell = cellFromEvent(e);
      if (cell === null) return;
      if ((e.buttons & 1) === 1) paintAt(cell.c, cell.r, false);
      else if ((e.buttons & 2) === 2) paintAt(cell.c, cell.r, true);
    },
    [cellFromEvent, paintAt],
  );

  const handleClear = useCallback(() => {
    setGrid(createEmptyGrid());
  }, []);

  const handleMatrixSelect = useCallback(
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

  const handleVariantSelect = useCallback(
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

  const handleAnimToggle = useCallback(
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

  /** Chosen variant paint src for a canonical (null = canonical sheet). */
  const activeVariantFor = useCallback(
    (canonicalSrc: string): string | null => {
      const index = variantChoice.get(syncKeyFor(canonicalSrc)) ?? 0;
      if (index <= 0) return null;
      return pickerSrcsFor(canonicalSrc)[index] ?? null;
    },
    [variantChoice],
  );

  const selectedName =
    selected === null
      ? null
      : selected.src === selected.sheet.src
        ? (familyDisplayName(selected.sheet.src) ?? selected.sheet.name)
        : (selected.src.split("/").pop()?.replace(/\.png$/, "") ??
          selected.sheet.name);
  const categories = useMemo(() => {
    /** Most-reached-for ground tiles first; props and special cases last. */
    const CATEGORY_ORDER = [
      "Grass",
      "Water",
      "Beach",
      "Cobble_Road",
      "FarmLand",
      "Bridge",
      "Cliff",
      "Cave",
      "Waterfall",
      "Misc",
    ];
    const order: string[] = [];
    const groups = new Map<string, TileSheet[]>();
    for (const sheet of TILE_SHEETS) {
      const list = groups.get(sheet.category);
      if (list === undefined) {
        groups.set(sheet.category, [sheet]);
        order.push(sheet.category);
      } else {
        list.push(sheet);
      }
    }
    order.sort(
      (a, b) =>
        (CATEGORY_ORDER.indexOf(a) === -1
          ? CATEGORY_ORDER.length
          : CATEGORY_ORDER.indexOf(a)) -
        (CATEGORY_ORDER.indexOf(b) === -1
          ? CATEGORY_ORDER.length
          : CATEGORY_ORDER.indexOf(b)),
    );
    return order.map((category) => ({
      category,
      sheets: groups.get(category) ?? [],
    }));
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-surface-primary text-text-primary">
      <header className="flex flex-wrap items-center gap-3 border-b border-border-default px-4 py-3">
        <h1 className="text-xl font-bold">Tile Map Editor</h1>
        <span className="text-sm text-text-muted">
          {MAP_COLS}×{MAP_ROWS} cells · left-click paints · right-click erases
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span
            data-testid="selected-tile"
            className="text-sm text-text-secondary"
          >
            {selected === null || selectedName === null
              ? "No tile selected"
              : `${selectedName} (${selected.sx}, ${selected.sy})`}
          </span>
          <button
            type="button"
            onClick={handleClear}
            className="rounded-md border border-border-default bg-surface-tertiary px-3 py-1.5 text-sm hover:border-border-hover"
          >
            Clear All
          </button>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 lg:flex-row">
        <div
          ref={wrapperRef}
          className="relative flex min-h-[50dvh] min-w-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-border-default bg-surface-secondary"
        >
          <canvas
            ref={canvasRef}
            data-testid="map-canvas"
            className="absolute inset-0 block cursor-crosshair"
            style={{ imageRendering: "pixelated" }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>
        <aside className="flex w-max max-w-none shrink-0 flex-col gap-3 overflow-y-auto lg:max-h-[calc(100dvh-120px)]">
          {categories.map(({ category, sheets }) => (
            <section key={category} className="w-max max-w-none">
              <h2 className="mb-1 text-sm font-bold tracking-wide text-text-secondary uppercase">
                {category}
              </h2>
              <div className="flex w-max max-w-none flex-col gap-2">
                {sheets.map((sheet, sheetIndex) => {
                  // Matrix members and anim-pair anim sides paint from
                  // another section; nested singles from a row in their
                  // parent's section.
                  if (
                    isMatrixMember(sheet.src) ||
                    isNestedSingle(sheet.src) ||
                    isAnimSheet(sheet.src)
                  ) {
                    return null;
                  }
                  const matrix = matrixFor(sheet.src);
                  return (
                    <SheetSection
                      key={sheet.src}
                      sheet={sheet}
                      defaultOpen={category === categories[0]?.category && sheetIndex === 0}
                      selected={selected}
                      activeVariantFor={activeVariantFor}
                      animated={animChoice.get(sheet.src) ?? false}
                      matrix={matrix}
                      matrixIndices={
                        matrix === null
                          ? []
                          : (matrixChoice.get(sheet.src) ??
                            matrix.axes.map(() => 0))
                      }
                      nested={nestedSheetsFor(sheet.src)}
                      onSelect={setSelected}
                      onVariantSelect={(canonicalSrc, src) =>
                        handleVariantSelect(canonicalSrc, src)
                      }
                      onMatrixSelect={(axisIdx, optIdx) => {
                        if (matrix !== null) {
                          handleMatrixSelect(sheet.src, matrix, axisIdx, optIdx);
                        }
                      }}
                      onAnimToggle={handleAnimToggle}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </aside>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CELL_PX, TILE_SHEETS, migrateTileSrc, type TileSheet } from "./tiles";
import {
  animFrameIndex,
  animSrcCol,
  foldAnimSx,
  sheetForTileSrc,
} from "./tile-anim";
import {
  canonicalSwatchCss,
  familyDisplayName,
  getTileImage,
  isVariantSrc,
  variantSrcsFor,
  variantSwatchCss,
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
        empty[r][c] = cell === null || cell === undefined ? null : isPlacedTile(cell) ? { ...cell, src: migrateTileSrc(cell.src) } : null;
        if (cell !== null && cell !== undefined && !isPlacedTile(cell)) return createEmptyGrid();
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

function SheetSection({
  sheet,
  defaultOpen,
  selected,
  activeVariant,
  onSelect,
  onVariantSelect,
}: {
  sheet: TileSheet;
  defaultOpen: boolean;
  selected: SelectedTile | null;
  /** Chosen variant src for this family, or null for the canonical sheet. */
  activeVariant: string | null;
  onSelect: (tile: SelectedTile) => void;
  onVariantSelect: (src: string | null) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const variantSrcs = useMemo(() => variantSrcsFor(sheet.src), [sheet.src]);
  const familyName = useMemo(() => familyDisplayName(sheet.src), [sheet.src]);
  const displayName = familyName ?? sheet.name;
  const previewSrc = activeVariant ?? sheet.src;
  const cells = useMemo(() => {
    if (!open) return [];
    const list: { sx: number; sy: number }[] = [];
    for (let sy = 0; sy < sheet.rows; sy += 1) {
      for (let sx = 0; sx < sheet.cols; sx += 1) {
        list.push({ sx, sy });
      }
    }
    return list;
  }, [open, sheet]);

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
      </summary>
      {variantSrcs.length > 0 && (
        <div className="flex items-center gap-1.5 px-2 pt-1">
          <SwatchDot
            label={`${sheet.name} canonical`}
            color={canonicalSwatchCss(sheet.src)}
            active={activeVariant === null}
            src={sheet.src}
            onSelect={() => onVariantSelect(null)}
          />
          {variantSrcs.map((variantSrc) => (
            <SwatchDot
              key={variantSrc}
              label={variantSrc.split("/").pop() ?? variantSrc}
              color={variantSwatchCss(variantSrc)}
              active={activeVariant === variantSrc}
              src={variantSrc}
              onSelect={() => onVariantSelect(variantSrc)}
            />
          ))}
        </div>
      )}
      <div
        className="grid w-fit gap-1 p-2"
        style={{ gridTemplateColumns: `repeat(${sheet.cols}, ${PALETTE_PX}px)` }}
      >
        {cells.map(({ sx, sy }) => {
          const isActive =
            selected !== null &&
            selected.sheet.src === sheet.src &&
            selected.sx === sx &&
            selected.sy === sy;
          return (
            <button
              key={`${sx}-${sy}`}
              type="button"
              title={`${displayName} (${sx}, ${sy})`}
              aria-label={`${displayName} cell ${sx},${sy}`}
              data-testid="palette-cell"
              data-src={sheet.src}
              data-sx={sx}
              data-sy={sy}
              onClick={() =>
                onSelect({ sheet, sx, sy, src: activeVariant ?? sheet.src })
              }
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
                offsetX={-sx * PALETTE_PX}
                offsetY={-sy * PALETTE_PX}
              />
            </button>
          );
        })}
      </div>
    </details>
  );
}

/** Image URL for a palette cell, following synthesized variants (async). */
function useTileImageUrl(src: string): string {
  const [url, setUrl] = useState(() => (isVariantSrc(src) ? "" : src));
  useEffect(() => {
    if (!isVariantSrc(src)) {
      setUrl(src);
      return;
    }
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

export function MapEditor() {
  const [grid, setGrid] = useState<MapGrid>(() =>
    typeof window === "undefined" ? createEmptyGrid() : loadGrid(),
  );
  const [selected, setSelected] = useState<SelectedTile | null>(null);
  /** Per-family paint variant: canonical sheet src -> chosen variant src. */
  const [variantChoice, setVariantChoice] = useState<Map<string, string>>(
    () => new Map(),
  );

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

  const handleVariantSelect = useCallback(
    (canonicalSrc: string, src: string | null) => {
      setVariantChoice((prev) => {
        const next = new Map(prev);
        if (src === null) {
          next.delete(canonicalSrc);
        } else {
          next.set(canonicalSrc, src);
        }
        return next;
      });
      setSelected((prev) =>
        prev !== null && prev.sheet.src === canonicalSrc
          ? { ...prev, src: src ?? canonicalSrc }
          : prev,
      );
    },
    [],
  );

  const selectedName =
    selected === null
      ? null
      : selected.src === selected.sheet.src
        ? (familyDisplayName(selected.sheet.src) ?? selected.sheet.name)
        : (selected.src.split("/").pop()?.replace(/\.png$/, "") ??
          selected.sheet.name);
  const categories = useMemo(() => {
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
                {sheets.map((sheet, sheetIndex) => (
                  <SheetSection
                    key={sheet.src}
                    sheet={sheet}
                    defaultOpen={category === categories[0]?.category && sheetIndex === 0}
                    selected={selected}
                    activeVariant={variantChoice.get(sheet.src) ?? null}
                    onSelect={setSelected}
                    onVariantSelect={(src) =>
                      handleVariantSelect(sheet.src, src)
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </aside>
      </div>
    </div>
  );
}

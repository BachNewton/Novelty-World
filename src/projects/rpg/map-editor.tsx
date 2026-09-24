"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CELL_PX, TILE_SHEETS, migrateTileSrc, type TileSheet } from "./tiles";
import {
  animSrcCol,
  foldAnimSx,
  sheetForTileSrc,
} from "./tile-anim";
import {
  animFor,
  canonicalSrcFor,
  canonicalSwatchCss,
  familyDisplayName,
  getTileImage,
  isAnimSheet,
  isMatrixMember,
  isNestedSingle,
  isVariantSrc,
  matrixFor,
  matrixIndicesFor,
  matrixPaintSrc,
  matrixPrimaryFor,
  matrixSwatchCss,
  nestedSingleSrcsFor,
  pickerSrcsFor,
  staticFor,
  syncKeyFor,
  variantSrcsFor,
  variantSwatchCss,
  type TileMatrix,
} from "./tile-variants";
import { getCoopRoomId, getSharedCoopTransport, useEditorMapSync } from "./coop/map-sync";
import { advanceRemoteRender, usePresence } from "./coop/presence";
import {
  DEFAULT_CHARACTER_ID,
  idleStripsFor,
  sanitizeCharacterId,
  walkStripsFor,
  type CharacterId,
} from "./characters";

export const MAP_COLS = 40;
export const MAP_ROWS = 28;
export const STORAGE_KEY = "map-editor-v1";
/**
 * Visually-hidden style for the co-op state badges (`coop-status`,
 * `coop-role`, `coop-peer-count`, `coop-remote-count`). They expose live
 * `usePresence` state to E2E (condition-based waits) without affecting the
 * editor layout.
 */
const COOP_BADGE_STYLE: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};
// --- CO-OP CHUNK 1: playing-peer avatar overlay. Each peer renders with
// its own character strips (preloaded on demand in the canvas effect);
// frame constants mirror the play canvas. Remotes cycle continuously off
// `now` instead of resetting on idle/walk switches.
const AVATAR_FRAME = 64;
const AVATAR_FRAMES = 6;
const AVATAR_IDLE_MS = 200;
const AVATAR_WALK_MS = 120;
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
    if (matrix === null || !SHEET_BY_SRC.has(matrixPrimary)) return null;
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
  if (!SHEET_BY_SRC.has(canonical)) return null;
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

/** Header selected-tile preview; cycles frames when the selected src is an
 * animated sheet (same global-clock math as the palette cells). */
function SelectedPreview({
  selected,
  sheet,
}: {
  selected: { src: string; sx: number; sy: number };
  sheet: TileSheet;
}) {
  const anim = sheet.anim;
  const now = useAnimTick(anim !== undefined, anim?.fps ?? 1);
  const srcCol =
    anim === undefined
      ? selected.sx
      : animSrcCol(sheet, selected.sx, now, selected.sx, selected.sy);
  return (
    <span
      className="block overflow-hidden rounded-sm border border-brand-orange"
      style={{ width: 32, height: 32 }}
    >
      <CellPreview
        src={selected.src}
        width={sheet.cols * 32}
        height={sheet.rows * 32}
        offsetX={-srcCol * 32}
        offsetY={-selected.sy * 32}
      />
    </span>
  );
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
  /** Hovered map cell for the 1-cell highlight, written by mouse handlers and
   * read by the rAF loop (ref, not state: hover must never re-render). */
  const hoverRef = useRef<{ c: number; r: number } | null>(null);
  /** Alt-held eyedropper indicator state; drives the canvas cursor only. */
  const [altHeld, setAltHeld] = useState(false);
  const scaleRef = useRef(1);
  const sizeRef = useRef({ width: 1, height: 1 });
  const offsetRef = useRef({ x: 0, y: 0 });
  // --- CO-OP CHUNK 1: receive-only presence — the edit canvas shows playing
  // peers live (bidirectional requirement). This hook never sends pos.
  // Shares one transport with the map-sync binding below (one PeerJS peer
  // per tab, caller-owned so the `~` toggle keeps the peer id and host).
  // Page's co-op room (`?coop-room=`, default room when absent): resolved
  // per render (client read, SSR-safe default); the URL is stable for the
  // page lifetime so presence and map-sync always agree on one room.
  const coopRoom = getCoopRoomId();
  const getRoomTransport = useCallback(
    () => getSharedCoopTransport(coopRoom),
    [coopRoom],
  );
  const presence = usePresence(undefined, {
    createTransport: getRoomTransport,
  });
  const { remotesRef: remoteAvatarsRef, state: coopState } = presence;
  /**
   * Mount gate for the coop badges: server HTML and the first client render
   * emit identical static placeholders (`idle` / `""` / `0`), and the live
   * hook state only renders after this event-driven flip — so the
   * transport's async `connecting`/`reconnecting` transitions can never
   * produce a hydration mismatch. Allowed: `useEffect`-gated `setState`,
   * no timers.
   */
  const [coopMounted, setCoopMounted] = useState(false);
  useEffect(() => {
    // Intentional hydration gate (static placeholders pre-mount, no timers).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-gated badge placeholders must flip post-mount
    setCoopMounted(true);
  }, []);
  /**
   * Mirrors the live remote-avatar count into the `coop-remote-count` badge
   * once per frame (direct DOM write inside the existing rAF loop: net
   * traffic never re-renders React, and no new subscription or timer is added).
   */
  const remoteCountRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    gridRef.current = grid;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(grid));
    } catch {
      // Storage full or unavailable — the map still works in memory.
    }
  }, [grid]);

  // [coop-map-sync] Chunk 2 shared live map editing: outbound paints batch
  // into one tiles message per frame, inbound tiles/snapshot/clear merge
  // through the same setGrid updater + LWW seq map. This persistence effect
  // stays the single localStorage writer (the seq map is never persisted).
  const mapSync = useEditorMapSync(gridRef, setGrid, coopRoom);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  // Alt hygiene: the eyedropper cursor follows the physical Alt keys only
  // (`code`-based; AltGr reports Ctrl+Alt and must not trigger it). Alt
  // keydown is swallowed so the browser never focuses the menu bar, and blur
  // clears a stuck Alt when the key is released outside the window.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isAltModifierCode(e.code)) return;
      e.preventDefault();
      setAltHeld(
        resolveEyedropperActive({
          alt: e.getModifierState("Alt"),
          ctrl: e.getModifierState("Control") || e.ctrlKey,
          meta: e.getModifierState("Meta") || e.metaKey,
          altGraph: e.getModifierState("AltGraph"),
        }),
      );
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!isAltModifierCode(e.code)) return;
      setAltHeld(
        resolveEyedropperActive({
          alt: e.getModifierState("Alt"),
          ctrl: e.getModifierState("Control") || e.ctrlKey,
          meta: e.getModifierState("Meta") || e.metaKey,
          altGraph: e.getModifierState("AltGraph"),
        }),
      );
    };
    const onBlur = () => setAltHeld(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (canvas === null || wrapper === null) return;

    const ctx = canvas.getContext("2d");
    if (ctx === null) return;

    // --- CO-OP CHUNK 1: avatar strips for the playing-peer overlay.
    const avatarImgs: Record<string, HTMLImageElement | undefined> = {};
    const ensureAvatarStrips = (id: CharacterId) => {
      for (const src of [
        ...Object.values(idleStripsFor(id)),
        ...Object.values(walkStripsFor(id)),
      ]) {
        if (avatarImgs[src] !== undefined) continue;
        const img = new Image();
        img.src = src;
        avatarImgs[src] = img;
      }
    };
    ensureAvatarStrips(DEFAULT_CHARACTER_ID);

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
    let coopLast: number | null = null;
    const drawFrame = (now: number) => {
      rafId = requestAnimationFrame(drawFrame);
      const coopDt =
        coopLast === null ? 0 : Math.min((now - coopLast) / 1000, 0.05);
      coopLast = now;
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

      // Hover highlight: a subtle 1-cell border tracking the mouse, drawn
      // from the handler-written ref so it works in every mode (paint, erase,
      // pick) without touching hit-testing or persistence.
      const hover = hoverRef.current;
      if (hover !== null) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
        ctx.lineWidth = 2;
        ctx.strokeRect(
          offsetX + hover.c * CELL_PX * scale + 0.5,
          offsetY + hover.r * CELL_PX * scale + 0.5,
          CELL_PX * scale - 1,
          CELL_PX * scale - 1,
        );
      }

      // --- CO-OP CHUNK 1: playing-peer avatar overlay. World px map to the
      // canvas via the same offset/scale as tiles; positions lerp like the
      // play canvas. An orange dot stands in until the strips load.
      for (const avatar of remoteAvatarsRef.current.values()) {
        advanceRemoteRender(avatar, coopDt);
        const centerX = offsetX + avatar.renderX * scale;
        const centerY = offsetY + avatar.renderY * scale;
        const avatarId = sanitizeCharacterId(avatar.characterId);
        ensureAvatarStrips(avatarId);
        const strips = avatar.moving ? walkStripsFor(avatarId) : idleStripsFor(avatarId);
        const img = avatarImgs[strips[avatar.dir]];
        if (img !== undefined && img.complete && img.naturalWidth > 0) {
          const frameMs = avatar.moving ? AVATAR_WALK_MS : AVATAR_IDLE_MS;
          const rf = Math.floor(now / frameMs) % AVATAR_FRAMES;
          const adw = AVATAR_FRAME * scale;
          const adx = centerX - adw / 2;
          const ady = centerY - adw / 2;
          if (avatar.flip) {
            ctx.save();
            ctx.translate(2 * centerX, 0);
            ctx.scale(-1, 1);
          }
          ctx.drawImage(
            img,
            rf * AVATAR_FRAME,
            0,
            AVATAR_FRAME,
            AVATAR_FRAME,
            adx,
            ady,
            adw,
            adw,
          );
          if (avatar.flip) ctx.restore();
        } else {
          ctx.beginPath();
          ctx.fillStyle = "#f97316";
          ctx.arc(
            centerX,
            centerY,
            Math.max(3, CELL_PX * scale * 0.75),
            0,
            Math.PI * 2,
          );
          ctx.fill();
          ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      const remoteBadge = remoteCountRef.current;
      if (remoteBadge !== null) {
        const n = String(remoteAvatarsRef.current.size);
        if (remoteBadge.textContent !== n) remoteBadge.textContent = n;
      }
    };

    rafId = requestAnimationFrame(drawFrame);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", resize);
    };
    // remoteAvatarsRef is a stable presence-hook ref: listed for
    // exhaustive-deps, never re-runs the loop.
  }, [remoteAvatarsRef]);

  const cellFromEvent = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (canvas === null) return null;
    const rect = canvas.getBoundingClientRect();
    const size = sizeRef.current;
    const scale = scaleRef.current;
    const { x: offsetX, y: offsetY } = offsetRef.current;
    const scaleX = size.width <= 0 ? 1 : rect.width / size.width;
    const scaleY = size.height <= 0 ? 1 : rect.height / size.height;
    const x = (e.clientX - rect.left) / scaleX;
    const y = (e.clientY - rect.top) / scaleY;
    return cellFromPoint(x, y, scale, offsetX, offsetY);
  }, []);

  const paintAt = useCallback(
    (c: number, r: number, erase: boolean) => {
      const sel = selectedRef.current;
      if (!erase && sel === null) return;
      // [coop-map-sync] Pre-check against the mirrored grid so only real
      // changes queue a network batch (keeps the setGrid updater pure).
      // A stale mirror can only cause a redundant send, never a lost paint:
      // skipping requires the mirror to already equal the new tile.
      const current = gridRef.current.at(r)?.at(c);
      if (erase) {
        if (current === null || current === undefined) return;
      } else if (
        sel !== null &&
        current !== null &&
        current !== undefined &&
        current.src === sel.src &&
        current.sx === sel.sx &&
        current.sy === sel.sy
      ) {
        return;
      }
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
      // [coop-map-sync] Emit the paint; the hook batches drag paints into one
      // tiles message per animation frame.
      mapSync.queueLocalPaint(
        c,
        r,
        erase || sel === null
          ? null
          : { src: sel.src, sx: sel.sx, sy: sel.sy },
      );
    },
    [mapSync],
  );

  const applyPick = useCallback((tile: PlacedTile | null) => {
    if (tile === null) {
      setSelected(null);
      return;
    }
    const resolved = resolvePickedTile(tile);
    const sheet =
      resolved === null ? undefined : SHEET_BY_SRC.get(resolved.sheetSrc);
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

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      hoverRef.current = cellFromEvent(e);
      // Covers Alt pressed before the window focused (no keydown seen).
      const eyedropper = resolveEyedropperActive({
        alt: e.altKey,
        ctrl: e.ctrlKey,
        meta: e.metaKey,
        altGraph: e.getModifierState("AltGraph"),
      });
      setAltHeld((prev) => (prev === eyedropper ? prev : eyedropper));
      const intent = resolveMouseDownIntent(e.button, e.altKey);
      if (intent === "ignore") return;
      const cell = cellFromEvent(e);
      if (cell === null) return;
      if (intent === "pick") {
        // Alt+click can steal menu focus or start a drag in some
        // browsers — swallow it so picking never paints.
        e.preventDefault();
        applyPick(gridRef.current[cell.r]?.[cell.c] ?? null);
        return;
      }
      paintAt(cell.c, cell.r, intent === "erase");
    },
    [cellFromEvent, paintAt, applyPick],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Hover tracks on every move — including button-free moves — so the
      // highlight works in all modes and never gates painting.
      hoverRef.current = cellFromEvent(e);
      const eyedropper = resolveEyedropperActive({
        alt: e.altKey,
        ctrl: e.ctrlKey,
        meta: e.metaKey,
        altGraph: e.getModifierState("AltGraph"),
      });
      setAltHeld((prev) => (prev === eyedropper ? prev : eyedropper));
      const intent = resolveMouseMoveIntent(e.buttons, e.altKey);
      if (intent === "none") return;
      const cell = cellFromEvent(e);
      if (cell === null) return;
      if (intent === "pick") {
        // Alt+drag would otherwise select text or start a native drag.
        e.preventDefault();
        applyPick(gridRef.current[cell.r]?.[cell.c] ?? null);
        return;
      }
      paintAt(cell.c, cell.r, intent === "erase");
    },
    [cellFromEvent, paintAt, applyPick],
  );

  const handleMouseLeave = useCallback(() => {
    hoverRef.current = null;
  }, []);

  // [coop-map-sync] Clear All broadcasts clear {seq} (LWW alone would let
  // peers' old cells resurrect the map); the hook also stamps the local seq
  // map so the clear converges identically on all peers.
  const handleClear = useCallback(() => {
    mapSync.broadcastClear();
  }, [mapSync]);

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
  /** Manifest sheet behind the selected paint src (follows synthesized
   * variants to their canonical strip) — drives the header preview geometry. */
  const selectedPaintSheet =
    selected === null
      ? null
      : (sheetForTileSrc(selected.src) ?? selected.sheet);
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
          {MAP_COLS}×{MAP_ROWS} cells · left-click paints · Alt+click picks · right-click erases
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span
            data-testid="selected-preview"
            className="flex items-center"
            title={
              selected === null || selectedName === null
                ? "No tile selected"
                : `${selectedName} (${selected.sx}, ${selected.sy})`
            }
          >
            {selected === null ||
            selectedPaintSheet === null ||
            selectedName === null ? (
              <span
                data-testid="selected-preview-empty"
                aria-label="No tile selected"
                className="flex items-center justify-center rounded-sm border border-dashed border-border-default text-sm text-text-muted"
                style={{ width: 32, height: 32 }}
              >
                –
              </span>
            ) : (
              <SelectedPreview selected={selected} sheet={selectedPaintSheet} />
            )}
          </span>
          <span
            data-testid="selected-tile"
            className="text-sm text-text-secondary"
          >
            {selected === null || selectedName === null
              ? "No tile selected"
              : `${selectedName} (${selected.sx}, ${selected.sy})`}
          </span>
          <span data-testid="coop-status" style={COOP_BADGE_STYLE}>{coopMounted ? coopState.status : "idle"}</span>
          <span data-testid="coop-role" style={COOP_BADGE_STYLE}>{coopMounted ? (coopState.role ?? "") : ""}</span>
          <span data-testid="coop-peer-count" style={COOP_BADGE_STYLE}>{coopMounted ? coopState.peers.length : 0}</span>
          <span data-testid="coop-remote-count" ref={remoteCountRef} style={COOP_BADGE_STYLE}>0</span>
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
            data-alt-held={altHeld ? "true" : "false"}
            className="absolute inset-0 block"
            style={{
              imageRendering: "pixelated",
              cursor: altHeld ? EYEDROPPER_CURSOR : "crosshair",
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
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

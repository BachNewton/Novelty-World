import { useMemo, useState } from "react";
import { CELL_PX, TILE_SHEET_BY_SRC, TILE_SHEETS, type TileSheet } from "./tiles";
import { animSrcCol, sheetForTileSrc } from "./tile-anim";
import {
  animFor,
  canonicalSwatchCss,
  familyDisplayName,
  isAnimSheet,
  isMatrixMember,
  isNestedSingle,
  matrixFor,
  matrixPaintSrc,
  matrixSwatchCss,
  nestedSingleSrcsFor,
  pickerSrcsFor,
  syncKeyFor,
  variantSrcsFor,
  variantSwatchCss,
  type TileMatrix,
} from "./tile-variants";
import { CellPreview, useAnimTick } from "./tile-preview";
import type { SelectedTile, TileSelection } from "./tile-selection";

const PALETTE_SCALE = 2;
const PALETTE_PX = CELL_PX * PALETTE_SCALE;

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

function categoryRank(category: string): number {
  const index = CATEGORY_ORDER.indexOf(category);
  return index === -1 ? CATEGORY_ORDER.length : index;
}

/** Matrix members and anim-pair anim sides paint from another section;
 * nested singles from a row in their parent's section. */
function ownsSection(sheet: TileSheet): boolean {
  return (
    !isMatrixMember(sheet.src) && !isNestedSingle(sheet.src) && !isAnimSheet(sheet.src)
  );
}

function groupPaletteCategories(): { category: string; sheets: TileSheet[] }[] {
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
  order.sort((a, b) => categoryRank(a) - categoryRank(b));
  return order.map((category) => ({
    category,
    sheets: (groups.get(category) ?? []).filter(ownsSection),
  }));
}

const PALETTE_CATEGORIES = groupPaletteCategories();

/** Manifest sheets nested as singles rows in this parent's section. */
function nestedSheetsFor(parentSrc: string): TileSheet[] {
  const out: TileSheet[] = [];
  for (const src of nestedSingleSrcsFor(parentSrc)) {
    const sheet = TILE_SHEET_BY_SRC.get(src);
    if (sheet !== undefined) out.push(sheet);
  }
  return out;
}

export function TilePalette({ selection }: { selection: TileSelection }) {
  return (
    <aside className="flex w-max max-w-none shrink-0 flex-col gap-3 overflow-y-auto lg:max-h-[calc(100dvh-120px)]">
      {PALETTE_CATEGORIES.map(({ category, sheets }) => (
        <section key={category} className="w-max max-w-none">
          <h2 className="mb-1 text-sm font-bold tracking-wide text-text-secondary uppercase">
            {category}
          </h2>
          <div className="flex w-max max-w-none flex-col gap-2">
            {sheets.map((sheet, sheetIndex) => {
              const matrix = matrixFor(sheet.src);
              return (
                <SheetSection
                  key={sheet.src}
                  sheet={sheet}
                  defaultOpen={
                    category === PALETTE_CATEGORIES[0]?.category && sheetIndex === 0
                  }
                  selected={selection.selected}
                  activeVariantFor={selection.activeVariantFor}
                  animated={selection.animatedFor(sheet.src)}
                  matrix={matrix}
                  matrixIndices={
                    matrix === null ? [] : selection.matrixChoiceFor(sheet.src, matrix)
                  }
                  nested={nestedSheetsFor(sheet.src)}
                  onSelect={selection.select}
                  onVariantSelect={selection.selectVariant}
                  onMatrixSelect={(axisIdx, optIdx) => {
                    if (matrix !== null) {
                      selection.selectMatrix(sheet.src, matrix, axisIdx, optIdx);
                    }
                  }}
                  onAnimToggle={selection.toggleAnim}
                />
              );
            })}
          </div>
        </section>
      ))}
    </aside>
  );
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
            <VariantSwatches
              sheet={sheet}
              variantSrcs={variantSrcs}
              activeVariant={activeVariant}
              onVariantSelect={onVariantSelect}
            />
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
              className={paletteCellClass(isSelectedCell(selected, sheet, sx, sy))}
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
  return (
    <div className="flex items-center gap-1.5 px-2 pb-2">
      <span className="text-xs text-text-muted">{displayName}</span>
      {!sharedPicker && variantSrcs.length > 0 && (
        <VariantSwatches
          sheet={sheet}
          variantSrcs={variantSrcs}
          activeVariant={activeVariant}
          onVariantSelect={onVariantSelect}
        />
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
        className={paletteCellClass(isSelectedCell(selected, sheet, 0, 0))}
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

/** Canonical dot followed by one dot per synthesized variant. */
function VariantSwatches({
  sheet,
  variantSrcs,
  activeVariant,
  onVariantSelect,
}: {
  sheet: TileSheet;
  variantSrcs: string[];
  activeVariant: string | null;
  onVariantSelect: (canonicalSrc: string, src: string | null) => void;
}) {
  return (
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
  );
}

function isSelectedCell(
  selected: SelectedTile | null,
  sheet: TileSheet,
  sx: number,
  sy: number,
): boolean {
  return (
    selected !== null &&
    selected.sheet.src === sheet.src &&
    selected.sx === sx &&
    selected.sy === sy
  );
}

function paletteCellClass(active: boolean): string {
  return `overflow-hidden rounded-sm border p-0 ${
    active
      ? "border-brand-orange"
      : "border-border-default hover:border-border-hover"
  }`;
}

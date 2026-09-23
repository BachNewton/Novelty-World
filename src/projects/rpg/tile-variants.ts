import VARIANTS_TABLE from "./variants.json";

interface VariantFamily {
  canonical: string;
  variants: Record<string, Record<string, string>>;
}

interface VariantSpec {
  canonical: string;
  lut: ReadonlyMap<number, number>;
  swatch: string;
}

const TABLE: Record<string, VariantFamily> = VARIANTS_TABLE as Record<
  string,
  VariantFamily
>;

/** The grass tone every grass-family LUT remaps; swatches key off it. */
const PRIMARY_OLD = "#3e8948ff";

function parseRgba(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`tile-variants: bad hex color ${hex}`);
  }
  return value;
}

function toCss(hex: string): string {
  return hex.slice(0, 7);
}

/** variant src URL -> its canonical src URL, integer LUT, and swatch color. */
const SPECS = new Map<string, VariantSpec>();
/** canonical src URL -> variant src URLs in table order. */
const BY_CANONICAL = new Map<string, string[]>();
/** canonical src URL -> family key from variants.json. */
const CANONICAL_FAMILY = new Map<string, string>();
/** canonical src URL -> swatch color for the canonical itself. */
const CANONICAL_SWATCHES = new Map<string, string>();

for (const [familyName, family] of Object.entries(TABLE)) {
  CANONICAL_FAMILY.set(family.canonical, familyName);
  const list = BY_CANONICAL.get(family.canonical) ?? [];
  for (const [variantSrc, hexLut] of Object.entries(family.variants)) {
    const entries = Object.entries(hexLut);
    const intLut = new Map<number, number>();
    const byOld = new Map<string, string>();
    for (const [oldHex, newHex] of entries) {
      intLut.set(parseRgba(oldHex), parseRgba(newHex));
      byOld.set(oldHex, newHex);
    }
    const target = byOld.get(PRIMARY_OLD) ?? entries.at(-1)?.at(1);
    SPECS.set(variantSrc, {
      canonical: family.canonical,
      lut: intLut,
      swatch: target === undefined ? "#888888" : toCss(target),
    });
    list.push(variantSrc);
    if (!CANONICAL_SWATCHES.has(family.canonical)) {
      const primary = byOld.has(PRIMARY_OLD)
        ? PRIMARY_OLD
        : entries.at(0)?.at(0);
      CANONICAL_SWATCHES.set(
        family.canonical,
        primary === undefined ? "#888888" : toCss(primary),
      );
    }
  }
  BY_CANONICAL.set(family.canonical, list);
}

/** Variant src URLs synthesized from this canonical sheet, in table order. */
export function variantSrcsFor(canonicalSrc: string): string[] {
  return BY_CANONICAL.get(canonicalSrc) ?? [];
}

/** Display color for a variant swatch: the remapped primary tone. */
export function variantSwatchCss(variantSrc: string): string {
  return SPECS.get(variantSrc)?.swatch ?? "#888888";
}

/** Display color for the canonical swatch: its own primary tone. */
export function canonicalSwatchCss(canonicalSrc: string): string {
  return CANONICAL_SWATCHES.get(canonicalSrc) ?? "#888888";
}

// ---------------------------------------------------------------------------
// Matrix families: two-axis variant pickers (bank tint x rock style).
// A matrix folds several canonical sheets into ONE palette section with one
// swatch row per axis. Every cell is an explicitly allowlisted paint src
// (row-major over the axes); no combination is inferred from filenames.
// The rock recolor is position-dependent (only 356 shading pixels differ
// between Waterfall_1 and Waterfall_5, the shared rock tones stay put), so
// no global rock LUT exists — each cell reuses an already-registered src
// whose synthesis path (plain sheet or variants.json LUT) is unchanged.
// ---------------------------------------------------------------------------

export interface TileMatrixAxis {
  key: string;
  label: string;
  /** Option paint srcs; options[0] is the axis resting state. */
  options: string[];
  /** Pinned display colors per option; options without an entry fall back
   * to the green-tone variant/canonical swatch helpers. */
  swatches?: Record<string, string>;
}

export interface TileMatrix {
  key: string;
  /** Primary sheet: owns the palette section and its cell geometry. */
  canonical: string;
  /** Extra member sheets folded into the primary section (no section of
   * their own). Same dims/anim as the primary. */
  members: string[];
  axes: TileMatrixAxis[];
  /** Paint src per combination, row-major over axes. */
  cells: string[];
}

const MATRICES: TileMatrix[] = [
  {
    key: "waterfall",
    canonical: "/rpg/tiles/Waterfall/Waterfall_1.png",
    members: ["/rpg/tiles/Waterfall/Waterfall_5.png"],
    axes: [
      {
        key: "bank",
        label: "Bank",
        options: [
          "/rpg/tiles/Waterfall/Waterfall_1.png",
          "/rpg/tiles/Waterfall/Waterfall_2.png",
          "/rpg/tiles/Waterfall/Waterfall_3.png",
          "/rpg/tiles/Waterfall/Waterfall_4.png",
        ],
      },
      {
        key: "rock",
        label: "Rock",
        options: [
          "/rpg/tiles/Waterfall/Waterfall_1.png",
          "/rpg/tiles/Waterfall/Waterfall_5.png",
        ],
        // Rock-face tones from the artist's own WF1->WF5 recolor pair
        // (#6c7c9d -> #9c6754, 48 px); the green-tone helpers would show
        // bank grass here instead of rock.
        swatches: {
          "/rpg/tiles/Waterfall/Waterfall_1.png": "#6c7c9d",
          "/rpg/tiles/Waterfall/Waterfall_5.png": "#9c6754",
        },
      },
    ],
    cells: [
      "/rpg/tiles/Waterfall/Waterfall_1.png",
      "/rpg/tiles/Waterfall/Waterfall_5.png",
      "/rpg/tiles/Waterfall/Waterfall_2.png",
      "/rpg/tiles/Waterfall/Waterfall_6.png",
      "/rpg/tiles/Waterfall/Waterfall_3.png",
      "/rpg/tiles/Waterfall/Waterfall_7.png",
      "/rpg/tiles/Waterfall/Waterfall_4.png",
      "/rpg/tiles/Waterfall/Waterfall_8.png",
    ],
  },
];

/** Swatch color for a matrix option: a pinned per-axis color when the
 * axis defines one, else the green-tone variant/canonical helpers. */
export function matrixSwatchCss(matrix: TileMatrix, axisKey: string, optionSrc: string): string {
  const axis = matrix.axes.find((a) => a.key === axisKey);
  if (axis === undefined) return "#888888";
  const pinned = axis.swatches?.[optionSrc];
  if (pinned !== undefined) return pinned;
  const variant = variantSwatchCss(optionSrc);
  if (variant !== "#888888") return variant;
  return canonicalSwatchCss(optionSrc);
}

// ---------------------------------------------------------------------------
// Nested singles: 1x1 sheets that paint from a small row inside their
// parent family section instead of owning a standalone section. Explicit
// allowlist of sheet srcs; the palette resolves them to manifest sheets.
// ---------------------------------------------------------------------------

export interface TileNest {
  parent: string;
  children: string[];
}

const NESTS: TileNest[] = [
  {
    parent: "/rpg/tiles/Grass/Grass_Tiles_1.png",
    children: [
      "/rpg/tiles/Grass/Grass_1_Middle.png",
      "/rpg/tiles/Grass/Path_Middle.png",
    ],
  },
  {
    parent: "/rpg/tiles/Water/Water_Tile_1.png",
    children: ["/rpg/tiles/Water/Water_Middle.png"],
  },
  {
    parent: "/rpg/tiles/Cave/Cave_Floor_1.png",
    children: [
      "/rpg/tiles/Cave/Cave_Floor_Middle.png",
      "/rpg/tiles/Cave/Cave_Floor_Ladder.png",
    ],
  },
];

const NEST_BY_PARENT = new Map<string, string[]>(
  NESTS.map((nest) => [nest.parent, nest.children]),
);
const NESTED_SINGLES = new Set(NESTS.flatMap((nest) => nest.children));

/** 1x1 child srcs nested in this parent sheet's section. */
export function nestedSingleSrcsFor(parentSrc: string): string[] {
  return NEST_BY_PARENT.get(parentSrc) ?? [];
}

/** Whether this sheet paints from a nested row, not its own section. */
export function isNestedSingle(src: string): boolean {
  return NESTED_SINGLES.has(src);
}

const MATRIX_BY_PRIMARY = new Map<string, TileMatrix>(
  MATRICES.map((m) => [m.canonical, m]),
);
const MATRIX_MEMBER_TO_PRIMARY = new Map<string, string>();
for (const m of MATRICES) {
  for (const member of m.members) MATRIX_MEMBER_TO_PRIMARY.set(member, m.canonical);
}

function matrixCellCount(matrix: TileMatrix): number {
  return matrix.axes.reduce((n, axis) => n * axis.options.length, 1);
}

for (const m of MATRICES) {
  if (m.cells.length !== matrixCellCount(m)) {
    throw new Error(`tile-variants: matrix ${m.key} cells mismatch axes`);
  }
  const paintable = new Set([
    m.canonical,
    ...m.members,
    ...m.axes.flatMap((axis) => axis.options),
  ]);
  for (const cell of m.cells) {
    if (!paintable.has(cell) && !isVariantSrc(cell)) {
      throw new Error(`tile-variants: matrix ${m.key} cell ${cell} is not paintable`);
    }
  }
}

/** Matrix owned by this primary sheet src, or null. */
export function matrixFor(canonicalSrc: string): TileMatrix | null {
  return MATRIX_BY_PRIMARY.get(canonicalSrc) ?? null;
}

/** Whether this sheet is folded into another sheet's matrix section. */
export function isMatrixMember(src: string): boolean {
  return MATRIX_MEMBER_TO_PRIMARY.has(src);
}

/** Axis indices for a combination; row-major over axes. */
export function matrixIndicesFor(
  matrix: TileMatrix,
  paintSrc: string,
): number[] | null {
  const flat = matrix.cells.indexOf(paintSrc);
  if (flat < 0) return null;
  const indices = new Array<number>(matrix.axes.length);
  let rest = flat;
  for (let a = matrix.axes.length - 1; a >= 0; a -= 1) {
    const axis = matrix.axes[a] as TileMatrixAxis;
    indices[a] = rest % axis.options.length;
    rest = Math.floor(rest / axis.options.length);
  }
  return indices;
}

/** Paint src for axis indices (out-of-range axes rest at 0). */
export function matrixPaintSrc(matrix: TileMatrix, indices: number[]): string {
  let flat = 0;
  for (let a = 0; a < matrix.axes.length; a += 1) {
    const axis = matrix.axes[a] as TileMatrixAxis;
    const raw = indices[a] ?? 0;
    const pick = Math.min(Math.max(raw, 0), axis.options.length - 1);
    flat = flat * axis.options.length + pick;
  }
  return matrix.cells[flat] ?? matrix.canonical;
}

/** Whether this URL is a synthesized variant (no PNG on disk). */
export function isVariantSrc(src: string): boolean {
  return SPECS.has(src);
}

/**
 * Canonical sheet src behind a URL: variant srcs map to their canonical
 * sheet, everything else maps to itself.
 */
export function canonicalSrcFor(src: string): string {
  return SPECS.get(src)?.canonical ?? src;
}

/** Human-readable family name for a canonical sheet, or null if standalone. */
export function familyDisplayName(canonicalSrc: string): string | null {
  const key = CANONICAL_FAMILY.get(canonicalSrc);
  if (key === undefined) return null;
  return key
    .split("-")
    .map((w) => (w.length === 0 ? w : w.slice(0, 1).toUpperCase() + w.slice(1)))
    .join(" ");
}

function packPixel(r: number, g: number, b: number, a: number): number {
  return ((r * 256 + g) * 256 + b) * 256 + a;
}

/** Remap the loaded canonical bitmap through the LUT; returns a PNG data URL. */
function synthesizeBitmap(
  base: HTMLImageElement,
  lut: ReadonlyMap<number, number>,
): string {
  const width = base.naturalWidth;
  const height = base.naturalHeight;
  if (width === 0 || height === 0) {
    throw new Error("tile-variants: canonical image has no pixels yet");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("tile-variants: 2d canvas context unavailable");
  }
  ctx.drawImage(base, 0, 0);
  const imageData = ctx.getImageData(0, 0, width, height);
  const px = imageData.data;
  for (let i = 0; i + 3 < px.length; i += 4) {
    const mapped = lut.get(packPixel(px[i], px[i + 1], px[i + 2], px[i + 3]));
    if (mapped !== undefined) {
      px[i] = Math.floor(mapped / 16777216) % 256;
      px[i + 1] = Math.floor(mapped / 65536) % 256;
      px[i + 2] = Math.floor(mapped / 256) % 256;
      px[i + 3] = mapped % 256;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

const imageCache = new Map<string, HTMLImageElement>();

/**
 * Image element for any tile sheet URL, shared by the editor and the game.
 * Variant URLs are synthesized once from their canonical sheet (offscreen
 * canvas + LUT remap) and cached under the existing URL string, so stored
 * maps keep referencing variant srcs unchanged.
 */
export function getTileImage(src: string): HTMLImageElement {
  const cached = imageCache.get(src);
  if (cached !== undefined) return cached;
  const img = new Image();
  imageCache.set(src, img);
  const spec = SPECS.get(src);
  if (spec === undefined) {
    img.src = src;
    return img;
  }
  const base = getTileImage(spec.canonical);
  const render = () => {
    img.src = synthesizeBitmap(base, spec.lut);
  };
  if (base.complete && base.naturalWidth > 0) {
    render();
  } else {
    base.addEventListener("load", render, { once: true });
  }
  return img;
}

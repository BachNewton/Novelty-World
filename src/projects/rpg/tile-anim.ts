import { TILE_SHEETS, type TileAnim, type TileSheet } from "./tiles";
import { canonicalSrcFor } from "./tile-variants";

const SHEETS_BY_SRC = new Map<string, TileSheet>(
  TILE_SHEETS.map((sheet) => [sheet.src, sheet]),
);

/**
 * Manifest sheet for a painted cell src. Variant srcs have no manifest entry
 * of their own (their PNGs are synthesized at runtime), so follow them to
 * their canonical sheet — the LUT remap preserves animation frames.
 */
export function sheetForTileSrc(src: string): TileSheet | undefined {
  return SHEETS_BY_SRC.get(src) ?? SHEETS_BY_SRC.get(canonicalSrcFor(src));
}

/**
 * Fold a stored sx into frame-0 range for animated sheets. Old maps may hold
 * cells picked from later frames (sx >= frameW); new paints are always
 * frame-0-relative, so folding is a no-op for them.
 */
export function foldAnimSx(
  sheet: TileSheet | undefined,
  sx: number,
): number {
  const frameW = sheet?.anim?.frameW ?? 0;
  if (frameW <= 0) return sx;
  return ((sx % frameW) + frameW) % frameW;
}

/** Deterministic per-cell phase so adjacent water tiles don't shimmer in lockstep. */
export function animPhase(c: number, r: number, frames: number): number {
  if (frames <= 0) return 0;
  const h = Math.imul(c, 374761393) ^ Math.imul(r, 668265263);
  return ((h % frames) + frames) % frames;
}

/**
 * Animation frame index at a rAF timestamp. The clock is global (shared
 * across the editor and game canvases) with a per-cell phase offset;
 * ping-pong runs a triangle wave over 2*frames-2 steps.
 */
export function animFrameIndex(
  anim: TileAnim,
  nowMs: number,
  c: number,
  r: number,
): number {
  if (anim.frames <= 0) return 0;
  const step =
    Math.floor(nowMs / (1000 / anim.fps)) + animPhase(c, r, anim.frames);
  if (anim.mode === "loop" || anim.frames <= 1) {
    return ((step % anim.frames) + anim.frames) % anim.frames;
  }
  const period = 2 * anim.frames - 2;
  const i = ((step % period) + period) % period;
  return i < anim.frames ? i : period - i;
}

/** Source cell column for an animated tile at map cell (c, r); sy is unchanged. */
export function animSrcCol(
  sheet: TileSheet,
  sx: number,
  nowMs: number,
  c: number,
  r: number,
): number {
  const anim = sheet.anim;
  if (anim === undefined) return sx;
  return animFrameIndex(anim, nowMs, c, r) * anim.frameW + foldAnimSx(sheet, sx);
}

import { SPACES } from "./data";

// Pure camera geometry for the infinite-scroll board (see `components/squares.tsx`).
// The board renders three identical copies stacked; the camera normally lives in
// the middle copy and a snap-back keeps it there. These helpers compute where the
// camera should sit and how a token hop is laid out, in scroll-content coords.

// Each row is 44px (h-11). The 1px divider is painted as an inset bottom
// shadow on the row itself, so it doesn't add to the row's box.
export const ROW_PX = 44;
export const CYCLE_PX = SPACES.length * ROW_PX;

// On each turn the active player's square is parked just under the header; the
// camera follows a slide only if the landing would fall within this margin of
// the bottom edge.
export const ANCHOR_TOP_PX = 4;
export const FOLLOW_BOTTOM_GAP = ROW_PX * 1.5;

// Slides up to a die roll's reach (incl. passing GO) animate; longer jumps
// (teleports, "advance to" cards, jail) cut instantly so the token never zips
// the wrong way around the board.
export const MAX_SLIDE_ROWS = 12;

const clampCopy = (n: number) => Math.max(0, Math.min(2, n));

// Scroll offset that parks `position`'s row at the top anchor, choosing the
// board copy nearest the current camera so a glide or park always takes the
// short way — forward motion reads as a small scroll down, never a yank the
// long way around the loop. Any out-of-band result self-corrects via the
// (invisible) snap-back, since every copy renders identical content.
export const anchorNear = (position: number, scrollTop: number) => {
  const raw = position * ROW_PX - ANCHOR_TOP_PX;
  return raw + CYCLE_PX * Math.round((scrollTop - raw) / CYCLE_PX);
};

// Signed forward delta in rows between two board positions: a die roll reads as
// a small positive (forward) hop, including across GO; only a more-than-half-
// board gap flips negative (a teleport that should cut instantly, not slide).
export const signedRows = (from: number, to: number) => {
  const forward = (to - from + SPACES.length) % SPACES.length;
  return forward <= SPACES.length / 2 ? forward : forward - SPACES.length;
};

export interface SlideGeometry {
  signed: number;
  startCenter: number;
  endCenter: number;
}

// Geometry of a token hop, starting from wherever the token currently sits on
// screen. Finds the nearest board copy of `from` to the viewport center, then
// the hop's start and end row centers in content coords.
export const slideGeometry = (
  scrollTop: number,
  clientHeight: number,
  from: number,
  to: number,
): SlideGeometry => {
  const signed = signedRows(from, to);
  const viewCenter = scrollTop + clientHeight / 2;
  const copy = clampCopy(
    Math.round((viewCenter - (from * ROW_PX + ROW_PX / 2)) / CYCLE_PX),
  );
  const startCenter = (copy * SPACES.length + from) * ROW_PX + ROW_PX / 2;
  const endCenter = startCenter + signed * ROW_PX;
  return { signed, startCenter, endCenter };
};

// Down-only follow: the scrollTop the camera should animate to so the landing
// clears the bottom margin, or null if it already fits (camera holds still).
export const followTarget = (
  scrollTop: number,
  viewportHeight: number,
  endCenter: number,
): number | null => {
  const overflow = endCenter - scrollTop - (viewportHeight - FOLLOW_BOTTOM_GAP);
  return overflow > 0 ? scrollTop + overflow : null;
};

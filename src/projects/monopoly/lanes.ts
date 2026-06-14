// Horizontal lane geometry for player tokens. Every player owns a fixed lane
// (their seat index in the roster), so a token sits — and animates, and trails —
// at the same x on every square. This keeps moving tokens and their trails from
// landing on top of each other when several players travel the same stretch of
// board. Both the static tokens (square-row's TokenStrip) and the sliding
// overlay token (squares' Squares) read these helpers so the two stay aligned.

// The token strip starts after the 72px left panel, the context panel's 8px
// left padding, and the 150px name cell.
export const STRIP_LEFT_PX = 72 + 8 + 150;

// Width of a token, used to draw the overlay token and to keep the rightmost
// lane inside the strip when computing the pitch.
export const LANE_TOKEN_PX = 30;

// Space reserved to the right of the strip — the context panel's 8px right
// padding plus the 60px cost cell — so lanes stay clear of the cost readout on
// the squares that show one. Cost-less squares get extra slack we don't use,
// which keeps every square's lanes in the same columns.
const STRIP_RESERVED_PX = STRIP_LEFT_PX + 8 + 60;

// Lanes never spread wider than a token plus a little breathing room; past that
// the extra width is left as slack rather than pushing players far apart.
const MAX_LANE_PITCH_PX = 36;

/** Horizontal distance between adjacent lanes for a roster of `count` players,
 *  given the board's pixel width. The pitch shrinks so every lane fits inside
 *  the strip and grows up to MAX_LANE_PITCH_PX when there's room — the same
 *  spread-or-pile behavior tokens used to get only while sharing a square. */
export function lanePitch(count: number, boardWidthPx: number): number {
  if (count <= 1) return 0;
  const stripWidth = Math.max(0, boardWidthPx - STRIP_RESERVED_PX);
  const pitch = (stripWidth - LANE_TOKEN_PX) / (count - 1);
  return Math.max(0, Math.min(pitch, MAX_LANE_PITCH_PX));
}

/** The x offset (from the strip's left edge) of a player's lane. */
export const laneOffset = (seatIndex: number, pitch: number): number =>
  seatIndex * pitch;

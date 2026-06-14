import { describe, it, expect } from "vitest";
import {
  ROW_PX,
  CYCLE_PX,
  anchorNear,
  signedRows,
  slideGeometry,
  followTarget,
} from "./camera";

// A typical phone viewport height (the board is full-bleed below the header).
const H = 700;

describe("signedRows", () => {
  it("reads a die roll as a small forward hop", () => {
    expect(signedRows(10, 16)).toBe(6);
  });

  it("reads a wrap past GO as a short forward hop, not a backward jump", () => {
    expect(signedRows(38, 2)).toBe(4);
  });
});

// Replay a doubles turn that wraps past GO, one authoritative move at a time,
// tracking the camera (scrollTop) and the token's on-screen pixel exactly as the
// component would. The "forward = down" illusion requires that across the whole
// turn the token's screen position only ever moves DOWN (or holds) — it never
// jumps backward up the board between the moves of a doubles chain.
describe("a doubles turn that wraps past GO", () => {
  // Simulate one move: park/continue, lay out the hop, follow if needed.
  const playMove = (scrollTop: number, from: number, to: number) => {
    const { startCenter, endCenter } = slideGeometry(scrollTop, H, from, to);
    const target = followTarget(scrollTop, H, endCenter);
    const nextScroll = target ?? scrollTop;
    return {
      startCenter,
      endCenter,
      nextScroll,
      // Where the token sits on screen at the start and end of the hop.
      startOnScreen: startCenter - scrollTop,
      endOnScreen: endCenter - nextScroll,
    };
  };

  it("the camera never scrolls up across the chain", () => {
    // Turn start: player parked at the top anchor for position 36.
    let scrollTop = anchorNear(36, CYCLE_PX);

    // Roll 1 (doubles, 12): 36 -> 8, wrapping past GO.
    const m1 = playMove(scrollTop, 36, 8);
    expect(m1.nextScroll).toBeGreaterThanOrEqual(scrollTop); // down or hold
    scrollTop = m1.nextScroll;

    // Re-roll (5): 8 -> 13.
    const m2 = playMove(scrollTop, 8, 13);
    expect(m2.nextScroll).toBeGreaterThanOrEqual(scrollTop); // down or hold

    // And the re-roll continues from exactly where move 1 left the token —
    // no backward jump at the seam.
    expect(m2.startCenter).toBe(m1.endCenter);
  });
});

// The handoff/park path positions the camera by an absolute target rather than
// a relative slide. `anchorNear` picks the board copy nearest the current camera,
// so a forward step parks one row DOWN instead of yanking ~a full board the long
// way around the loop — the regression this guards against.
describe("parking on the active square preserves forward = down", () => {
  it("a one-square forward step parks exactly one row down", () => {
    // Two adjacent squares that straddle a board-copy seam. Stepping forward
    // from `before` to `after` should nudge the camera DOWN one row, never wrap.
    const before = 20;
    const after = 21;
    expect(signedRows(before, after)).toBe(1); // one step forward

    const parked = anchorNear(before, CYCLE_PX); // camera resting on `before`
    const next = anchorNear(after, parked); // re-park on the next square
    expect(next - parked).toBe(ROW_PX); // one row down — no full-board yank
  });

  it("parks in the copy nearest the camera, never the long way around", () => {
    // Wherever the camera sits, the chosen anchor is always within half a board.
    for (let pos = 0; pos < 40; pos++) {
      for (const scrollTop of [CYCLE_PX, CYCLE_PX * 0.6, CYCLE_PX * 1.4]) {
        const anchor = anchorNear(pos, scrollTop);
        expect(Math.abs(anchor - scrollTop)).toBeLessThanOrEqual(CYCLE_PX / 2);
      }
    }
  });
});

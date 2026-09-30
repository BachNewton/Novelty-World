import type { Lanes, TetrominoKind } from "./types";

// A pull-off: lanes beside the road, on its left or right edge, spanning a
// fixed stretch of the course with a barrier at each end, like a lay-by on a
// mountain road. No vehicle ever enters it. It holds one waiting piece, which
// the frog can swap its own piece for.

export type Side = "left" | "right";

export interface PullOff {
  side: Side;
  // The stretch it spans along the course, between its barriers' inner faces.
  near: number;
  far: number;
  // How many lanes wide it is.
  width: number;
  waiting: TetrominoKind;
}

// How deep a barrier block is, beyond each end of the stretch. The rules only
// need the stretch's ends; the barriers are what the player sees of them.
export const BARRIER_DEPTH = 1;

// The pull-off's lanes, beside the `roadCols` traffic lanes.
export function pullOffLanes(pullOff: Pick<PullOff, "side" | "width">, roadCols: number): Lanes {
  return pullOff.side === "left"
    ? { first: -pullOff.width, last: -1 }
    : { first: roadCols, last: roadCols + pullOff.width - 1 };
}

// Whether a depth range along the course lies within the pull-off's stretch.
export function withinStretch(pullOff: Pick<PullOff, "near" | "far">, back: number, front: number): boolean {
  return back >= pullOff.near && front <= pullOff.far;
}

// The pull-off the camera makes room for, with the frog's depth range from
// `back` to `front`: the first whose near barrier is no more than `reach`
// ahead of the frog and whose far barrier the frog hasn't yet gone by. Null
// if none is near.
export function nearPullOff<P extends PullOff>(pullOffs: readonly P[], back: number, front: number, reach: number): P | null {
  return pullOffs.find((p) => front >= p.near - BARRIER_DEPTH - reach && back <= p.far + BARRIER_DEPTH) ?? null;
}

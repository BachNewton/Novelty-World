// ---------------------------------------------------------------------------
// Decode: argmax, and only argmax.
//
// The policy's selection IS the move. There is deliberately no sampled decode
// here and no mode switch to reach one — the bot executes what the net picked.
//
// That is not a taste call about exploration. A stochastic decode makes every
// action the net leaves mass on reachable at play time, so an action that must
// never be taken cannot be ruled out by the weights alone; and it puts a second
// policy (the draw) between the weights and the board, one nobody measured. The
// place to forbid an action is its LEGALITY MASK in `core/action-space.ts`,
// which the training rig reads from this same source — so the policy is never
// offered the action in the first place, in training or in play.
// ---------------------------------------------------------------------------

/**
 * The highest-probability entry of ONE row of a flat probability buffer; ties go
 * to the lowest index, matching the reference `argmax`.
 *
 * The row is `[offset, offset + width)`. Rows live in one buffer because a
 * per-row-independent head is a grid of them, and slicing each one out would
 * allocate per decision on the hot path. The returned index is relative to the
 * row, not to the buffer.
 */
export function greedyIndex(probs: ArrayLike<number>, offset: number, width: number): number {
  if (width <= 0) throw new Error("greedyIndex: empty row");
  let best = 0;
  for (let i = 1; i < width; i++) if (probs[offset + i] > probs[offset + best]) best = i;
  return best;
}

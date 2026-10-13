/*
 * Page elements pinned over figures, kept from covering each other: each is
 * a touch target, and on a phone the figures of one room stand a finger's
 * width apart or less. Elements that would overlap are laid side by side,
 * in the order they stand across the screen, centred where they wanted to
 * be, and never moved up or down. A row that would leave the screen is slid
 * back onto it as a whole, so the screen's edge never pushes one box onto
 * its neighbour.
 */

/** A pinned element on the screen: its middle across, its top, and its size, in CSS pixels. */
export interface PinBox {
  x: number;
  top: number;
  width: number;
  height: number;
}

interface Run {
  /** The boxes laid side by side, left to right, by index. */
  members: number[];
  left: number;
  width: number;
  top: number;
  bottom: number;
}

/** Where each box's middle goes across so that none overlaps another, with at least `gap` between neighbours side by side,
 *  kept between `bounds` (the screen's edges, less a margin) where a row fits. */
export function pinsApart(boxes: readonly PinBox[], gap: number, bounds: { left: number; right: number } = { left: -Infinity, right: Infinity }): number[] {
  const order = boxes.map((_, i) => i).sort((a, b) => boxes[a].x - boxes[b].x || a - b);
  const runs: Run[] = [];
  const layOut = (members: number[]): Run => {
    const width = members.reduce((sum, i) => sum + boxes[i].width, 0) + gap * (members.length - 1);
    const middle = members.reduce((sum, i) => sum + boxes[i].x, 0) / members.length;
    return {
      members,
      left: Math.max(bounds.left, Math.min(middle - width / 2, bounds.right - width)),
      width,
      top: Math.min(...members.map((i) => boxes[i].top)),
      bottom: Math.max(...members.map((i) => boxes[i].top + boxes[i].height)),
    };
  };
  const clash = (a: Run, b: Run) => a.top < b.bottom && b.top < a.bottom && a.left < b.left + b.width + gap && b.left < a.left + a.width + gap;
  for (const index of order) {
    let run = layOut([index]);
    // A run that grows can reach the runs laid out before it: they join it, until it clashes with none.
    for (let other = runs.findIndex((placed) => clash(placed, run)); other !== -1; other = runs.findIndex((placed) => clash(placed, run))) {
      const [joined] = runs.splice(other, 1);
      run = layOut([...joined.members, ...run.members].sort((a, b) => boxes[a].x - boxes[b].x || a - b));
    }
    runs.push(run);
  }
  const placed = boxes.map((box) => box.x);
  for (const run of runs) {
    let left = run.left;
    for (const i of run.members) {
      placed[i] = left + boxes[i].width / 2;
      left += boxes[i].width + gap;
    }
  }
  return placed;
}

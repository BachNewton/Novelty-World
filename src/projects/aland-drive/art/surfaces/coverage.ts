import { float, floor, fract, max, min } from "three/tsl";
import type { Node } from "three/webgpu";

/*
 * How much of a pixel a shape covers, for patterns drawn in metres on a surface.
 * Each is the shape box-filtered over the pixel's footprint, so it is a crisp
 * edge up close and settles on the shape's share of the surface far off, by
 * itself: nothing needs fading out, so no distance shows a change.
 */

type F = Node<"float">;
type Value = F | number;

/** The share of a pixel `size` wide, centred at `x`, that lies between `from` and `to`. */
export function band(x: F, from: Value, to: Value, size: F): F {
  const half = size.max(1e-4).mul(0.5);
  return min(x.add(half), to).sub(max(x.sub(half), from)).div(half.mul(2)).clamp(0, 1);
}

/** The same for a row of pulses `half` either side of every multiple of `period`. */
export function pulses(x: F, period: F, half: number, size: F): F {
  const width = float(half * 2);
  // How much of the row lies below x, counted from the start of a pulse.
  const before = (at: F) => {
    const cycles = at.add(half).div(period);
    return floor(cycles).mul(width).add(min(fract(cycles).mul(period), width));
  };
  const spread = size.max(1e-4);
  return before(x.add(spread.mul(0.5))).sub(before(x.sub(spread.mul(0.5)))).div(spread).clamp(0, 1);
}

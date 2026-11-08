import { float, floor, select, sqrt, vec2 } from "three/tsl";
import type { Node } from "three/webgpu";

/*
 * A square spiral over a lattice, from a centre cell outwards: ring 0 is the centre, ring k the 8k cells round it.
 * A compute pass that goes through its places in this order appends them to its list near to far, more or less, since
 * the GPU runs its workgroups in about the order they're dispatched, and a list drawn near to far has the depth test
 * spare what stands behind what's already drawn. Row by row, a list came out back to front for half the ways a camera
 * can face, and a forest's crowns were shaded three and four deep.
 */

/** The lattice cells a spiral of this many rings round its centre holds. */
export const spiralPlaces = (rings: number) => (2 * rings + 1) ** 2;

/** The cell, relative to the centre, that the `index`th place of the spiral is: every number here is a whole one well under a float's 24 bits, so it's exact. */
export function spiralCell(index: Node<"uint">): Node<"vec2"> {
  const place = float(index);
  // The ring: (2k - 1)² cells lie inside ring k.
  const ring = floor(sqrt(place).add(1).div(2)).toVar();
  const along = place.sub(ring.mul(2).sub(1).mul(ring.mul(2).sub(1))).toVar();
  const edge = ring.mul(2).toVar();
  const side = floor(along.div(edge)).toVar();
  const step = along.sub(side.mul(edge)).toVar();
  // Up the right side, back along the top, down the left side, forward along the bottom.
  const right = vec2(ring, ring.negate().add(step));
  const top = vec2(ring.sub(step), ring);
  const left = vec2(ring.negate(), ring.sub(step));
  const bottom = vec2(ring.negate().add(step), ring.negate());
  const around = select(side.lessThan(1), right, select(side.lessThan(2), top, select(side.lessThan(3), left, bottom)));
  return select(ring.lessThan(0.5), vec2(0, 0), around);
}

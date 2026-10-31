import type { V3 } from "../roadside/mesh";
import { Marked, type MarinaPart } from "./paint";

/*
 * A modern yacht's hull out of the water, for what stands ashore: a bow along +x and
 * its keel's bottom at y 0, so a cradle or a tarp is built round it. Its boat is no
 * boat in particular: only the shape a cradle's pads and a winter cover need.
 */

/** Along, half-beam at the sheer, sheer height, half-beam at the bilge, bilge height, canoe body's bottom. */
export const YACHT_STATIONS: readonly (readonly [x: number, deck: number, sheer: number, bilge: number, bilgeY: number, body: number])[] = [
  [-4.5, 1.05, 2.75, 0.95, 2.05, 1.72],
  [-3, 1.42, 2.72, 1.22, 1.75, 1.42],
  [-1.2, 1.55, 2.74, 1.25, 1.62, 1.3],
  [0.8, 1.48, 2.8, 1.1, 1.65, 1.32],
  [2.8, 1.02, 2.92, 0.62, 1.86, 1.5],
  [4.8, 0.04, 3.14, 0.02, 2.6, 2.45],
];

export const YACHT_KEEL_TOP_M = 1.4;

export interface HullPaint {
  topsides: MarinaPart;
  below: MarinaPart;
}

/** The loft, its boot-top, the deck, the transom, and the fin and rudder. */
export function yachtHull(into: Marked, stations: readonly (typeof YACHT_STATIONS)[number][], { topsides, below }: HullPaint, withBootTop: boolean): Marked {
  for (const side of [-1, 1]) {
    for (let station = 0; station + 1 < stations.length; station++) {
      const [ax, aDeck, aSheer, aBilge, aBilgeY, aBody] = stations[station];
      const [bx, bDeck, bSheer, bBilge, bBilgeY, bBody] = stations[station + 1];
      const shade = side > 0 ? 1 : 0.9;
      into
        .face([[ax, aSheer, side * aDeck], [bx, bSheer, side * bDeck], [bx, bBilgeY + 0.34, side * (bBilge + 0.1 * bDeck)], [ax, aBilgeY + 0.34, side * (aBilge + 0.1 * aDeck)]], topsides, shade)
        .face([[ax, aBilgeY + 0.34, side * (aBilge + 0.1 * aDeck)], [bx, bBilgeY + 0.34, side * (bBilge + 0.1 * bDeck)], [bx, bBilgeY, side * bBilge], [ax, aBilgeY, side * aBilge]], below, shade * 0.95)
        .face([[ax, aBilgeY, side * aBilge], [bx, bBilgeY, side * bBilge], [bx, bBody, 0], [ax, aBody, 0]], below, shade * 0.72)
        .face([[ax, aSheer, side * aDeck], [bx, bSheer, side * bDeck], [bx, bSheer, 0], [ax, aSheer, 0]], "yacht-deck", 1.05);
      if (withBootTop) into.face([[ax, aBilgeY + 0.36, side * (aBilge + 0.102 * aDeck)], [bx, bBilgeY + 0.36, side * (bBilge + 0.102 * bDeck)], [bx, bBilgeY + 0.3, side * (bBilge + 0.095 * bDeck)], [ax, aBilgeY + 0.3, side * (aBilge + 0.095 * aDeck)]], "boot-top", shade);
    }
  }
  const [x, deck, sheer, bilge, bilgeY, body] = stations[0];
  into.face([[x, sheer, deck], [x, sheer, -deck], [x, bilgeY, -bilge], [x, body, 0], [x, bilgeY, bilge]], topsides, 0.88);
  const fin: V3[] = [[-0.5, YACHT_KEEL_TOP_M, 0], [1.1, YACHT_KEEL_TOP_M, 0], [0.55, 0.02, 0], [-0.6, 0.02, 0]];
  for (const lean of [-0.07, 0.07]) into.face(fin.map(([fx, fy]): V3 => [fx, fy, fy < 1 ? 0 : lean]), below, lean > 0 ? 0.85 : 0.7);
  into.box([-0.6, 0, -0.14], [0.55, 0.16, 0.14], "iron", { shade: 0.9 });
  return into.face([[-3.9, 1.65, 0.02], [-3.45, 1.55, 0.02], [-3.55, 0.65, 0.02], [-3.95, 0.72, 0.02]], below, 0.8);
}

/** A cabin trunk on the deck, for a boat that isn't under a cover. */
export function coachroof(into: Marked): Marked {
  return into
    .box([-1.3, 2.74, -0.95], [2, 3.25, 0.95], "hull-white", { open: true, shadeTop: 1.08 })
    .face([[-1.31, 2.95, 0.96], [1.7, 2.95, 0.96], [1.7, 3.1, 0.96], [-1.31, 3.1, 0.96]], "glass")
    .face([[-1.31, 2.95, -0.96], [1.7, 2.95, -0.96], [1.7, 3.1, -0.96], [-1.31, 3.1, -0.96]], "glass");
}

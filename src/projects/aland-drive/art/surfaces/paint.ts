import { abs, float, fract, fwidth, max, mod, select, smoothstep } from "three/tsl";
import type { Node } from "three/webgpu";
import { GIVE_WAY, STOP, ZEBRA } from "./road-attributes";

/*
 * The paint at a junction, drawn on the ribbon of the road that gives way, from
 * two numbers per vertex (`road-attributes.ts`): how far the junction is and what
 * it asks for. No decals: nothing to fight the road for depth, no extra draw call.
 */

const LINE_FROM_M = 0.5;
const STOP_LINE_M = 0.45;
const TEETH_ROW_M = 0.62;
const TOOTH_EVERY_M = 0.95;
const TOOTH_WIDE_M = 0.62;
const ZEBRA_FROM_M = 2.6;
const ZEBRA_LENGTH_M = 3.2;
const ZEBRA_STRIPE_M = 0.55;
const EDGE_LEFT_M = 0.25;
const OWN_LANE_FROM_M = 2.6;

export interface MarkInput {
  /** Signed: positive left of the chain's direction. */
  across: Node<"float">;
  halfWidth: Node<"float">;
  toMark: Node<"float">;
  mark: Node<"float">;
}

/** How much paint is on this spot of road, 0 to 1. */
export function junctionMarks({ across, halfWidth, toMark, mark }: MarkInput): Node<"float"> {
  const kind = abs(mark);
  const line = mod(kind, float(ZEBRA));
  const hasZebra = kind.greaterThan(ZEBRA - 0.5);
  const metres = across.mul(halfWidth);
  // Traffic keeps right, so the lane coming to a chain's end is on its right, and the lane coming to its start on its left.
  const inLane = select(mark.greaterThan(0), metres.negate(), metres);
  const blurAlong = fwidth(toMark).max(0.002);
  const blurAcross = fwidth(metres).max(0.002);
  const band = (from: number, to: number) => smoothstep(float(from).sub(blurAlong), float(from).add(blurAlong), toMark).mul(float(1).sub(smoothstep(float(to).sub(blurAlong), float(to).add(blurAlong), toMark)));

  const ownLane = select(halfWidth.greaterThan(OWN_LANE_FROM_M), smoothstep(float(0.05).sub(blurAcross), float(0.05).add(blurAcross), inLane), float(1));
  const withinEdges = float(1).sub(smoothstep(blurAcross.negate(), blurAcross, abs(metres).sub(halfWidth).add(EDGE_LEFT_M)));

  const stopLine = band(LINE_FROM_M, LINE_FROM_M + STOP_LINE_M).mul(ownLane).mul(withinEdges);

  // Shark's teeth, their points towards the driver, their bases at the junction's side.
  const toothPlace = abs(fract(metres.div(TOOTH_EVERY_M)).sub(0.5)).mul(TOOTH_EVERY_M);
  const toothUp = toMark.sub(LINE_FROM_M).div(TEETH_ROW_M);
  const halfBase = float(TOOTH_WIDE_M / 2).mul(float(1).sub(toothUp));
  const tooth = float(1).sub(smoothstep(halfBase.sub(blurAcross), halfBase.add(blurAcross), toothPlace)).mul(band(LINE_FROM_M, LINE_FROM_M + TEETH_ROW_M));
  const teeth = tooth.mul(ownLane).mul(withinEdges);

  const stripePlace = abs(fract(metres.div(ZEBRA_STRIPE_M * 2)).sub(0.5));
  const stripe = float(1).sub(smoothstep(float(0.25).sub(blurAcross), float(0.25).add(blurAcross), stripePlace));
  const zebra = stripe.mul(band(ZEBRA_FROM_M, ZEBRA_FROM_M + ZEBRA_LENGTH_M)).mul(withinEdges).mul(select(hasZebra, float(1), float(0)));

  const lineChoice = select(abs(line.sub(GIVE_WAY)).lessThan(0.5), teeth, select(abs(line.sub(STOP)).lessThan(0.5), stopLine, float(0)));
  // Past a pixel the marks are too fine to draw, so they fade, like the road's own lines.
  const fades = float(1).sub(smoothstep(float(0.05), float(0.18), max(blurAlong, blurAcross)));
  return max(lineChoice, zebra).mul(fades);
}

import { abs, float, fwidth, max, min, mod, select } from "three/tsl";
import { band, pulses } from "./coverage";
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

/**
 * How much paint is on this spot of road, 0 to 1: each mark's share of the
 * pixel (`coverage.ts`), so a mark is crisp near and settles on its own share of
 * the road far off, with no distance where it fades in.
 */
export function junctionMarks({ across, halfWidth, toMark, mark }: MarkInput): Node<"float"> {
  const kind = abs(mark);
  const line = mod(kind, float(ZEBRA));
  const hasZebra = kind.greaterThan(ZEBRA - 0.5);
  const metres = across.mul(halfWidth);
  // Traffic keeps right, so the lane coming to a chain's end is on its right, and the lane coming to its start on its left.
  const inLane = select(mark.greaterThan(0), metres.negate(), metres);
  const pixelAlong = fwidth(toMark);
  const pixelAcross = fwidth(metres);
  const alongRow = (from: number, to: number) => band(toMark, from, to, pixelAlong);

  const ownLane = select(halfWidth.greaterThan(OWN_LANE_FROM_M), band(inLane, 0.05, 1000, pixelAcross), float(1));
  const withinEdges = band(abs(metres), -1, halfWidth.sub(EDGE_LEFT_M), pixelAcross);

  const stopLine = alongRow(LINE_FROM_M, LINE_FROM_M + STOP_LINE_M).mul(ownLane).mul(withinEdges);

  // Shark's teeth, their points towards the driver, their bases at the junction's side. A tooth narrows evenly, so its
  // width at the middle of the part of the row a pixel spans is its mean width over that part.
  const rowEnd = LINE_FROM_M + TEETH_ROW_M;
  const spanned = max(toMark.sub(pixelAlong.mul(0.5)), LINE_FROM_M).add(min(toMark.add(pixelAlong.mul(0.5)), rowEnd)).mul(0.5);
  const halfBase = float(TOOTH_WIDE_M / 2).mul(float(1).sub(spanned.sub(LINE_FROM_M).div(TEETH_ROW_M).clamp(0, 1)));
  const tooth = pulses(metres.sub(TOOTH_EVERY_M / 2), TOOTH_EVERY_M, halfBase, pixelAcross).mul(alongRow(LINE_FROM_M, rowEnd));
  const teeth = tooth.mul(ownLane).mul(withinEdges);

  const stripes = pulses(metres.sub(ZEBRA_STRIPE_M), ZEBRA_STRIPE_M * 2, ZEBRA_STRIPE_M / 2, pixelAcross);
  const zebra = stripes.mul(alongRow(ZEBRA_FROM_M, ZEBRA_FROM_M + ZEBRA_LENGTH_M)).mul(withinEdges).mul(select(hasZebra, float(1), float(0)));

  const lineChoice = select(abs(line.sub(GIVE_WAY)).lessThan(0.5), teeth, select(abs(line.sub(STOP)).lessThan(0.5), stopLine, float(0)));
  return max(lineChoice, zebra);
}

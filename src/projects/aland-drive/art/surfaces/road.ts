import { abs, float, floor, fract, fwidth, max, min, mix, select, sin, smoothstep, texture, vec2 } from "three/tsl";
import type { Node, Texture } from "three/webgpu";
import { COARSE_M, FINE_M } from "./ground";

/*
 * Road surfaces. Asphalt is its token, freckled with aggregate, worn along the
 * wheel tracks, patched and cracked; gravel is packed in two tracks with loose
 * stone beside them. In town a kerb and paving take the place of the shoulder.
 * All of it is laid out in metres from the road's own attributes
 * (`road-attributes.ts`), so it fits whatever width the road is.
 */

const FADE = [40, 170] as const;
const PATCH_EVERY_M = 19;
const LANE_FROM_M = 2.6;
const WHEEL_FROM_LANE_M = 0.8;
const KERB_M = 0.16;
const GUTTER_M = 0.05;
const KERB_LENGTH_M = 1;
const PAVER_M = 0.7;
const CRACK_ZONES_M = 61;

export interface RoadInput {
  place: Node<"vec2">;
  toCamera: Node<"float">;
  /** 0 on the centre, 1 at the carriageway's edge, 2 where the shoulder meets the land. */
  across: Node<"float">;
  /** The same, positive on the chain's left. */
  signedAcross: Node<"float">;
  along: Node<"float">;
  /** 1 for a sealed road, 0 for gravel. */
  paved: Node<"float">;
  /** 1 in town, where a sealed road has a kerb. */
  town: Node<"float">;
  /** From the centre to the carriageway's edge, and the shoulder's own width, metres. */
  halfWidth: Node<"float">;
  shoulderM: Node<"float">;
  /** The land's colour under the road. */
  ground: Node<"vec3">;
  colour: (name: string) => Node<"vec3">;
  detail: Texture;
}

export interface RoadDress {
  /** What the carriageway is, paint aside. */
  carriageway: Node<"vec3">;
  /** Where the shoulder takes over, 0 to 1, a broken edge rather than a ruled one. */
  shoulderShare: Node<"float">;
  shoulder: Node<"vec3">;
  /** How much of a coat of paint is left, 0 to 1. */
  paintLeft: Node<"float">;
}

const hash = (value: Node<"float">) => fract(sin(value.mul(12.9898)).mul(43758.5453));

export function dressRoad({ place, toCamera, across, signedAcross, along, paved, town, halfWidth, shoulderM, ground, colour, detail }: RoadInput): RoadDress {
  const shown = float(1).sub(smoothstep(float(FADE[0]), float(FADE[1]), toCamera));
  const coarse = texture(detail, place.div(COARSE_M));
  const fine = texture(detail, place.div(FINE_M).add(vec2(0.23, 0.41)));
  const metres = across.mul(halfWidth);

  // Asphalt.
  const laneMiddle = mix(float(0), halfWidth.mul(0.5), smoothstep(float(LANE_FROM_M - 0.1), float(LANE_FROM_M + 0.1), halfWidth));
  const fromWheel = abs(abs(metres.sub(laneMiddle)).sub(WHEEL_FROM_LANE_M));
  const wheelTrack = float(1).sub(smoothstep(float(0.2), float(0.65), fromWheel));
  const aggregate = fine.g.sub(0.5).mul(0.55).add(coarse.g.sub(0.5).mul(0.25));
  const blotch = coarse.a.sub(0.5).mul(0.18);
  const patchCell = floor(along.div(PATCH_EVERY_M));
  const patchRoll = hash(patchCell.add(0.5));
  const patchStart = patchRoll.mul(0.5).mul(PATCH_EVERY_M);
  const inCell = along.sub(patchCell.mul(PATCH_EVERY_M));
  const patchLength = hash(patchCell.add(3.1)).mul(6).add(2.5);
  const patchSoft = fwidth(metres).max(0.01);
  const patchLane = laneMiddle.mul(select(hash(patchCell.add(9.7)).greaterThan(0.5), float(1), float(-1)));
  const patchSide = float(1).sub(smoothstep(float(1.25).sub(patchSoft), float(1.25).add(patchSoft), abs(signedAcross.mul(halfWidth).sub(patchLane))));
  const patchEnds = smoothstep(float(0), float(0.06), inCell.sub(patchStart)).mul(float(1).sub(smoothstep(float(0), float(0.06), inCell.sub(patchStart).sub(patchLength))));
  const patched = patchEnds.mul(patchSide).mul(smoothstep(float(0.8), float(0.82), patchRoll)).mul(0.6);
  const crackLine = float(1).sub(smoothstep(float(0.05), float(0.12), coarse.b)).mul(smoothstep(float(0.46), float(0.56), texture(detail, place.div(CRACK_ZONES_M)).a));
  const asphaltBase = mix(colour("surface-asphalt"), colour("surface-asphalt-patch"), patched);
  const asphalt = asphaltBase.mul(float(1).add(aggregate.add(blotch).mul(shown))).mul(float(1).sub(wheelTrack.mul(0.1))).mul(float(1).sub(crackLine.mul(0.4).mul(shown)));

  // Gravel.
  const trackShare = wheelTrack.mul(smoothstep(float(-0.15), float(0.1), coarse.a.sub(0.45)));
  const packed = mix(colour("surface-gravel"), colour("surface-gravel-worn"), trackShare);
  const looseStone = fine.g.sub(0.5).mul(mix(float(1.3), float(0.6), trackShare)).add(coarse.g.sub(0.5).mul(0.7));
  const gravel = mix(packed, ground, smoothstep(float(0.75), float(1.05), across.add(coarse.g.sub(0.5).mul(0.3))).mul(0.55)).mul(float(1).add(looseStone.mul(shown)));

  const carriageway = mix(gravel, asphalt, paved);

  // The edge of the seal is broken a little by the stone beside it.
  const edgeNoise = coarse.a.sub(0.5).mul(0.14).add(fine.g.sub(0.5).mul(0.05)).div(halfWidth);
  const shoulderShare = smoothstep(float(0.99), float(1.05), across.add(edgeNoise.mul(paved)));

  const beyond = across.sub(1).max(0).mul(shoulderM);
  const stone = float(1).add(fine.g.sub(0.5).mul(1.1).add(coarse.g.sub(0.5).mul(0.6)).mul(shown));
  const looseShoulder = mix(colour("road-shoulder").mul(stone), ground, smoothstep(float(0.05), float(0.7), across.sub(1).add(coarse.r.sub(0.5).mul(0.5))));

  // In town: a gutter's shadow, a kerbstone with its joints, then paving.
  const kerbed = town.mul(paved).mul(smoothstep(float(2), float(2.6), halfWidth));
  const blur = fwidth(beyond).max(0.001);
  const onKerb = smoothstep(float(GUTTER_M).sub(blur), float(GUTTER_M).add(blur), beyond).mul(float(1).sub(smoothstep(float(KERB_M + GUTTER_M).sub(blur), float(KERB_M + GUTTER_M).add(blur), beyond)));
  const lengthwise = float(0.5).sub(abs(fract(along.div(KERB_LENGTH_M)).sub(0.5))).mul(KERB_LENGTH_M);
  const kerbJoint = float(1).sub(smoothstep(float(0.006), float(0.012).add(fwidth(along)), lengthwise));
  const kerb = colour("surface-kerb").mul(float(1).add(fine.b.sub(0.5).mul(0.25))).mul(float(1).sub(kerbJoint.mul(0.45)));
  const paverAcross = abs(fract(beyond.div(PAVER_M)).sub(0.5));
  const paverAlong = abs(fract(along.div(PAVER_M).add(floor(beyond.div(PAVER_M)).mul(0.5))).sub(0.5));
  const paverBlur = max(fwidth(beyond), fwidth(along)).div(PAVER_M).mul(1.5);
  const paverJoints = smoothstep(float(0.47).sub(paverBlur), float(0.495), max(paverAcross, paverAlong)).mul(float(1).sub(smoothstep(float(0.05), float(0.25), paverBlur)));
  const paving = colour("surface-paving").mul(float(1).add(coarse.a.sub(0.5).mul(0.3)).add(fine.g.sub(0.5).mul(0.2))).mul(float(1).sub(paverJoints.mul(0.3)));
  const gutter = float(1).sub(smoothstep(float(0), float(GUTTER_M), beyond));
  const urbanSide = mix(mix(paving, kerb, onKerb), colour("surface-asphalt-patch").mul(0.5), gutter.mul(0.8));
  const shoulder = mix(looseShoulder, urbanSide, kerbed);

  const paintLeft = min(float(1), smoothstep(float(0.28), float(0.5), fine.g.mul(0.5).add(coarse.a.mul(0.5))).mul(0.45).add(0.6));

  return { carriageway, shoulderShare, shoulder, paintLeft };
}

import type { V3 } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";
import { TownPainted, townModel, type TownPart } from "./paint";

/*
 * A parked town bicycle, the upright Scandinavian kind with a rack and mudguards, on its stand. Its origin is on the
 * ground under the bottom bracket, front wheel along +x. Wheels are flat rings: a tyre is too thin to need a third
 * dimension until a car's bumper is on it.
 */

export type BikeFrame = Extract<TownPart, "bike-red" | "bike-blue" | "bike-black">;

const WHEEL_R = 0.34;
const WHEEL_SIDES = 9;
const FAR_WHEEL_SIDES = 6;
const AXLE_REAR = -0.54;
const AXLE_FRONT = 0.56;
const SEAT: V3 = [-0.2, 0.92, 0];
const BRACKET: V3 = [0, 0.32, 0];
const HEAD_TOP: V3 = [0.4, 0.98, 0];
const HEAD_LOW: V3 = [0.44, 0.76, 0];
/** Leaning on its stand, this much of a metre sideways per metre up. */
const LEAN = 0.09;

const leaning = ([x, y, z]: V3): V3 => [x, y, z + y * LEAN];

function wheel(into: TownPainted, axle: number, rimWide: number, sides = WHEEL_SIDES, z = 0): TownPainted {
  const ring = (radius: number) => Array.from({ length: sides }, (_, side) => {
    const angle = (side / sides) * 2 * Math.PI;
    return leaning([axle + Math.cos(angle) * radius, WHEEL_R + Math.sin(angle) * radius, z]);
  });
  const [outer, inner] = [ring(WHEEL_R), ring(WHEEL_R - rimWide)];
  outer.forEach((corner, side) => {
    const next = (side + 1) % sides;
    into.face([corner, outer[next], inner[next], inner[side]], "bike-tyre");
  });
  return into;
}

const bar = (into: TownPainted, from: V3, to: V3, radius: number, part: TownPart) => into.tube(leaning(from), leaning(to), radius, 3, {}, part);

/** One bicycle. Frame colours are separate models, and three of them are enough for a rack. */
export function buildBicycle(frame: BikeFrame = "bike-black"): RoadsideModel {
  const rear: V3 = [AXLE_REAR, WHEEL_R, 0];
  const front: V3 = [AXLE_FRONT, WHEEL_R, 0];
  const near = new TownPainted();
  wheel(near, AXLE_REAR, 0.05);
  wheel(near, AXLE_FRONT, 0.05);
  bar(near, BRACKET, SEAT, 0.018, frame);
  bar(near, BRACKET, HEAD_LOW, 0.02, frame);
  bar(near, SEAT, HEAD_TOP, 0.016, frame);
  bar(near, BRACKET, rear, 0.012, frame);
  bar(near, [SEAT[0] + 0.015, SEAT[1] - 0.05, 0], rear, 0.012, frame);
  bar(near, HEAD_TOP, front, 0.015, "bike-steel");
  bar(near, HEAD_TOP, [0.38, 1.1, 0], 0.012, "bike-steel");
  bar(near, [0.36, 1.1, -0.27], [0.36, 1.1, 0.27], 0.011, "bike-steel");
  bar(near, SEAT, [-0.19, 1, 0], 0.012, "bike-steel");
  near
    .face([leaning([-0.3, 1, -0.035]), leaning([-0.3, 1, 0.035]), leaning([-0.06, 0.985, 0.08]), leaning([-0.06, 0.985, -0.08])], "bike-saddle")
    // The rear rack and a front mudguard.
    .face([leaning([-0.82, 0.72, -0.07]), leaning([-0.82, 0.72, 0.07]), leaning([-0.28, 0.74, 0.07]), leaning([-0.28, 0.74, -0.07])], "bike-steel", 0.85)
    .face([leaning([0.3, 0.6, -0.02]), leaning([0.3, 0.6, 0.02]), leaning([0.56, 0.74, 0.02]), leaning([0.56, 0.74, -0.02])], frame, 1.05)
    // The stand: the one thing not leaning.
    .beam(leaning(BRACKET), [BRACKET[0] - 0.06, 0.01, 0.13], 0.015, 0.015, "bike-steel");
  const far = new TownPainted();
  wheel(far, AXLE_REAR, 0.06, FAR_WHEEL_SIDES, -0.01);
  wheel(far, AXLE_FRONT, 0.06, FAR_WHEEL_SIDES, 0.01);
  const card = (from: V3, to: V3, half: number, part: TownPart, z = 0) => {
    const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
    const length = Math.hypot(dx, dy);
    const [ox, oy] = [(-dy / length) * half, (dx / length) * half];
    far.face([leaning([from[0] + ox, from[1] + oy, z]), leaning([to[0] + ox, to[1] + oy, z]), leaning([to[0] - ox, to[1] - oy, z]), leaning([from[0] - ox, from[1] - oy, z])], part);
  };
  const edgeOn = (from: V3, to: V3, half: number, part: TownPart) => far.face([leaning([from[0], from[1], -half]), leaning([to[0], to[1], -half]), leaning([to[0], to[1], half]), leaning([from[0], from[1], half])], part);
  card(BRACKET, SEAT, 0.02, frame, 0.012);
  card(BRACKET, HEAD_LOW, 0.022, frame, -0.012);
  card(SEAT, HEAD_TOP, 0.018, frame, 0.024);
  card(BRACKET, rear, 0.014, frame, -0.024);
  card(SEAT, rear, 0.014, frame, 0.036);
  card(HEAD_TOP, front, 0.016, "bike-steel", 0.036);
  edgeOn(BRACKET, SEAT, 0.02, frame);
  edgeOn(HEAD_TOP, front, 0.016, "bike-steel");
  far
    .face([leaning([0.36, 1.08, -0.27]), leaning([0.36, 1.08, 0.27]), leaning([0.36, 1.12, 0.27]), leaning([0.36, 1.12, -0.27])], "bike-steel")
    .face([leaning([-0.3, 1, -0.05]), leaning([-0.3, 1, 0.05]), leaning([-0.06, 0.985, 0.08]), leaning([-0.06, 0.985, -0.08])], "bike-saddle")
    .face([leaning([-0.82, 0.72, -0.07]), leaning([-0.82, 0.72, 0.07]), leaning([-0.28, 0.74, 0.07]), leaning([-0.28, 0.74, -0.07])], "bike-steel", 0.85)
    .face([leaning([BRACKET[0] - 0.015, BRACKET[1], -0.04]), leaning([BRACKET[0] + 0.015, BRACKET[1], -0.04]), [BRACKET[0] - 0.045, 0.01, 0.13], [BRACKET[0] - 0.075, 0.01, 0.13]], "bike-steel");
  return townModel(near, far, 28, 150);
}

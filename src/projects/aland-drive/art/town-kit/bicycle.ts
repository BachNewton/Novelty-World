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
const AXLE_REAR = -0.54;
const AXLE_FRONT = 0.56;
const SEAT: V3 = [-0.2, 0.92, 0];
const BRACKET: V3 = [0, 0.32, 0];
const HEAD_TOP: V3 = [0.4, 0.98, 0];
const HEAD_LOW: V3 = [0.44, 0.76, 0];
/** Leaning on its stand, this much of a metre sideways per metre up. */
const LEAN = 0.09;

const leaning = ([x, y, z]: V3): V3 => [x, y, z + y * LEAN];

function wheel(into: TownPainted, axle: number, rimWide: number): TownPainted {
  const ring = (radius: number) => Array.from({ length: WHEEL_SIDES }, (_, side) => {
    const angle = (side / WHEEL_SIDES) * 2 * Math.PI;
    return leaning([axle + Math.cos(angle) * radius, WHEEL_R + Math.sin(angle) * radius, 0]);
  });
  const [outer, inner] = [ring(WHEEL_R), ring(WHEEL_R - rimWide)];
  outer.forEach((corner, side) => {
    const next = (side + 1) % WHEEL_SIDES;
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
  for (const axle of [AXLE_REAR, AXLE_FRONT]) far.face([leaning([axle - WHEEL_R, WHEEL_R, 0]), leaning([axle, WHEEL_R * 2, 0]), leaning([axle + WHEEL_R, WHEEL_R, 0]), leaning([axle, 0, 0])], "bike-tyre");
  far.face([leaning(BRACKET), leaning(SEAT), leaning(HEAD_TOP), leaning(HEAD_LOW)], frame);
  return townModel(near, far, 28, 150);
}

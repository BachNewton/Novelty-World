import type { Point } from "../cars/mesh";
import { add, scale, unit } from "./mat";

/*
 * The bicycles, as numbers a bike shop would quote, and the points they give.
 * Nose to -z like the cars, up +y, the chain on the right (+x), the road at y = 0
 * and z = 0 halfway between the axles.
 */

export interface BikeSpec {
  name: string;
  /** Tokens without the `--color-aland-drive-` prefix. */
  paint: string;
  accent: string;
  wheelRadiusM: number;
  tyreM: number;
  spokes: number;
  wheelbaseM: number;
  /** The bottom bracket, below the axles and ahead of the rear one. */
  bbDropM: number;
  chainstayM: number;
  seatAngleDeg: number;
  seatTubeM: number;
  /** From the bottom bracket to the saddle's top. */
  saddleM: number;
  headAngleDeg: number;
  forkRakeM: number;
  forkM: number;
  headTubeM: number;
  /** Above the head tube, then forward and up to the bar. */
  spacerM: number;
  stemM: number;
  stemRiseM: number;
  frame: "step" | "diamond";
  bar: "upright" | "flat" | "drop";
  barHalfM: number;
  /** The rider's back from vertical. */
  torsoLeanDeg: number;
  /** Metres rolled per turn of the cranks. */
  gearM: number;
  mudguards: boolean;
  rack: boolean;
  basket: boolean;
  panniers: boolean;
  chainguard: boolean;
  bottle: boolean;
  lamp: boolean;
}

const NONE = { mudguards: false, rack: false, basket: false, panniers: false, chainguard: false, bottle: false, lamp: false };

/** Ejder is an invented make. */
export const BIKES: readonly BikeSpec[] = [
  {
    ...NONE,
    name: "Ejder Stad",
    paint: "bike-paint-sage",
    accent: "bike-paint-cream",
    wheelRadiusM: 0.345,
    tyreM: 0.042,
    spokes: 12,
    wheelbaseM: 1.08,
    bbDropM: 0.06,
    chainstayM: 0.47,
    seatAngleDeg: 70,
    seatTubeM: 0.46,
    saddleM: 0.71,
    headAngleDeg: 68,
    forkRakeM: 0.05,
    forkM: 0.37,
    headTubeM: 0.2,
    spacerM: 0.1,
    stemM: 0.05,
    stemRiseM: 0.08,
    frame: "step",
    bar: "upright",
    barHalfM: 0.27,
    torsoLeanDeg: 15,
    gearM: 4.6,
    mudguards: true,
    rack: true,
    basket: true,
    chainguard: true,
    lamp: true,
  },
  {
    ...NONE,
    name: "Ejder Tur",
    paint: "bike-paint-sea",
    accent: "bike-paint-yellow",
    wheelRadiusM: 0.35,
    tyreM: 0.038,
    spokes: 12,
    wheelbaseM: 1.08,
    bbDropM: 0.07,
    chainstayM: 0.47,
    seatAngleDeg: 73,
    seatTubeM: 0.54,
    saddleM: 0.72,
    headAngleDeg: 71,
    forkRakeM: 0.05,
    forkM: 0.38,
    headTubeM: 0.17,
    spacerM: 0.05,
    stemM: 0.07,
    stemRiseM: 0.04,
    frame: "diamond",
    bar: "flat",
    barHalfM: 0.3,
    torsoLeanDeg: 32,
    gearM: 5.2,
    mudguards: true,
    rack: true,
    panniers: true,
    lamp: true,
    bottle: true,
  },
  {
    ...NONE,
    name: "Ejder Grus",
    paint: "bike-paint-moss",
    accent: "bike-paint-yellow",
    wheelRadiusM: 0.355,
    tyreM: 0.048,
    spokes: 12,
    wheelbaseM: 1.03,
    bbDropM: 0.07,
    chainstayM: 0.43,
    seatAngleDeg: 73,
    seatTubeM: 0.5,
    saddleM: 0.72,
    headAngleDeg: 71,
    forkRakeM: 0.05,
    forkM: 0.4,
    headTubeM: 0.16,
    spacerM: 0.03,
    stemM: 0.08,
    stemRiseM: 0.02,
    frame: "diamond",
    bar: "drop",
    barHalfM: 0.23,
    torsoLeanDeg: 42,
    gearM: 5.6,
    bottle: true,
  },
  {
    ...NONE,
    name: "Ejder Sund",
    paint: "bike-paint-falu",
    accent: "bike-paint-ink",
    wheelRadiusM: 0.34,
    tyreM: 0.026,
    spokes: 12,
    wheelbaseM: 0.99,
    bbDropM: 0.07,
    chainstayM: 0.41,
    seatAngleDeg: 73.5,
    seatTubeM: 0.5,
    saddleM: 0.72,
    headAngleDeg: 73,
    forkRakeM: 0.045,
    forkM: 0.37,
    headTubeM: 0.14,
    spacerM: 0.02,
    stemM: 0.09,
    stemRiseM: 0,
    frame: "diamond",
    bar: "drop",
    barHalfM: 0.2,
    torsoLeanDeg: 48,
    gearM: 6.6,
    bottle: true,
  },
];

export interface BikeLayout {
  rearAxle: Point;
  frontAxle: Point;
  bb: Point;
  seatDir: Point;
  seatTop: Point;
  saddle: Point;
  /** The steering axis: where it leaves the head tube's foot, and which way is up it. */
  headBottom: Point;
  headTop: Point;
  steerAxis: Point;
  stemTop: Point;
  barCentre: Point;
  /** The right grip, where the hand closes. The left mirrors it. */
  grip: Point;
  /** The middle of the rider's pelvis, seated. */
  hip: Point;
}

const HIP_ABOVE_SADDLE_M = 0.08;
const HIP_AHEAD_OF_SADDLE_M = 0.02;

const rad = (degrees: number) => (degrees * Math.PI) / 180;

function gripOffset({ bar, barHalfM }: BikeSpec): Point {
  if (bar === "upright") return [barHalfM, 0.06, 0.14];
  if (bar === "flat") return [barHalfM, 0.015, 0.03];
  return [barHalfM, 0.03, -0.1];
}

export function layoutOf(spec: BikeSpec): BikeLayout {
  const half = spec.wheelbaseM / 2;
  const radius = spec.wheelRadiusM;
  const rearAxle: Point = [0, radius, half];
  const frontAxle: Point = [0, radius, -half];
  const bb: Point = [0, radius - spec.bbDropM, half - Math.sqrt(spec.chainstayM ** 2 - spec.bbDropM ** 2)];
  const seatDir: Point = [0, Math.sin(rad(spec.seatAngleDeg)), Math.cos(rad(spec.seatAngleDeg))];
  const seatTop = add(bb, scale(seatDir, spec.seatTubeM));
  const saddle = add(bb, scale(seatDir, spec.saddleM));
  const steerAxis = unit([0, Math.sin(rad(spec.headAngleDeg)), Math.cos(rad(spec.headAngleDeg))]);
  const atAxle: Point = [0, radius, -half + spec.forkRakeM / Math.sin(rad(spec.headAngleDeg))];
  const headBottom = add(atAxle, scale(steerAxis, spec.forkM));
  const headTop = add(headBottom, scale(steerAxis, spec.headTubeM));
  const stemTop = add(headTop, scale(steerAxis, spec.spacerM));
  const barCentre = add(stemTop, [0, spec.stemRiseM, -spec.stemM]);
  const grip = add(barCentre, gripOffset(spec));
  const hip = add(saddle, [0, HIP_ABOVE_SADDLE_M, -HIP_AHEAD_OF_SADDLE_M]);
  return { rearAxle, frontAxle, bb, seatDir, seatTop, saddle, headBottom, headTop, steerAxis, stemTop, barCentre, grip, hip };
}

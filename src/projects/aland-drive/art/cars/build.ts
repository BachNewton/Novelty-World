import { SUSPENSION, CAR } from "../../sim/tuning";
import { buildBody, ROWS, type BodySpec, type BodyDetail } from "./body";
import type { Soup } from "./mesh";
import { buildWheel, type WheelSpec } from "./wheel";

/*
 * A car's parts at a detail: pure numbers, so triangle counts and shapes can be
 * tested without a renderer. `model.ts` turns them into something to draw.
 */

export type CarDetail = "near" | "far";

export interface CarSpec {
  name: string;
  /** A paint token, without the `--color-aland-drive-` prefix. */
  paint: string;
  body: BodySpec;
  wheel: WheelSpec;
  /** Half the length and width of the shadow on the road. */
  shadowHalf: readonly [wide: number, long: number];
}

export interface CarParts {
  body: Soup;
  wheel: Soup;
}

const { sill, sillTop, mid, shoulder, belt, windowBase, windowTop, rail, roofOuter, roofInner, centre } = ROWS;

const NEAR: BodyDetail = {
  maxStepM: 0.26,
  archSteps: 12,
  rows: [sill, sillTop, ROWS.lower, mid, shoulder, belt, windowBase, windowTop, rail, roofOuter, roofInner, centre],
  seams: true,
  fine: true,
  creaseDeg: 34,
};

const FAR: BodyDetail = {
  maxStepM: 1.2,
  archSteps: 5,
  rows: [sill, sillTop, belt, windowBase, windowTop, rail, roofInner, centre],
  seams: false,
  fine: false,
  creaseDeg: 40,
};

/** The sag of the springs under the car's weight: the same sum the simulation starts from. */
export const SAG_M = (CAR.massKg * 9.81) / 4 / SUSPENSION.springNPerM;
/** Where a wheel's centre sits in the car at rest. */
export const AXLE_Y = -SUSPENSION.droopM + SAG_M;

/** The road under a car at rest, in the car's own frame: heights in a spec are measured from here. */
export const groundY = (radiusM: number) => AXLE_Y - radiusM;

export function buildCarParts(spec: CarSpec, detail: CarDetail): CarParts {
  const near = detail === "near";
  return {
    body: buildBody(spec.body, groundY(spec.wheel.radiusM), near ? NEAR : FAR),
    wheel: buildWheel(spec.wheel, { sides: near ? 20 : 9, spokes: near }),
  };
}

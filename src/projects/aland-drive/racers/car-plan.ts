import { steerLimit } from "../sim/car";
import { limitsOn } from "../sim/car-limits";
import { CARS, type CarId } from "../sim/cars";
import type { RoadLine } from "../sim/road-net";
import { GROUND_GRIP, type Condition, type Tyre } from "../sim/surfaces";
import { wheelBaseOf } from "../sim/tuning";
import type { RaceLine } from "./race-line-file";
import { crestOf, signedCurvatureOf } from "./racing-line";
import { ROUTE_STEP_M } from "./route-plan";
import type { DriverSkill } from "./skill";
import { planSpeeds, type PacePlan } from "./speed-plan";

/*
 * A car's speed plan on a race's line (`speed-plan.ts`): the line's own shape,
 * read once for every car planned on it, and the car's measured limits and its
 * footing on the ground under each stretch, sealed or gravel as laid, in the
 * condition, on its tyres. Every racer's plan is made here, and so is the
 * plan a player's driving line is drawn from, so they are one plan.
 */

/** The tightest turn a plan asks of the steering is this much wider than the lock's own, for the tyres' slip. */
const STEERING_ROOM = 1.3;

/** A line's shape at the plan's step: which way and how sharply it bends, and where it crests. */
export interface LineShape {
  bends: Float64Array;
  crest: Float64Array;
}

export const shapeOf = (line: RoadLine): LineShape => ({ bends: signedCurvatureOf(line, ROUTE_STEP_M), crest: crestOf(line, ROUTE_STEP_M) });

/** A car's plan on a line of this shape from a standing start at `fromM`, in a condition on a set of tyres, at a skill. */
export function carPlan(car: CarId, condition: Condition, tyres: Tyre, { pavedAt }: Pick<RaceLine, "pavedAt">, { bends, crest }: LineShape, skill: DriverSkill, fromM: number): PacePlan {
  const tuning = CARS[car];
  const grounds = (["asphalt", "gravel"] as const).map((surface) => ({ limits: limitsOn(car, condition, surface, tyres), footing: GROUND_GRIP[tuning.class][tyres][condition][surface] }));
  const groundAt = (sample: number) => grounds[pavedAt(sample * ROUTE_STEP_M) ? 0 : 1];
  return planSpeeds({
    bends,
    crest,
    stepM: ROUTE_STEP_M,
    limitsAt: (sample) => groundAt(sample).limits,
    footingAt: (sample) => groundAt(sample).footing,
    cornerShare: skill.cornerShare,
    brakeShare: skill.brakeShare,
    tightestRadiusAt: (speed, footing) => (STEERING_ROOM * wheelBaseOf(tuning)) / Math.tan(steerLimit(tuning, speed, false, footing)),
    fromM,
  });
}

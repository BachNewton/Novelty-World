import { CARS, DEFAULT_CAR, type CarId } from "../../sim/cars";
import { sagOf, type CarTuning } from "../../sim/tuning";
import { buildBody, ROWS, type BodySpec, type BodyDetail } from "./body";
import { pick, type Soup, type Surface } from "./mesh";
import { buildWheel, type WheelSpec } from "./wheel";

/*
 * A car's parts at a detail: pure numbers, so triangle counts and shapes can be
 * tested without a renderer. `model.ts` turns them into something to draw.
 */

export type CarDetail = "hero" | "far";

/** How a body hangs on its wheels: where a wheel hangs with no weight on it, how far the springs settle, and the centre of mass, all from the body's origin. */
export interface Ride {
  droopM: number;
  sagM: number;
  massUpM: number;
}

export const rideOf = (tuning: CarTuning): Ride => ({ droopM: tuning.suspension.droopM, sagM: sagOf(tuning), massUpM: tuning.car.massUpM });

/** A world car hangs as the game's own car does. */
export const WORLD_RIDE = rideOf(CARS[DEFAULT_CAR]);

export interface CarSpec {
  /** A car a player can drive: its wheels and ride are its simulation's. */
  id?: CarId;
  name: string;
  /** A paint token, without the `--color-aland-drive-` prefix. */
  paint: string;
  body: BodySpec;
  wheel: WheelSpec;
  /** Its paint is its livery, so a seeded world car keeps it and stays plain. */
  livery?: boolean;
  /** Half the length and width of the shadow on the road. */
  shadowHalf: readonly [wide: number, long: number];
  ride: Ride;
}

export interface CarParts {
  body: Soup;
  /** A hero's see-through glass, drawn apart. A world car's is in its body. */
  glass: Soup | null;
  wheel: Soup;
}

const { sill, sillTop, mid, shoulder, belt, windowBase, windowTop, rail, roofOuter, roofInner, centre } = ROWS;

const HERO: BodyDetail = {
  maxStepM: 0.075,
  archSteps: 20,
  rows: [sill, 0.5, sillTop, 1.04, 1.5, ROWS.lower, 2.5, mid, 3.5, shoulder, 4.5, belt, windowBase, windowTop, 7.93, rail, 8.5, roofOuter, 9.5, roofInner, 10.5, centre],
  seams: true,
  fine: true,
  creaseDeg: 42,
  cabin: true,
};

const FAR: BodyDetail = {
  maxStepM: 1.2,
  archSteps: 5,
  rows: [sill, sillTop, belt, windowBase, windowTop, rail, roofInner, centre],
  seams: false,
  fine: false,
  creaseDeg: 40,
  cabin: false,
};

/** Where a wheel's centre sits in the car at rest. */
export const axleY = ({ ride }: Pick<CarSpec, "ride">) => -ride.droopM + ride.sagM;

/** The road under a car at rest, in the car's own frame: heights in a spec are measured from here. */
export const groundY = (spec: Pick<CarSpec, "ride" | "wheel">) => axleY(spec) - spec.wheel.radiusM;

/** The parts a world car can have or not, which `fleet.ts` turns on per instance. */
const isOption = (surface: Surface) => surface === "rack" || surface === "plateBand";

export function buildCarParts(spec: CarSpec, detail: CarDetail, options = false): CarParts {
  const hero = detail === "hero";
  const shell = buildBody(spec.body, groundY(spec), hero ? HERO : FAR);
  return {
    body: pick(shell, (surface) => (options || !isOption(surface)) && !(hero && surface === "glass")),
    glass: hero ? pick(shell, (surface) => surface === "glass") : null,
    wheel: buildWheel(spec.wheel, { sides: hero ? 30 : 9, spokes: hero, fine: hero }),
  };
}

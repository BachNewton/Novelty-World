import type { CarTuning } from "./tuning";
import type { CarId } from "./cars";
import { GROUND_GRIP, TYRES, type Condition, type Surface, type Tyre } from "./surfaces";
import aska from "./limits/aska.json";
import ankar from "./limits/ankar.json";
import berg from "./limits/berg.json";
import bris from "./limits/bris.json";
import dyning from "./limits/dyning.json";
import fjard from "./limits/fjard.json";
import grus from "./limits/grus.json";
import gnista from "./limits/gnista.json";
import holm from "./limits/holm.json";
import kobb from "./limits/kobb.json";
import orkan from "./limits/orkan.json";
import ljus from "./limits/ljus.json";
import salta from "./limits/salta.json";
import skerryGt from "./limits/skerry-gt.json";
import span from "./limits/span.json";
import sten from "./limits/sten.json";
import strimma from "./limits/strimma.json";
import strom from "./limits/strom.json";
import sund from "./limits/sund.json";
import varg from "./limits/varg.json";
import vik from "./limits/vik.json";

/*
 * What each car can do at the limit, measured in the simulation
 * (`measure-limits.ts`, run by `tools/car-limits.ts`): its grip in steady
 * corners, its braking and its pull, by speed. The racers plan their speeds
 * from it, so each drives its own car as that car can be driven. A car has a
 * row for every ground, each surface in each condition on each set of tyres
 * that matters there, measured on a pad of that surface alone. Each car's entry carries a print of the tuning and the
 * surfaces' grip it was measured with, and a test holds the two together, so a
 * change to either asks for the table to be measured again. Each car's entry is
 * a file of its own (`limits/<id>.json`), written by the tool, and a line here.
 */

/** A rate over a band of speeds, in g. */
export interface SpeedBand {
  fromKmh: number;
  toKmh: number;
  g: number;
}

export interface CarLimits {
  /** Sideways grip held in a steady corner, in g, at each of a set of speeds the car can hold through one. */
  corner: { kmh: number; g: number }[];
  /** Slowing on the brakes alone, in a straight line, band by band down from the fastest of a few set speeds it reaches. */
  braking: SpeedBand[];
  /** Metres to a stop from 100 km/h. */
  stopFrom100M: number;
  /** Gaining at full throttle from a standstill, band by band, gear changes included. */
  pull: SpeedBand[];
  /** Seconds from a standstill to each of a few set speeds it reaches, at full throttle. */
  sprintS: { kmh: number; s: number }[];
  /** Seconds to cover 400 m from a standstill. */
  quarterS: number;
  /** The fastest it went in a minute of full throttle. */
  reachedKmh: number;
}

/** A surface in a condition on a set of tyres, as the table names its rows. */
export type Ground = `${Condition}-${Surface}-${Tyre}`;

export const groundOf = (condition: Condition, surface: Surface, tyres: Tyre = "summer"): Ground => `${condition}-${surface}-${tyres}`;

/**
 * The tyres each condition is measured on: summer tyres in the dry and the wet, since no racer fits winter tyres
 * for a summer's day, and every set in snow and on ice, where the choice is the point.
 */
export const MEASURED_TYRES: Readonly<Record<Condition, readonly Tyre[]>> = { dry: ["summer"], wet: ["summer"], snow: TYRES, ice: TYRES };

/** A short print of a car's tuning and of every surface's grip on every tyre: any change to a number changes it. */
export function tuningPrint(tuning: CarTuning): string {
  let hash = 0x811c9dc5;
  for (const character of JSON.stringify([tuning, GROUND_GRIP[tuning.class]])) hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Every car's entry, under its tier as `cars.ts` has it. */
export const CAR_LIMITS: Readonly<Record<CarId, { tuning: string; grounds: Partial<Record<Ground, CarLimits>> }>> = {
  // A1
  aska,
  // A2
  orkan,
  varg,
  // A3
  dyning,
  span,
  strimma,
  // A4
  sund,
  // A5
  "skerry-gt": skerryGt,
  strom,
  ankar,
  // A6
  bris,
  sten,
  // A7
  ljus,
  // B1
  grus,
  gnista,
  // B2
  fjard,
  // B3
  holm,
  // B4
  berg,
  // C1
  // C2
  // C3
  vik,
  // C4
  salta,
  // Outside the tiers
  kobb,
};

/** A car's limits on one ground: a ground the table doesn't measure is a mistake in the caller, not a gap to fill. */
export function limitsOn(id: CarId, condition: Condition, surface: Surface, tyres: Tyre = "summer"): CarLimits {
  const limits = CAR_LIMITS[id].grounds[groundOf(condition, surface, tyres)];
  if (!limits) throw new Error(`the limits table measures no ${tyres} tyres in ${condition} on ${surface}: see MEASURED_TYRES`);
  return limits;
}

import type { CarTuning } from "./tuning";
import type { CarId } from "./cars";
import table from "./car-limits.json";

/*
 * What each car can do at the limit, measured in the simulation
 * (`measure-limits.ts`, run by `tools/car-limits.ts`): its grip in steady
 * corners, its braking and its pull, by speed. The racers plan their speeds
 * from it, so each drives its own car as that car can be driven. Each car's
 * entry carries a print of the tuning it was measured with, and a test holds
 * the two together, so a tuning change asks for the table to be measured again.
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

/** A short print of a car's tuning: any change to a number changes it. */
export function tuningPrint(tuning: CarTuning): string {
  let hash = 0x811c9dc5;
  for (const character of JSON.stringify(tuning)) hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export const CAR_LIMITS: Readonly<Record<CarId, CarLimits & { tuning: string }>> = table;


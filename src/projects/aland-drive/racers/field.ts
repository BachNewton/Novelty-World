import { CAR_LIMITS } from "../sim/car-limits";
import { CAR_IDS, CARS, type CarId } from "../sim/cars";
import type { RaceGround } from "../challenge/types";
import type { CarClass, Condition, Tyre } from "../sim/surfaces";

/*
 * The cars that race each race (`ideas/races.md`, "What each race allows"): the
 * race's own car, which the player is handed, and the cars nearest it in pace
 * of the kinds its ground suits, so a grid is a field of different cars rather
 * than copies. A road race takes the sports and road cars; cross country and
 * off-road take the rally cars and the four-by-fours, and cross country the road
 * cars too, whose share of asphalt they are at home on. Pace is the measured
 * sprint to 100 km/h on the ground's dry surface (`sim/limits/`), the figure
 * the tiers rank cars by, so a field is drawn by the same ruler.
 */

/** The tyres made for a condition: what a racer fits for the day. */
export const tyresFor = (condition: Condition): Tyre => (condition === "snow" || condition === "ice" ? "winter" : "summer");

/** The most cars a race's grid holds, the race's own among them. */
export const FIELD_SIZE = 6;

const CLASSES_ON: Readonly<Record<RaceGround, readonly CarClass[]>> = {
  road: ["sports", "road"],
  "cross-country": ["rally", "offroad", "road"],
  "off-road": ["rally", "offroad"],
};

/** Seconds to 100 km/h on the ground's dry surface, as the tiers measure a car. */
function sprintS(car: CarId, ground: RaceGround): number {
  const surface = ground === "road" ? "asphalt" : "gravel";
  const limits = CAR_LIMITS[car].grounds[`dry-${surface}-summer`];
  const sprint = limits?.sprintS.find(({ kmh }) => kmh === 100);
  // A car that never reaches 100 km/h on the ground is as slow as a car can be.
  return sprint?.s ?? Infinity;
}

/** The race's car first, then the cars nearest it in pace of the kinds its ground suits, up to the grid's size. */
export function fieldOf(car: CarId, ground: RaceGround, size = FIELD_SIZE): CarId[] {
  const own = sprintS(car, ground);
  const others = CAR_IDS.filter((id) => id !== car && CLASSES_ON[ground].includes(CARS[id].class))
    .map((id) => ({ id, off: Math.abs(sprintS(id, ground) - own) }))
    .sort((a, b) => a.off - b.off || CAR_IDS.indexOf(a.id) - CAR_IDS.indexOf(b.id))
    .slice(0, Math.max(0, size - 1))
    .map(({ id }) => id);
  return [car, ...others];
}

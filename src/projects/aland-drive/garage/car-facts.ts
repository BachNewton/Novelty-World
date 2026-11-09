import { CAR_ENTRIES, CAR_IDS, type CarId } from "../sim/cars";
import type { Maker, Origin } from "../sim/cars/character";
import { limitsOn } from "../sim/car-limits";
import { torqueAt } from "../sim/gearbox";
import { sprintSurface, TIER_BANDS, type Tier } from "../sim/tiers";
import type { Surface } from "../sim/surfaces";

/*
 * A car's spec sheet, as a racing game shows one: who makes it, its class and tier, its engine, drive and weight, and
 * what it does, read from its measured limits (`sim/car-limits.ts`) on dry ground on summer tyres, as its tier is. Every
 * figure comes from the car's own files, so nothing here is typed twice.
 */

/** The class a car's tier is in, or none for a car outside the tiers. */
export type CarGroup = "asphalt" | "gravel" | "classic" | "none";

/** Which wheels the engine drives. */
export type Drive = "FWD" | "RWD" | "AWD";

export interface CarFacts {
  id: CarId;
  name: string;
  maker: Maker;
  group: CarGroup;
  tier: Tier | null;
  engine: string;
  from: Origin;
  /** Seconds from a standstill to 100 km/h, on the surface its tier is ranked on: gravel in B, asphalt otherwise. */
  to100: { s: number; surface: Surface };
  /** Top speed on dry asphalt. */
  topKmh: number;
  /** Metres to a stop from 100 km/h on dry asphalt. */
  stopFrom100M: number;
  /** Sideways grip held through a steady corner at 100 km/h, in g, on dry asphalt and dry gravel. */
  grip: { asphalt: number; gravel: number };
  /** The engine's most power, anywhere in its revs. */
  powerKw: number;
  /** The engine's most torque. */
  torqueNm: number;
  massKg: number;
  /** Power for each tonne it carries. */
  kwPerTonne: number;
  drive: Drive;
  gears: number;
}

const GROUPS: Record<string, CarGroup> = { A: "asphalt", B: "gravel", C: "classic" };

export const groupOf = (tier: Tier | null): CarGroup => (tier === null ? "none" : GROUPS[tier[0]]);

export const driveOf = (rearShare: number): Drive => (rearShare === 0 ? "FWD" : rearShare === 1 ? "RWD" : "AWD");

/** Revs sampled across the band for the engine's peaks: the torque curve is straight between its points, so a fine grid finds its peaks to well within a figure's rounding. */
const REV_STEPS = 4000;

/** The engine's most torque and most power, read off the same torque curve the simulation drives on. */
function enginePeaks(id: CarId): { powerKw: number; torqueNm: number } {
  const tuning = CAR_ENTRIES[id].tuning;
  let powerKw = 0;
  let torqueNm = 0;
  for (let step = 0; step < REV_STEPS; step++) {
    const rpm = (step / REV_STEPS) * tuning.gearbox.redlineRpm;
    const torque = torqueAt(tuning, rpm);
    torqueNm = Math.max(torqueNm, torque);
    powerKw = Math.max(powerKw, (torque * rpm * Math.PI) / 30 / 1000);
  }
  return { powerKw, torqueNm };
}

function gripAt100(id: CarId, surface: Surface): number {
  const corner = limitsOn(id, "dry", surface).corner.find(({ kmh }) => kmh === 100);
  if (!corner) throw new Error(`${id}'s limits hold no corner at 100 km/h on dry ${surface}`);
  return corner.g;
}

export function carFacts(id: CarId): CarFacts {
  const { tier, maker, engine, from, tuning } = CAR_ENTRIES[id];
  const surface = tier === null ? "asphalt" : sprintSurface(tier);
  const sprint = limitsOn(id, "dry", surface).sprintS.find(({ kmh }) => kmh === 100);
  if (!sprint) throw new Error(`${id} never reaches 100 km/h on dry ${surface}`);
  const asphalt = limitsOn(id, "dry", "asphalt");
  const peaks = enginePeaks(id);
  return {
    id,
    name: tuning.name,
    maker,
    group: groupOf(tier),
    tier,
    engine,
    from,
    to100: { s: sprint.s, surface },
    topKmh: asphalt.reachedKmh,
    stopFrom100M: asphalt.stopFrom100M,
    grip: { asphalt: gripAt100(id, "asphalt"), gravel: gripAt100(id, "gravel") },
    ...peaks,
    massKg: tuning.car.massKg,
    kwPerTonne: peaks.powerKw / (tuning.car.massKg / 1000),
    drive: driveOf(tuning.power.rearShare),
    gears: tuning.gearbox.gearTopMS.length,
  };
}

/** A figure's reach across the field: the least and the most of any car, and of any tier's band where it has one. */
export type Reach = readonly [low: number, high: number];

export interface Field {
  to100S: Reach;
  topKmh: Reach;
  stopFrom100M: Reach;
  grip: Reach;
  kwPerTonne: Reach;
}

const reach = (values: readonly number[]): Reach => [Math.min(...values), Math.max(...values)];

/** How far each figure reaches across every car, so a car's bars read against the whole field. */
export function fieldOf(cars: readonly CarFacts[]): Field {
  const bands = cars.flatMap(({ tier }) => (tier === null ? [] : [TIER_BANDS[tier]]));
  return {
    to100S: reach([...cars.map(({ to100 }) => to100.s), ...bands.flatMap(({ to100S }) => to100S)]),
    topKmh: reach([...cars.map(({ topKmh }) => topKmh), ...bands.flatMap(({ topKmh }) => topKmh)]),
    stopFrom100M: reach(cars.map(({ stopFrom100M }) => stopFrom100M)),
    grip: reach(cars.flatMap(({ grip }) => [grip.asphalt, grip.gravel])),
    kwPerTonne: reach(cars.map(({ kwPerTonne }) => kwPerTonne)),
  };
}

/** Every car's facts, in the registry's order: by class and tier, fastest first, and those outside the tiers last. */
export const allCarFacts = (): CarFacts[] => CAR_IDS.map(carFacts);

import type { CarState } from "../sim/car-state";
import { CARS, type CarId } from "../sim/cars";
import type { RoadLine } from "../sim/road-net";
import { sagOf } from "../sim/tuning";

/*
 * The simplest computer-driven car: along one of the start tile's roads at a
 * steady speed, stopping at its end, with nothing in its way. It is how a test
 * proves the nearest-player rule (`computer-cars.ts`) before there are racers
 * to race or traffic shared online. Its whole driver's record is where it is
 * along which road and how fast it goes, and its car is a pure function of
 * that, so whoever runs it next carries on from exactly there.
 */

export interface ScriptedDriver {
  kind: "scripted";
  chain: number;
  along: number;
  speedMS: number;
}

export function parseScriptedDriver(value: Record<string, unknown>): ScriptedDriver {
  const { kind, chain, along, speedMS } = value;
  if (kind !== "scripted" || typeof chain !== "number" || !Number.isInteger(chain) || chain < 0 || typeof along !== "number" || !Number.isFinite(along) || typeof speedMS !== "number" || !Number.isFinite(speedMS) || speedMS < 0) {
    throw new Error(`not a scripted driver's record: ${JSON.stringify(value)}`);
  }
  return { kind, chain, along, speedMS };
}

export function scriptedStep(driver: ScriptedDriver, seconds: number, line: RoadLine): ScriptedDriver {
  return { ...driver, along: Math.min(driver.along + driver.speedMS * seconds, line.length) };
}

/** The car where its driver has it: on its wheels at rest on the road, rolling along it. */
export function scriptedState({ along, speedMS }: ScriptedDriver, line: RoadLine, car: CarId): CarState {
  const { x, y, z, heading } = line.at(along);
  const tuning = CARS[car];
  const speed = along < line.length ? speedMS : 0;
  return {
    car,
    position: [x, y + tuning.car.wheelRadiusM + tuning.suspension.droopM - sagOf(tuning), z],
    rotation: [0, Math.sin(heading / 2), 0, Math.cos(heading / 2)],
    velocity: [-Math.sin(heading) * speed, 0, -Math.cos(heading) * speed],
    spin: [0, 0, 0],
    steer: 0,
    suspension: [0, 0, 0, 0],
    roll: [along / tuning.car.wheelRadiusM, along / tuning.car.wheelRadiusM, along / tuning.car.wheelRadiusM, along / tuning.car.wheelRadiusM],
    lamps: { head: true, brake: false, reverse: false },
  };
}

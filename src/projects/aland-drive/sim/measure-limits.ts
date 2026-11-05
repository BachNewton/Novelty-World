import { NO_INPUT, type DriveInput } from "./car";
import type { CarLimits, SpeedBand } from "./car-limits";
import { CARS, type CarId } from "./cars";
import { headingOf, speedOf, type CarState } from "./car-state";
import { Drive } from "./drive";
import { topSpeedMS } from "./gearbox";
import { PAD_M, padPoint, testPad } from "./test-pad";
import type { Condition } from "./surfaces";
import { STEP_S, WORLD as PHYSICS } from "./tuning";
import type { World } from "./world";

/*
 * Each car's limits, measured by driving it in the simulation through the same
 * manoeuvres on a flat test pad: how hard it can corner at speed, brake and
 * pull. Through `DriveInput` alone, as a player drives, so what's measured is
 * what a driver of the car can do, steering's narrowing with speed included.
 * `tools/car-limits.ts` writes them into the table the racers read
 * (`car-limits.ts`). The simulation has no clock, so a car gives the same
 * numbers every run.
 */

const CORNER_SPEEDS_KMH = [60, 100, 140, 180, 220];
const BRAKE_FROM_KMH = [200, 160, 100];
const SPRINT_KMH = [100, 160, 200];
const BAND_KMH = 20;
/** A corner speed is measured only up to this share of the car's top speed, where it still has the pull to hold it through a corner. */
const CORNER_SHARE_OF_TOP = 0.85;
/** And only up to this share of the fastest it went on the surface measured, which it reaches with time to spare. */
const REACHABLE_SHARE = 0.95;
/** The steering wound on from straight to full over this long, slowly enough that the car is in a steady corner all the way. */
const STEER_RAMP_S = 12;
/** Sideways pull is read over this long, which a single step's noise can't move. */
const SMOOTH_S = 0.5;
/** Only while the speed is held this near what's asked. */
const HELD_SHARE = 0.03;
/** Past this angle between the nose and the way the car goes, it is sliding, not cornering, and the corner ends. */
const SLIDING_RAD = 0.25;
const SPEED_HOLD_PER_MS = 2;
const SETTLE_S = 1;
const PULL_S = 60;
const STOPPED_MS = 0.3;
const QUARTER_M = 400;
const LONGEST_RUN_S = 120;

const kmh = (ms: number) => ms * 3.6;
const ms = (kmh: number) => kmh / 3.6;
const toG = (ms2: number) => ms2 / PHYSICS.gravity;
const round = (value: number, places: number) => Number(value.toFixed(places));

/** Start a run near the pad's west edge, facing east across it, halfway north to south. */
const START_X = 200;
const START_Z = -PAD_M / 2;

function padDrive(world: World, id: CarId, condition: Condition): Drive {
  const drive = new Drive(world, padPoint(START_X, START_Z), id);
  drive.condition = condition;
  return drive;
}

function holdSpeed(state: CarState, target: number): Pick<DriveInput, "throttle" | "brake"> {
  const error = target - speedOf(state);
  return { throttle: Math.max(0, Math.min(1, error * SPEED_HOLD_PER_MS)), brake: Math.max(0, Math.min(1, -error * SPEED_HOLD_PER_MS)) };
}

/** Full throttle in a straight line until the car is going this fast, or has been for as long as a run may last. */
function upTo(drive: Drive, speed: number): void {
  for (let step = 0; step * STEP_S < LONGEST_RUN_S && speedOf(drive.stateAt(1)) < speed; step++) {
    drive.step({ ...NO_INPUT, throttle: 1 });
    if (drive.stateAt(1).position[0] > PAD_M - START_X) throw new Error(`a ${drive.carId} ran out of pad on its way to ${kmh(speed).toFixed(0)} km/h`);
  }
}

/** Sideways pull, from how the car's velocity turned over one step. */
function sidewaysMS2(before: CarState, after: CarState): number {
  const [ax, , az] = before.velocity;
  const [bx, , bz] = after.velocity;
  const along = Math.hypot(bx, bz);
  if (along === 0) return 0;
  // The change in velocity, across the way the car now goes.
  return Math.abs(((bx - ax) * -bz + (bz - az) * bx) / along) / STEP_S;
}

/** The most sideways grip the car holds at a speed, through a corner wound on slowly at that speed. */
function cornerAt(world: World, id: CarId, condition: Condition, speed: number): number | null {
  const drive = padDrive(world, id, condition);
  upTo(drive, speed);
  for (let step = 0; step * STEP_S < SETTLE_S; step++) drive.step({ ...NO_INPUT, ...holdSpeed(drive.stateAt(1), speed) });
  const window: number[] = [];
  const windowSteps = Math.round(SMOOTH_S / STEP_S);
  let best: number | null = null;
  let sum = 0;
  let before = drive.stateAt(1);
  for (let step = 0; step * STEP_S < STEER_RAMP_S; step++) {
    const steer = (step * STEP_S) / STEER_RAMP_S;
    drive.step({ ...NO_INPUT, ...holdSpeed(before, speed), steer });
    const after = drive.stateAt(1);
    const pull = sidewaysMS2(before, after);
    window.push(pull);
    sum += pull;
    if (window.length > windowSteps) sum -= window.shift() ?? 0;
    const way = Math.atan2(-after.velocity[0], -after.velocity[2]);
    const slide = Math.abs(Math.atan2(Math.sin(headingOf(after.rotation) - way), Math.cos(headingOf(after.rotation) - way)));
    if (slide > SLIDING_RAD) break;
    if (window.length === windowSteps && Math.abs(speedOf(after) - speed) < HELD_SHARE * speed) best = Math.max(best ?? 0, sum / windowSteps);
    before = after;
  }
  drive.dispose();
  return best;
}

/** Rates through bands of speed, from a run's speed at every step. */
function bands(speeds: number[], from: number, to: number): SpeedBand[] {
  // Slowing to a stop ends at the last step, under STOPPED_MS.
  const crossing = (kmhAt: number) => {
    const at = kmhAt === 0 && from > to ? speeds.length - 1 : speeds.findIndex((speed, step) => step > 0 && (from < to ? speed >= ms(kmhAt) : speed <= ms(kmhAt)));
    return at < 0 ? null : at;
  };
  const found: SpeedBand[] = [];
  const way = Math.sign(to - from);
  for (let start = from; start !== to; start += way * BAND_KMH) {
    const end = start + way * BAND_KMH;
    const first = crossing(start);
    const last = crossing(end);
    if (first === null || last === null || last <= first) continue;
    found.push({ fromKmh: start, toKmh: end, g: round(toG(Math.abs(speeds[last] - speeds[first]) / ((last - first) * STEP_S)), 3) });
  }
  return found;
}

function braking(world: World, id: CarId, condition: Condition, reachableKmh: number): Pick<CarLimits, "braking" | "stopFrom100M"> {
  const top = topSpeedMS(CARS[id]);
  const fromKmh = BRAKE_FROM_KMH.find((kmhAt) => ms(kmhAt) < 0.9 * top && kmhAt <= reachableKmh) ?? BRAKE_FROM_KMH[BRAKE_FROM_KMH.length - 1];
  const drive = padDrive(world, id, condition);
  upTo(drive, ms(fromKmh) + 1);
  const speeds: number[] = [];
  let stopFrom100M = 0;
  let from100: CarState | null = null;
  let state = drive.stateAt(1);
  for (let step = 0; step * STEP_S < LONGEST_RUN_S && speedOf(state) > STOPPED_MS; step++) {
    drive.step({ ...NO_INPUT, brake: 1 });
    state = drive.stateAt(1);
    speeds.push(speedOf(state));
    if (!from100 && speedOf(state) <= ms(100)) from100 = state;
  }
  if (from100) stopFrom100M = Math.hypot(state.position[0] - from100.position[0], state.position[2] - from100.position[2]);
  drive.dispose();
  return { braking: bands(speeds, fromKmh, 0), stopFrom100M: round(stopFrom100M, 1) };
}

function pull(world: World, id: CarId, condition: Condition): Pick<CarLimits, "pull" | "sprintS" | "quarterS" | "reachedKmh"> {
  const drive = padDrive(world, id, condition);
  const start = drive.stateAt(1).position;
  const speeds: number[] = [];
  let quarterS = 0;
  // The pad's far edge, with room to stop.
  const roomM = PAD_M - 2 * START_X;
  for (let step = 0; step * STEP_S < PULL_S; step++) {
    drive.step({ ...NO_INPUT, throttle: 1 });
    const { position } = drive.stateAt(1);
    speeds.push(speedOf(drive.stateAt(1)));
    const gone = Math.hypot(position[0] - start[0], position[2] - start[2]);
    if (!quarterS && gone >= QUARTER_M) quarterS = (step + 1) * STEP_S;
    if (gone > roomM) break;
  }
  drive.dispose();
  const reached = Math.max(...speeds);
  const sprintS = SPRINT_KMH.flatMap((kmhAt) => {
    const at = speeds.findIndex((speed) => speed >= ms(kmhAt));
    return at < 0 ? [] : [{ kmh: kmhAt, s: round((at + 1) * STEP_S, 2) }];
  });
  return { pull: bands(speeds, 0, Math.floor(kmh(reached) / BAND_KMH) * BAND_KMH), sprintS, quarterS: round(quarterS, 2), reachedKmh: round(kmh(reached), 1) };
}

/** Measures a car on a pad of one surface (`testPad`), in a condition: as tuned, on dry asphalt. */
export function measureCar(id: CarId, world: World = testPad(), condition: Condition = "dry"): CarLimits {
  const top = topSpeedMS(CARS[id]);
  const pulled = pull(world, id, condition);
  // Soft ground holds a car well under what its engine and drag allow.
  const reachableKmh = REACHABLE_SHARE * pulled.reachedKmh;
  const corner = CORNER_SPEEDS_KMH.filter((kmhAt) => ms(kmhAt) <= CORNER_SHARE_OF_TOP * top && kmhAt <= reachableKmh).flatMap((kmhAt) => {
    const held = cornerAt(world, id, condition, ms(kmhAt));
    return held === null ? [] : [{ kmh: kmhAt, g: round(toG(held), 3) }];
  });
  return { corner, ...braking(world, id, condition, reachableKmh), ...pulled };
}

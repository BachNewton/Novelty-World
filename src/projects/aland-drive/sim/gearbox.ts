import type { CarTuning } from "./tuning";

/*
 * The engine and its automatic gearbox, with no physics in them: the gear, the
 * revs and the load a speed and a throttle ask for, and the torque those revs
 * make. The car drives on this, and the sound hears the same numbers.
 */

export interface Gearbox {
  idleRpm: number;
  redlineRpm: number;
  /** The speed at the redline in each gear, m/s. One entry is a car with no gearbox. */
  gearTopMS: readonly number[];
  /** How long the drive is cut for a gear change. */
  shiftS: number;
  /** Upshift point lifting off, as a share of the redline. Flat out it shifts near the redline. */
  gentleShift: number;
}

export interface EngineRead {
  gear: number;
  rpm: number;
  load: number;
  shiftLeftS: number;
}

export const restingEngine = (box: Gearbox): EngineRead => ({ gear: 0, rpm: box.idleRpm, load: 0, shiftLeftS: 0 });

const lerp = (a: number, b: number, share: number) => a + (b - a) * share;

/** How much of a change a smoothing of time constant `seconds` makes over `dt`. */
const settle = (dt: number, seconds: number) => 1 - Math.exp(-dt / seconds);

/** Below this share of first gear's top speed the clutch is still slipping. */
const CLUTCH_SHARE = 0.32;
/** How far the revs rise in first with the clutch slipping, as a share of the redline. */
const CLUTCH_REVS = 0.5;
const DOWNSHIFT_AT = [0.3, 0.46] as const;
const REV_FOLLOW_S = 0.05;
const REV_FREE_S = 0.14;
const LOAD_FOLLOW_S = 0.06;

const revsIn = (box: Gearbox, gear: number, speed: number) => (speed / box.gearTopMS[gear]) * box.redlineRpm;

/** The engine already running at a speed, in the gear a gentle drive would be in: for a car swapped in mid-drive. */
export function runningEngine(box: Gearbox, speed: number): EngineRead {
  const upAt = lerp(box.gentleShift, 0.97, 0.5) * box.redlineRpm;
  const last = box.gearTopMS.length - 1;
  let gear = 0;
  while (gear < last && revsIn(box, gear, speed) > upAt) gear++;
  return { gear, rpm: Math.min(Math.max(revsIn(box, gear, speed), box.idleRpm), box.redlineRpm), load: 0, shiftLeftS: 0 };
}

/**
 * One step of the revs, the gear and the load. `shifted` says a change happened in this step. The revs follow the
 * driven wheels, which a spinning tyre turns faster than the car goes, and so does the box once the car is under way:
 * a car spinning its wheels on the spot stays in first, at the limiter.
 */
export function stepEngine(box: Gearbox, read: EngineRead, speed: number, throttle: number, dt: number, wheelSpeed = speed): { read: EngineRead; shifted: boolean } {
  let { gear, shiftLeftS } = read;
  let shifted = false;
  shiftLeftS = Math.max(0, shiftLeftS - dt);

  if (shiftLeftS === 0) {
    const by = speed < box.gearTopMS[0] * CLUTCH_SHARE ? speed : wheelSpeed;
    const upAt = lerp(box.gentleShift, 0.97, throttle) * box.redlineRpm;
    const downAt = lerp(DOWNSHIFT_AT[0], DOWNSHIFT_AT[1], throttle) * box.redlineRpm;
    const last = box.gearTopMS.length - 1;
    if (gear < last && revsIn(box, gear, by) > upAt && revsIn(box, gear + 1, by) > downAt) {
      gear += 1;
      shifted = true;
    } else if (gear > 0 && revsIn(box, gear, by) < downAt && revsIn(box, gear - 1, by) < upAt * 0.92) {
      gear -= 1;
      shifted = true;
    }
    if (shifted) shiftLeftS = box.shiftS;
  }

  const hasClutch = box.idleRpm > 0;
  const atWheels = revsIn(box, gear, wheelSpeed);
  const slipping = hasClutch && gear === 0 && wheelSpeed < box.gearTopMS[0] * CLUTCH_SHARE;
  const clutchRevs = slipping ? lerp(box.idleRpm, box.redlineRpm * CLUTCH_REVS, throttle) : 0;
  const target = Math.min(Math.max(atWheels, clutchRevs, box.idleRpm), box.redlineRpm * 1.01);
  const rpm = read.rpm + (target - read.rpm) * settle(dt, slipping ? REV_FREE_S : REV_FOLLOW_S);
  const load = read.load + ((shiftLeftS > 0 ? 0 : throttle) - read.load) * settle(dt, LOAD_FOLLOW_S);
  return { read: { gear, rpm, load, shiftLeftS }, shifted };
}

/** A car's torque at some revs, in newton metres. At the redline the fuel is cut. */
export function torqueAt({ engine, gearbox }: CarTuning, rpm: number): number {
  const revs = rpm / gearbox.redlineRpm;
  if (revs >= 1) return 0;
  const curve = engine.torqueCurve;
  const above = curve.findIndex(([at]) => at > revs);
  if (above <= 0) return engine.peakTorqueNm * curve[0][1];
  const [lowAt, low] = curve[above - 1];
  const [highAt, high] = curve[above];
  return engine.peakTorqueNm * lerp(low, high, (revs - lowAt) / (highAt - lowAt));
}

/** How many radians the engine turns for each metre the car rolls, in a gear: a torque times this is a force at the road. */
export const radiansPerMetre = ({ gearbox }: CarTuning, gear: number) => (gearbox.redlineRpm * Math.PI) / 30 / gearbox.gearTopMS[gear];

/** How hard the closed throttle holds the car back at some revs, in newton metres. */
export const engineBrakeAt = ({ engine, gearbox }: CarTuning, rpm: number) => (engine.engineBrakeNm * Math.max(0, rpm - gearbox.idleRpm)) / (gearbox.redlineRpm - gearbox.idleRpm);

/**
 * The drive at the road for a throttle, with the engine where it is: what the car pulls with, before the tyres have
 * their say. Traction control holds it to what the tyres put down off the line; without it, the engine's all.
 */
export function pullAt(tuning: CarTuning, { gear, rpm, shiftLeftS }: EngineRead, throttle: number, traction = true, launchN = tuning.power.launchN): number {
  if (shiftLeftS > 0) return 0;
  const toRoad = radiansPerMetre(tuning, gear);
  const pull = Math.min(traction ? launchN : Infinity, torqueAt(tuning, rpm) * toRoad);
  return throttle * pull - (1 - throttle) * engineBrakeAt(tuning, rpm) * toRoad;
}

/** What holds a car back on the flat at a speed: the air and the tyres' rolling. */
export const resistanceAt = ({ power }: CarTuning, speed: number) => power.dragPerMS2 * speed * speed + power.rollingN;

/** The car's top speed on the flat: where its best pull in any gear meets the air, or the last gear's redline if that comes first. */
export function topSpeedMS(tuning: CarTuning): number {
  const { gearbox } = tuning;
  const best = (speed: number) =>
    Math.max(...gearbox.gearTopMS.map((_, gear) => Math.min(tuning.power.launchN, torqueAt(tuning, (speed / gearbox.gearTopMS[gear]) * gearbox.redlineRpm) * radiansPerMetre(tuning, gear))));
  let speed = 1;
  while (best(speed) > resistanceAt(tuning, speed)) speed += 0.05;
  return speed;
}

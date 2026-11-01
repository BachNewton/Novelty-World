import { speedOf, type CarState, type Rotation, type Vector3 } from "../sim/car-state";
import type { DriveInput } from "../sim/car";
import type { EngineRead } from "../sim/gearbox";
import { SUSPENSION } from "../sim/tuning";
import { BIKE, type EngineSpec, type VehicleId } from "./vehicles";

/*
 * The sound's rules, with no Web Audio in them: what the game tells the sound
 * each frame, the jolts heard in the car's motion, and the levels
 * and pitches all of that asks for. `graph.ts` plays what this says.
 */

export type Surface = "asphalt" | "gravel" | "grass";
export const SURFACES: readonly Surface[] = ["asphalt", "gravel", "grass"];

/** How much of each place is round the car, 0 to 1. Places overlap: a shore town is both. */
export interface Place {
  forest: number;
  shore: number;
  town: number;
}

export interface DriveAudioState {
  vehicle: VehicleId;
  speedMS: number;
  throttle: number;
  brake: number;
  handbrake: boolean;
  /** How hard the tyres are sliding, 0 to 1. */
  slip: number;
  surface: Surface;
  /** How far each wheel has risen into its arch, as `CarState` has it. */
  suspension: readonly [number, number, number, number];
  place: Place;
  /** The drive is stopped, as under the world map: only the place is heard. */
  paused?: boolean;
  /** Holds the revs here instead of the gearbox's, for the audition's slider. */
  heldRpm?: number;
  /** The simulation's own engine. With none, as in the audition, the sound runs a gearbox of its own. */
  engine?: EngineRead;
}

const clamp = (value: number, low = 0, high = 1) => Math.min(Math.max(value, low), high);
const lerp = (a: number, b: number, share: number) => a + (b - a) * share;

/** How much of a change a smoothing of time constant `seconds` makes over `dt`. */
const settle = (dt: number, seconds: number) => (seconds <= 0 ? 1 : 1 - Math.exp(-dt / seconds));

function rotate([x, y, z]: Vector3, [qx, qy, qz, qw]: Rotation): Vector3 {
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  return [x + qw * tx + qy * tz - qz * ty, y + qw * ty + qz * tx - qx * tz, z + qw * tz + qx * ty - qy * tx];
}

const dot = (a: Vector3, b: Vector3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const SLIDE_STARTS_MS = 1.2;
const SLIDE_FULL_MS = 7;
const LOCKED_WHEELS_SLIP = 0.55;

/** How hard the tyres are sliding, from the car's motion across its own nose. */
export function slipOf(car: CarState, handbrake: boolean): number {
  const speed = speedOf(car);
  const across = Math.abs(dot(car.velocity, rotate([1, 0, 0], car.rotation)));
  const sliding = clamp((across - SLIDE_STARTS_MS) / (SLIDE_FULL_MS - SLIDE_STARTS_MS));
  const locked = handbrake && speed > 3 ? LOCKED_WHEELS_SLIP : 0;
  return Math.max(sliding, locked);
}

/** A frame's state from the simulation's car, with what only the game knows passed in. */
export function stateFromCar(car: CarState, input: DriveInput, known: Pick<DriveAudioState, "vehicle" | "surface" | "place" | "paused" | "engine">): DriveAudioState {
  return {
    ...known,
    speedMS: speedOf(car),
    throttle: input.throttle,
    brake: input.brake,
    handbrake: input.handbrake,
    slip: slipOf(car, input.handbrake),
    suspension: car.suspension,
  };
}

// ---- The jolts ----

export type Jolt = { sound: "knock" | "thud" | "bump-stop" | "crash" | "handbrake"; strength: number };

export interface Jolts {
  suspension: readonly number[] | null;
  /** The speed a moment ago, for telling a hit from braking, however long a frame is. */
  recentSpeedMS: number;
  handbrake: boolean;
  /** Which wheels are hard against their stops: the sound comes once, as they arrive. */
  stopped: boolean;
  /** A hit is one crash, though the car takes a moment to stop. */
  sinceHitS: number;
}

export const noJolts = (): Jolts => ({ suspension: null, recentSpeedMS: 0, handbrake: false, stopped: false, sinceHitS: Infinity });

/** A wheel rising faster than this, m/s, is heard: a pothole's edge, not the road's slow swell. */
const KNOCK_MS = 0.9;
const THUD_MS = 2.1;
const FULL_THUD_MS = 5;
/** Hard braking loses 14 m/s² and a hit far more, so the speed lost over `HIT_WINDOW_S` tells them apart. */
const HIT_WINDOW_S = 0.12;
const HIT_MS = 5;
const FULL_HIT_MS = 28;
const HIT_LASTS_S = 0.6;
const STOP_MARGIN_M = 0.002;

export function readJolts(past: Jolts, state: DriveAudioState, dt: number): { jolts: Jolts; heard: Jolt[] } {
  const heard: Jolt[] = [];

  const risen = state.suspension.map((now, wheel) => (past.suspension === null ? 0 : (now - past.suspension[wheel]) / dt));
  const fastest = Math.max(...risen);
  if (fastest >= THUD_MS) heard.push({ sound: "thud", strength: clamp(fastest / FULL_THUD_MS, 0.4) });
  else if (fastest >= KNOCK_MS) heard.push({ sound: "knock", strength: clamp(fastest / THUD_MS, 0.4) });

  const stopped = state.suspension.some((wheel) => wheel >= SUSPENSION.travelM - STOP_MARGIN_M);
  if (stopped && !past.stopped) heard.push({ sound: "bump-stop", strength: 1 });

  const lost = past.recentSpeedMS - state.speedMS;
  const hit = lost >= HIT_MS && past.sinceHitS >= HIT_LASTS_S;
  if (hit) heard.push({ sound: "crash", strength: clamp(lost / FULL_HIT_MS, 0.35) });
  const sinceHitS = hit ? 0 : past.sinceHitS + dt;
  const recentSpeedMS = past.recentSpeedMS + (state.speedMS - past.recentSpeedMS) * settle(dt, HIT_WINDOW_S);

  if (state.handbrake && !past.handbrake) heard.push({ sound: "handbrake", strength: 1 });

  return { jolts: { suspension: state.suspension, recentSpeedMS, handbrake: state.handbrake, stopped, sinceHitS }, heard };
}

// ---- The mix ----

/** A voice's level, and what it's tuned to. Levels are linear, before the master volume. */
export interface Mix {
  rpm: number;
  firingHz: number;
  engineLevel: number;
  driveAmount: number;
  exhaustHz: number;
  intakeHz: number;
  intakeLevel: number;

  chainLevel: number;
  chainHz: number;
  freewheelLevel: number;
  freewheelRate: number;

  asphaltLevel: number;
  asphaltHz: number;
  rumbleLevel: number;
  rumbleHz: number;
  gravelLevel: number;
  gravelRate: number;
  grassLevel: number;
  grassRate: number;

  squealLevel: number;
  squealHz: number;
  hissLevel: number;

  windLowLevel: number;
  windLowHz: number;
  windHighLevel: number;
  windHighHz: number;

  forestLevel: number;
  shoreLevel: number;
  gullsLevel: number;
  townLevel: number;
}

/** Wind and tyres are full at the speed that's flat out for the vehicle: a bicycle hears them much sooner. */
const fullSpeedOf = (vehicle: VehicleId) => (vehicle === "bike" ? BIKE.fullSpeedMS : 55);

const TYRES: Record<Surface, { road: number; gravel: number; grass: number; rumble: number; squeal: number; hiss: number }> = {
  asphalt: { road: 0.24, gravel: 0, grass: 0, rumble: 0.2, squeal: 0.12, hiss: 0.1 },
  gravel: { road: 0.05, gravel: 0.5, grass: 0, rumble: 0.34, squeal: 0, hiss: 0.2 },
  grass: { road: 0, gravel: 0, grass: 0.45, rumble: 0.3, squeal: 0, hiss: 0.1 },
};
const BIKE_TYRE_SHARE = 0.5;

const WIND_LOW = 0.7;
const WIND_HIGH = 0.2;
/** A car's engine and wind cover the world, so the place sinks as the speed rises. */
const PLACE_SINKS_AT_SPEED = 0.6;
const PLACE = { forest: 0.44, shore: 0.42, gulls: 0.28, town: 0.42 };

export interface MixInputs {
  state: DriveAudioState;
  /** Null for a bicycle. */
  engine: { spec: EngineSpec; read: EngineRead } | null;
  /** Seconds, for the gusts. */
  time: number;
  /** A slow wander, -1 to 1, so a long slide isn't one held note. */
  wander: number;
}

const QUIET_ENGINE = { rpm: 0, firingHz: 0, engineLevel: 0, driveAmount: 0, exhaustHz: 400, intakeHz: 500, intakeLevel: 0 };

function engineMix({ spec, read }: { spec: EngineSpec; read: EngineRead }, heldRpm: number | undefined) {
  const rpm = heldRpm ?? read.rpm;
  const revs = clamp((rpm - spec.idleRpm) / (spec.redlineRpm - spec.idleRpm));
  const { load } = read;
  const shaped = lerp(spec.idleLevel, 1, 0.42 * revs + 0.58 * load * Math.sqrt(revs + 0.15));
  // An electric car is silent at rest: its whine comes with the speed.
  const stirring = spec.idleRpm > 0 ? 1 : clamp(rpm / 700);
  return {
    rpm,
    firingHz: (rpm / 60) * spec.firesPerRev,
    engineLevel: spec.level * shaped * stirring,
    driveAmount: 1 + spec.drive * load,
    exhaustHz: spec.exhaustHz[0] + spec.exhaustHz[1] * revs + spec.exhaustHz[2] * load,
    intakeHz: lerp(spec.intakeHz[0], spec.intakeHz[1], revs),
    intakeLevel: spec.intakeLevel * (0.25 + 0.75 * load) * (0.35 + 0.65 * revs) * stirring,
  };
}

export function mix({ state, engine, time, wander }: MixInputs): Mix {
  const { speedMS, surface, slip, vehicle, place } = state;
  const bike = vehicle === "bike";
  const full = fullSpeedOf(vehicle);
  const speed = clamp(speedMS / full);
  const rolling = Math.pow(clamp(speedMS / (full * 0.55)), 0.75);
  const grounded = state.suspension.some((wheel) => wheel > 0) ? 1 : 0;
  const stage = state.paused === true ? 0 : 1;
  const tyre = TYRES[surface];
  const tyreShare = (bike ? BIKE_TYRE_SHARE : 1) * grounded * stage;
  const scrub = speedMS > 1 ? Math.pow(clamp(slip), 1.3) : 0;
  const gust = 1 + 0.16 * Math.sin(time * 0.71) + 0.1 * Math.sin(time * 1.93 + 1);

  const pedalling = bike && state.throttle > 0.02 && speedMS > 0.3;
  const wheelTurnsHz = speedMS / (2 * Math.PI * BIKE.wheelRadiusM);
  const cadenceHz = BIKE.fullCadenceHz * Math.sqrt(speed);

  const placeShare = bike ? 1 : 1 - PLACE_SINKS_AT_SPEED * speed;
  const running = engine === null ? QUIET_ENGINE : engineMix(engine, state.heldRpm);

  return {
    ...running,
    engineLevel: running.engineLevel * stage,
    intakeLevel: running.intakeLevel * stage,

    chainLevel: pedalling ? stage * (0.05 + 0.1 * state.throttle) * clamp(speedMS / 2) : 0,
    chainHz: cadenceHz * BIKE.chainringTeeth,
    freewheelLevel: bike && !pedalling ? stage * 0.3 * clamp(speedMS / 1.5) : 0,
    freewheelRate: Math.max(wheelTurnsHz / BIKE.renderedTurnsHz, 0.1),

    asphaltLevel: tyreShare * tyre.road * rolling,
    asphaltHz: 420 + 1000 * speed,
    rumbleLevel: tyreShare * tyre.rumble * rolling * (bike ? 0.4 : 1),
    rumbleHz: (bike ? 140 : 70) + 150 * speed,
    gravelLevel: tyreShare * (tyre.gravel * rolling + (surface === "gravel" ? 0.2 * scrub : 0)),
    gravelRate: 0.45 + 1.15 * speed + 0.3 * scrub,
    grassLevel: tyreShare * (tyre.grass * rolling + (surface === "grass" ? 0.12 * scrub : 0)),
    grassRate: 0.5 + 1.1 * speed,

    squealLevel: tyreShare * tyre.squeal * scrub,
    squealHz: 840 + 300 * clamp(slip) + 70 * wander,
    hissLevel: tyreShare * tyre.hiss * scrub,

    windLowLevel: stage * WIND_LOW * Math.pow(speed, 1.5) * gust,
    windLowHz: 170 + 620 * speed,
    windHighLevel: stage * WIND_HIGH * Math.pow(speed, 2.2) * gust,
    windHighHz: 1500 + 3600 * speed,

    forestLevel: PLACE.forest * place.forest * placeShare,
    shoreLevel: PLACE.shore * place.shore * placeShare,
    gullsLevel: PLACE.gulls * place.shore * placeShare,
    townLevel: PLACE.town * place.town * placeShare,
  };
}


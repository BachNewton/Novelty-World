import type { Gearbox } from "../sim/gearbox";
import { CAR_IDS, CARS, type CarId } from "../sim/cars";

/*
 * What each car's engine sounds like, as numbers: its voice here, its gearbox
 * the simulation's own (`sim/cars.ts`), so in the game the sound hears that
 * car's real gear and revs, and in the audition it runs that same gearbox.
 */

export type EngineId = CarId;
export type VehicleId = EngineId | "bike";

export const ENGINE_IDS: readonly EngineId[] = CAR_IDS;
export const VEHICLE_IDS: readonly VehicleId[] = [...ENGINE_IDS, "bike"];

export const vehicleLabel = (id: VehicleId) => (id === "bike" ? "Bicycle" : CARS[id].name);

export interface Harmonic {
  /** Multiple of the firing frequency. */
  order: number;
  wave: OscillatorType;
  level: number;
  /** Detuned by this many cents, so two partials beat rather than sit dead still. */
  cents: number;
}

/** How an engine sounds, apart from its revs and gears. */
export interface Voice {
  /** Firings per crankshaft turn: half the cylinders in a four-stroke, or a motor's poles. */
  firesPerRev: number;

  /** One firing's ring, as multiples of the firing frequency, in the rendered cycle. */
  pulseOrders: readonly number[];
  /** How long a firing rings, as a share of the gap to the next. */
  pulseDecay: number;
  /** How unevenly the cylinders fire, by amplitude: burble and lope. */
  unevenness: number;
  harmonics: readonly Harmonic[];
  cycleLevel: number;

  /** The exhaust's low-pass: closed at idle, open with revs and load. */
  exhaustHz: readonly [closed: number, revs: number, load: number];
  /** The silencer's resonance, fixed however the revs move. */
  bodyHz: number;
  bodyDb: number;
  /** How hard the load drives the soft clipper: more is more rasp. */
  drive: number;

  /** The intake: noise beaten by the firings, in a band that rises with the revs. */
  intakeHz: readonly [low: number, high: number];
  intakeQ: number;
  intakeLevel: number;
  /** Fixed-pitch clatter's share of the intake: a diesel's knock. */
  firingBeat: number;

  level: number;
  /** The share of its level the engine keeps at idle with no load. */
  idleLevel: number;
}

export type EngineSpec = Gearbox & Voice;

const VOICES: Record<EngineId, Voice> = {
  // A straight six that loves to rev: smooth at idle, a hard edge up high.
  "skerry-gt": {
    firesPerRev: 3,
    pulseOrders: [1, 2.02, 3.04, 5.1],
    pulseDecay: 0.5,
    unevenness: 0.12,
    harmonics: [
      { order: 0.5, wave: "sine", level: 0.07, cents: 0 },
      { order: 1, wave: "sawtooth", level: 0.36, cents: -4 },
      { order: 2, wave: "sawtooth", level: 0.2, cents: 7 },
    ],
    cycleLevel: 0.55,
    exhaustHz: [900, 2400, 1800],
    bodyHz: 340,
    bodyDb: 8,
    drive: 2.2,
    intakeHz: [500, 2400],
    intakeQ: 1.2,
    intakeLevel: 0.16,
    firingBeat: 0.5,
    level: 0.34,
    idleLevel: 0.46,
  },
  // A little turbo triple: an off-beat thrum, a whistle as the boost comes in, nothing much at the top.
  ljus: {
    firesPerRev: 1.5,
    pulseOrders: [1, 2, 3.02, 4.5],
    pulseDecay: 0.45,
    unevenness: 0.22,
    harmonics: [
      { order: 0.5, wave: "sine", level: 0.12, cents: 0 },
      { order: 1, wave: "sawtooth", level: 0.3, cents: -6 },
      { order: 2, wave: "sawtooth", level: 0.14, cents: 8 },
    ],
    cycleLevel: 0.65,
    exhaustHz: [800, 1700, 1300],
    bodyHz: 300,
    bodyDb: 9,
    drive: 1.8,
    intakeHz: [900, 3200],
    intakeQ: 3.5,
    intakeLevel: 0.14,
    firingBeat: 0.4,
    level: 0.28,
    idleLevel: 0.5,
  },
  // A turbo five: the warble of an odd number of cylinders, a broad hum, a hiss of boost.
  fjard: {
    firesPerRev: 2.5,
    pulseOrders: [1, 1.5, 2.04, 3.1],
    pulseDecay: 0.48,
    unevenness: 0.2,
    harmonics: [
      { order: 0.5, wave: "triangle", level: 0.14, cents: 0 },
      { order: 1, wave: "sawtooth", level: 0.32, cents: -5 },
      { order: 2, wave: "sawtooth", level: 0.14, cents: 9 },
    ],
    cycleLevel: 0.6,
    exhaustHz: [850, 1900, 1500],
    bodyHz: 280,
    bodyDb: 9,
    drive: 1.9,
    intakeHz: [700, 2800],
    intakeQ: 2.5,
    intakeLevel: 0.15,
    firingBeat: 0.5,
    level: 0.32,
    idleLevel: 0.48,
  },
  // A flat-plane V8 to 9,000: even, hard and high, a shriek flat out.
  sund: {
    firesPerRev: 4,
    pulseOrders: [1, 2.01, 3, 4.02],
    pulseDecay: 0.55,
    unevenness: 0.06,
    harmonics: [
      { order: 0.5, wave: "sine", level: 0.04, cents: 0 },
      { order: 1, wave: "sawtooth", level: 0.4, cents: -3 },
      { order: 2, wave: "sawtooth", level: 0.24, cents: 5 },
      { order: 3, wave: "square", level: 0.06, cents: 11 },
    ],
    cycleLevel: 0.45,
    exhaustHz: [1100, 3600, 2200],
    bodyHz: 420,
    bodyDb: 7,
    drive: 2.8,
    intakeHz: [800, 3600],
    intakeQ: 1.4,
    intakeLevel: 0.2,
    firingBeat: 0.4,
    level: 0.36,
    idleLevel: 0.42,
  },
  // A cross-plane V8: the lopsided burble at idle, a deep rumble under load, never high.
  holm: {
    firesPerRev: 4,
    pulseOrders: [1, 2, 3.05],
    pulseDecay: 0.5,
    unevenness: 0.4,
    harmonics: [
      { order: 0.25, wave: "sine", level: 0.08, cents: 0 },
      { order: 0.5, wave: "triangle", level: 0.2, cents: 4 },
      { order: 1, wave: "sawtooth", level: 0.3, cents: -8 },
      { order: 2, wave: "sawtooth", level: 0.12, cents: 10 },
    ],
    cycleLevel: 0.8,
    exhaustHz: [600, 1200, 1300],
    bodyHz: 170,
    bodyDb: 11,
    drive: 2,
    intakeHz: [400, 1500],
    intakeQ: 1.3,
    intakeLevel: 0.12,
    firingBeat: 0.6,
    level: 0.36,
    idleLevel: 0.55,
  },
  // A turbo diesel in a tin box: low revs and the clatter that gives it away.
  kobb: {
    firesPerRev: 2,
    pulseOrders: [1, 2.5, 4.3, 7.2, 11.4],
    pulseDecay: 0.26,
    unevenness: 0.2,
    harmonics: [
      { order: 0.5, wave: "triangle", level: 0.08, cents: 0 },
      { order: 1, wave: "square", level: 0.2, cents: -6 },
      { order: 2, wave: "sawtooth", level: 0.16, cents: 9 },
    ],
    cycleLevel: 0.8,
    exhaustHz: [760, 800, 700],
    bodyHz: 190,
    bodyDb: 9,
    drive: 1.2,
    intakeHz: [1500, 2600],
    intakeQ: 2.2,
    intakeLevel: 0.24,
    firingBeat: 1,
    level: 0.3,
    idleLevel: 0.56,
  },
  // A tired four: lumpy, muffled, out of breath early.
  salta: {
    firesPerRev: 2,
    pulseOrders: [1, 2, 2.97, 4.1, 6.05],
    pulseDecay: 0.42,
    unevenness: 0.34,
    harmonics: [
      { order: 0.5, wave: "triangle", level: 0.1, cents: 3 },
      { order: 1, wave: "sawtooth", level: 0.3, cents: -9 },
      { order: 2, wave: "sawtooth", level: 0.18, cents: 12 },
    ],
    cycleLevel: 0.7,
    exhaustHz: [650, 800, 900],
    bodyHz: 230,
    bodyDb: 10,
    drive: 1.5,
    intakeHz: [380, 1100],
    intakeQ: 1.6,
    intakeLevel: 0.1,
    firingBeat: 0.6,
    level: 0.32,
    idleLevel: 0.52,
  },
  // A twin-carb four with no silencer to speak of: raspy, and the carburettors gasping.
  vik: {
    firesPerRev: 2,
    pulseOrders: [1, 2.03, 3.1, 4.4],
    pulseDecay: 0.4,
    unevenness: 0.18,
    harmonics: [
      { order: 0.5, wave: "triangle", level: 0.08, cents: 0 },
      { order: 1, wave: "sawtooth", level: 0.34, cents: -6 },
      { order: 2, wave: "sawtooth", level: 0.2, cents: 10 },
    ],
    cycleLevel: 0.6,
    exhaustHz: [900, 2600, 1600],
    bodyHz: 360,
    bodyDb: 8,
    drive: 2.4,
    intakeHz: [700, 2600],
    intakeQ: 1.1,
    intakeLevel: 0.3,
    firingBeat: 0.7,
    level: 0.3,
    idleLevel: 0.45,
  },
  // A high-revving four: buzzy low down, then a hard howl from the intake past 6,000.
  sten: {
    firesPerRev: 2,
    pulseOrders: [1, 2, 3.02, 4.1, 5.05],
    pulseDecay: 0.5,
    unevenness: 0.1,
    harmonics: [
      { order: 0.5, wave: "sine", level: 0.05, cents: 0 },
      { order: 1, wave: "sawtooth", level: 0.36, cents: -4 },
      { order: 2, wave: "sawtooth", level: 0.22, cents: 6 },
      { order: 3, wave: "triangle", level: 0.08, cents: 9 },
    ],
    cycleLevel: 0.5,
    exhaustHz: [1000, 3400, 1800],
    bodyHz: 450,
    bodyDb: 7,
    drive: 2.6,
    intakeHz: [900, 4200],
    intakeQ: 1.6,
    intakeLevel: 0.26,
    firingBeat: 0.5,
    level: 0.32,
    idleLevel: 0.42,
  },
  // An old straight six that never revs: a low, muffled drone and a lazy beat.
  berg: {
    firesPerRev: 3,
    pulseOrders: [1, 2, 3.1],
    pulseDecay: 0.46,
    unevenness: 0.2,
    harmonics: [
      { order: 0.5, wave: "triangle", level: 0.12, cents: 0 },
      { order: 1, wave: "sawtooth", level: 0.3, cents: -7 },
      { order: 2, wave: "triangle", level: 0.14, cents: 8 },
    ],
    cycleLevel: 0.7,
    exhaustHz: [550, 900, 900],
    bodyHz: 200,
    bodyDb: 11,
    drive: 1.4,
    intakeHz: [350, 1100],
    intakeQ: 1.4,
    intakeLevel: 0.1,
    firingBeat: 0.55,
    level: 0.32,
    idleLevel: 0.55,
  },
  // No firings: a rising whine that sits above the tyres, and almost nothing at rest.
  strom: {
    firesPerRev: 6,
    pulseOrders: [1, 3],
    pulseDecay: 2,
    unevenness: 0,
    harmonics: [
      { order: 1, wave: "sine", level: 0.34, cents: 0 },
      { order: 1.5, wave: "triangle", level: 0.1, cents: 5 },
      { order: 0.25, wave: "sine", level: 0.3, cents: -3 },
    ],
    cycleLevel: 0.08,
    exhaustHz: [1600, 3200, 1600],
    bodyHz: 900,
    bodyDb: 3,
    drive: 0.4,
    intakeHz: [2400, 6200],
    intakeQ: 5,
    intakeLevel: 0.03,
    firingBeat: 0,
    level: 0.2,
    idleLevel: 0,
  },
  // A V12: so many firings the note is a seamless tearing silk, quiet at a cruise.
  ankar: {
    firesPerRev: 6,
    pulseOrders: [1, 2, 3],
    pulseDecay: 0.7,
    unevenness: 0.04,
    harmonics: [
      { order: 0.5, wave: "sine", level: 0.05, cents: 0 },
      { order: 1, wave: "sawtooth", level: 0.3, cents: -3 },
      { order: 2, wave: "sawtooth", level: 0.18, cents: 4 },
    ],
    cycleLevel: 0.35,
    exhaustHz: [900, 2800, 1600],
    bodyHz: 320,
    bodyDb: 6,
    drive: 1.8,
    intakeHz: [700, 2600],
    intakeQ: 1.1,
    intakeLevel: 0.12,
    firingBeat: 0.3,
    level: 0.3,
    idleLevel: 0.32,
  },
  // A V6: the same firings as the six but gruffer, a growl rather than a scream.
  bris: {
    firesPerRev: 3,
    pulseOrders: [1, 1.5, 2.03, 3.05],
    pulseDecay: 0.45,
    unevenness: 0.24,
    harmonics: [
      { order: 0.5, wave: "triangle", level: 0.12, cents: 0 },
      { order: 1, wave: "sawtooth", level: 0.34, cents: -6 },
      { order: 1.5, wave: "triangle", level: 0.08, cents: 5 },
      { order: 2, wave: "sawtooth", level: 0.16, cents: 9 },
    ],
    cycleLevel: 0.62,
    exhaustHz: [800, 2000, 1600],
    bodyHz: 280,
    bodyDb: 9,
    drive: 2.1,
    intakeHz: [600, 2200],
    intakeQ: 1.2,
    intakeLevel: 0.14,
    firingBeat: 0.5,
    level: 0.33,
    idleLevel: 0.48,
  },
  // A turbo flat four on unequal pipes: a loping rumble, and a whoosh as the boost arrives.
  grus: {
    firesPerRev: 2,
    pulseOrders: [1, 1.5, 2.05, 3.1],
    pulseDecay: 0.38,
    unevenness: 0.45,
    harmonics: [
      { order: 0.5, wave: "triangle", level: 0.22, cents: 0 },
      { order: 1, wave: "sawtooth", level: 0.3, cents: -9 },
      { order: 2, wave: "sawtooth", level: 0.14, cents: 12 },
    ],
    cycleLevel: 0.78,
    exhaustHz: [800, 2200, 1800],
    bodyHz: 260,
    bodyDb: 10,
    drive: 2.3,
    intakeHz: [1200, 4400],
    intakeQ: 3,
    intakeLevel: 0.2,
    firingBeat: 0.5,
    level: 0.34,
    idleLevel: 0.5,
  },
};

/** Each car's voice on its own gearbox. */
export const ENGINES: Record<EngineId, EngineSpec> = Object.fromEntries(ENGINE_IDS.map((id) => [id, { ...CARS[id].gearbox, ...VOICES[id] }])) as Record<EngineId, EngineSpec>;

export const BIKE = {
  wheelRadiusM: 0.34,
  /** The speed wind and tyres read as flat out on a bicycle. */
  fullSpeedMS: 14,
  /** Pedal turns per second at full speed, with the gears a rider would pick. */
  fullCadenceHz: 1.7,
  chainringTeeth: 42,
  /** Freewheel clicks per turn of the rear wheel. */
  pawlClicks: 30,
  /** The wheel speed the freewheel's loop is rendered at, turns a second. */
  renderedTurnsHz: 3,
} as const;

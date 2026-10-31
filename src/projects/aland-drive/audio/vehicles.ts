/*
 * What each drivetrain sounds like, as numbers. The simulation has one engine
 * and no gears, so the gearbox and the revs are the sound's own: they follow
 * the car's speed, and nothing in the car's behaviour depends on them.
 */

export type EngineId = "skerry-gt" | "old-estate" | "electric" | "diesel-van";
export type VehicleId = EngineId | "bike";

export const ENGINE_IDS: readonly EngineId[] = ["skerry-gt", "old-estate", "electric", "diesel-van"];
export const VEHICLE_IDS: readonly VehicleId[] = [...ENGINE_IDS, "bike"];

export const VEHICLE_LABELS: Record<VehicleId, string> = {
  "skerry-gt": "Skerry GT",
  "old-estate": "Old estate",
  electric: "Electric",
  "diesel-van": "Diesel van",
  bike: "Bicycle",
};

export interface Harmonic {
  /** Multiple of the firing frequency. */
  order: number;
  wave: OscillatorType;
  level: number;
  /** Detuned by this many cents, so two partials beat rather than sit dead still. */
  cents: number;
}

export interface EngineSpec {
  idleRpm: number;
  redlineRpm: number;
  /** Firings per crankshaft turn: half the cylinders in a four-stroke, or a motor's poles. */
  firesPerRev: number;
  /** The speed at the redline in each gear, m/s. One entry is a car with no gearbox. */
  gearTopMS: readonly number[];
  /** How long the drive is cut for a gear change. */
  shiftS: number;
  /** Upshift point lifting off, as a share of the redline. Flat out it shifts near the redline. */
  gentleShift: number;

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

export const ENGINES: Record<EngineId, EngineSpec> = {
  // A straight six that loves to rev: smooth at idle, a hard edge up high.
  "skerry-gt": {
    idleRpm: 900,
    redlineRpm: 7800,
    firesPerRev: 3,
    gearTopMS: [15, 25, 35, 45, 53, 62],
    shiftS: 0.11,
    gentleShift: 0.42,
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
  // A tired four with a four-speed box: lumpy, muffled, out of breath early.
  "old-estate": {
    idleRpm: 780,
    redlineRpm: 5200,
    firesPerRev: 2,
    gearTopMS: [13, 24, 38, 60],
    shiftS: 0.28,
    gentleShift: 0.48,
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
  // One gear and no firings: a rising whine that sits above the tyres, and almost nothing at rest.
  electric: {
    idleRpm: 0,
    redlineRpm: 15000,
    firesPerRev: 6,
    gearTopMS: [62],
    shiftS: 0,
    gentleShift: 1,
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
  // A turbo diesel in a tin box: low revs, a slow box, and the clatter that gives it away.
  "diesel-van": {
    idleRpm: 760,
    redlineRpm: 4200,
    firesPerRev: 2,
    gearTopMS: [10, 19, 31, 45, 62],
    shiftS: 0.34,
    gentleShift: 0.52,
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
};

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

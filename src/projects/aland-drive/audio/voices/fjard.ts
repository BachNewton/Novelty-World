import type { Voice } from "../vehicles";

/** A turbo five: the warble of an odd number of cylinders, a broad hum, a hiss of boost. */
export const fjard: Voice = {
  seed: 195,
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
};

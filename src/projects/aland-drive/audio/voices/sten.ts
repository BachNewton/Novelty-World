import type { Voice } from "../vehicles";

/** A high-revving four: buzzy low down, then a hard howl from the intake past 6,000. */
export const sten: Voice = {
  seed: 777,
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
};
